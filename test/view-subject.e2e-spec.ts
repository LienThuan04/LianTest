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
 * e2e trang **"Môn học của tôi"** (`/view_subject/*`) — port view_subject.php +
 * XemMonHocModel.php: giảng viên chỉ thấy môn được PHÂN CÔNG cho chính mình,
 * lọc theo năm học/học kỳ + tìm kiếm, kèm quản lý chương của môn đó.
 *
 * An toàn dữ liệu:
 * - Các ca đọc chỉ dùng dữ liệu mẫu, đối chiếu số liệu **tính lại độc lập** bằng
 *   Prisma thay vì hardcode.
 * - Ca "phân công đã xoá mềm không hiện" TỰ TẠO 1 dòng `phancong` trangthai=0 rồi
 *   xoá đúng dòng đó.
 * - Ca quản lý chương tạo 1 chương tạm rồi **xoá CỨNG** ở `afterAll` (route chỉ
 *   xoá mềm nên phải dọn tay để CSDL về nguyên trạng).
 * - Thiếu dữ liệu mẫu → bỏ qua kèm cảnh báo thay vì đỏ oan.
 */
describe('Môn học của tôi — view_subject (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;

  let gvCookie: string | null = null;
  let svCookie: string | null = null;

  const GV = 'gv001';
  const TEMP_CHAPTER = `[E2E-VS] Chương tạm ${Date.now()}`;

  let fixture: {
    mamonhoc: string;
    tenmonhoc: string;
    namhoc: number;
    hocky: number;
    /** Tổng số dòng phân công (trangthai=1, môn còn hoạt động) của GV. */
    total: number;
  } | null = null;

  /** Phân công xoá mềm do test tạo — dọn ở afterAll. */
  let softDeleted: { mamonhoc: string; namhoc: number; hocky: number } | null =
    null;

  const post = (path: string, cookie: string, body: Record<string, unknown>) =>
    request(server)
      .post(path)
      .set('Cookie', cookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send(body);

  /** Gọi phân trang y pagination.js: mọi tham số gói trong chuỗi JSON `args`. */
  const paginate = (cookie: string, args: Record<string, unknown>) =>
    post('/view_subject/pagination', cookie, {
      args: JSON.stringify({ controller: 'view_subject', ...args }),
    });

  const totalPages = (cookie: string, args: Record<string, unknown>) =>
    post('/view_subject/getTotalPages', cookie, {
      args: JSON.stringify({ controller: 'view_subject', ...args }),
    });

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    gvCookie = await login(app, GV);
    if (!gvCookie) return fixtureFailure(`CSDL chưa có tài khoản mẫu ${GV}`);

    const rows = await prisma.$queryRaw<
      { mamonhoc: string; tenmonhoc: string; namhoc: number; hocky: number }[]
    >`
      SELECT pc.mamonhoc, mh.tenmonhoc, pc.namhoc, pc.hocky
      FROM phancong pc
      JOIN monhoc mh ON mh.mamonhoc = pc.mamonhoc
      WHERE pc.manguoidung = ${GV} AND pc.trangthai = 1 AND mh.trangthai = 1
      ORDER BY pc.namhoc DESC, pc.hocky DESC, pc.mamonhoc ASC
      LIMIT 1
    `;
    if (!rows.length)
      return fixtureFailure('CSDL chưa có phân công mẫu (chạy seed-demo)');

    const [count] = await prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM (
        SELECT DISTINCT pc.mamonhoc, pc.namhoc, pc.hocky
        FROM phancong pc
        JOIN monhoc mh ON mh.mamonhoc = pc.mamonhoc
        WHERE pc.manguoidung = ${GV} AND pc.trangthai = 1 AND mh.trangthai = 1
      ) t
    `;

    fixture = { ...rows[0], total: count.total };

    // SV bất kỳ để kiểm RBAC (nhóm quyền 2 không có quyền xem_monhoc/hocphan).
    const sv = await prisma.nguoiDung.findFirst({
      where: { manhomquyen: 2 },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (sv) svCookie = await login(app, sv.id);
  }, 90_000);

  afterAll(async () => {
    if (prisma) {
      // Chương tạm: route chỉ xoá MỀM → xoá cứng để CSDL về nguyên trạng.
      await prisma.chuong.deleteMany({
        where: { tenchuong: { startsWith: '[E2E-VS]' } },
      });
      if (softDeleted) {
        await prisma.phanCong.deleteMany({
          where: { ...softDeleted, manguoidung: GV, trangthai: 0 },
        });
      }
    }
    await app?.close();
  }, 60_000);

  // ── Trang SSR ──────────────────────────────────────────────────────────────

  it('GET /view_subject trả trang có đủ hook cho pagination.js + view_subject.js', async () => {
    requireFixture(gvCookie, 'teacher session');
    const res = await request(server)
      .get('/view_subject')
      .set('Cookie', gvCookie)
      .expect(200);

    expect(res.text).toContain('id="list-subject"');
    expect(res.text).toContain('id="filter-namhoc"');
    expect(res.text).toContain('id="filter-hocky"');
    expect(res.text).toContain('class="pagination-container"');
    expect(res.text).toContain('/public/js/pages/view_subject.js');
    expect(res.text).toContain('id="modal-chapter"');
  });

  // ── Dropdown năm học / học kỳ ─────────────────────────────────────────────

  it('POST /view_subject/getNamHoc trả năm học có phân công của GV', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/view_subject/getNamHoc', gvCookie, {}).expect(201);

    expect(res.body.success).toBe(true);
    const codes = res.body.data.map((n: { manamhoc: number }) => n.manamhoc);
    expect(codes).toContain(fixture.namhoc);
    // Không trùng lặp (SELECT DISTINCT).
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('POST /view_subject/getHocKy trả học kỳ của đúng năm học đó', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/view_subject/getHocKy', gvCookie, {
      namhoc: fixture.namhoc,
    }).expect(201);

    expect(res.body.success).toBe(true);
    const codes = res.body.data.map((h: { mahocky: number }) => h.mahocky);
    expect(codes).toContain(fixture.hocky);

    // Mọi học kỳ trả về phải thuộc năm học đã hỏi.
    const belong = await prisma.hocKy.count({
      where: { mahocky: { in: codes }, manamhoc: fixture.namhoc },
    });
    expect(belong).toBe(codes.length);
  });

  it('POST /view_subject/getHocKy thiếu tham số namhoc → 400', async () => {
    requireFixture(gvCookie, 'teacher session');
    await post('/view_subject/getHocKy', gvCookie, {}).expect(400);
  });

  // ── Phân trang danh sách môn được phân công ───────────────────────────────

  it('POST /view_subject/pagination chỉ trả môn phân công cho chính GV', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await paginate(gvCookie, { limit: 50, page: 1 }).expect(201);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(fixture.total);
    for (const row of res.body) {
      expect(row.manguoidung).toBe(GV);
      expect(row.tenmonhoc).toBeTruthy();
    }
    expect(
      res.body.some(
        (r: { mamonhoc: string }) => r.mamonhoc === fixture!.mamonhoc,
      ),
    ).toBe(true);
  });

  it('POST /view_subject/getTotalPages khớp số dòng thật', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await totalPages(gvCookie, { limit: 1, page: 1 }).expect(201);
    expect(res.body.totalPages).toBe(fixture.total);
  });

  it('phân trang cắt đúng trang (limit=1 → trang 1 khác trang 2)', async () => {
    requireFixture(
      fixture && gvCookie && !(fixture.total < 2),
      'seeded business fixture and teacher session and at least two subject assignments',
    );
    const p1 = await paginate(gvCookie, { limit: 1, page: 1 }).expect(201);
    const p2 = await paginate(gvCookie, { limit: 1, page: 2 }).expect(201);

    expect(p1.body).toHaveLength(1);
    expect(p2.body).toHaveLength(1);
    expect(JSON.stringify(p1.body[0])).not.toBe(JSON.stringify(p2.body[0]));
  });

  it('lọc theo năm học + học kỳ chỉ trả đúng năm/kỳ đó', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await paginate(gvCookie, {
      limit: 50,
      page: 1,
      filter: { namhoc: String(fixture.namhoc), hocky: '', input: '' },
    }).expect(201);

    expect(res.body.length).toBeGreaterThan(0);
    for (const row of res.body) expect(row.namhoc).toBe(fixture.namhoc);

    const res2 = await paginate(gvCookie, {
      limit: 50,
      page: 1,
      filter: {
        namhoc: String(fixture.namhoc),
        hocky: String(fixture.hocky),
        input: '',
      },
    }).expect(201);

    expect(res2.body.length).toBeGreaterThan(0);
    for (const row of res2.body) {
      expect(row.namhoc).toBe(fixture.namhoc);
      expect(row.hocky).toBe(fixture.hocky);
    }
  });

  it('tìm kiếm nhận cả args.input lẫn filter.input, không phân biệt hoa thường', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const keyword = fixture.mamonhoc.toLowerCase();

    // Nhánh pagination.js gán (gõ vào ô tìm kiếm).
    const byArgs = await paginate(gvCookie, {
      limit: 50,
      page: 1,
      input: keyword,
    }).expect(201);
    expect(byArgs.body.length).toBeGreaterThan(0);
    for (const row of byArgs.body) expect(row.mamonhoc).toBe(fixture.mamonhoc);

    // Nhánh nút kính lúp — KHÁC PHP: bản gốc bỏ qua filter.input nên nút vô tác dụng.
    const byFilter = await paginate(gvCookie, {
      limit: 50,
      page: 1,
      filter: { namhoc: '', hocky: '', input: keyword },
    }).expect(201);
    expect(byFilter.body.map((r: { mamonhoc: string }) => r.mamonhoc)).toEqual(
      byArgs.body.map((r: { mamonhoc: string }) => r.mamonhoc),
    );

    // Từ khoá không khớp gì → mảng rỗng + 0 trang.
    const none = await paginate(gvCookie, {
      limit: 50,
      page: 1,
      input: 'khong-ton-tai-zzz',
    }).expect(201);
    expect(none.body).toEqual([]);
    const nonePages = await totalPages(gvCookie, {
      limit: 10,
      page: 1,
      input: 'khong-ton-tai-zzz',
    }).expect(201);
    expect(nonePages.body.totalPages).toBe(0);
  });

  it('phân công đã xoá mềm (trangthai=0) KHÔNG hiện trong danh sách', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );

    // Chọn 1 môn còn hoạt động chưa được phân công cho GV ở năm/kỳ này.
    const free = await prisma.$queryRaw<{ mamonhoc: string }[]>`
      SELECT mh.mamonhoc FROM monhoc mh
      WHERE mh.trangthai = 1
        AND NOT EXISTS (
          SELECT 1 FROM phancong pc
          WHERE pc.mamonhoc = mh.mamonhoc AND pc.manguoidung = ${GV}
            AND pc.namhoc = ${fixture.namhoc} AND pc.hocky = ${fixture.hocky}
        )
      ORDER BY mh.mamonhoc ASC LIMIT 1
    `;
    if (!free.length)
      return fixtureFailure('không còn môn trống để dựng ca xoá mềm');

    softDeleted = {
      mamonhoc: free[0].mamonhoc,
      namhoc: fixture.namhoc,
      hocky: fixture.hocky,
    };
    await prisma.phanCong.create({
      data: { ...softDeleted, manguoidung: GV, trangthai: 0 },
    });

    const res = await paginate(gvCookie, { limit: 50, page: 1 }).expect(201);
    expect(
      res.body.some(
        (r: { mamonhoc: string }) => r.mamonhoc === free[0].mamonhoc,
      ),
    ).toBe(false);
    expect(res.body.length).toBe(fixture.total);
  });

  // ── Quản lý chương của môn ────────────────────────────────────────────────

  it('thêm → đổi tên → xoá mềm chương của môn được phân công', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );

    const before = await post('/view_subject/getAllChapter', gvCookie, {
      mamonhoc: fixture.mamonhoc,
    }).expect(201);
    const soLuong = before.body.length;

    expect(
      (
        await post('/view_subject/addChapter', gvCookie, {
          mamonhoc: fixture.mamonhoc,
          tenchuong: TEMP_CHAPTER,
        }).expect(201)
      ).text,
    ).toBe('true');

    const added = await post('/view_subject/getAllChapter', gvCookie, {
      mamonhoc: fixture.mamonhoc,
    }).expect(201);
    expect(added.body).toHaveLength(soLuong + 1);
    const temp = added.body.find(
      (c: { tenchuong: string }) => c.tenchuong === TEMP_CHAPTER,
    );
    expect(temp).toBeTruthy();

    const tenMoi = `${TEMP_CHAPTER} (đã đổi)`;
    expect(
      (
        await post('/view_subject/updateChapter', gvCookie, {
          machuong: temp.machuong,
          tenchuong: tenMoi,
        }).expect(201)
      ).text,
    ).toBe('true');
    expect(
      (await prisma.chuong.findUnique({ where: { machuong: temp.machuong } }))
        ?.tenchuong,
    ).toBe(tenMoi);

    expect(
      (
        await post('/view_subject/chapterDelete', gvCookie, {
          machuong: temp.machuong,
        }).expect(201)
      ).text,
    ).toBe('true');

    // Xoá MỀM: biến khỏi danh sách nhưng bản ghi vẫn còn với trangthai = 0.
    const after = await post('/view_subject/getAllChapter', gvCookie, {
      mamonhoc: fixture.mamonhoc,
    }).expect(201);
    expect(after.body).toHaveLength(soLuong);
    expect(
      (await prisma.chuong.findUnique({ where: { machuong: temp.machuong } }))
        ?.trangthai,
    ).toBe(0);
  });

  it('thêm chương thiếu tên → 400 (DTO chặn trước khi vào CSDL)', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    await post('/view_subject/addChapter', gvCookie, {
      mamonhoc: fixture.mamonhoc,
      tenchuong: '',
    }).expect(400);
  });

  // ── RBAC ──────────────────────────────────────────────────────────────────

  it('sinh viên mở trang → 403 (trang lỗi HTML), gọi AJAX → 403 JSON', async () => {
    requireFixture(svCookie, 'student session');
    const page = await request(server)
      .get('/view_subject')
      .set('Cookie', svCookie)
      .set('Accept', 'text/html')
      .expect(403);
    expect(page.text).toContain('403');

    const ajax = await paginate(svCookie, { limit: 10, page: 1 }).expect(403);
    expect(ajax.body.code).toBe('FORBIDDEN');
  });

  it('chưa đăng nhập → 401 ở cả trang lẫn AJAX', async () => {
    await request(server)
      .post('/view_subject/getNamHoc')
      .set('X-Requested-With', 'XMLHttpRequest')
      .expect(401);

    // Trình duyệt (GET + Accept: text/html) → chuyển hướng về trang đăng nhập.
    const page = await request(server)
      .get('/view_subject')
      .set('Accept', 'text/html');
    expect([302, 401]).toContain(page.status);
  });
});
