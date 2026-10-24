// Ghi dữ liệu mẫu nghiệp vụ của hệ thi vào DB (Phase 7 slice 2).
//
// Hàm thuần (KHÔNG phụ thuộc Nest) nhận sẵn một PrismaClient để dùng được ở 2 nơi:
//   1. `SeedDbService` khi SEED_DEMO_DATA=true (chạy lúc app khởi động);
//   2. script một lần `scripts/seed-demo.cjs` (require bản build trong `dist/`).
//
// Các khoá tự tăng (manamhoc/mahocky/machuong/macauhoi/madv/manhom/made) được tạo tuần
// tự rồi tra ngược qua Map theo `key`/tên khai báo trong `data/*.json` — nhờ vậy
// file dữ liệu không phải hardcode id.
//
// Không bọc toàn bộ trong một transaction dài. Ngân hàng câu và kết quả được ghi
// bằng các lô nhỏ atomic; lỗi vẫn dừng seed và có thể để lại các lô đã commit.
// Khi seed dở, dùng DB test sạch để chạy lại; không tự retry một commit chưa rõ.

import { PrismaClient } from '@prisma/client';
import { loadSeedData } from '../seed-data.loader';
import { seedExamTimes } from '../seed-exam-times';
import {
  seedQuestionBank,
  SEED_BATCH_SIZE,
  SEED_TRANSACTION_OPTIONS,
} from './question-bank.seeder';
import type {
  IDemoDeThi,
  IDemoSeedData,
  ISeedDataset,
} from './seed-data.types';

export interface ISeedDemoOptions {
  /** A dataset prevalidated by loadSeedData, e.g. before explicit clear-and-seed. */
  dataset?: ISeedDataset;
  /** Hàm ghi log (mặc định `console.log`). */
  log?: (message: string) => void;
  /** Bỏ qua kiểm tra "DB đã có dữ liệu nghiệp vụ" (dùng ngay sau clearExamDemo). */
  force?: boolean;
}

/** Kết quả seed để nơi gọi in tóm tắt / kiểm thử. */
export interface ISeedDemoResult {
  skipped: boolean;
  monhoc: number;
  chuong: number;
  cauhoi: number;
  nhom: number;
  dethi: number;
  ketqua: number;
}

/** Bảng tra: mức độ trong `socau` của đề tự động ↔ giá trị cột `dokho`. */
const MUC_DO = [
  ['de', 1],
  ['tb', 2],
  ['kho', 3],
] as const;

/**
 * Xoá toàn bộ dữ liệu nghiệp vụ mẫu (KHÔNG đụng nguoidung/nhomquyen/chitietquyen/
 * danhmucchucnang — 4 bảng đó do `SeedDbService.clear()` quản). Xoá theo thứ tự phụ
 * thuộc; các bảng con có onDelete: Cascade vẫn xoá tường minh cho chắc vì phần lớn FK
 * trong schema để dạng scalar (giống DB MySQL gốc, không có ràng buộc thật).
 */
export async function clearExamDemo(
  prisma: PrismaClient,
  opts: ISeedDemoOptions = {},
): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));

  await prisma.chamTuLuan.deleteMany();
  await prisma.hinhAnhTraLoiTuLuan.deleteMany();
  await prisma.traLoiTuLuan.deleteMany();
  await prisma.chiTietKetQua.deleteMany();
  await prisma.ketQua.deleteMany();

  await prisma.chiTietDeThi.deleteMany();
  await prisma.deThiTuDong.deleteMany();
  await prisma.giaoDeThi.deleteMany();
  await prisma.deThi.deleteMany();

  await prisma.trangThaiThongBao.deleteMany();
  await prisma.chiTietThongBao.deleteMany();
  await prisma.thongBao.deleteMany();

  await prisma.chiTietNhom.deleteMany();
  await prisma.nhom.deleteMany();

  await prisma.cauTraLoi.deleteMany();
  await prisma.cauHoi.deleteMany();
  await prisma.doanVan.deleteMany();

  await prisma.phanCong.deleteMany();
  await prisma.chuong.deleteMany();
  await prisma.monHoc.deleteMany();
  await prisma.hocKy.deleteMany();
  await prisma.namHoc.deleteMany();

  log('Đã xoá dữ liệu nghiệp vụ mẫu (năm học → đề thi → kết quả).');
}

/** Seed dữ liệu mẫu nghiệp vụ. Idempotent: bỏ qua nếu DB đã có dữ liệu (trừ `force`). */
export async function seedExamDemo(
  prisma: PrismaClient,
  opts: ISeedDemoOptions = {},
): Promise<ISeedDemoResult> {
  const dataset = opts.dataset ?? loadSeedData({ includeDemo: true });
  if (!dataset.demo) throw new Error('Demo seed data was not loaded.');
  const referenceTime = dataset.referenceTime ?? Date.now();
  const {
    academicYears: demoNamHoc,
    subjects: demoMonHoc,
    assignments: demoPhanCong,
    groups: demoNhom,
    questions: demoCauHoi,
    readingPassages: demoDoanVan,
    exams: demoDeThi,
  } = dataset.demo;
  const log = opts.log ?? ((m: string) => console.log(m));
  const empty: ISeedDemoResult = {
    skipped: true,
    monhoc: 0,
    chuong: 0,
    cauhoi: 0,
    nhom: 0,
    dethi: 0,
    ketqua: 0,
  };

  if (!opts.force) {
    const [monhoc, namhoc, cauhoi, nhom, dethi] = await Promise.all([
      prisma.monHoc.count(),
      prisma.namHoc.count(),
      prisma.cauHoi.count(),
      prisma.nhom.count(),
      prisma.deThi.count(),
    ]);
    const total = monhoc + namhoc + cauhoi + nhom + dethi;
    if (total > 0) {
      log(
        `DB đã có dữ liệu nghiệp vụ (monhoc=${monhoc}, namhoc=${namhoc}, cauhoi=${cauhoi}, ` +
          `nhom=${nhom}, dethi=${dethi}). Bỏ qua seed dữ liệu mẫu.`,
      );
      return empty;
    }
  }

  // Người dùng phải được seed trước (data/users.json) vì nhóm/phân công/bài làm đều
  // All referenced users must exist before writing any demo rows.
  await assertDemoUsersExist(prisma, dataset.demo);

  // ── 1. Năm học + học kỳ ────────────────────────────────────────────────────
  const namhocIds = new Map<string, number>();
  const hockyIds = new Map<string, number>();
  for (const y of demoNamHoc) {
    const nh = await prisma.namHoc.create({
      data: { tennamhoc: y.tennamhoc, trangthai: 1 },
    });
    namhocIds.set(y.tennamhoc, nh.manamhoc);
    for (let i = 1; i <= y.sohocky; i++) {
      const hk = await prisma.hocKy.create({
        data: { tenhocky: `Học kỳ ${i}`, manamhoc: nh.manamhoc, sohocky: i },
      });
      hockyIds.set(JSON.stringify([y.tennamhoc, i]), hk.mahocky);
    }
  }
  log(`Năm học: ${namhocIds.size}, học kỳ: ${hockyIds.size}.`);

  // ── 2. Môn học + chương ────────────────────────────────────────────────────
  const chuongIds = new Map<string, number>();
  for (const m of demoMonHoc) {
    await prisma.monHoc.create({
      data: {
        mamonhoc: m.mamonhoc,
        tenmonhoc: m.tenmonhoc,
        sotinchi: m.sotinchi,
        sotietlythuyet: m.sotietlythuyet,
        sotietthuchanh: m.sotietthuchanh,
        trangthai: 1,
      },
    });
    for (const ten of m.chuong) {
      const c = await prisma.chuong.create({
        data: { tenchuong: ten, mamonhoc: m.mamonhoc, trangthai: 1 },
      });
      chuongIds.set(JSON.stringify([m.mamonhoc, ten]), c.machuong);
    }
  }
  const machuongOf = (mamonhoc: string, tenchuong: string): number => {
    const id = chuongIds.get(JSON.stringify([mamonhoc, tenchuong]));
    if (id == null) {
      throw new Error(
        `Không tìm thấy chương "${tenchuong}" của môn ${mamonhoc}.`,
      );
    }
    return id;
  };
  log(`Môn học: ${demoMonHoc.length}, chương: ${chuongIds.size}.`);

  // ── 3. Phân công giảng dạy ─────────────────────────────────────────────────
  const mahockyOf = (tennamhoc: string, sohocky: number): number => {
    const id = hockyIds.get(JSON.stringify([tennamhoc, sohocky]));
    if (id == null) {
      throw new Error(
        `Không tìm thấy học kỳ ${sohocky} của năm học ${tennamhoc}.`,
      );
    }
    return id;
  };
  const manamhocOf = (tennamhoc: string): number => {
    const id = namhocIds.get(tennamhoc);
    if (id == null) throw new Error(`Không tìm thấy năm học ${tennamhoc}.`);
    return id;
  };

  const pc = await prisma.phanCong.createMany({
    data: demoPhanCong.map((p) => ({
      mamonhoc: p.mamonhoc,
      manguoidung: p.manguoidung,
      namhoc: manamhocOf(p.tennamhoc),
      hocky: mahockyOf(p.tennamhoc, p.sohocky),
      trangthai: 1,
    })),
    skipDuplicates: true,
  });
  log(`Phân công giảng dạy: ${pc.count}.`);

  // ── 4. Nhóm học phần + thành viên ──────────────────────────────────────────
  const nhomIds = new Map<string, number>(); // key nhóm → manhom
  for (const g of demoNhom) {
    const created = await prisma.nhom.create({
      data: {
        tennhom: g.tennhom,
        mamoi: g.mamoi,
        ghichu: g.ghichu,
        namhoc: manamhocOf(g.tennamhoc),
        hocky: mahockyOf(g.tennamhoc, g.sohocky),
        giangvien: g.giangvien,
        mamonhoc: g.mamonhoc,
        siso: g.sinhvien.length,
        trangthai: 1,
        hienthi: 1,
      },
    });
    nhomIds.set(g.key, created.manhom);
    await prisma.chiTietNhom.createMany({
      data: g.sinhvien.map((manguoidung) => ({
        manhom: created.manhom,
        manguoidung,
        hienthi: 1,
      })),
      skipDuplicates: true,
    });
  }
  log(`Nhóm học phần: ${nhomIds.size}.`);

  // ── 5. Ngân hàng câu hỏi ───────────────────────────────────────────────────
  const cauhoiIds = await seedQuestionBank(
    prisma,
    demoCauHoi,
    demoDoanVan,
    machuongOf,
    log,
  );
  log(
    `Câu hỏi: ${cauhoiIds.size} (gồm ${demoDoanVan.length} đoạn văn đọc hiểu).`,
  );

  // ── 6. Đề thi (+ giao nhóm, thông báo, bài làm mẫu) ────────────────────────
  let soKetQua = 0;
  log(`Đề thi: 0/${demoDeThi.length} — bắt đầu ghi đề và bài làm mẫu.`);
  for (const [index, t] of demoDeThi.entries()) {
    soKetQua += await taoDeThi(prisma, t, {
      referenceTime,
      log,
      machuongOf,
      nhomIds,
      cauhoiIds,
    });
    log(
      `Đề thi: ${index + 1}/${demoDeThi.length}, bài làm mẫu đã ghi: ${soKetQua}.`,
    );
  }
  log(`Đề thi: ${demoDeThi.length}, bài làm mẫu: ${soKetQua}.`);

  return {
    skipped: false,
    monhoc: demoMonHoc.length,
    chuong: chuongIds.size,
    cauhoi: cauhoiIds.size,
    nhom: nhomIds.size,
    dethi: demoDeThi.length,
    ketqua: soKetQua,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chi tiết
// ─────────────────────────────────────────────────────────────────────────────

interface ITaoDeThiCtx {
  referenceTime: number;
  log: (message: string) => void;
  machuongOf: (mamonhoc: string, tenchuong: string) => number;
  nhomIds: Map<string, number>;
  cauhoiIds: Map<string, number>;
}

/**
 * Tạo 1 đề thi mẫu — đi theo đúng trình tự của `ExamsService.createTest`:
 * dethi → dethitudong → giaodethi → chitietdethi → thông báo tự động → (tuỳ chọn)
 * bài làm mẫu. Trả về số bài làm đã tạo.
 */
async function taoDeThi(
  prisma: PrismaClient,
  t: IDemoDeThi,
  ctx: ITaoDeThiCtx,
): Promise<number> {
  const times = seedExamTimes(t, undefined, ctx.referenceTime);
  const machuong = t.chuong.map((ten) => ctx.machuongOf(t.mamonhoc, ten));

  const created = await prisma.deThi.create({
    data: {
      monthi: t.mamonhoc,
      nguoitao: t.nguoitao,
      tende: t.tende,
      thoigianthi: t.thoigianthi,
      thoigianbatdau: times.start,
      thoigianketthuc: times.end,
      hienthibailam: t.hienthibailam,
      xemdiemthi: t.xemdiemthi,
      xemdapan: t.xemdapan,
      troncauhoi: t.troncauhoi,
      trondapan: t.trondapan,
      nopbaichuyentab: t.nopbaichuyentab,
      loaide: t.loaide,
      mcq_de: t.socau?.mcq?.de ?? 0,
      mcq_tb: t.socau?.mcq?.tb ?? 0,
      mcq_kho: t.socau?.mcq?.kho ?? 0,
      essay_de: t.socau?.essay?.de ?? 0,
      essay_tb: t.socau?.essay?.tb ?? 0,
      essay_kho: t.socau?.essay?.kho ?? 0,
      reading_de: t.socau?.reading?.de ?? 0,
      reading_tb: t.socau?.reading?.tb ?? 0,
      reading_kho: t.socau?.reading?.kho ?? 0,
      diem_tracnghiem: t.diem_tracnghiem,
      diem_tuluan: t.diem_tuluan,
      diem_dochieu: t.diem_dochieu,
      trangthai: 1,
    },
  });
  const made = created.made;

  if (machuong.length) {
    await prisma.deThiTuDong.createMany({
      data: [...new Set(machuong)].map((c) => ({ made, machuong: c })),
      skipDuplicates: true,
    });
  }

  const manhom = t.nhom.map((key) => {
    const id = ctx.nhomIds.get(key);
    if (id == null)
      throw new Error(`Không tìm thấy nhóm "${key}" khi giao đề.`);
    return id;
  });
  if (manhom.length) {
    await prisma.giaoDeThi.createMany({
      data: manhom.map((n) => ({ made, manhom: n })),
      skipDuplicates: true,
    });
  }

  // Danh sách câu của đề: thủ công lấy theo `key`, tự động random như addQuestionsToAutoTest.
  const macauhoi =
    t.loaide === 0
      ? (t.cauhoi ?? []).map((key) => {
          const id = ctx.cauhoiIds.get(key);
          if (id == null)
            throw new Error(`Không tìm thấy câu hỏi "${key}" của đề ${t.key}.`);
          return id;
        })
      : await chonCauTuDong(prisma, t, machuong);

  if (macauhoi.length) {
    await prisma.chiTietDeThi.createMany({
      data: macauhoi.map((id, i) => ({ made, macauhoi: id, thutu: i + 1 })),
      skipDuplicates: true,
    });
  }

  await taoThongBaoDeThi(prisma, made, t, manhom);

  if (!t.ketqua?.length) return 0;
  return taoKetQuaMau(prisma, made, t, macauhoi, times, ctx.log);
}

/**
 * Chọn câu cho đề TỰ ĐỘNG. Khác `addQuestionsToAutoTest` (ORDER BY RANDOM): ở đây lấy
 * theo macauhoi tăng dần để mỗi lần seed ra cùng một đề — dễ đối chiếu khi thử nghiệm.
 * Chỉ hỗ trợ loại 'mcq' và 'essay'; 'reading' phải lấy trọn đoạn văn nên không dùng.
 */
async function chonCauTuDong(
  prisma: PrismaClient,
  t: IDemoDeThi,
  machuong: number[],
): Promise<number[]> {
  const picked: number[] = [];
  for (const [loai, levels] of Object.entries(t.socau ?? {})) {
    if (loai === 'reading') {
      throw new Error(
        `Đề mẫu "${t.key}": seeder chưa hỗ trợ random câu đọc hiểu (phải lấy trọn đoạn văn).`,
      );
    }
    for (const [key, dokho] of MUC_DO) {
      const qty = levels[key] ?? 0;
      if (qty <= 0) continue;
      const rows = await prisma.cauHoi.findMany({
        where: {
          mamonhoc: t.mamonhoc,
          loai,
          dokho,
          trangthai: 1,
          ...(machuong.length ? { machuong: { in: machuong } } : {}),
        },
        select: { macauhoi: true },
        orderBy: { macauhoi: 'asc' },
        take: qty,
      });
      if (rows.length < qty) {
        throw new Error(
          `Đề mẫu "${t.key}": không đủ câu ${loai} mức ${key} (có ${rows.length}, cần ${qty}).`,
        );
      }
      picked.push(...rows.map((r) => r.macauhoi));
    }
  }
  return picked;
}

/** Thông báo tự động khi tạo đề — bê nguyên định dạng của `createNotification`. */
async function taoThongBaoDeThi(
  prisma: PrismaClient,
  made: number,
  t: IDemoDeThi,
  manhom: number[],
): Promise<void> {
  const mon = await prisma.monHoc.findUnique({
    where: { mamonhoc: t.mamonhoc },
    select: { tenmonhoc: true },
  });
  const link = `./test/start/${made}`;
  const noidung =
    `<span style="text-decoration: underline; color: blue; cursor: pointer;" ` +
    `onclick="window.open('${link}', '_blank')">${t.tende} – Môn ${mon?.tenmonhoc ?? 'Không rõ'}</span>`;

  const tb = await prisma.thongBao.create({
    data: {
      noidung,
      thoigiantao: new Date(),
      nguoitao: t.nguoitao,
      is_auto: 1,
    },
  });
  if (!manhom.length) return;

  await prisma.chiTietThongBao.createMany({
    data: manhom.map((n) => ({ matb: tb.matb, manhom: n })),
    skipDuplicates: true,
  });
  const members = await prisma.chiTietNhom.findMany({
    where: { manhom: { in: manhom } },
    select: { manguoidung: true },
    distinct: ['manguoidung'],
  });
  if (members.length) {
    await prisma.trangThaiThongBao.createMany({
      data: members.map((m) => ({ matb: tb.matb, manguoidung: m.manguoidung })),
      skipDuplicates: true,
    });
  }
}

/**
 * Sinh bài làm mẫu cho đề đã kết thúc: ketqua + chitietketqua + traloi_tuluan.
 * Cách chấm bám đúng `ExamsService.submit`: điểm = (điểm_loại / tổng_câu_loại) × số
 * câu đúng, làm tròn 2 chữ số; `diemthi` KHÔNG gồm điểm tự luận; đề có câu tự luận thì
 * `trangthai_tuluan` = 'Chưa chấm' để thử trang chấm tay.
 * `socaudung` trong dữ liệu mẫu áp cho các câu KHÔNG phải tự luận, tính từ câu đầu đề.
 */
async function taoKetQuaMau(
  prisma: PrismaClient,
  made: number,
  t: IDemoDeThi,
  macauhoi: number[],
  times: ReturnType<typeof seedExamTimes>,
  log: (message: string) => void,
): Promise<number> {
  // Nạp loại câu + đáp án để biết chọn đáp án đúng/sai cho từng câu.
  const cauhoi = await prisma.cauHoi.findMany({
    where: { macauhoi: { in: macauhoi } },
    select: { macauhoi: true, loai: true },
  });
  const loaiOf = new Map(cauhoi.map((c) => [c.macauhoi, c.loai]));

  const dapan = await prisma.cauTraLoi.findMany({
    where: { macauhoi: { in: macauhoi } },
    select: { macautl: true, macauhoi: true, ladapan: true },
    orderBy: { macautl: 'asc' },
  });
  const dungOf = new Map<number, number>();
  const saiOf = new Map<number, number>();
  for (const a of dapan) {
    const bucket = a.ladapan === 1 ? dungOf : saiOf;
    if (!bucket.has(a.macauhoi)) bucket.set(a.macauhoi, a.macautl);
  }

  const cauTracNghiem = macauhoi.filter((id) => loaiOf.get(id) === 'mcq');
  const cauDocHieu = macauhoi.filter((id) => loaiOf.get(id) === 'reading');
  const cauTuLuan = macauhoi.filter((id) => loaiOf.get(id) === 'essay');
  const cauChamTuDong = macauhoi.filter((id) => loaiOf.get(id) !== 'essay');

  const prepared = (t.ketqua ?? []).map((kq, index) => {
    const dungIds = new Set(cauChamTuDong.slice(0, kq.socaudung));
    const dungMcq = cauTracNghiem.filter((id) => dungIds.has(id)).length;
    const dungDocHieu = cauDocHieu.filter((id) => dungIds.has(id)).length;

    const diemTracNghiem = cauTracNghiem.length
      ? Math.round((t.diem_tracnghiem / cauTracNghiem.length) * dungMcq * 100) /
        100
      : 0;
    const diemDocHieu = cauDocHieu.length
      ? Math.round((t.diem_dochieu / cauDocHieu.length) * dungDocHieu * 100) /
        100
      : 0;

    const ketthuc = times.results[index];
    return {
      original: kq,
      dungIds,
      data: {
        made,
        manguoidung: kq.manguoidung,
        diemthi: diemTracNghiem + diemDocHieu,
        diem_dochieu: diemDocHieu,
        diem_tuluan: 0,
        thoigianvaothi: times.start,
        thoigianketthuc: ketthuc,
        // Cột lưu SỐ GIÂY làm bài (submit tính bằng giây), dữ liệu mẫu khai theo phút.
        thoigianlambai: kq.thoigianlambai * 60,
        socaudung: dungMcq + dungDocHieu,
        solanchuyentab: kq.solanchuyentab,
        trangthai: 'Đã nộp',
        trangthai_tuluan: cauTuLuan.length ? 'Chưa chấm' : 'Đã chấm',
      },
    };
  });
  log(`Bài làm ${t.key}: 0/${prepared.length}.`);
  for (let offset = 0; offset < prepared.length; offset += SEED_BATCH_SIZE) {
    const batch = prepared.slice(offset, offset + SEED_BATCH_SIZE);
    await prisma.$transaction(async (tx) => {
      const created = await tx.ketQua.createManyAndReturn({
        data: batch.map((row) => row.data),
        select: { makq: true, manguoidung: true },
      });
      const resultIds = new Map(
        created.map((row) => [row.manguoidung, row.makq]),
      );
      if (created.length !== batch.length || resultIds.size !== batch.length) {
        throw new Error('Seed batch không trả đủ ID bài làm.');
      }
      const resultId = (userId: string): number => {
        const id = resultIds.get(userId);
        if (id == null)
          throw new Error('Không ghép được ID bài làm với sinh viên.');
        return id;
      };
      await tx.chiTietKetQua.createMany({
        data: batch.flatMap((row) =>
          macauhoi.map((id, index) => ({
            makq: resultId(row.original.manguoidung),
            macauhoi: id,
            thutu: index + 1,
            dapanchon:
              loaiOf.get(id) === 'essay'
                ? null
                : ((row.dungIds.has(id) ? dungOf.get(id) : saiOf.get(id)) ??
                  null),
          })),
        ),
        skipDuplicates: true,
      });
      const essays = batch.flatMap((row) =>
        row.original.baituluan
          ? cauTuLuan.map((id) => ({
              makq: resultId(row.original.manguoidung),
              macauhoi: id,
              noidung: `<p>${row.original.baituluan}</p>`,
              thoigianlam: row.data.thoigianketthuc,
            }))
          : [],
      );
      if (essays.length) await tx.traLoiTuLuan.createMany({ data: essays });
    }, SEED_TRANSACTION_OPTIONS);
    log(
      `Bài làm ${t.key}: ${offset + batch.length}/${prepared.length} — đã ghi xong lô.`,
    );
  }
  return prepared.length;
}

/** Reject missing database users before writing or clearing demo data. */
export async function assertDemoUsersExist(
  prisma: PrismaClient,
  data: IDemoSeedData,
): Promise<void> {
  const can = new Set<string>();
  for (const p of data.assignments) can.add(p.manguoidung);
  for (const q of data.questions) can.add(q.nguoitao);
  for (const passage of data.readingPassages) can.add(passage.nguoitao);
  for (const g of data.groups) {
    can.add(g.giangvien);
    for (const sv of g.sinhvien) can.add(sv);
  }
  for (const t of data.exams) {
    can.add(t.nguoitao);
    for (const kq of t.ketqua ?? []) can.add(kq.manguoidung);
  }

  const co = await prisma.nguoiDung.findMany({
    where: { id: { in: [...can] } },
    select: { id: true },
  });
  const thieu = [...can].filter((id) => !co.some((u) => u.id === id));
  if (thieu.length) {
    throw new Error(
      `Missing seed users in the database: ${thieu.join(', ')}. Run scripts/seed-exam.cjs first; no demo rows were written.`,
    );
  }
}
