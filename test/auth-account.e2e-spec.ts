import request from 'supertest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/prisma/prisma.service';
import { SupabaseStorageService } from '@/storage/supabase-storage.service';
import { EmailService } from '@/email/email.service';
import {
  createTestApp,
  login,
  requireFixture,
  fixtureFailure,
} from './setup-app';

/**
 * e2e cho 4 mảng bổ sung sau khi rà soát lại toàn bộ so với bản PHP:
 *  1. `POST /test/getTestGroup` — tab "Đề kiểm tra" ở offcanvas nhóm học phần (GV).
 *  2. `POST /user/addFileExcel` — nhập người dùng hàng loạt ở trang Người dùng.
 *  3. Trang cá nhân `/account` — đổi mật khẩu / hồ sơ / ảnh đại diện.
 *  4. Đăng ký tài khoản + khôi phục mật khẩu bằng OTP (`/auth/*`).
 *
 * An toàn dữ liệu:
 * - Mọi thao tác GHI đều nhắm vào các tài khoản `E2EAC…` do chính test tạo;
 *   `afterAll` xoá sạch chúng và ảnh đại diện test đã ghi ra `public/media/avatars`.
 * - `EmailService.sendRegisterOtp` bị **thay bằng hàm rỗng** trong lúc chạy test
 *   nên KHÔNG có email nào được gửi thật; mã OTP đọc thẳng từ cột `nguoidung.otp`.
 * - Thiếu dữ liệu mẫu → bỏ qua kèm cảnh báo thay vì đỏ oan.
 */
describe('Trang cá nhân, đăng ký/khôi phục mật khẩu, đề của nhóm, nhập user Excel (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;

  let gvCookie: string | null = null;
  let svCookie: string | null = null;

  const GV = 'gv001';
  const PREFIX = `E2EAC${Date.now().toString().slice(-6)}`;
  /** Tài khoản do luồng đăng ký tạo ra (dùng lại cho trang cá nhân + khôi phục). */
  const ACC = {
    id: `${PREFIX}A`,
    email: `${PREFIX.toLowerCase()}a@dht.edu.vn`,
    password: 'matkhau123',
  };
  /** URL ảnh đại diện test đã đẩy lên Supabase — `afterAll` xoá lại. */
  const uploadedAvatars: string[] = [];

  /** PNG 1x1 hợp lệ. */
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  let fixtureNhom: number | null = null;
  /** Đề đã có bài làm trong nhóm mẫu (cho getExamineeByGroup). */
  let fixtureMade: number | null = null;

  const post = (
    path: string,
    cookie: string | null,
    body: Record<string, unknown>,
  ) => {
    const req = request(server)
      .post(path)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form');
    if (cookie) req.set('Cookie', cookie);
    return req.send(body);
  };

  /** File .xlsx danh sách SV đúng bố cục bản mẫu (dữ liệu từ dòng 3). */
  async function buildStudentXlsx(
    rows: { mssv: string; hoDem: string; ten: string; email: string }[],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('DSSV');
    sheet.getRow(1).getCell(1).value = 'DANH SÁCH SINH VIÊN';
    rows.forEach((r, i) => {
      const line = sheet.getRow(3 + i);
      line.getCell(2).value = r.mssv;
      line.getCell(3).value = r.hoDem;
      line.getCell(4).value = r.ten;
      line.getCell(8).value = r.email;
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Cùng bố cục nhưng ghi ra định dạng `.xls` cũ (BIFF) — exceljs không ghi được. */
  function buildStudentXls(
    rows: { mssv: string; hoDem: string; ten: string; email: string }[],
  ): Buffer {
    const aoa: unknown[][] = [
      ['DANH SÁCH SINH VIÊN'],
      [],
      ...rows.map((r) => ['', r.mssv, r.hoDem, r.ten, '', '', '', r.email]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'DSSV');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer;
  }

  const svExcel = [1, 2].map((i) => ({
    mssv: `${PREFIX}X${i}`,
    hoDem: 'Trần Thị',
    ten: `Excel${i}`,
    email: `${PREFIX.toLowerCase()}x${i}@dht.edu.vn`,
  }));

  /** Người dùng nhập từ file `.xls` cũ (tiền tố khác để đối chiếu riêng). */
  const svExcelXls = [1, 2].map((i) => ({
    mssv: `${PREFIX}Z${i}`,
    hoDem: 'Phạm Văn',
    ten: `Biff${i}`,
    email: `${PREFIX.toLowerCase()}z${i}@dht.edu.vn`,
  }));

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // KHÔNG gửi email thật trong lúc test.
    jest
      .spyOn(app.get(EmailService), 'sendRegisterOtp')
      .mockResolvedValue(undefined);

    gvCookie = await login(app, GV);

    const nhom = await prisma.$queryRaw<{ manhom: number }[]>`
      SELECT N.manhom FROM nhom N
      JOIN giaodethi GDT ON GDT.manhom = N.manhom
      WHERE N.giangvien = ${GV}
      GROUP BY N.manhom
      ORDER BY N.manhom ASC
      LIMIT 1
    `;
    fixtureNhom = nhom[0]?.manhom ?? null;

    // Đề của nhóm đó đã có người nộp bài (để kiểm getExamineeByGroup).
    if (fixtureNhom) {
      const made = await prisma.$queryRaw<{ made: number }[]>`
        SELECT KQ.made
        FROM ketqua KQ
        JOIN giaodethi GDT ON GDT.made = KQ.made
        WHERE GDT.manhom = ${fixtureNhom}
        GROUP BY KQ.made
        ORDER BY KQ.made ASC
        LIMIT 1
      `;
      fixtureMade = made[0]?.made ?? null;
    }

    const sv = await prisma.nguoiDung.findFirst({
      where: { manhomquyen: 2, id: { notIn: [ACC.id] } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    requireFixture(sv, 'student account for RBAC assertions');
    svCookie = await login(app, sv.id);
  }, 90_000);

  afterAll(async () => {
    // Ảnh đại diện do test upload — xoá khỏi bucket Supabase trước khi xoá user.
    if (app && uploadedAvatars.length) {
      const storage = app.get(SupabaseStorageService);
      for (const url of uploadedAvatars) await storage.remove(url);
    }
    if (prisma) {
      await prisma.chiTietNhom.deleteMany({
        where: { manguoidung: { startsWith: PREFIX } },
      });
      await prisma.nguoiDung.deleteMany({
        where: { id: { startsWith: PREFIX } },
      });
    }
    await app?.close();
  }, 60_000);

  // ── 1. Đề đã giao cho 1 nhóm (offcanvas nhóm học phần) ─────────────────────

  it('POST /test/getTestGroup trả đề của nhóm, thời gian đã định dạng H:i d/m/Y', async () => {
    if (!gvCookie || !fixtureNhom)
      return fixtureFailure('chưa có nhóm mẫu có đề');
    const res = await post('/test/getTestGroup', gvCookie, {
      manhom: fixtureNhom,
    }).expect(201);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const expected = await prisma.giaoDeThi.count({
      where: { manhom: fixtureNhom },
    });
    expect(res.body.length).toBe(expected);

    for (const t of res.body) {
      expect(typeof t.made).toBe('number');
      expect(t.tende).toBeTruthy();
      expect(t.thoigianbatdau).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}$/);
      expect(t.thoigianketthuc).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}$/);
    }
    // ORDER BY made DESC
    const ids = res.body.map((t: { made: number }) => t.made);
    expect([...ids].sort((a: number, b: number) => b - a)).toEqual(ids);
  });

  it('POST /test/getTestGroup nhóm không tồn tại → mảng rỗng; SV → 403', async () => {
    requireFixture(gvCookie, 'teacher session');
    const res = await post('/test/getTestGroup', gvCookie, {
      manhom: 999999,
    }).expect(201);
    expect(res.body).toEqual([]);

    if (svCookie) {
      await post('/test/getTestGroup', svCookie, { manhom: 1 }).expect(403);
    }
  });

  it('POST /test/getExamineeByGroup trả bài làm của đề, lọc theo nhóm', async () => {
    if (!gvCookie || !fixtureNhom || !fixtureMade) {
      return fixtureFailure('chưa có đề đã nộp bài trong nhóm mẫu');
    }
    const res = await post('/test/getExamineeByGroup', gvCookie, {
      made: fixtureMade,
      manhom: fixtureNhom,
    }).expect(201);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    // Đối chiếu độc lập: SV vừa có ketqua của đề này, vừa thuộc nhóm.
    const members = await prisma.chiTietNhom.findMany({
      where: { manhom: fixtureNhom },
      select: { manguoidung: true },
    });
    const ids = members.map((m) => m.manguoidung);
    const expected = await prisma.ketQua.count({
      where: { made: fixtureMade, manguoidung: { in: ids } },
    });
    expect(res.body.length).toBe(expected);

    for (const row of res.body) {
      expect(row.made).toBe(fixtureMade);
      expect(ids).toContain(row.manguoidung);
      // Có kèm thông tin người dùng (email/hoten/avatar) như SQL gốc.
      expect(row.email).toBeTruthy();
      expect(row.hoten).toBeTruthy();
      expect(row).toHaveProperty('avatar');
      expect(row).toHaveProperty('makq');
    }
  });

  it('POST /test/getExamineeByGroup: nhóm/đề không khớp → rỗng; SV → 403', async () => {
    requireFixture(gvCookie && fixtureMade, 'teacher session and !fixtureMade');
    const res = await post('/test/getExamineeByGroup', gvCookie, {
      made: fixtureMade,
      manhom: 999999,
    }).expect(201);
    expect(res.body).toEqual([]);

    if (svCookie) {
      await post('/test/getExamineeByGroup', svCookie, {
        made: fixtureMade,
        manhom: fixtureNhom ?? 1,
      }).expect(403);
    }
  });

  // ── 2. Nhập người dùng hàng loạt từ Excel (trang Người dùng) ───────────────

  it('POST /user/addExcel → /user/addFileExcel tạo tài khoản, chạy lại báo đã có', async () => {
    requireFixture(gvCookie, 'teacher session');
    const file = await buildStudentXlsx(svExcel);

    const parsed = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .attach('fileToUpload', file, 'dssv.xlsx')
      .expect(201);
    expect(parsed.body.status).toBe('success');
    expect(parsed.body.data).toHaveLength(svExcel.length);

    const res = await post('/user/addFileExcel', gvCookie, {
      listuser: JSON.stringify(parsed.body.data),
      password: 'matkhau123',
    }).expect(201);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toContain(`${svExcel.length} người dùng`);

    // Tài khoản tạo ra: nhóm quyền 2, mật khẩu đã băm và đăng nhập được.
    const created = await prisma.nguoiDung.findUnique({
      where: { id: svExcel[0].mssv },
    });
    expect(created?.manhomquyen).toBe(2);
    expect(created?.matkhau).not.toBe('matkhau123');
    expect(created?.hoten).toBe(`${svExcel[0].hoDem} ${svExcel[0].ten}`);
    expect(await login(app, svExcel[0].mssv, 'matkhau123')).toBeTruthy();

    // Chạy lại: không nhân bản, báo đã có tài khoản.
    const again = await post('/user/addFileExcel', gvCookie, {
      listuser: JSON.stringify(parsed.body.data),
      password: 'matkhau123',
    }).expect(201);
    expect(again.body.message).toContain('Đã có tài khoản');
    expect(
      await prisma.nguoiDung.count({ where: { id: { startsWith: PREFIX } } }),
    ).toBe(svExcel.length);
  }, 60_000);

  it('POST /user/addFileExcel: danh sách hỏng → error; SV → 403', async () => {
    requireFixture(gvCookie, 'teacher session');
    const bad = await post('/user/addFileExcel', gvCookie, {
      listuser: 'khong-phai-json',
      password: 'matkhau123',
    }).expect(201);
    expect(bad.body.status).toBe('error');

    if (svCookie) {
      await post('/user/addFileExcel', svCookie, {
        listuser: '[]',
        password: 'matkhau123',
      }).expect(403);
    }
  });

  it('nhập người dùng từ file .xls CŨ (BIFF) cũng chạy trọn luồng', async () => {
    requireFixture(gvCookie, 'teacher session');
    const parsed = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .attach('fileToUpload', buildStudentXls(svExcelXls), 'dssv.xls')
      .expect(201);
    expect(parsed.body.status).toBe('success');
    expect(parsed.body.data).toHaveLength(svExcelXls.length);

    const res = await post('/user/addFileExcel', gvCookie, {
      listuser: JSON.stringify(parsed.body.data),
      password: 'matkhau123',
    }).expect(201);
    expect(res.body.status).toBe('success');

    const created = await prisma.nguoiDung.findUnique({
      where: { id: svExcelXls[0].mssv },
    });
    expect(created?.hoten).toBe(`${svExcelXls[0].hoDem} ${svExcelXls[0].ten}`);
    expect(created?.email).toBe(svExcelXls[0].email);
    expect(created?.manhomquyen).toBe(2);
  }, 60_000);

  // ── 3. Đăng ký tài khoản ───────────────────────────────────────────────────

  it('GET /auth/signup và /auth/recover render được (không cần đăng nhập)', async () => {
    const signup = await request(server).get('/auth/signup').expect(200);
    expect(signup.text).toContain('/auth/addUser');
    const recover = await request(server).get('/auth/recover').expect(200);
    expect(recover.text).toContain('reminder-credential');
  });

  it('POST /auth/addUser tạo tài khoản Sinh Viên và đăng nhập được', async () => {
    const res = await post('/auth/addUser', null, {
      masinhvien: ACC.id,
      email: ACC.email,
      hoten: 'Nguyễn Văn Kiểm Thử',
      ngaysinh: '2004-03-02',
      gioitinh: '1',
      sodienthoai: '0900000001',
      password: ACC.password,
      confirm_password: ACC.password,
    }).expect(201);

    expect(res.body.status).toBe('success');

    const user = await prisma.nguoiDung.findUnique({ where: { id: ACC.id } });
    expect(user?.manhomquyen).toBe(2); // luôn là Sinh Viên, không nhận role từ client
    expect(user?.trangthai).toBe(1);
    expect(user?.gioitinh).toBe(true); // 1 = Nam theo quy ước chung
    expect(await login(app, ACC.id, ACC.password)).toBeTruthy();
  });

  it('POST /auth/addUser chặn trùng mã/email, lệch mật khẩu, mật khẩu quá ngắn', async () => {
    const trungId = await post('/auth/addUser', null, {
      masinhvien: ACC.id,
      email: `${PREFIX.toLowerCase()}b@dht.edu.vn`,
      hoten: 'X',
      password: 'matkhau123',
      confirm_password: 'matkhau123',
    }).expect(201);
    expect(trungId.body.message).toBe('Mã sinh viên đã được sử dụng');

    const trungEmail = await post('/auth/addUser', null, {
      masinhvien: `${PREFIX}B`,
      email: ACC.email,
      hoten: 'X',
      password: 'matkhau123',
      confirm_password: 'matkhau123',
    }).expect(201);
    expect(trungEmail.body.message).toBe('Email đã được sử dụng');

    const lech = await post('/auth/addUser', null, {
      masinhvien: `${PREFIX}C`,
      email: `${PREFIX.toLowerCase()}c@dht.edu.vn`,
      hoten: 'X',
      password: 'matkhau123',
      confirm_password: 'khac12345',
    }).expect(201);
    expect(lech.body.message).toBe('Mật khẩu xác nhận không khớp');

    await post('/auth/addUser', null, {
      masinhvien: `${PREFIX}D`,
      email: `${PREFIX.toLowerCase()}d@dht.edu.vn`,
      hoten: 'X',
      password: '123',
      confirm_password: '123',
    }).expect(400);

    expect(
      await prisma.nguoiDung.count({
        where: { id: { startsWith: `${PREFIX}B` } },
      }),
    ).toBe(0);
  });

  // ── 4. Khôi phục mật khẩu bằng OTP ────────────────────────────────────────

  it('luồng khôi phục: gửi OTP → xác minh → đổi mật khẩu (và chặn mọi lối tắt)', async () => {
    // Chưa có vé: 3 route đều từ chối, 2 trang đều chuyển hướng.
    // Route trả boolean trần → đọc qua res.text (superagent không dựng lại scalar JSON).
    expect((await post('/auth/checkOpt', null, { otp: '123456' })).text).toBe(
      'false',
    );
    expect(
      (await post('/auth/changePassword', null, { password: 'abcdef123' })).body
        .status,
    ).toBe('error');
    expect((await post('/auth/resendOtpAuth', null, {})).body.status).toBe(
      'error',
    );
    expect((await request(server).get('/auth/otp')).headers.location).toBe(
      '/auth/recover',
    );
    expect(
      (await request(server).get('/auth/changepass')).headers.location,
    ).toBe('/auth/recover');

    // Email không tồn tại → báo lỗi, không cấp vé.
    const lac = await post('/auth/sendOptAuth', null, {
      'reminder-credential': `khongton-${PREFIX.toLowerCase()}@dht.edu.vn`,
    }).expect(201);
    expect(lac.body.status).toBe('error');

    // Gửi OTP cho tài khoản test → có cookie vé khôi phục.
    const sent = await post('/auth/sendOptAuth', null, {
      'reminder-credential': ACC.email,
    }).expect(201);
    expect(sent.body.status).toBe('success');
    const rawCookie = sent.headers['set-cookie'];
    const ticket = (Array.isArray(rawCookie) ? rawCookie : [rawCookie])
      .filter(Boolean)
      .map((c: string) => c.split(';')[0])
      .join('; ');
    expect(ticket).toContain('recover_ticket');

    const otp = (
      await prisma.nguoiDung.findUnique({
        where: { id: ACC.id },
        select: { otp: true },
      })
    )?.otp;
    expect(otp).toMatch(/^\d{6}$/);

    // Có vé nhưng CHƯA xác minh OTP: không được đổi mật khẩu, trang bị đẩy về /auth/otp.
    const somQua = await request(server)
      .post('/auth/changePassword')
      .set('Cookie', ticket)
      .type('form')
      .send({ password: 'matkhaumoi9' })
      .expect(201);
    expect(somQua.body.status).toBe('error');
    expect(
      (await request(server).get('/auth/changepass').set('Cookie', ticket))
        .headers.location,
    ).toBe('/auth/otp');

    // Trang OTP hiển thị đúng email lấy từ vé (không phải từ localStorage).
    const otpPage = await request(server)
      .get('/auth/otp')
      .set('Cookie', ticket)
      .expect(200);
    expect(otpPage.text).toContain(ACC.email);

    // OTP sai → false; OTP đúng → true + vé được nâng cấp.
    const sai = await request(server)
      .post('/auth/checkOpt')
      .set('Cookie', ticket)
      .type('form')
      .send({ otp: '000000' })
      .expect(201);
    expect(sai.text).toBe('false');

    const dung = await request(server)
      .post('/auth/checkOpt')
      .set('Cookie', ticket)
      .type('form')
      .send({ otp })
      .expect(201);
    expect(dung.text).toBe('true');
    const verified = (
      Array.isArray(dung.headers['set-cookie'])
        ? dung.headers['set-cookie']
        : [dung.headers['set-cookie']]
    )
      .filter(Boolean)
      .map((c: string) => c.split(';')[0])
      .join('; ');

    // Đổi mật khẩu thành công, OTP bị xoá, mật khẩu cũ hết hiệu lực.
    const doi = await request(server)
      .post('/auth/changePassword')
      .set('Cookie', verified)
      .type('form')
      .send({ password: 'matkhaumoi9' })
      .expect(201);
    expect(doi.body.status).toBe('success');

    expect(
      (
        await prisma.nguoiDung.findUnique({
          where: { id: ACC.id },
          select: { otp: true },
        })
      )?.otp,
    ).toBeNull();
    expect(await login(app, ACC.id, 'matkhaumoi9')).toBeTruthy();
    await request(server)
      .post('/auth/login')
      .send({ id: ACC.id, password: ACC.password })
      .expect(401);

    ACC.password = 'matkhaumoi9';
  }, 60_000);

  // ── 5. Trang cá nhân ──────────────────────────────────────────────────────

  it('GET /account render hồ sơ của chính người đăng nhập', async () => {
    const cookie = await login(app, ACC.id, ACC.password);
    if (!cookie) return fixtureFailure('không đăng nhập được tài khoản test');

    const res = await request(server)
      .get('/account')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.text).toContain(ACC.id);
    expect(res.text).toContain(ACC.email);
    expect(res.text).toContain('/public/js/pages/account_setting.js');
    expect(res.text).toContain('Mã sinh viên'); // nhóm quyền 2

    await request(server).get('/account').expect(401);
  });

  it('POST /account/changePassword: sai mật khẩu cũ bị từ chối, đúng thì đổi được', async () => {
    const cookie = await login(app, ACC.id, ACC.password);
    requireFixture(cookie, 'authenticated session');

    const sai = await post('/account/changePassword', cookie, {
      matkhaucu: 'saibet123',
      matkhaumoi: 'khongdoiduoc',
    }).expect(201);
    expect(sai.body).toEqual({
      valid: false,
      message: 'Mật khẩu hiện tại không đúng.',
    });
    expect(await login(app, ACC.id, ACC.password)).toBeTruthy();

    const dung = await post('/account/changePassword', cookie, {
      matkhaucu: ACC.password,
      matkhaumoi: 'matkhau456',
    }).expect(201);
    expect(dung.body.valid).toBe(true);
    expect(await login(app, ACC.id, 'matkhau456')).toBeTruthy();
    ACC.password = 'matkhau456';
  }, 30_000);

  it('POST /account/changeProfile: email trùng bị chặn, hợp lệ thì lưu đúng', async () => {
    const cookie = await login(app, ACC.id, ACC.password);
    requireFixture(cookie, 'authenticated session');

    const gv = await prisma.nguoiDung.findUnique({
      where: { id: GV },
      select: { email: true },
    });
    requireFixture(gv, 'teacher account for the duplicate-email case');
    {
      const trung = await post('/account/changeProfile', cookie, {
        hoten: 'Đổi Tên',
        email: gv.email,
        ngaysinh: '2004-01-01',
        gioitinh: '1',
      }).expect(201);
      expect(trung.body).toEqual({
        valid: false,
        message: 'Địa chỉ email đã tồn tại !',
      });
    }

    const moi = `${PREFIX.toLowerCase()}a2@dht.edu.vn`;
    const ok = await post('/account/changeProfile', cookie, {
      hoten: 'Tên Mới Sau Khi Đổi',
      email: moi,
      ngaysinh: '2003-12-25',
      gioitinh: '0',
    }).expect(201);
    expect(ok.body.valid).toBe(true);

    const user = await prisma.nguoiDung.findUnique({ where: { id: ACC.id } });
    expect(user?.hoten).toBe('Tên Mới Sau Khi Đổi');
    expect(user?.email).toBe(moi);
    expect(user?.gioitinh).toBe(false);
    expect(user?.ngaysinh?.toISOString().slice(0, 10)).toBe('2003-12-25');
    ACC.email = moi;

    await post('/account/changeProfile', cookie, {
      hoten: 'X',
      email: 'khong-phai-email',
    }).expect(400);
  }, 30_000);

  it('POST /account/uploadFile: nhận .png, từ chối file lạ và request không có file', async () => {
    const cookie = await login(app, ACC.id, ACC.password);
    requireFixture(cookie, 'authenticated session');

    const ok = await request(server)
      .post('/account/uploadFile')
      .set('Cookie', cookie)
      .attach('file-img', PNG, 'anh.png')
      .expect(201);
    expect(ok.text).toBe('true');

    const user = await prisma.nguoiDung.findUnique({
      where: { id: ACC.id },
      select: { avatar: true },
    });
    // Ảnh nay nằm trên Supabase Storage → cột `avatar` lưu URL đầy đủ.
    expect(user?.avatar).toMatch(/^https?:\/\/.+\/avatars\/.+\.png$/);
    uploadedAvatars.push(user!.avatar!);

    // Trang cá nhân dùng thẳng URL đó (không ghép /public/media/avatars/ nữa).
    const trang = await request(server)
      .get('/account')
      .set('Cookie', cookie)
      .expect(200);
    expect(trang.text).toContain(`src="${user!.avatar!}"`);

    const sai = await request(server)
      .post('/account/uploadFile')
      .set('Cookie', cookie)
      .attach('file-img', Buffer.from('khong phai anh'), 'note.txt')
      .expect(201);
    expect(sai.text).toBe('false');

    const trong = await request(server)
      .post('/account/uploadFile')
      .set('Cookie', cookie)
      .expect(201);
    expect(trong.text).toBe('false');
  }, 30_000);

  it('avatar dạng TÊN FILE cũ vẫn hiển thị qua /public/media/avatars/', async () => {
    const cookie = await login(app, ACC.id, ACC.password);
    requireFixture(cookie, 'authenticated session');

    // Dữ liệu cũ (seed/bản PHP) lưu tên file chứ không phải URL.
    await prisma.nguoiDung.update({
      where: { id: ACC.id },
      data: { avatar: 'ANHSV.png' },
    });
    const trang = await request(server)
      .get('/account')
      .set('Cookie', cookie)
      .expect(200);
    expect(trang.text).toContain('src="/public/media/avatars/ANHSV.png"');
  }, 30_000);
});
