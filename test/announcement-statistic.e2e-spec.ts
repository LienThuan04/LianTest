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
 * e2e Phase 6: **Thông báo** (`/teacher_announcement/*`) + **Thống kê**
 * (`/statistic/*`) — hai module còn thiếu e2e sau `exam-flow` và
 * `exam-auto-essay`.
 *
 * Giữ đúng nguyên tắc của bộ e2e chạy trên CSDL thật:
 * 1. Chỉ TẠO dữ liệu mới (thông báo gắn dấu `[E2E-TB] <timestamp>`); `afterAll`
 *    xoá đúng phần đã tạo. Thao tác nào phải sửa dữ liệu sẵn có (đánh dấu đã xem
 *    thông báo) thì KHÔI PHỤC ngay trong cùng ca test.
 * 2. Thiếu dữ liệu mẫu → bỏ qua kèm cảnh báo thay vì đỏ oan.
 *
 * ⚠️ QUYỀN: dump gốc chỉ seed `thongbao`/`thongke` cho nhóm quyền 3 (Admin), mà
 * dữ liệu nghiệp vụ (nhóm/đề/kết quả) lại thuộc GV `gv001` (nhóm quyền 1) — admin
 * không có gì để xem. Nên `beforeAll` CẤP TẠM các quyền còn thiếu cho nhóm quyền 1
 * và `afterAll` xoá lại ĐÚNG những dòng đã thêm (dòng có sẵn không đụng tới).
 *
 * Prisma chỉ dùng để dò dữ liệu tiên quyết, tính lại kỳ vọng ĐỘC LẬP với truy vấn
 * của service và dọn dẹp; mọi bước nghiệp vụ đều đi qua HTTP như trình duyệt.
 */
describe('Thông báo + Thống kê (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;

  let gvCookie: string | null = null;
  let gv2Cookie: string | null = null;
  let svCookie: string | null = null;

  const GV = 'gv001';
  const GV2 = 'gv002';

  /** Quyền được cấp tạm cho nhóm quyền 1 (xoá lại ở afterAll). */
  const granted: { manhomquyen: number; chucnang: string; hanhdong: string }[] =
    [];

  const marker = `[E2E-TB] ${Date.now()}`;

  /** Dữ liệu tiên quyết dò từ CSDL mẫu; null = bỏ qua cả bộ test. */
  let fixture: {
    /** 2 nhóm học phần của gv001 (có thành viên) — nhóm 2 dùng cho ca đổi nhóm nhận. */
    g1: { manhom: number; tennhom: string; mamonhoc: string };
    g2: { manhom: number; tennhom: string; mamonhoc: string } | null;
    namhoc: number;
    hocky: number;
    /** SV thuộc g1 (nhận thông báo). */
    sv: string;
    /** Đề của gv001 ĐÃ có bài làm (dùng cho thống kê chi tiết). */
    made: number;
  } | null = null;

  let matb = 0;

  /** POST kiểu AJAX của JS gốc (urlencoded + header XHR). */
  const post = (path: string, cookie: string, body: Record<string, unknown>) =>
    request(server)
      .post(path)
      .set('Cookie', cookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send(body);

  /** `args` của pagination.js cho trang thông báo. */
  const paginationArgs = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      controller: 'teacher_announcement',
      model: 'AnnouncementModel',
      id: GV,
      limit: 10,
      page: 1,
      ...extra,
    });

  const round1 = (x: number) => Math.round(x * 10) / 10;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // Cấp tạm quyền thongbao/thongke cho nhóm quyền của GV (xem ghi chú đầu file).
    const needed = [
      { chucnang: 'thongbao', hanhdong: 'view' },
      { chucnang: 'thongbao', hanhdong: 'create' },
      { chucnang: 'thongbao', hanhdong: 'update' },
      { chucnang: 'thongbao', hanhdong: 'delete' },
      { chucnang: 'thongke', hanhdong: 'view' },
    ];
    for (const q of needed) {
      const row = { manhomquyen: 1, ...q };
      const existed = await prisma.chiTietQuyen.findUnique({
        where: { manhomquyen_chucnang_hanhdong: row },
      });
      if (!existed) {
        await prisma.chiTietQuyen.create({ data: row });
        granted.push(row);
      }
    }

    gvCookie = await login(app, GV);
    if (!gvCookie) return fixtureFailure(`CSDL chưa có tài khoản mẫu ${GV}`);
    gv2Cookie = await login(app, GV2);

    // Nhóm học phần của GV, ưu tiên nhóm CÓ thành viên.
    const nhomList = await prisma.nhom.findMany({
      where: { giangvien: GV, trangthai: 1 },
      orderBy: { manhom: 'asc' },
    });
    const withMembers: {
      manhom: number;
      tennhom: string;
      mamonhoc: string;
      namhoc: number;
      hocky: number;
      sv: string;
    }[] = [];
    for (const n of nhomList) {
      if (n.namhoc == null || n.hocky == null) continue;
      const sv = await prisma.chiTietNhom.findFirst({
        where: { manhom: n.manhom },
        orderBy: { manguoidung: 'asc' },
        select: { manguoidung: true },
      });
      if (!sv) continue;
      withMembers.push({
        manhom: n.manhom,
        tennhom: n.tennhom,
        mamonhoc: n.mamonhoc,
        namhoc: n.namhoc,
        hocky: n.hocky,
        sv: sv.manguoidung,
      });
    }
    if (!withMembers.length) {
      return fixtureFailure(
        'CSDL chưa có nhóm học phần của GV kèm thành viên (chạy seed-demo)',
      );
    }

    // Đề của GV đã có bài làm — cần cho thống kê chi tiết.
    const deRows = await prisma.$queryRaw<{ made: number }[]>`
      SELECT d.made
      FROM dethi d JOIN ketqua kq ON kq.made = d.made
      WHERE d.nguoitao = ${GV} AND d.trangthai = 1
      GROUP BY d.made
      ORDER BY COUNT(kq.makq) DESC
      LIMIT 1
    `;
    if (!deRows.length) {
      return fixtureFailure(
        'CSDL chưa có đề của GV kèm bài làm (chạy seed-demo)',
      );
    }

    const g1 = withMembers[0];
    fixture = {
      g1: { manhom: g1.manhom, tennhom: g1.tennhom, mamonhoc: g1.mamonhoc },
      g2: withMembers[1]
        ? {
            manhom: withMembers[1].manhom,
            tennhom: withMembers[1].tennhom,
            mamonhoc: withMembers[1].mamonhoc,
          }
        : null,
      namhoc: g1.namhoc,
      hocky: g1.hocky,
      sv: g1.sv,
      made: deRows[0].made,
    };

    svCookie = await login(app, fixture.sv);
    if (!svCookie)
      fixtureFailure(`không đăng nhập được bằng SV mẫu ${fixture.sv}`);
  }, 90_000);

  afterAll(async () => {
    if (prisma) {
      // Xoá mọi thông báo do test tạo (chitietthongbao/trangthaithongbao cascade).
      const tb = await prisma.thongBao.findMany({
        where: { noidung: { contains: marker } },
        select: { matb: true },
      });
      if (tb.length) {
        await prisma.thongBao.deleteMany({
          where: { matb: { in: tb.map((t) => t.matb) } },
        });
      }
      // Trả nhóm quyền về đúng như trước khi chạy test.
      for (const row of granted) {
        await prisma.chiTietQuyen.deleteMany({ where: row });
      }
    }
    await app?.close();
  }, 60_000);

  // ── Thông báo: trang SSR ────────────────────────────────────────────────────

  it('GET /teacher_announcement + /add render được', async () => {
    requireFixture(gvCookie, 'teacher session');
    await request(server)
      .get('/teacher_announcement')
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(200);
    await request(server)
      .get('/teacher_announcement/add')
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(200);
  });

  // ── Thông báo: tạo & gửi ────────────────────────────────────────────────────

  it('GV gửi thông báo cho nhóm → sinh chitietthongbao + trạng thái "chưa xem"', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const nhom = [fixture.g1.manhom];
    if (fixture.g2) nhom.push(fixture.g2.manhom);

    const res = await post('/teacher_announcement/sendAnnouncement', gvCookie, {
      noticeText: `${marker} Nội dung ban đầu`,
      mamonhoc: fixture.g1.mamonhoc,
      manhom: nhom,
      thoigiantao: '2026/8/11 9:30:0',
    });

    expect(res.status).toBe(201);
    matb = Number(res.text);
    expect(matb).toBeGreaterThan(0);

    const tb = await prisma.thongBao.findUnique({ where: { matb } });
    expect(tb!.nguoitao).toBe(GV);
    expect(tb!.is_auto).toBe(0); // KHÁC thông báo tự sinh khi tạo đề (is_auto=1)
    expect(tb!.noidung).toContain(marker);
    // Chuỗi 'YYYY/M/D H:m:s' của announcement.js được hiểu đúng.
    expect(tb!.thoigiantao?.getFullYear()).toBe(2026);

    const ct = await prisma.chiTietThongBao.findMany({ where: { matb } });
    expect(ct.map((c) => c.manhom).sort()).toEqual([...nhom].sort());

    // Mỗi SV của các nhóm nhận có đúng 1 dòng trạng thái, mặc định 'chưa xem'.
    const members = await prisma.chiTietNhom.findMany({
      where: { manhom: { in: nhom } },
      select: { manguoidung: true },
    });
    const uniq = [...new Set(members.map((m) => m.manguoidung))];
    const tt = await prisma.trangThaiThongBao.findMany({ where: { matb } });
    expect(tt).toHaveLength(uniq.length);
    expect(tt.every((r) => r.trangthai === 'chưa xem')).toBe(true);
  });

  it('gửi cho nhóm KHÔNG tồn tại → không tạo dòng chitietthongbao mồ côi', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/teacher_announcement/sendAnnouncement', gvCookie, {
      noticeText: `${marker} Nhóm không tồn tại`,
      manhom: [999999],
    });

    const id = Number(res.text);
    expect(id).toBeGreaterThan(0);
    // KHÁC PHP (dựa FK): service tự lọc nhóm có thật trước khi ghi.
    expect(await prisma.chiTietThongBao.count({ where: { matb: id } })).toBe(0);
    expect(await prisma.trangThaiThongBao.count({ where: { matb: id } })).toBe(
      0,
    );
  });

  it('POST getDetail trả nội dung + danh sách mã nhóm đang nhận', async () => {
    requireFixture(
      matb && fixture && gvCookie,
      'announcement created by a preceding test and seeded business fixture and teacher session',
    );
    const res = await post('/teacher_announcement/getDetail', gvCookie, {
      matb,
    });

    expect(res.body.matb).toBe(matb);
    expect(res.body.noidung).toContain(marker);
    expect(res.body.tenmonhoc).toBeTruthy();
    const nhom = [fixture.g1.manhom];
    if (fixture.g2) nhom.push(fixture.g2.manhom);
    expect([...(res.body.nhom as number[])].sort()).toEqual([...nhom].sort());
  });

  // ── Thông báo: danh sách + phân trang ──────────────────────────────────────

  it('phân trang (model=AnnouncementModel) có thông báo vừa gửi, KHÔNG có thông báo tự sinh', async () => {
    requireFixture(
      matb && fixture && gvCookie,
      'announcement created by a preceding test and seeded business fixture and teacher session',
    );
    const pages = await post('/teacher_announcement/getTotalPages', gvCookie, {
      args: paginationArgs(),
    });
    expect(pages.body.totalPages).toBeGreaterThan(0);

    const list = await post('/teacher_announcement/pagination', gvCookie, {
      args: paginationArgs(),
    });
    const row = list.body.find((r: { matb: number }) => r.matb === matb);
    expect(row).toBeDefined();
    expect(row.is_auto).toBe(0);
    expect(row.nguoitao).toBe(GV);
    // STRING_AGG gộp tên các nhóm nhận thành 1 chuỗi.
    expect(row.nhom).toContain(fixture.g1.tennhom);
    if (fixture.g2) expect(row.nhom).toContain(fixture.g2.tennhom);
    // Thông báo sinh tự động khi tạo đề bị loại khỏi danh sách quản lý.
    expect(
      (list.body as { is_auto: number }[]).every((r) => r.is_auto === 0),
    ).toBe(true);
  });

  it('ô tìm kiếm + bộ lọc học kỳ/môn của phân trang', async () => {
    requireFixture(
      matb && fixture && gvCookie,
      'announcement created by a preceding test and seeded business fixture and teacher session',
    );
    const call = (extra: Record<string, unknown>) =>
      post('/teacher_announcement/pagination', gvCookie!, {
        args: paginationArgs(extra),
      });
    const has = (body: { matb: number }[]) => body.some((r) => r.matb === matb);

    expect(has((await call({ input: marker })).body)).toBe(true);
    expect(
      has((await call({ input: `khong-ton-tai-${Date.now()}` })).body),
    ).toBe(false);

    // Lọc chỉ áp dụng khi có CẢ năm học và học kỳ (giữ đúng PHP).
    expect(
      has(
        (
          await call({
            filter: { namhoc: fixture.namhoc, hocky: fixture.hocky },
          })
        ).body,
      ),
    ).toBe(true);
    expect(
      has(
        (await call({ filter: { namhoc: fixture.namhoc, hocky: 999999 } }))
          .body,
      ),
    ).toBe(false);
    expect(
      has((await call({ filter: { mamonhoc: fixture.g1.mamonhoc } })).body),
    ).toBe(true);

    const pages = await post('/teacher_announcement/getTotalPages', gvCookie, {
      args: paginationArgs({ input: `khong-ton-tai-${Date.now()}` }),
    });
    expect(pages.body.totalPages).toBe(0);
  });

  it('POST getListAnnounce gộp tên nhóm thành mảng (giữ quirk tenhocky = mã học kỳ)', async () => {
    requireFixture(
      matb && fixture && gvCookie,
      'announcement created by a preceding test and seeded business fixture and teacher session',
    );
    const res = await post(
      '/teacher_announcement/getListAnnounce',
      gvCookie,
      {},
    );

    const row = res.body.find((r: { matb: number }) => r.matb === matb);
    expect(row).toBeDefined();
    expect(row.nhom).toContain(fixture.g1.tennhom);
    if (fixture.g2) expect(row.nhom).toHaveLength(2);
    // QUIRK PHP giữ nguyên: khoá `tenhocky` chứa MÃ học kỳ chứ không phải tên.
    expect(row.tenhocky).toBe(fixture.hocky);
  });

  it('POST getAnnounce lấy thông báo theo nhóm (nhóm lạ → rỗng)', async () => {
    requireFixture(
      matb && fixture && gvCookie,
      'announcement created by a preceding test and seeded business fixture and teacher session',
    );
    const res = await post('/teacher_announcement/getAnnounce', gvCookie, {
      manhom: fixture.g1.manhom,
    });
    const row = res.body.find((r: { matb: number }) => r.matb === matb);
    expect(row).toBeDefined();
    expect(row.noidung).toContain(marker);
    expect(row).toHaveProperty('avatar');

    const nhomLa = await post('/teacher_announcement/getAnnounce', gvCookie, {
      manhom: 999999,
    });
    expect(nhomLa.body).toEqual([]);
  });

  // ── Thông báo: phía sinh viên (chuông) ─────────────────────────────────────

  it('SV thấy thông báo ở chuông; markAsRead xoá số chưa xem (khôi phục sau đó)', async () => {
    requireFixture(
      matb && fixture && svCookie,
      'announcement created by a preceding test and seeded business fixture and student session',
    );

    const noti = await post(
      '/teacher_announcement/getNotifications',
      svCookie,
      {},
    );
    expect(
      (noti.body as { noidung: string }[]).some((r) =>
        r.noidung?.includes(marker),
      ),
    ).toBe(true);

    const truoc = await post(
      '/teacher_announcement/getUnreadCount',
      svCookie,
      {},
    );
    expect(truoc.body.count).toBeGreaterThan(0);

    // Ghi lại các dòng 'chưa xem' SẴN CÓ để khôi phục sau khi đánh dấu đã xem.
    const chuaXem = await prisma.trangThaiThongBao.findMany({
      where: { manguoidung: fixture.sv, trangthai: 'chưa xem' },
      select: { matb: true },
    });
    try {
      const marked = await post(
        '/teacher_announcement/markAsRead',
        svCookie,
        {},
      );
      expect(marked.body.success).toBe(true);

      const sau = await post(
        '/teacher_announcement/getUnreadCount',
        svCookie,
        {},
      );
      expect(sau.body.count).toBe(0);
    } finally {
      await prisma.trangThaiThongBao.updateMany({
        where: {
          manguoidung: fixture.sv,
          matb: { in: chuaXem.map((r) => r.matb) },
        },
        data: { trangthai: 'chưa xem' },
      });
    }

    const khoiphuc = await prisma.trangThaiThongBao.count({
      where: { manguoidung: fixture.sv, trangthai: 'chưa xem' },
    });
    expect(khoiphuc).toBe(chuaXem.length);
  });

  it('SV KHÔNG được gửi thông báo (403)', async () => {
    requireFixture(
      svCookie && fixture,
      'student session and seeded business fixture',
    );
    await post('/teacher_announcement/sendAnnouncement', svCookie, {
      noticeText: `${marker} SV gửi trộm`,
      manhom: [fixture.g1.manhom],
    }).expect(403);
    expect(
      await prisma.thongBao.count({
        where: { noidung: { contains: 'SV gửi trộm' } },
      }),
    ).toBe(0);
  });

  // ── Thông báo: sửa / xoá ───────────────────────────────────────────────────

  it('GET /teacher_announcement/update/:matb — chủ sở hữu 200, người khác 403', async () => {
    requireFixture(
      matb && gvCookie,
      'announcement created by a preceding test and teacher session',
    );
    await request(server)
      .get(`/teacher_announcement/update/${matb}`)
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(200);

    if (gv2Cookie) {
      // KHÁC PHP (PHP không kiểm người tạo): GV khác bị chặn.
      await request(server)
        .get(`/teacher_announcement/update/${matb}`)
        .set('Accept', 'text/html')
        .set('Cookie', gv2Cookie)
        .expect(403);
    }

    await request(server)
      .get('/teacher_announcement/update/999999')
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(404);
  });

  it('GV khác không sửa/xoá được thông báo của người ta', async () => {
    requireFixture(
      matb && gv2Cookie,
      'announcement created by a preceding test and second teacher session',
    );
    await post('/teacher_announcement/updateAnnounce', gv2Cookie, {
      matb,
      noidung: 'cướp quyền',
      manhom: [fixture!.g1.manhom],
    }).expect(403);
    await post('/teacher_announcement/deleteAnnounce', gv2Cookie, {
      matb,
    }).expect(403);

    const tb = await prisma.thongBao.findUnique({ where: { matb } });
    expect(tb!.noidung).toContain(marker); // còn nguyên
  });

  it('updateAnnounce đổi nội dung + nhóm nhận (giữ quirk không dọn trangthaithongbao)', async () => {
    requireFixture(
      matb && fixture && gvCookie,
      'announcement created by a preceding test and seeded business fixture and teacher session',
    );
    const truoc = await prisma.trangThaiThongBao.count({ where: { matb } });

    const res = await post('/teacher_announcement/updateAnnounce', gvCookie, {
      matb,
      noidung: `${marker} Nội dung đã sửa`,
      manhom: [fixture.g1.manhom], // bỏ nhóm 2 (nếu có)
    });
    expect(res.text).toBe('true');

    const tb = await prisma.thongBao.findUnique({ where: { matb } });
    expect(tb!.noidung).toContain('đã sửa');
    const ct = await prisma.chiTietThongBao.findMany({ where: { matb } });
    expect(ct.map((c) => c.manhom)).toEqual([fixture.g1.manhom]);

    // QUIRK PHP: SV của nhóm bị bỏ vẫn còn dòng trạng thái đọc.
    expect(await prisma.trangThaiThongBao.count({ where: { matb } })).toBe(
      truoc,
    );
  });

  it('deleteAnnounce xoá thông báo + dữ liệu phụ thuộc (cascade)', async () => {
    requireFixture(
      matb && gvCookie,
      'announcement created by a preceding test and teacher session',
    );
    const res = await post('/teacher_announcement/deleteAnnounce', gvCookie, {
      matb,
    });
    expect(res.text).toBe('true');

    expect(await prisma.thongBao.findUnique({ where: { matb } })).toBeNull();
    expect(await prisma.chiTietThongBao.count({ where: { matb } })).toBe(0);
    expect(await prisma.trangThaiThongBao.count({ where: { matb } })).toBe(0);
    matb = 0;
  });

  // ── Thống kê ───────────────────────────────────────────────────────────────

  it('GET /statistic (tổng hợp) và /statistic?made= (chi tiết) render được', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    await request(server)
      .get('/statistic')
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(200);
    await request(server)
      .get(`/statistic?made=${fixture.made}`)
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(200);
    // Đề không tồn tại / không phải của mình → 404.
    await request(server)
      .get('/statistic?made=999999')
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(404);
    if (gv2Cookie) {
      await request(server)
        .get(`/statistic?made=${fixture.made}`)
        .set('Accept', 'text/html')
        .set('Cookie', gv2Cookie)
        .expect(404);
    }
  });

  it('getStatictical (tất cả nhóm) khớp số liệu tính độc lập — kể cả quirk đếm trùng', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/statistic/getStatictical', gvCookie, {
      made: fixture.made,
      manhom: 0,
    });
    const mong = await tinhThongKeDe(fixture.made, 0);

    expect(res.body.da_nop_bai).toBe(mong.da_nop_bai);
    expect(res.body.chua_nop_bai).toBe(mong.chua_nop_bai);
    expect(res.body.khong_thi).toBe(mong.khong_thi);
    expect(res.body.diem_cao_nhat).toBeCloseTo(mong.diem_cao_nhat, 2);
    expect(res.body.diem_trung_binh).toBeCloseTo(mong.diem_trung_binh, 2);
    expect(res.body.thong_ke_diem).toEqual(mong.thong_ke_diem);

    // QUIRK PHP: JOIN chitietnhom chỉ theo manguoidung → SV học nhiều nhóm bị
    // đếm nhiều lần khi chọn "Tất cả nhóm". Số bài THẬT nhỏ hơn hoặc bằng.
    const soBaiThat = await prisma.ketQua.count({
      where: { made: fixture.made, diemthi: { not: null } },
    });
    expect(res.body.da_nop_bai).toBeGreaterThanOrEqual(soBaiThat);
  });

  it('getStatictical lọc theo 1 nhóm → chỉ đếm bài của nhóm đó', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const gd = await prisma.giaoDeThi.findFirst({
      where: { made: fixture.made },
      select: { manhom: true },
    });
    requireFixture(gd, 'assigned group for statistics');

    const res = await post('/statistic/getStatictical', gvCookie, {
      made: fixture.made,
      manhom: gd.manhom,
    });
    const mong = await tinhThongKeDe(fixture.made, gd.manhom);

    expect(res.body.da_nop_bai).toBe(mong.da_nop_bai);
    expect(res.body.khong_thi).toBe(mong.khong_thi);
    expect(res.body.diem_trung_binh).toBeCloseTo(mong.diem_trung_binh, 2);
    expect(res.body.thong_ke_diem).toEqual(mong.thong_ke_diem);
  });

  it('thong_ke_diem có 10 khoảng và bỏ sót điểm 10 (giữ quirk PHP)', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/statistic/getStatictical', gvCookie, {
      made: fixture.made,
      manhom: 0,
    });
    const bins = res.body.thong_ke_diem as number[];
    expect(bins).toHaveLength(10);

    const mong = await tinhThongKeDe(fixture.made, 0);
    // Điểm đúng 10 không rơi vào khoảng nào → tổng cột = số bài có điểm < 10.
    expect(bins.reduce((a, b) => a + b, 0)).toBe(mong.so_bai_duoi_10);
  });

  it('getStatictical với đề của người khác → trả {error}, KHÔNG lộ số liệu', async () => {
    requireFixture(
      fixture && gv2Cookie,
      'seeded business fixture and second teacher session',
    );
    const res = await post('/statistic/getStatictical', gv2Cookie, {
      made: fixture.made,
      manhom: 0,
    });
    expect(res.body.error).toMatch(/không có quyền|không tồn tại/i);
    expect(res.body).not.toHaveProperty('da_nop_bai');
  });

  it('getFilters + getGroupsBySubject nạp môn học / nhóm theo học kỳ - năm học', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const filters = await post('/statistic/getFilters', gvCookie, {
      mahocky: fixture.hocky,
      namhoc: fixture.namhoc,
    });
    expect(
      (filters.body.subjects as { mamonhoc: string }[]).some(
        (s) => s.mamonhoc === fixture!.g1.mamonhoc,
      ),
    ).toBe(true);
    expect(
      (filters.body.groups as { manhom: number }[]).some(
        (g) => g.manhom === fixture!.g1.manhom,
      ),
    ).toBe(true);

    const groups = await post('/statistic/getGroupsBySubject', gvCookie, {
      mahocky: fixture.hocky,
      namhoc: fixture.namhoc,
      mamonhoc: fixture.g1.mamonhoc,
    });
    expect(
      (groups.body as { manhom: number }[]).some(
        (g) => g.manhom === fixture!.g1.manhom,
      ),
    ).toBe(true);

    // Học kỳ không có đề của GV → dropdown rỗng (không lỗi).
    const rong = await post('/statistic/getFilters', gvCookie, {
      mahocky: 999999,
      namhoc: fixture.namhoc,
    });
    expect(rong.body.subjects).toEqual([]);
    expect(rong.body.groups).toEqual([]);
  });

  it('getAggregatedStatistical khớp số liệu tính độc lập (có/không lọc môn)', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/statistic/getAggregatedStatistical', gvCookie, {
      mahocky: fixture.hocky,
      namhoc: fixture.namhoc,
      mamonhoc: '',
      manhom: '',
    });
    const mong = await tinhThongKeTongHop(fixture.hocky, fixture.namhoc);

    expect(res.body.da_nop_bai).toBe(mong.da_nop_bai);
    expect(res.body.chua_nop_bai).toBe(mong.chua_nop_bai);
    expect(res.body.khong_thi).toBe(mong.khong_thi);
    expect(res.body.diem_cao_nhat).toBeCloseTo(mong.diem_cao_nhat, 2);
    expect(res.body.diem_trung_binh).toBeCloseTo(mong.diem_trung_binh, 2);
    expect(res.body.thong_ke_diem).toEqual(mong.thong_ke_diem);

    const theoMon = await post(
      '/statistic/getAggregatedStatistical',
      gvCookie,
      {
        mahocky: fixture.hocky,
        namhoc: fixture.namhoc,
        mamonhoc: fixture.g1.mamonhoc,
        manhom: fixture.g1.manhom,
      },
    );
    const mongMon = await tinhThongKeTongHop(
      fixture.hocky,
      fixture.namhoc,
      fixture.g1.mamonhoc,
      fixture.g1.manhom,
    );
    expect(theoMon.body.da_nop_bai).toBe(mongMon.da_nop_bai);
    expect(theoMon.body.khong_thi).toBe(mongMon.khong_thi);
    expect(theoMon.body.da_nop_bai).toBeLessThanOrEqual(res.body.da_nop_bai);
  });

  it('SV KHÔNG vào được trang/API thống kê (403)', async () => {
    requireFixture(
      svCookie && fixture,
      'student session and seeded business fixture',
    );
    await request(server)
      .get('/statistic')
      .set('Accept', 'text/html')
      .set('Cookie', svCookie)
      .expect(403);
    await post('/statistic/getStatictical', svCookie, {
      made: fixture.made,
      manhom: 0,
    }).expect(403);
  });

  // ── Tính lại kỳ vọng ĐỘC LẬP với SQL của service ───────────────────────────

  /**
   * Thống kê 1 đề, tính bằng các truy vấn Prisma đơn giản (không tái dùng câu
   * SQL của service) — kể cả quirk "đếm theo số nhóm SV tham gia".
   */
  async function tinhThongKeDe(made: number, manhom: number) {
    const kq = await prisma.ketQua.findMany({
      where: { made },
      select: { manguoidung: true, diemthi: true },
    });
    const memberships = kq.length
      ? await prisma.chiTietNhom.findMany({
          where: {
            manguoidung: { in: kq.map((r) => r.manguoidung) },
            ...(manhom ? { manhom } : {}),
          },
          select: { manguoidung: true },
        })
      : [];
    const soLan = (u: string) =>
      memberships.filter((m) => m.manguoidung === u).length;

    const bins = new Array<number>(10).fill(0);
    let da_nop_bai = 0;
    let chua_nop_bai = 0;
    let tong = 0;
    let dem = 0;
    let diem_cao_nhat = 0;
    let so_bai_duoi_10 = 0;
    for (const r of kq) {
      const lan = soLan(r.manguoidung);
      if (lan === 0) continue;
      if (r.diemthi === null) {
        chua_nop_bai += lan;
        continue;
      }
      da_nop_bai += lan;
      tong += r.diemthi * lan;
      dem += lan;
      const capped = Math.min(r.diemthi, 10);
      diem_cao_nhat = Math.max(diem_cao_nhat, capped);
      if (capped < 10) {
        bins[Math.floor(capped)] += lan;
        so_bai_duoi_10 += lan;
      }
    }

    // Không thi = thành viên nhóm được giao đề nhưng chưa có kết quả.
    const assigned = await prisma.giaoDeThi.findMany({
      where: { made },
      select: { manhom: true },
    });
    let khong_thi = 0;
    for (const g of assigned) {
      if (manhom && g.manhom !== manhom) continue;
      const members = await prisma.chiTietNhom.findMany({
        where: { manhom: g.manhom },
        select: { manguoidung: true },
      });
      for (const m of members) {
        if (!kq.some((r) => r.manguoidung === m.manguoidung)) khong_thi++;
      }
    }

    return {
      da_nop_bai,
      chua_nop_bai,
      khong_thi,
      diem_cao_nhat,
      diem_trung_binh: dem ? round1(tong / dem) : 0,
      thong_ke_diem: bins,
      so_bai_duoi_10,
    };
  }

  /** Thống kê tổng hợp theo học kỳ/năm học, tính độc lập như trên. */
  async function tinhThongKeTongHop(
    hocky: number,
    namhoc: number,
    mamonhoc?: string,
    manhom?: number,
  ) {
    const de = await prisma.deThi.findMany({
      where: {
        nguoitao: GV,
        trangthai: 1,
        ...(mamonhoc ? { monthi: mamonhoc } : {}),
      },
      select: { made: true },
    });
    const madeList = de.map((d) => d.made);
    const giao = madeList.length
      ? await prisma.giaoDeThi.findMany({ where: { made: { in: madeList } } })
      : [];
    const nhomHopLe = await prisma.nhom.findMany({
      where: {
        trangthai: 1,
        hocky,
        namhoc,
        ...(manhom ? { manhom } : {}),
      },
      select: { manhom: true },
    });
    const nhomIds = new Set(nhomHopLe.map((n) => n.manhom));
    const cap = giao.filter((g) => nhomIds.has(g.manhom));

    const kq = madeList.length
      ? await prisma.ketQua.findMany({
          where: { made: { in: madeList } },
          select: { made: true, manguoidung: true, diemthi: true },
        })
      : [];
    const thanhVien = cap.length
      ? await prisma.chiTietNhom.findMany({
          where: { manhom: { in: cap.map((c) => c.manhom) } },
          select: { manhom: true, manguoidung: true },
        })
      : [];
    const laThanhVien = (u: string, g: number) =>
      thanhVien.some((t) => t.manguoidung === u && t.manhom === g);

    const bins = new Array<number>(10).fill(0);
    const diem: number[] = [];
    let da_nop_bai = 0;
    let chua_nop_bai = 0;
    for (const r of kq) {
      for (const c of cap) {
        if (c.made !== r.made || !laThanhVien(r.manguoidung, c.manhom))
          continue;
        if (r.diemthi === null) chua_nop_bai++;
        else {
          da_nop_bai++;
          diem.push(Math.min(r.diemthi, 10));
        }
      }
    }
    for (const d of diem) if (d < 10) bins[Math.floor(d)]++;

    // COUNT(DISTINCT manguoidung) — đếm theo NGƯỜI, không theo lượt đề.
    const chuaLam = new Set<string>();
    for (const c of cap) {
      for (const t of thanhVien) {
        if (t.manhom !== c.manhom) continue;
        const daLam = kq.some(
          (r) => r.made === c.made && r.manguoidung === t.manguoidung,
        );
        if (!daLam) chuaLam.add(t.manguoidung);
      }
    }

    return {
      da_nop_bai,
      chua_nop_bai,
      khong_thi: chuaLam.size,
      diem_cao_nhat: diem.length ? Math.max(...diem) : 0,
      diem_trung_binh: diem.length
        ? round1(diem.reduce((a, b) => a + b, 0) / diem.length)
        : 0,
      thong_ke_diem: bins,
    };
  }
});
