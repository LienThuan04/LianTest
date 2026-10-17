import request from 'supertest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { join } from 'path';
import { existsSync } from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '@/prisma/prisma.service';
import { cellText } from '@/common/utils/excel.util';
import {
  createTestApp,
  login,
  requireFixture,
  fixtureFailure,
} from './setup-app';

/**
 * e2e Phase 7 slice 1: **xuất Excel / in PDF / nhập SV từ .xlsx**.
 * Trước đây mới kiểm bằng script tay (2026-08-07 và 2026-08-08) — bộ này đưa
 * hết vào e2e để không hỏng ngầm về sau.
 *
 * Điểm khác các bộ e2e trước: file .xlsx trả về được **đọc ngược lại bằng
 * exceljs** (round-trip) để chắc chắn file mở được và đúng nội dung, chứ không
 * chỉ kiểm `status=true`.
 *
 * An toàn dữ liệu:
 * - Các ca XUẤT file chỉ đọc dữ liệu mẫu.
 * - Các ca NHẬP SV ghi vào một **nhóm học phần tạm** do test tạo (`[E2E-XL]`),
 *   không đụng nhóm mẫu; `afterAll` xoá nhóm tạm (chitietnhom cascade) rồi xoá
 *   các tài khoản test đã tạo.
 * - Thiếu dữ liệu mẫu → bỏ qua kèm cảnh báo thay vì đỏ oan.
 */
describe('Xuất Excel / in PDF / nhập SV từ .xlsx (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let prisma: PrismaService;

  let gvCookie: string | null = null;
  let svCookie: string | null = null;

  const GV = 'gv001';
  /** Tiền tố mã SV do test tạo — dùng để dọn dẹp. */
  const PREFIX = `E2EXL${Date.now().toString().slice(-6)}`;

  let fixture: {
    /** Nhóm mẫu có SV + có đề đã thi (chỉ ĐỌC). */
    manhom: number;
    tennhom: string;
    mamonhoc: string;
    namhoc: number;
    hocky: number;
    made: number;
    makq: number;
    svs: string[];
  } | null = null;

  /** Nhóm tạm do test tạo (chỉ dùng cho các ca nhập SV). */
  let tempNhom = 0;

  const post = (path: string, cookie: string, body: Record<string, unknown>) =>
    request(server)
      .post(path)
      .set('Cookie', cookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .type('form')
      .send(body);

  /** Tách phần base64 của data-URI rồi nạp lại thành workbook để đọc kiểm. */
  async function readXlsx(dataUri: string): Promise<ExcelJS.Worksheet> {
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
    return wb.worksheets[0];
  }

  const text = (sheet: ExcelJS.Worksheet, row: number, col: number) => {
    const v = sheet.getRow(row).getCell(col).value;
    // Ô kiểu object (rich text/công thức/ngày) → dùng chính helper của app.
    return typeof v === 'object' && v !== null ? cellText(v) : String(v ?? '');
  };

  /**
   * Dựng file .xlsx danh sách SV đúng bố cục bản mẫu: dữ liệu từ **dòng 3**,
   * cột B=MSSV, C=họ đệm, D=tên, H=email.
   */
  async function buildStudentXlsx(
    rows: { mssv: string; hoDem: string; ten: string; email: string }[],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('DSSV');
    sheet.getRow(1).getCell(1).value = 'DANH SÁCH SINH VIÊN';
    sheet.getRow(2).getCell(2).value = 'MSSV';
    sheet.getRow(2).getCell(3).value = 'Họ đệm';
    sheet.getRow(2).getCell(4).value = 'Tên';
    sheet.getRow(2).getCell(8).value = 'Email';
    rows.forEach((r, i) => {
      const line = sheet.getRow(3 + i);
      line.getCell(2).value = r.mssv;
      line.getCell(3).value = r.hoDem;
      line.getCell(4).value = r.ten;
      line.getCell(8).value = r.email;
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * Cùng bố cục nhưng ghi ra **định dạng `.xls` cũ (BIFF)** — exceljs không ghi
   * được nên dùng SheetJS, đúng thứ mà server phải đọc được ở nhánh `.xls`.
   */
  function buildStudentXls(
    rows: { mssv: string; hoDem: string; ten: string; email: string }[],
  ): Buffer {
    const aoa: unknown[][] = [
      ['DANH SÁCH SINH VIÊN'],
      ['', 'MSSV', 'Họ đệm', 'Tên', '', '', '', 'Email'],
      ...rows.map((r) => ['', r.mssv, r.hoDem, r.ten, '', '', '', r.email]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'DSSV');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer;
  }

  /** 3 SV hợp lệ dùng cho luồng nhập nhóm. */
  const svMoi = [0, 1, 2].map((i) => ({
    mssv: `${PREFIX}${i}`,
    hoDem: 'Nguyễn Văn',
    ten: `Test${i}`,
    email: `${PREFIX.toLowerCase()}${i}@e2e.local`,
  }));

  /** 2 SV riêng cho luồng nhập từ file `.xls` (vẫn cùng tiền tố để dọn dẹp). */
  const svXls = [0, 1].map((i) => ({
    mssv: `${PREFIX}X${i}`,
    hoDem: 'Lê Thị',
    ten: `Biff${i}`,
    email: `${PREFIX.toLowerCase()}x${i}@e2e.local`,
  }));

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    gvCookie = await login(app, GV);
    if (!gvCookie) return fixtureFailure(`CSDL chưa có tài khoản mẫu ${GV}`);

    // Nhóm mẫu của GV có SV và có đề đã thi (để xuất bảng điểm + in phiếu).
    const rows = await prisma.$queryRaw<
      { manhom: number; made: number; makq: number }[]
    >`
      SELECT N.manhom, KQ.made, MIN(KQ.makq)::int AS makq
      FROM nhom N
      JOIN giaodethi GDT ON GDT.manhom = N.manhom
      JOIN ketqua KQ ON KQ.made = GDT.made
      WHERE N.giangvien = ${GV} AND N.trangthai = 1
      GROUP BY N.manhom, KQ.made
      ORDER BY N.manhom ASC
      LIMIT 1
    `;
    if (!rows.length) {
      return fixtureFailure(
        'CSDL chưa có nhóm + đề đã có bài làm (chạy seed-demo)',
      );
    }

    const nhom = await prisma.nhom.findUnique({
      where: { manhom: rows[0].manhom },
    });
    const members = await prisma.chiTietNhom.findMany({
      where: { manhom: rows[0].manhom },
      select: { manguoidung: true },
      orderBy: { manguoidung: 'asc' },
    });
    if (!nhom || nhom.namhoc == null || nhom.hocky == null || !members.length) {
      return fixtureFailure('nhóm mẫu thiếu thành viên hoặc năm học/học kỳ');
    }

    fixture = {
      manhom: nhom.manhom,
      tennhom: nhom.tennhom,
      mamonhoc: nhom.mamonhoc,
      namhoc: nhom.namhoc,
      hocky: nhom.hocky,
      made: rows[0].made,
      makq: rows[0].makq,
      svs: members.map((m) => m.manguoidung),
    };

    svCookie = await login(app, fixture.svs[0]);

    // Nhóm TẠM cho các ca nhập SV — không đụng nhóm mẫu.
    const created = await prisma.nhom.create({
      data: {
        tennhom: `[E2E-XL] Nhóm nhập Excel ${Date.now()}`,
        mamoi: `e2e${Date.now().toString().slice(-7)}`,
        siso: 0,
        namhoc: fixture.namhoc,
        hocky: fixture.hocky,
        trangthai: 1,
        hienthi: 1,
        giangvien: GV,
        mamonhoc: fixture.mamonhoc,
      },
    });
    tempNhom = created.manhom;
  }, 90_000);

  afterAll(async () => {
    if (prisma) {
      if (tempNhom) {
        await prisma.nhom.delete({ where: { manhom: tempNhom } }); // cascade chitietnhom
      }
      await prisma.chiTietNhom.deleteMany({
        where: { manguoidung: { startsWith: PREFIX } },
      });
      await prisma.nguoiDung.deleteMany({
        where: { id: { startsWith: PREFIX } },
      });
    }
    await app?.close();
  }, 60_000);

  // ── Xuất danh sách SV của nhóm ─────────────────────────────────────────────

  it('POST /module/exportExcelStudentS trả .xlsx mở lại được, đủ SV của nhóm', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/module/exportExcelStudentS', gvCookie, {
      manhom: fixture.manhom,
    });

    expect(res.body.status).toBe(true);
    expect(res.body.filename).toBe('Danh sách sinh viên.xlsx');
    expect(res.body.file).toContain(
      'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,',
    );

    const sheet = await readXlsx(res.body.file);
    expect(text(sheet, 1, 1)).toBe('MSSV');
    expect(text(sheet, 1, 6)).toBe('Giới tính');

    const mssv: string[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) mssv.push(text(sheet, r, 1));
    expect(mssv.sort()).toEqual([...fixture.svs].sort());
    // Cột giới tính ra chuỗi 'Null' khi CSDL chưa có dữ liệu — ĐÚNG CHỦ Ý (giữ bản PHP).
    expect(text(sheet, 2, 6)).toBe('Null');
  });

  it('nhóm chưa có SV → file chỉ có dòng header (không lỗi)', async () => {
    requireFixture(
      tempNhom && gvCookie,
      'temporary import group and teacher session',
    );
    const res = await post('/module/exportExcelStudentS', gvCookie, {
      manhom: tempNhom,
    });
    expect(res.body.status).toBe(true);
    const sheet = await readXlsx(res.body.file);
    expect(text(sheet, 1, 1)).toBe('MSSV');
    expect(text(sheet, 2, 1)).toBe('');
  });

  // ── Xuất bảng điểm 1 đề ────────────────────────────────────────────────────

  it('POST /test/exportExcel (lọc 1 nhóm) — SV đã thi có điểm, SV chưa thi ghi "Chưa làm"', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/test/exportExcel', gvCookie, {
      made: fixture.made,
      manhom: fixture.manhom,
      ds: [],
    });

    expect(res.body.status).toBe(true);
    expect(res.body.filename).toBe(
      `Ket_qua_de_${fixture.made}_nhom_${fixture.manhom}.xlsx`,
    );

    const sheet = await readXlsx(res.body.file);
    // Dòng 1 = tiêu đề gộp; dòng 2 = header 10 cột; dữ liệu từ dòng 3.
    expect(text(sheet, 1, 1)).toContain(`MÃ ĐỀ: ${fixture.made}`);
    expect(text(sheet, 1, 1)).toContain(fixture.tennhom);
    expect(text(sheet, 2, 1)).toBe('MSSV');
    expect(text(sheet, 2, 3)).toBe('ĐIỂM TỔNG');
    expect(text(sheet, 2, 10)).toBe('Lần chuyển Tab');

    const kq = await prisma.ketQua.findMany({
      where: { made: fixture.made },
      select: {
        manguoidung: true,
        diemthi: true,
        diem_tuluan: true,
        diem_dochieu: true,
      },
    });
    const daThi = new Set(kq.map((r) => r.manguoidung));

    let dem = 0;
    for (let r = 3; r <= sheet.rowCount; r++) {
      const id = text(sheet, r, 1);
      if (!id) continue;
      dem++;
      if (daThi.has(id)) {
        const row = kq.find((k) => k.manguoidung === id)!;
        const tong =
          Math.round(((row.diemthi ?? 0) + (row.diem_tuluan ?? 0)) * 100) / 100;
        // ĐIỂM TỔNG = trắc nghiệm + tự luận + đọc hiểu (đọc hiểu đã nằm trong diemthi).
        expect(Number(text(sheet, r, 3))).toBeCloseTo(tong, 2);
        expect(text(sheet, r, 7)).not.toBe(''); // có thời gian vào thi
      } else {
        expect(text(sheet, r, 3)).toBe('Chưa làm');
        expect(text(sheet, r, 9)).toBe('Chưa làm');
      }
    }
    expect(dem).toBe(fixture.svs.length); // mọi SV của nhóm đều có dòng
  });

  it('POST /test/exportExcel (tất cả nhóm, ds=[mã nhóm]) — tiêu đề hiện TÊN LỚP thật', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/test/exportExcel', gvCookie, {
      made: fixture.made,
      manhom: 0,
      ds: [fixture.manhom],
    });

    expect(res.body.filename).toBe(`Ket_qua_de_${fixture.made}.xlsx`);
    const sheet = await readXlsx(res.body.file);
    // KHÁC PHP: PHP tra `tennhom IN (<mã nhóm>)` nên luôn ra "Tất cả các lớp";
    // ở đây tra theo manhom → hiện đúng tên lớp.
    expect(text(sheet, 1, 1)).toContain(fixture.tennhom);
    expect(text(sheet, 1, 1)).not.toContain('Tất cả các lớp');

    const ids: string[] = [];
    for (let r = 3; r <= sheet.rowCount; r++) {
      const id = text(sheet, r, 1);
      if (id) ids.push(id);
    }
    expect(ids.sort()).toEqual([...fixture.svs].sort());
  });

  it('POST /test/exportExcel không chọn nhóm nào → "Không có dữ liệu"', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/test/exportExcel', gvCookie, {
      made: fixture.made,
      manhom: 0,
      ds: [],
    });
    const sheet = await readXlsx(res.body.file);
    expect(text(sheet, 3, 1)).toBe('Không có dữ liệu');
  });

  // ── Bảng điểm tất cả đề của nhóm ───────────────────────────────────────────

  it('POST /test/getMarkOfAllTest dựng ma trận SV × đề, ghép đúng theo cặp', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await post('/test/getMarkOfAllTest', gvCookie, {
      manhom: fixture.manhom,
    });

    expect(res.body.status).toBe(true);
    expect(res.body.filename).toBe(`Bang_diem_nhom_${fixture.manhom}.xlsx`);

    const sheet = await readXlsx(res.body.file);
    expect(text(sheet, 1, 1)).toContain(fixture.tennhom);
    expect(text(sheet, 2, 1)).toBe('Mã sinh viên');
    expect(text(sheet, 2, 2)).toBe('Tên sinh viên');

    const tests = await prisma.$queryRaw<{ made: number; tende: string }[]>`
      SELECT DT.made, DT.tende
      FROM giaodethi GDT JOIN dethi DT ON GDT.made = DT.made
      WHERE GDT.manhom = ${fixture.manhom}
      ORDER BY DT.made ASC
    `;
    tests.forEach((t, i) => {
      expect(text(sheet, 2, 3 + i)).toBe(t.tende);
    });

    // Từng ô điểm phải khớp cặp (SV, đề); SV chưa thi đề nào → ô rỗng.
    const kq = await prisma.ketQua.findMany({
      where: { made: { in: tests.map((t) => t.made) } },
      select: { made: true, manguoidung: true, diemthi: true },
    });
    for (let r = 3; r <= sheet.rowCount; r++) {
      const id = text(sheet, r, 1);
      if (!id) continue;
      tests.forEach((t, i) => {
        const diem = kq.find(
          (k) => k.manguoidung === id && k.made === t.made,
        )?.diemthi;
        const o = text(sheet, r, 3 + i);
        if (diem === undefined || diem === null) expect(o).toBe('');
        else expect(Number(o)).toBeCloseTo(diem, 2);
      });
    }
  });

  it('getMarkOfAllTest với nhóm chưa có SV → "Không có dữ liệu"', async () => {
    requireFixture(
      tempNhom && gvCookie,
      'temporary import group and teacher session',
    );
    const res = await post('/test/getMarkOfAllTest', gvCookie, {
      manhom: tempNhom,
    });
    const sheet = await readXlsx(res.body.file);
    expect(text(sheet, 3, 1)).toBe('Không có dữ liệu');
  });

  // ── Phiếu kết quả để in ────────────────────────────────────────────────────

  it('GET /test/exportPdf/:makq trả trang HTML tự in, đủ số câu + đúng điểm', async () => {
    requireFixture(
      fixture && gvCookie,
      'seeded business fixture and teacher session',
    );
    const res = await request(server)
      .get(`/test/exportPdf/${fixture.makq}`)
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(200);

    const kq = await prisma.ketQua.findUnique({
      where: { makq: fixture.makq },
    });
    // KHÁC PHP (dompdf): trả HTML tự gọi window.print() thay file application/pdf.
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('window.print()');
    expect(res.text).toContain(
      `Chi_tiet_ket_qua_${kq!.manguoidung}_MD${fixture.makq}`,
    );
    expect(res.text).toContain(Number(kq!.diemthi ?? 0).toFixed(2));

    // Số thứ tự câu đếm liên tục qua mọi loại câu hỏi.
    const soCau = await prisma.chiTietKetQua.count({
      where: { makq: fixture.makq },
    });
    expect(soCau).toBeGreaterThan(0);
    for (let i = 1; i <= soCau; i++) expect(res.text).toContain(`Câu ${i}`);
    expect(res.text).not.toContain(`Câu ${soCau + 1}`);
  });

  it('exportPdf với mã kết quả lạ → 404; SV không có quyền dethi.view → 403', async () => {
    requireFixture(gvCookie, 'teacher session');
    await request(server)
      .get('/test/exportPdf/999999')
      .set('Accept', 'text/html')
      .set('Cookie', gvCookie)
      .expect(404);

    if (svCookie && fixture) {
      await request(server)
        .get(`/test/exportPdf/${fixture.makq}`)
        .set('Accept', 'text/html')
        .set('Cookie', svCookie)
        .expect(403);
      await post('/test/exportExcel', svCookie, {
        made: fixture.made,
        manhom: fixture.manhom,
      }).expect(403);
    }
  });

  // ── Nhập SV từ .xlsx: đọc file ─────────────────────────────────────────────

  it('POST /user/addExcel đọc được FILE MẪU trong public/filemau', async () => {
    requireFixture(gvCookie, 'teacher session');
    const mau = join(process.cwd(), 'public', 'filemau', 'danhsachsv_mau.xlsx');
    if (!existsSync(mau))
      return fixtureFailure('thiếu file mẫu danhsachsv_mau.xlsx');

    const res = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', mau);

    expect(res.body.status).toBe('success');
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.mssv).toBeTruthy();
      expect(row.email).toContain('@');
      expect(row.nhomquyen).toBe(2); // mặc định là sinh viên
    }
  });

  it('addExcel bỏ qua dòng thiếu MSSV / email sai định dạng', async () => {
    requireFixture(gvCookie, 'teacher session');
    const buf = await buildStudentXlsx([
      ...svMoi,
      { mssv: '', hoDem: 'Thiếu', ten: 'MSSV', email: 'x@e2e.local' },
      {
        mssv: `${PREFIX}9`,
        hoDem: 'Sai',
        ten: 'Email',
        email: 'khong-phai-email',
      },
    ]);

    const res = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', buf, 'dssv.xlsx');

    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveLength(svMoi.length);
    expect((res.body.data as { mssv: string }[]).map((r) => r.mssv)).toEqual(
      svMoi.map((s) => s.mssv),
    );
    // Họ đệm + tên được ghép lại thành họ tên đầy đủ.
    expect(res.body.data[0].fullname).toBe(`${svMoi[0].hoDem} ${svMoi[0].ten}`);
  });

  it('addExcel đọc được file .xls CŨ (BIFF) y hệt file .xlsx', async () => {
    requireFixture(gvCookie, 'teacher session');
    const rows = [
      ...svXls,
      { mssv: '', hoDem: 'Thiếu', ten: 'MSSV', email: 'x@e2e.local' },
      { mssv: `${PREFIX}X9`, hoDem: 'Sai', ten: 'Email', email: 'sai-email' },
    ];

    const xls = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', buildStudentXls(rows), 'dssv.xls');
    expect(xls.body.status).toBe('success');
    expect(xls.body.data).toHaveLength(svXls.length);
    expect(xls.body.data[0]).toMatchObject({
      mssv: svXls[0].mssv,
      fullname: `${svXls[0].hoDem} ${svXls[0].ten}`,
      email: svXls[0].email,
      nhomquyen: 2,
    });

    // Cùng dữ liệu, ghi ra .xlsx → 2 nhánh đọc phải cho kết quả GIỐNG HỆT.
    const xlsx = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', await buildStudentXlsx(rows), 'dssv.xlsx');
    expect(xlsx.body.data).toEqual(xls.body.data);
  });

  it('addExcel: thiếu file / đuôi lạ / file hỏng → lỗi có kiểm soát (không 500)', async () => {
    requireFixture(gvCookie, 'teacher session');
    const thieu = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(thieu.body.status).toBe('error');
    expect(thieu.body.message).toMatch(/Chưa chọn file/);

    const buf = await buildStudentXlsx(svMoi);
    const csv = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', buf, 'dssv.csv');
    expect(csv.body.status).toBe('error');
    expect(csv.body.message).toMatch(/\.xlsx, \.xls/);

    const hong = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', Buffer.from('day khong phai excel'), 'hong.xlsx');
    expect(hong.status).toBe(201);
    expect(hong.body.status).toBe('error');

    // File rác mang đuôi .xls cũng phải rơi vào nhánh lỗi có kiểm soát.
    const hongXls = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', Buffer.from('day khong phai excel'), 'hong.xls');
    expect(hongXls.status).toBe(201);
    expect(hongXls.body.status).toBe('error');
  });

  it('addExcel yêu cầu đăng nhập (401)', async () => {
    const buf = await buildStudentXlsx(svMoi);
    await request(server)
      .post('/user/addExcel')
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', buf, 'dssv.xlsx')
      .expect(401);
  });

  // ── Nhập SV từ .xlsx: ghi vào nhóm ─────────────────────────────────────────

  it('POST /user/addFileExcelGroup tạo tài khoản + thêm vào nhóm + cập sỉ số', async () => {
    requireFixture(
      tempNhom && gvCookie,
      'temporary import group and teacher session',
    );
    const res = await post('/user/addFileExcelGroup', gvCookie, {
      listuser: JSON.stringify(
        svMoi.map((s) => ({
          fullname: `${s.hoDem} ${s.ten}`,
          email: s.email,
          mssv: s.mssv,
          nhomquyen: 2,
          trangthai: 1,
        })),
      ),
      password: '123456',
      group: tempNhom,
    });

    expect(res.body.status).toBe('success');
    expect(res.body.message).toContain(`Đã thêm ${svMoi.length} sinh viên`);

    const users = await prisma.nguoiDung.findMany({
      where: { id: { startsWith: PREFIX } },
      orderBy: { id: 'asc' },
    });
    expect(users).toHaveLength(svMoi.length);
    expect(users[0].manhomquyen).toBe(2);
    expect(users[0].matkhau).not.toBe('123456'); // đã băm bcrypt
    expect(users[0].matkhau?.startsWith('$2')).toBe(true);

    const members = await prisma.chiTietNhom.findMany({
      where: { manhom: tempNhom },
    });
    expect(members).toHaveLength(svMoi.length);
    expect(members.every((m) => m.hienthi === 1)).toBe(true);

    const nhom = await prisma.nhom.findUnique({ where: { manhom: tempNhom } });
    expect(nhom!.siso).toBe(members.length);

    // Tài khoản mới đăng nhập được bằng mật khẩu mặc định vừa đặt.
    expect(await login(app, svMoi[0].mssv, '123456')).not.toBeNull();
  });

  it('nhập lại đúng danh sách đó → báo "đã có trong nhóm", KHÔNG nhân bản', async () => {
    requireFixture(
      tempNhom && gvCookie,
      'temporary import group and teacher session',
    );
    const res = await post('/user/addFileExcelGroup', gvCookie, {
      listuser: JSON.stringify(
        svMoi.map((s) => ({
          fullname: `${s.hoDem} ${s.ten}`,
          email: s.email,
          mssv: s.mssv,
          nhomquyen: 2,
          trangthai: 1,
        })),
      ),
      password: '123456',
      group: tempNhom,
    });

    expect(res.body.status).toBe('success');
    expect(res.body.message).toContain('đã có trong nhóm');
    expect(
      await prisma.chiTietNhom.count({ where: { manhom: tempNhom } }),
    ).toBe(svMoi.length);
    expect(
      await prisma.nguoiDung.count({ where: { id: { startsWith: PREFIX } } }),
    ).toBe(svMoi.length);
  });

  it('email trùng người dùng sẵn có → bắt P2002, KHÔNG tạo bản ghi mồ côi', async () => {
    requireFixture(
      tempNhom && gvCookie && fixture,
      'temporary import group and teacher session and seeded business fixture',
    );
    const cu = await prisma.nguoiDung.findUnique({
      where: { id: fixture.svs[0] },
      select: { email: true },
    });
    requireFixture(
      cu?.email,
      'existing student email for the duplicate-email case',
    );

    const mssvLoi = `${PREFIX}TRUNG`;
    const res = await post('/user/addFileExcelGroup', gvCookie, {
      listuser: JSON.stringify([
        {
          fullname: 'Trùng Email',
          email: cu.email,
          mssv: mssvLoi,
          nhomquyen: 2,
          trangthai: 1,
        },
      ]),
      password: '123456',
      group: tempNhom,
    });

    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('đã tồn tại');
    expect(
      await prisma.nguoiDung.findUnique({ where: { id: mssvLoi } }),
    ).toBeNull();
    expect(
      await prisma.chiTietNhom.count({
        where: { manhom: tempNhom, manguoidung: mssvLoi },
      }),
    ).toBe(0);
  });

  it('addFileExcelGroup với danh sách hỏng / thiếu nhóm → lỗi có kiểm soát', async () => {
    requireFixture(
      tempNhom && gvCookie,
      'temporary import group and teacher session',
    );
    const hong = await post('/user/addFileExcelGroup', gvCookie, {
      listuser: 'day-khong-phai-json',
      password: '123456',
      group: tempNhom,
    });
    expect(hong.body.status).toBe('error');
    expect(hong.body.message).toMatch(/không hợp lệ/);

    const rong = await post('/user/addFileExcelGroup', gvCookie, {
      listuser: '[]',
      password: '123456',
      group: tempNhom,
    });
    expect(rong.body.status).toBe('error');

    // Không có ghi nhận nào phát sinh thêm.
    expect(
      await prisma.chiTietNhom.count({ where: { manhom: tempNhom } }),
    ).toBe(svMoi.length);
  });

  // Luồng đầy đủ khởi đầu từ file .xls cũ — để cuối cùng vì có thêm thành viên
  // vào nhóm tạm (các ca trên đối chiếu sỉ số theo `svMoi`).
  it('nhập SV vào nhóm từ file .xls: addExcel → addFileExcelGroup', async () => {
    requireFixture(
      tempNhom && gvCookie,
      'temporary import group and teacher session',
    );

    const parsed = await request(server)
      .post('/user/addExcel')
      .set('Cookie', gvCookie)
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('fileToUpload', buildStudentXls(svXls), 'dssv.xls');
    expect(parsed.body.status).toBe('success');

    const res = await post('/user/addFileExcelGroup', gvCookie, {
      listuser: JSON.stringify(parsed.body.data),
      password: '123456',
      group: tempNhom,
    });
    expect(res.body.status).toBe('success');
    expect(res.body.message).toContain(`Đã thêm ${svXls.length} sinh viên`);

    const users = await prisma.nguoiDung.findMany({
      where: { id: { startsWith: `${PREFIX}X` } },
      orderBy: { id: 'asc' },
    });
    expect(users.map((u) => u.id)).toEqual(svXls.map((s) => s.mssv));
    expect(users[0].hoten).toBe(`${svXls[0].hoDem} ${svXls[0].ten}`);

    const nhom = await prisma.nhom.findUnique({ where: { manhom: tempNhom } });
    expect(nhom!.siso).toBe(svMoi.length + svXls.length);
  }, 60_000);
});
