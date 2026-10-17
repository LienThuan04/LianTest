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
 * e2e LUỒNG NGHIỆP VỤ 2: đề **TỰ ĐỘNG** (`loaide=1`) có câu tự luận →
 * SV làm bài (trắc nghiệm + đọc hiểu + tự luận) → GV **chấm tự luận** →
 * SV xem lại ở các trang `/client/*` (nhóm học phần + lịch kiểm tra).
 *
 * Bổ sung cho `exam-flow.e2e-spec.ts` (đề thủ công, chỉ mcq). Giữ đúng 2 nguyên
 * tắc của bộ e2e chạy trên CSDL thật:
 * 1. Chỉ TẠO dữ liệu mới (một đề riêng gắn dấu thời gian); thao tác nào phải sửa
 *    dữ liệu sẵn có (ẩn/hiện nhóm) thì KHÔI PHỤC lại ngay trong cùng ca test.
 *    `afterAll` xoá đúng những gì đã tạo (đề + bài làm + bài tự luận + điểm chấm
 *    + thông báo tự động). KHÔNG dùng `POST /test/delete` để dọn — route đó xoá
 *    TOÀN BỘ thông báo của nhóm (quirk bê từ PHP).
 * 2. Thiếu dữ liệu mẫu thì **bỏ qua kèm cảnh báo** thay vì đỏ oan.
 *
 * Prisma chỉ dùng để dò dữ liệu tiên quyết, lấy đáp án đúng và dọn dẹp; mọi bước
 * nghiệp vụ đều đi qua HTTP như trình duyệt.
 */
describe('Đề tự động + chấm tự luận + trang sinh viên (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;

  let gvCookie: string | null = null;
  let svCookie: string | null = null;

  /** Mức độ câu hỏi trong CSDL: 1=dễ, 2=trung bình, 3=khó. */
  const LEVEL_KEY: Record<number, 'de' | 'tb' | 'kho'> = {
    1: 'de',
    2: 'tb',
    3: 'kho',
  };

  const DIEM_TRACNGHIEM = 4;
  const DIEM_TULUAN = 3;
  const DIEM_DOCHIEU = 3;

  /** Dữ liệu tiên quyết dò được từ CSDL mẫu; null = bỏ qua cả bộ test. */
  let fixture: {
    manhom: number;
    mamoi: string;
    mamonhoc: string;
    chuong: number[];
    sv: string;
    mcqLevel: 'de' | 'tb' | 'kho';
    essayLevel: 'de' | 'tb' | 'kho';
    /** null = môn không có câu đọc hiểu → đề chỉ gồm trắc nghiệm + tự luận. */
    readingLevel: 'de' | 'tb' | 'kho' | null;
    readingQty: number;
  } | null = null;

  const tende = `[E2E] Đề tự động ${Date.now()}`;
  let made = 0;
  let makq = 0;

  /** Câu của đề do hệ thống tự sinh, gom theo loại (đọc lại từ chitietdethi). */
  let sinh: {
    mcq: { macauhoi: number; dung: number; sai: number | null }[];
    reading: { macauhoi: number; dung: number }[];
    essay: number[];
  } = { mcq: [], reading: [], essay: [] };

  /** `YYYY-MM-DD HH:mm` theo giờ máy — đúng định dạng flatpickr gửi lên. */
  const fmt = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
      `${p(d.getHours())}:${p(d.getMinutes())}`
    );
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    gvCookie = await login(app, 'gv001');
    if (!gvCookie) return fixtureFailure('CSDL chưa có tài khoản mẫu gv001');

    // Nhóm của gv001 có SV + môn đủ câu để sinh đề tự động (>=2 mcq cùng mức
    // độ và >=1 tự luận; đọc hiểu có thì dùng, không có thì bỏ phần đọc hiểu).
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

      const stats = await prisma.$queryRaw<
        { loai: string; dokho: number; cnt: number }[]
      >`
        SELECT loai, dokho, COUNT(*)::int AS cnt
        FROM cauhoi
        WHERE mamonhoc = ${nhom.mamonhoc} AND trangthai = 1
        GROUP BY loai, dokho
      `;
      const best = (loai: string, min: number) =>
        stats
          .filter((r) => r.loai === loai && r.cnt >= min)
          .sort((a, b) => b.cnt - a.cnt)[0] ?? null;

      const mcq = best('mcq', 2);
      const essay = best('essay', 1);
      if (!mcq || !essay) continue;
      const reading = best('reading', 1);

      const chuongRows = await prisma.$queryRaw<{ machuong: number }[]>`
        SELECT DISTINCT machuong FROM cauhoi
        WHERE mamonhoc = ${nhom.mamonhoc} AND trangthai = 1
          AND machuong IS NOT NULL
      `;

      fixture = {
        manhom: nhom.manhom,
        mamoi: nhom.mamoi ?? '',
        mamonhoc: nhom.mamonhoc,
        chuong: chuongRows.map((c) => c.machuong),
        sv: sv.manguoidung,
        mcqLevel: LEVEL_KEY[mcq.dokho],
        essayLevel: LEVEL_KEY[essay.dokho],
        readingLevel: reading ? LEVEL_KEY[reading.dokho] : null,
        readingQty: reading ? Math.min(3, reading.cnt) : 0,
      };
      break;
    }
    if (!fixture) {
      return fixtureFailure(
        'CSDL chưa có nhóm + câu mcq/tự luận mẫu (chạy seed-demo)',
      );
    }

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
      if (makq) {
        // traloi_tuluan / cham_tuluan KHÔNG có FK cascade từ ketqua → xoá tay
        // (hinhanh_traloi_tuluan cascade theo traloi_tuluan).
        await prisma.traLoiTuLuan.deleteMany({ where: { makq } });
        await prisma.chamTuLuan.deleteMany({ where: { makq } });
      }
      // chitietketqua cascade từ ketqua; chitietdethi/dethitudong/giaodethi từ dethi.
      await prisma.ketQua.deleteMany({ where: { made } });
      await prisma.deThi.deleteMany({ where: { made } });
    }
    await app?.close();
  }, 60_000);

  // ── GV: tạo đề tự động ─────────────────────────────────────────────────────

  it('GV tạo đề TỰ ĐỘNG (loaide=1) → hệ thống tự bốc câu vào đề', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const now = Date.now();
    const socau: Record<string, Record<string, number>> = {
      mcq: { [fixture.mcqLevel]: 2 },
      essay: { [fixture.essayLevel]: 1 },
    };
    if (fixture.readingLevel) {
      socau.reading = { [fixture.readingLevel]: fixture.readingQty };
    }

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
        socau: JSON.stringify(socau),
        diem_tracnghiem: DIEM_TRACNGHIEM,
        diem_tuluan: DIEM_TULUAN,
        diem_dochieu: fixture.readingLevel ? DIEM_DOCHIEU : 0,
        loaide: 1, // tự động → KHÔNG cần bước /test/addDetail
        xemdiem: 1,
        xemdapan: 1,
        xembailam: 1,
        daocauhoi: 0,
        daodapan: 0,
        tudongnop: 0,
        'chuong[]': fixture.chuong,
        'manhom[]': [fixture.manhom],
        'loaicauhoi[]': fixture.readingLevel
          ? ['mcq', 'essay', 'reading']
          : ['mcq', 'essay'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    made = res.body.made;

    // Số câu đúng yêu cầu và đúng loại/mức độ — không phải chọn tay như đề thủ công.
    const rows = await prisma.$queryRaw<
      { macauhoi: number; loai: string; dokho: number; thutu: number | null }[]
    >`
      SELECT ch.macauhoi, ch.loai, ch.dokho, ctd.thutu
      FROM chitietdethi ctd JOIN cauhoi ch ON ch.macauhoi = ctd.macauhoi
      WHERE ctd.made = ${made}
      ORDER BY ctd.thutu ASC
    `;
    const expected = 2 + 1 + (fixture.readingLevel ? fixture.readingQty : 0);
    expect(rows).toHaveLength(expected);
    expect(rows.filter((r) => r.loai === 'mcq')).toHaveLength(2);
    expect(rows.filter((r) => r.loai === 'essay')).toHaveLength(1);
    for (const r of rows) {
      expect(LEVEL_KEY[r.dokho]).toBe(
        r.loai === 'mcq'
          ? fixture.mcqLevel
          : r.loai === 'essay'
            ? fixture.essayLevel
            : fixture.readingLevel,
      );
      expect(r.thutu).toBeGreaterThan(0); // reorderQuestions đã đánh số
    }

    // Chương của đề tự động được lưu vào dethitudong (để random lại khi sửa đề).
    const chuongCount = await prisma.deThiTuDong.count({ where: { made } });
    expect(chuongCount).toBe(new Set(fixture.chuong).size);
  });

  it('chuẩn bị đáp án đúng/sai cho từng câu (đối chiếu điểm sau khi nộp)', async () => {
    requireFixture(made, 'exam created by a preceding test');
    const rows = await prisma.$queryRaw<{ macauhoi: number; loai: string }[]>`
      SELECT ch.macauhoi, ch.loai
      FROM chitietdethi ctd JOIN cauhoi ch ON ch.macauhoi = ctd.macauhoi
      WHERE ctd.made = ${made}
      ORDER BY ctd.thutu ASC
    `;
    const options = await prisma.cauTraLoi.findMany({
      where: { macauhoi: { in: rows.map((r) => r.macauhoi) } },
      select: { macauhoi: true, macautl: true, ladapan: true },
      orderBy: { macautl: 'asc' },
    });
    const keyOf = (macauhoi: number) =>
      options.find((o) => o.macauhoi === macauhoi && o.ladapan === 1)!.macautl;
    const wrongOf = (macauhoi: number) =>
      options.find((o) => o.macauhoi === macauhoi && o.ladapan !== 1)
        ?.macautl ?? null;

    sinh = {
      mcq: rows
        .filter((r) => r.loai === 'mcq')
        .map((r) => ({
          macauhoi: r.macauhoi,
          dung: keyOf(r.macauhoi),
          sai: wrongOf(r.macauhoi),
        })),
      reading: rows
        .filter((r) => r.loai === 'reading')
        .map((r) => ({ macauhoi: r.macauhoi, dung: keyOf(r.macauhoi) })),
      essay: rows.filter((r) => r.loai === 'essay').map((r) => r.macauhoi),
    };
    expect(sinh.mcq).toHaveLength(2);
    expect(sinh.essay).toHaveLength(1);
  });

  it('đòi nhiều câu hơn ngân hàng có → từ chối, KHÔNG tạo đề', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const tenLoi = `[E2E] Đề thiếu câu ${Date.now()}`;
    const res = await request(server)
      .post('/test/addTest')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({
        mamonhoc: fixture.mamonhoc,
        tende: tenLoi,
        thoigianthi: 30,
        socau: JSON.stringify({ mcq: { [fixture.mcqLevel]: 9999 } }),
        diem_tracnghiem: 10,
        diem_tuluan: 0,
        diem_dochieu: 0,
        loaide: 1,
        'chuong[]': fixture.chuong,
        'manhom[]': [fixture.manhom],
        'loaicauhoi[]': ['mcq'],
      });

    expect(res.body.success).toBe(false);
    expect(String(res.body.error)).toMatch(/Không đủ câu hỏi/);
    // $transaction rollback → không để lại đề rác.
    expect(await prisma.deThi.count({ where: { tende: tenLoi } })).toBe(0);
  });

  // ── SV: làm bài & nộp ──────────────────────────────────────────────────────

  it('SV bắt đầu làm bài → chitietketqua pre-insert đủ câu của đề', async () => {
    requireFixture(
      made && svCookie,
      'exam created by a preceding test and student session',
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
    makq = kq!.makq;

    const ct = await prisma.chiTietKetQua.count({ where: { makq } });
    expect(ct).toBe(sinh.mcq.length + sinh.reading.length + sinh.essay.length);
  });

  it('SV lấy đề: câu tự luận KHÔNG có lựa chọn, câu đọc hiểu kèm đoạn văn', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/getQuestion')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ made });

    expect(res.body.dethi.tende).toBe(tende);
    expect(res.body.cauhoi).toHaveLength(
      sinh.mcq.length + sinh.reading.length + sinh.essay.length,
    );
    for (const q of res.body.cauhoi) {
      if (q.loai === 'essay') {
        expect(q.cautraloi).toHaveLength(0);
      } else {
        expect(q.cautraloi.length).toBeGreaterThan(0);
        for (const o of q.cautraloi) expect(o).not.toHaveProperty('ladapan');
      }
      if (q.loai === 'reading') expect(q.context).toBeTruthy();
    }
  });

  it('SV nộp bài: 1/2 mcq đúng + đọc hiểu đúng hết + 1 bài tự luận', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    // mcq[0] đúng, mcq[1] sai (không có đáp án sai thì bỏ trống = 0 điểm).
    const listCauTraLoi = [
      { macauhoi: sinh.mcq[0].macauhoi, thutu: 1, cautraloi: sinh.mcq[0].dung },
      {
        macauhoi: sinh.mcq[1].macauhoi,
        thutu: 2,
        cautraloi: sinh.mcq[1].sai ?? 0,
      },
      ...sinh.reading.map((r, i) => ({
        macauhoi: r.macauhoi,
        thutu: 3 + i,
        cautraloi: r.dung,
      })),
    ];

    const req = request(server)
      .post('/test/submit')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('made', String(made))
      .field('thoigian', new Date().toISOString())
      .field('listCauTraLoi', JSON.stringify(listCauTraLoi))
      .field('essay_0_exists', '1')
      .field('essay_0_macauhoi', String(sinh.essay[0]))
      .field('essay_0_thutu', String(listCauTraLoi.length + 1))
      .field('essay_0_noidung', '<p>Bài làm tự luận e2e</p>');

    const res = await req;
    expect(res.body.success).toBe(true);
    expect(res.body.makq).toBe(makq);

    const diemMcq = round2((DIEM_TRACNGHIEM / 2) * 1);
    const diemDocHieu = fixture!.readingLevel ? DIEM_DOCHIEU : 0;
    const kq = await prisma.ketQua.findUnique({ where: { makq } });
    expect(kq!.diemthi).toBeCloseTo(diemMcq + diemDocHieu, 2);
    expect(kq!.diem_dochieu).toBeCloseTo(diemDocHieu, 2);
    expect(kq!.socaudung).toBe(1 + sinh.reading.length);
    expect(kq!.trangthai).toBe('Đã nộp');
    // Đề CÓ câu tự luận → phải chờ GV chấm (khác đề chỉ mcq của exam-flow).
    expect(kq!.trangthai_tuluan).toBe('Chưa chấm');

    // Bài tự luận được lưu, chitietketqua của câu tự luận không có đáp án chọn.
    const tl = await prisma.traLoiTuLuan.findFirst({
      where: { makq, macauhoi: sinh.essay[0] },
    });
    expect(tl).not.toBeNull();
    expect(tl!.noidung).toContain('Bài làm tự luận e2e');
    const ctEssay = await prisma.chiTietKetQua.findUnique({
      where: { makq_macauhoi: { makq, macauhoi: sinh.essay[0] } },
    });
    expect(ctEssay!.dapanchon).toBeNull();
  });

  // ── GV: chấm tự luận ───────────────────────────────────────────────────────

  it('GV thấy bài cần chấm (POST /test/getListEssaySubmissionsAction)', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const call = (body: Record<string, unknown>) =>
      request(server)
        .post('/test/getListEssaySubmissionsAction')
        .set('Cookie', gvCookie!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .type('form')
        .send(body);

    const all = await call({ made });
    expect(all.body.success).toBe(true);
    const row = all.body.data.find((r: { makq: number }) => r.makq === makq);
    expect(row).toBeDefined();
    expect(row.manguoidung).toBe(fixture!.sv);
    expect(row.trangthai_cham).toBe('Chưa chấm');

    // Lọc theo trạng thái: chưa chấm thì chỉ nằm ở nhánh 'ungraded'.
    const ungraded = await call({ made, status: 'ungraded' });
    expect(
      ungraded.body.data.some((r: { makq: number }) => r.makq === makq),
    ).toBe(true);
    const graded = await call({ made, status: 'graded' });
    expect(
      graded.body.data.some((r: { makq: number }) => r.makq === makq),
    ).toBe(false);

    // Tìm theo mã sinh viên.
    const found = await call({ made, q: fixture!.sv });
    expect(found.body.data.some((r: { makq: number }) => r.makq === makq)).toBe(
      true,
    );
  });

  it('GV mở bài tự luận (POST /test/getEssayDetailAction) → chưa có điểm', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/getEssayDetailAction')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ makq });

    expect(res.body.success).toBe(true);
    expect(res.body.manguoidung).toBe(fixture!.sv);
    expect(res.body.tong_cau).toBe(1);
    expect(res.body.da_cham).toBe(0);
    expect(res.body.cautraloi[0].macauhoi).toBe(sinh.essay[0]);
    expect(res.body.cautraloi[0].noidung_tra_loi).toContain(
      'Bài làm tự luận e2e',
    );
    expect(res.body.cautraloi[0].diem_cham).toBeNull();
    expect(res.body.cautraloi[0].hinhanh).toEqual([]);
  });

  it('chấm quá điểm tự luận tối đa của đề → bị từ chối', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/saveEssayScoreAction')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({
        makq,
        diem: DIEM_TULUAN + 1,
        [`cau[${sinh.essay[0]}]`]: DIEM_TULUAN + 1,
      });

    expect(res.body.success).toBe(false);
    expect(String(res.body.message)).toMatch(/vượt quá/);
    const kq = await prisma.ketQua.findUnique({ where: { makq } });
    expect(kq!.diem_tuluan ?? 0).toBe(0); // không ghi gì
    expect(await prisma.chamTuLuan.count({ where: { makq } })).toBe(0);
  });

  it('GV lưu điểm tự luận hợp lệ → ketqua + cham_tuluan cập nhật', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const diem = 2.5;
    const res = await request(server)
      .post('/test/saveEssayScoreAction')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ makq, diem, [`cau[${sinh.essay[0]}]`]: diem });

    expect(res.body.success).toBe(true);
    expect(res.body.diem_tuluan).toBe(diem);

    const kq = await prisma.ketQua.findUnique({ where: { makq } });
    expect(kq!.diem_tuluan).toBeCloseTo(diem, 2);
    expect(kq!.trangthai_tuluan).toBe('Đã chấm');
    // KHÁC PHP không ở chỗ này: điểm trắc nghiệm (diemthi) giữ nguyên, điểm tự
    // luận là cột riêng — tổng điểm do giao diện cộng khi hiển thị.
    const cham = await prisma.chamTuLuan.findMany({ where: { makq } });
    expect(cham).toHaveLength(1);
    expect(cham[0].macauhoi).toBe(sinh.essay[0]);
    expect(cham[0].diem).toBeCloseTo(diem, 2);
  });

  it('chấm lại lần 2 GHI ĐÈ điểm cũ (không nhân đôi bản ghi)', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const diem = 3;
    await request(server)
      .post('/test/saveEssayScoreAction')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ makq, diem, [`cau[${sinh.essay[0]}]`]: diem });

    const cham = await prisma.chamTuLuan.findMany({ where: { makq } });
    expect(cham).toHaveLength(1);
    expect(cham[0].diem).toBeCloseTo(diem, 2);

    const detail = await request(server)
      .post('/test/getEssayDetailAction')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ makq });
    expect(detail.body.da_cham).toBe(1);
    expect(detail.body.tong_diem_tuluan).toBeCloseTo(diem, 2);

    const list = await request(server)
      .post('/test/getListEssaySubmissionsAction')
      .set('Cookie', gvCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ made, status: 'graded' });
    expect(list.body.data.some((r: { makq: number }) => r.makq === makq)).toBe(
      true,
    );
  });

  it('SV xem lại bài: thấy nội dung tự luận + điểm GV đã chấm', async () => {
    requireFixture(makq, 'submitted exam result from a preceding test');
    const res = await request(server)
      .post('/test/getResultDetail')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ makq });

    expect(res.body.success).toBe(true);
    const essay = res.body.data.find(
      (r: { macauhoi: number }) => r.macauhoi === sinh.essay[0],
    );
    expect(essay.noidung_tra_loi).toContain('Bài làm tự luận e2e');
    expect(Number(essay.diem_cham_tuluan)).toBeCloseTo(3, 2);
  });

  // ── SV: các trang /client/* ────────────────────────────────────────────────

  it('GET /client/group + /client/test render được', async () => {
    requireFixture(svCookie, 'student session');
    await request(server)
      .get('/client/group')
      .set('Accept', 'text/html')
      .set('Cookie', svCookie)
      .expect(200);
    await request(server)
      .get('/client/test')
      .set('Accept', 'text/html')
      .set('Cookie', svCookie)
      .expect(200);
  });

  it('POST /client/loadDataGroups trả nhóm SV đang học', async () => {
    requireFixture(
      svCookie && fixture,
      'student session and seeded business fixture',
    );
    const res = await request(server)
      .post('/client/loadDataGroups')
      .set('Cookie', svCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ hienthi: 1 });

    expect(Array.isArray(res.body)).toBe(true);
    const row = res.body.find(
      (r: { manhom: number }) => r.manhom === fixture!.manhom,
    );
    expect(row).toBeDefined();
    expect(row.mamonhoc).toBe(fixture.mamonhoc);
    expect(row.hienthi).toBe(1);
  });

  it('POST /client/getFriendList trả bạn cùng nhóm, KHÔNG có chính mình', async () => {
    requireFixture(
      svCookie && fixture,
      'student session and seeded business fixture',
    );
    const res = await request(server)
      .post('/client/getFriendList')
      .set('Cookie', svCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ manhom: fixture.manhom });

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((sv: { id: string }) => sv.id === fixture!.sv)).toBe(
      false,
    );
  });

  it('POST /client/joinGroup: mã mời sai → 0, mã nhóm đang học → 1', async () => {
    requireFixture(
      svCookie && fixture?.mamoi,
      'student session and group invitation code',
    );
    const sai = await request(server)
      .post('/client/joinGroup')
      .set('Cookie', svCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ mamoi: `khong-ton-tai-${Date.now()}` });
    expect(sai.text).toBe('0');

    // Đã ở trong nhóm → trả 1, KHÔNG tạo thêm bản ghi chitietnhom.
    const truoc = await prisma.chiTietNhom.count({
      where: { manhom: fixture.manhom },
    });
    const lai = await request(server)
      .post('/client/joinGroup')
      .set('Cookie', svCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ mamoi: fixture.mamoi });
    expect(lai.text).toBe('1');
    expect(
      await prisma.chiTietNhom.count({ where: { manhom: fixture.manhom } }),
    ).toBe(truoc);
  });

  it('POST /client/hide ẩn rồi hiện lại nhóm (khôi phục nguyên trạng)', async () => {
    requireFixture(
      svCookie && fixture,
      'student session and seeded business fixture',
    );
    const key = { manhom: fixture.manhom, manguoidung: fixture.sv };
    const truoc = await prisma.chiTietNhom.findFirst({ where: key });
    const goc = truoc?.hienthi ?? 1;

    const hide = (giatri: number) =>
      request(server)
        .post('/client/hide')
        .set('Cookie', svCookie!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .type('form')
        .send({ manhom: fixture!.manhom, giatri });

    try {
      const an = await hide(goc === 1 ? 0 : 1);
      expect(an.text).toBe('true');
      const sau = await prisma.chiTietNhom.findFirst({ where: key });
      expect(sau!.hienthi).toBe(goc === 1 ? 0 : 1);

      // Giá trị ngoài 0/1 bị từ chối (không đụng dữ liệu).
      const bay = await hide(5);
      expect(bay.text).toBe('false');
    } finally {
      await hide(goc); // luôn trả về trạng thái ban đầu
    }
    const cuoi = await prisma.chiTietNhom.findFirst({ where: key });
    expect(cuoi!.hienthi).toBe(goc);
  });

  it('offcanvas nhóm (POST /test/getTestsGroupWithUserResult) có đề vừa thi', async () => {
    requireFixture(
      makq && fixture,
      'submitted exam result from a preceding test and seeded business fixture',
    );
    const res = await request(server)
      .post('/test/getTestsGroupWithUserResult')
      .set('Cookie', svCookie!)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send({ manhom: fixture.manhom });

    const row = res.body.find((r: { made: number }) => r.made === made);
    expect(row).toBeDefined();
    expect(row.tende).toBe(tende);
    expect(Number(row.diemthi)).toBeCloseTo(
      round2(DIEM_TRACNGHIEM / 2) + (fixture.readingLevel ? DIEM_DOCHIEU : 0),
      2,
    );
  });

  it('lịch kiểm tra (/client/pagination) xếp đề vừa nộp vào nhóm "đã thi"', async () => {
    requireFixture(
      makq && fixture,
      'submitted exam result from a preceding test and seeded business fixture',
    );
    const args = (filter: string) =>
      JSON.stringify({
        controller: 'client',
        model: 'DeThiModel',
        manguoidung: fixture!.sv,
        limit: 100,
        page: 1,
        filter,
        custom: { function: 'getUserTestSchedule' },
      });
    const call = (path: string, filter: string) =>
      request(server)
        .post(`/client/${path}`)
        .set('Cookie', svCookie!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .type('form')
        .send({ args: args(filter) });

    const pages = await call('getTotalPages', '3');
    expect(pages.body.totalPages).toBeGreaterThan(0);

    const daThi = await call('pagination', '3');
    const row = daThi.body.find((r: { made: number }) => r.made === made);
    expect(row).toBeDefined();
    expect(row.dathi).toBe(1);
    expect(row.tende).toBe(tende);
    // Đề bật xemdiem=1 → lịch thi được phép lộ điểm + trạng thái chấm tự luận.
    expect(Number(row.diemthi)).toBeCloseTo(
      round2(DIEM_TRACNGHIEM / 2) + (fixture.readingLevel ? DIEM_DOCHIEU : 0),
      2,
    );
    expect(row.trangthai_tuluan).toBe('Đã chấm');

    // Đã thi rồi thì KHÔNG còn nằm ở nhóm "đang mở, chưa thi".
    const dangMo = await call('pagination', '0');
    expect(dangMo.body.some((r: { made: number }) => r.made === made)).toBe(
      false,
    );
  });
});
