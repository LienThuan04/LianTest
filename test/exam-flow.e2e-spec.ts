import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/prisma/prisma.service';
import {
  createTestApp,
  login,
  requireFixture,
  fixtureFailure,
} from './setup-app';

/**
 * e2e LUỒNG NGHIỆP VỤ: GV tạo đề thủ công → chọn câu hỏi → giao nhóm →
 * SV vào thi → nộp bài → GV xem bảng điểm/thống kê.
 *
 * Chạy trên **CSDL thật** (như mọi e2e của dự án) nên có 2 nguyên tắc:
 * 1. Chỉ TẠO dữ liệu mới (một đề thi riêng có tên gắn dấu thời gian), KHÔNG sửa
 *    dữ liệu sẵn có; `afterAll` xoá sạch những gì đã tạo (đề + bài làm + thông
 *    báo tự động). KHÔNG dùng `POST /test/delete` để dọn vì route đó xoá TOÀN BỘ
 *    thông báo của nhóm (quirk bê từ PHP) → sẽ đụng dữ liệu mẫu.
 * 2. Thiếu dữ liệu mẫu (chưa seed) thì **bỏ qua kèm cảnh báo** thay vì đỏ oan.
 *
 * Prisma chỉ dùng để dò dữ liệu tiên quyết, lấy đáp án đúng (làm "đáp án chuẩn"
 * đối chiếu điểm) và dọn dẹp; mọi bước nghiệp vụ đều đi qua HTTP như trình duyệt.
 */
describe('Luồng nghiệp vụ: tạo đề → làm bài → chấm (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;

  let gvCookie: string | null = null;
  let svCookie: string | null = null;

  /** Dữ liệu tiên quyết dò được từ CSDL mẫu; null = bỏ qua cả bộ test. */
  let fixture: {
    manhom: number;
    mamonhoc: string;
    machuong: number[];
    sv: string;
  } | null = null;

  const tende = `[E2E] Đề kiểm thử ${Date.now()}`;
  let made = 0;
  /** macauhoi đã chọn vào đề, kèm macautl đúng để chấm điểm. */
  let chosen: { macauhoi: number; macautl: number }[] = [];
  let makq = 0;

  /** `YYYY-MM-DD HH:mm` theo giờ máy — đúng định dạng flatpickr gửi lên. */
  const fmt = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
      `${p(d.getHours())}:${p(d.getMinutes())}`
    );
  };

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    gvCookie = await login(app, 'gv001');
    if (!gvCookie) return fixtureFailure('CSDL chưa có tài khoản mẫu gv001');

    // Nhóm học phần của gv001 có ít nhất 1 sinh viên + môn có sẵn câu hỏi mcq.
    const nhomList = await prisma.nhom.findMany({
      where: { giangvien: 'gv001', trangthai: 1 },
      orderBy: { manhom: 'asc' },
    });
    for (const nhom of nhomList) {
      const sv = await prisma.chiTietNhom.findFirst({
        where: { manhom: nhom.manhom },
        orderBy: { manguoidung: 'asc' },
        select: { manguoidung: true },
      });
      if (!sv) continue;
      const mcq = await prisma.cauHoi.findMany({
        where: { mamonhoc: nhom.mamonhoc, loai: 'mcq', trangthai: 1 },
        orderBy: { macauhoi: 'asc' },
        take: 3,
        select: { machuong: true },
      });
      if (mcq.length < 3) continue;
      fixture = {
        manhom: nhom.manhom,
        mamonhoc: nhom.mamonhoc,
        machuong: [...new Set(mcq.map((q) => q.machuong ?? 0))].filter(Boolean),
        sv: sv.manguoidung,
      };
      break;
    }
    if (!fixture)
      return fixtureFailure('CSDL chưa có nhóm + câu hỏi mẫu (chạy seed-demo)');

    svCookie = await login(app, fixture.sv);
    if (!svCookie)
      fixtureFailure(`không đăng nhập được bằng SV mẫu ${fixture.sv}`);
  }, 90_000);

  afterAll(async () => {
    // Dọn CHÍNH XÁC những gì test tạo ra, theo thứ tự phụ thuộc.
    if (prisma && made) {
      const tb = await prisma.thongBao.findMany({
        where: { noidung: { contains: tende } },
        select: { matb: true },
      });
      const matbList = tb.map((t) => t.matb);
      if (matbList.length) {
        await prisma.trangThaiThongBao.deleteMany({
          where: { matb: { in: matbList } },
        });
        await prisma.chiTietThongBao.deleteMany({
          where: { matb: { in: matbList } },
        });
        await prisma.thongBao.deleteMany({ where: { matb: { in: matbList } } });
      }
      // chitietketqua có FK cascade từ ketqua; chitietdethi/giaodethi từ dethi.
      await prisma.ketQua.deleteMany({ where: { made } });
      await prisma.deThi.deleteMany({ where: { made } });
    }
    await app?.close();
  }, 60_000);

  // ── GV: tạo đề thủ công ────────────────────────────────────────────────────

  it('GV tạo đề thủ công (POST /test/addTest) → trả về mã đề', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const now = Date.now();
    const res = await request(server)
      .post('/test/addTest')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({
        mamonhoc: fixture.mamonhoc,
        tende,
        thoigianthi: 30,
        thoigianbatdau: fmt(new Date(now - 5 * 60_000)),
        thoigianketthuc: fmt(new Date(now + 2 * 3600_000)),
        socau: JSON.stringify({ mcq: { de: 0, tb: 0, kho: 0 } }),
        diem_tracnghiem: 10,
        diem_tuluan: 0,
        diem_dochieu: 0,
        loaide: 0, // thủ công → phải tự chọn câu ở bước sau
        xemdiem: 1,
        xemdapan: 1,
        xembailam: 1,
        daocauhoi: 0,
        daodapan: 0,
        tudongnop: 0,
        'chuong[]': fixture.machuong,
        'manhom[]': [fixture.manhom],
        'loaicauhoi[]': ['mcq'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.made).toBe('number');
    made = res.body.made;
  });

  it('đề vừa tạo đã được giao cho nhóm + sinh thông báo tự động', async () => {
    requireFixture(made, 'exam created by a preceding test');
    const giao = await prisma.giaoDeThi.count({
      where: { made, manhom: fixture!.manhom },
    });
    expect(giao).toBe(1);

    const tb = await prisma.thongBao.findFirst({
      where: { noidung: { contains: tende } },
    });
    expect(tb).not.toBeNull();
    expect(tb!.is_auto).toBe(1);
  });

  it('trang chọn câu hỏi (GET /test/select/:made) render được', async () => {
    requireFixture(made, 'exam created by a preceding test');
    await request(server)
      .get(`/test/select/${made}`)
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie!)
      .expect(200);
  });

  it('danh sách câu hỏi để chọn (pagination custom=getQuestionsForTest)', async () => {
    requireFixture(made, 'exam created by a preceding test');
    const args = JSON.stringify({
      controller: 'test',
      model: 'DeThiModel',
      mamonhoc: fixture!.mamonhoc,
      limit: 10,
      page: 1,
      filter: { loai: 'mcq' },
      custom: { function: 'getQuestionsForTest' },
    });

    const pages = await request(server)
      .post('/test/getTotalPages')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ args });
    expect(pages.body.totalPages).toBeGreaterThan(0);

    const res = await request(server)
      .post('/test/pagination')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ args });

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    // Chỉ trả câu của đúng môn (lọc qua phancong của GV đang đăng nhập).
    for (const q of res.body) {
      expect(q.mamonhoc).toBe(fixture!.mamonhoc);
      expect(q.loai).toBe('mcq');
    }

    // Lấy đáp án đúng làm "đáp án chuẩn" để đối chiếu điểm sau khi nộp.
    const macauhoiList: number[] = res.body
      .slice(0, 3)
      .map((q: { macauhoi: number }) => q.macauhoi);
    const keys = await prisma.cauTraLoi.findMany({
      where: { macauhoi: { in: macauhoiList }, ladapan: 1 },
      select: { macauhoi: true, macautl: true },
    });
    chosen = macauhoiList.map((macauhoi) => ({
      macauhoi,
      macautl: keys.find((k) => k.macauhoi === macauhoi)!.macautl,
    }));
    expect(chosen).toHaveLength(3);
  });

  it('lưu câu hỏi vào đề (POST /test/addDetail)', async () => {
    requireFixture(chosen.length, 'selected exam questions');
    const body: Record<string, string | number> = { made, action: 'add' };
    chosen.forEach((c, i) => {
      body[`cauhoi[${i}][macauhoi]`] = c.macauhoi;
      body[`cauhoi[${i}][thutu]`] = i + 1;
    });

    const res = await request(server)
      .post('/test/addDetail')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send(body);

    expect(res.body.success).toBe(true);
    const rows = await prisma.chiTietDeThi.findMany({ where: { made } });
    expect(rows).toHaveLength(3);
  });

  it('đọc lại câu hỏi của đề (POST /test/getQuestionOfTestManual)', async () => {
    requireFixture(chosen.length, 'selected exam questions');
    const res = await request(server)
      .post('/test/getQuestionOfTestManual')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ made });

    expect(res.body).toHaveLength(3);
    expect(
      res.body.map((q: { macauhoi: number }) => q.macauhoi).sort(),
    ).toEqual(chosen.map((c) => c.macauhoi).sort());
  });

  // ── SV: vào thi & nộp bài ──────────────────────────────────────────────────

  it('SV mở trang vào thi (GET /test/start/:made) → 200', async () => {
    requireFixture(
      chosen.length && svCookie,
      'selected exam questions and student session',
    );
    const res = await request(server)
      .get(`/test/start/${made}`)
      .set('Accept', 'text/html')
      .set('Cookie', svCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain(tende);
  });

  it('SV bắt đầu làm bài (POST /test/startTest) → tạo bản ghi kết quả', async () => {
    requireFixture(
      chosen.length && svCookie,
      'selected exam questions and student session',
    );
    await request(server)
      .post('/test/startTest')
      .set('Cookie', svCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ made })
      .expect(201);

    const kq = await prisma.ketQua.findFirst({
      where: { made, manguoidung: fixture!.sv },
    });
    expect(kq).not.toBeNull();
    expect(kq!.diemthi).toBeNull();
    makq = kq!.makq;

    // startTest pre-insert chitietketqua theo chitietdethi (không có dòng mồ côi).
    const ct = await prisma.chiTietKetQua.count({ where: { makq } });
    expect(ct).toBe(3);
  });

  it('SV lấy đề (POST /test/getQuestion) → đủ câu + KHÔNG lộ đáp án đúng', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/getQuestion')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ made });

    expect(res.body.cauhoi).toHaveLength(3);
    expect(res.body.dethi.tende).toBe(tende);
    for (const q of res.body.cauhoi) {
      expect(q.cautraloi.length).toBeGreaterThan(0);
      for (const o of q.cautraloi) {
        expect(o).not.toHaveProperty('ladapan');
      }
    }
  });

  it('SV mở trang làm bài (GET /test/taketest/:made) → render, không redirect', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .get(`/test/taketest/${made}`)
      .set('Accept', 'text/html')
      .set('Cookie', svCookie!);

    expect(res.status).toBe(200);
  });

  it('SV chuyển tab (POST /test/chuyentab) → đếm tăng, đề không bật tự nộp', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/chuyentab')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ made });

    // chuyentab trả về SỐ trần (cờ nopbaichuyentab), không bọc object.
    expect(res.text).toBe('0'); // tudongnop=0 lúc tạo đề
    const kq = await prisma.ketQua.findUnique({ where: { makq } });
    expect(kq!.solanchuyentab).toBe(1);
  });

  it('SV nộp bài đúng hết (POST /test/submit) → 10 điểm, trạng thái Đã nộp', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const listCauTraLoi = chosen.map((c, i) => ({
      macauhoi: c.macauhoi,
      thutu: i + 1,
      cautraloi: c.macautl,
    }));

    const res = await request(server)
      .post('/test/submit')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('made', String(made))
      .field('thoigian', new Date().toISOString())
      .field('listCauTraLoi', JSON.stringify(listCauTraLoi));

    expect(res.body.success).toBe(true);
    expect(res.body.makq).toBe(makq);

    const kq = await prisma.ketQua.findUnique({ where: { makq } });
    expect(kq!.diemthi).toBe(10); // 3/3 câu mcq × 10 điểm trắc nghiệm
    expect(kq!.socaudung).toBe(3);
    expect(kq!.trangthai).toBe('Đã nộp');
    // Đề không có câu tự luận → không phải chờ chấm tay.
    expect(kq!.trangthai_tuluan).toBe('Đã chấm');
  });

  it('nộp lại lần nữa bị từ chối (không ghi đè bài đã nộp)', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/submit')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('made', String(made))
      .field('listCauTraLoi', '[]');

    expect(res.body.success).toBe(false);
  });

  it('SV xem lại chi tiết bài làm (POST /test/getResultDetail)', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/getResultDetail')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ makq });

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);
  });

  // ── GV: xem kết quả ────────────────────────────────────────────────────────

  it('GV mở trang chi tiết đề (GET /test/detail/:made) → 200', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    await request(server)
      .get(`/test/detail/${made}`)
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie!)
      .expect(200);
  });

  it('bảng điểm (pagination model=KetQuaModel) có bài của SV vừa nộp', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const args = JSON.stringify({
      controller: 'test',
      model: 'KetQuaModel',
      made,
      manhom: [fixture!.manhom],
      limit: 10,
      page: 1,
      filter: 'present',
    });

    const res = await request(server)
      .post('/test/pagination')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ args });

    expect(Array.isArray(res.body)).toBe(true);
    const row = res.body.find(
      (r: { manguoidung: string }) => r.manguoidung === fixture!.sv,
    );
    expect(row).toBeDefined();
    expect(Number(row.diemthi)).toBe(10);
  });

  it('thống kê đề (POST /test/getStatictical) đếm đúng 1 bài đã nộp', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/getStatictical')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ made, manhom: fixture!.manhom });

    expect(res.body.da_nop_bai).toBe(1);
    expect(res.body.diem_cao_nhat).toBe(10);
    expect(res.body.diem_trung_binh).toBe(10);
    // 10 khoảng điểm; điểm 10 rơi vào khoảng cuối (ceil(10)-1 = 9).
    expect(res.body.thong_ke_diem[9]).toBe(1);
  });

  it('không xoá được đề đã có người thi (POST /test/delete)', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/delete')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ made });

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/hoàn thành bài thi/);
    // đề vẫn còn → afterAll mới dọn
    expect(await prisma.deThi.count({ where: { made } })).toBe(1);
  });
});
