import { randomBytes } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { generatePasswordHash } from '@/lib/bcrypt/bcrypt';
import {
  centerCells,
  createWorkbook,
  setColumnWidths,
  workbookToDataUri,
  writeHeaderRow,
} from '@/common/utils/excel.util';
import type { IExcelDownload } from '@/common/utils/excel.util';
import type {
  IExportStudentRow,
  IGroupDetail,
  IGroupItem,
  IGroupPaginationArgs,
  IGroupStudentRow,
  ISubjectGroups,
} from '@/class-modules/interfaces/class-modules.types';

/** Kết quả thao tác trả nguyên shape JS gốc mong đợi ({success, message}). */
export interface IActionResult {
  success: boolean;
  message: string;
}

interface IFlatGroupRow {
  mamonhoc: string;
  tenmonhoc: string;
  manamhoc: number;
  tennamhoc: string;
  mahocky: number;
  tenhocky: string;
  sohocky: number;
  manhom: number;
  tennhom: string;
  ghichu: string | null;
  siso: number | null;
  hienthi: number | null;
}

/**
 * Nghiệp vụ Nhóm học phần — thay NhomModel.php (phần đang cần cho tạo/sửa đề).
 * Chỉ port `getBySubject` (cấp dữ liệu dropdown nhóm cho action_test.js). UI quản
 * lý nhóm đầy đủ (assignment/class_detail/client_group) sẽ làm ở Phase 5.
 */
@Injectable()
export class ClassModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Cấp quyền quản lý theo chủ nhóm hoặc vai trò admin hiện tại trong DB. */
  async assertCanManageGroup(manhom: number, actorId: string): Promise<void> {
    const [group, actor] = await Promise.all([
      this.prisma.nhom.findUnique({
        where: { manhom },
        select: { giangvien: true, trangthai: true },
      }),
      this.prisma.nguoiDung.findUnique({
        where: { id: actorId },
        select: { manhomquyen: true, trangthai: true },
      }),
    ]);
    if (!group || group.trangthai !== 1) {
      throw new NotFoundException('Không tìm thấy nhóm.');
    }
    if (
      !actor ||
      actor.trangthai !== 1 ||
      (group.giangvien !== actorId && actor.manhomquyen !== 3)
    ) {
      throw new ForbiddenException('Bạn không có quyền quản lý nhóm này.');
    }
  }

  /**
   * POST /module/loadData — nhóm GV đang dạy, gom theo môn + năm học + học kỳ.
   * Thay NhomModel::getBySubject($nguoitao, $hienthi).
   * LƯU Ý: trong PHP biến `$hienthi` được tính nhưng KHÔNG nối vào câu SQL (dead
   * code) → thực tế trả mọi nhóm trangthai=1 bất kể hienthi. Giữ nguyên hành vi:
   * tham số `hienthi` được nhận nhưng không lọc.
   */
  async getBySubject(userId: string): Promise<ISubjectGroups[]> {
    const rows = await this.prisma.$queryRaw<IFlatGroupRow[]>(Prisma.sql`
      SELECT MH.mamonhoc, MH.tenmonhoc,
             NH.manamhoc, NH.tennamhoc,
             HK.mahocky, HK.tenhocky, HK.sohocky,
             N.manhom, N.tennhom, N.ghichu, N.siso, N.hienthi
      FROM nhom N
      JOIN monhoc MH ON N.mamonhoc = MH.mamonhoc
      JOIN hocky HK ON N.hocky = HK.mahocky
      JOIN namhoc NH ON HK.manamhoc = NH.manamhoc
      WHERE N.giangvien = ${userId} AND N.trangthai = 1
    `);

    const grouped: ISubjectGroups[] = [];
    for (const r of rows) {
      const detail: IGroupItem = {
        manhom: r.manhom,
        tennhom: r.tennhom,
        ghichu: r.ghichu,
        siso: r.siso,
        hienthi: r.hienthi,
      };
      const found = grouped.find(
        (g) =>
          g.mamonhoc === r.mamonhoc &&
          g.manamhoc === r.manamhoc &&
          g.mahocky === r.mahocky,
      );
      if (found) {
        found.nhom.push(detail);
      } else {
        grouped.push({
          mamonhoc: r.mamonhoc,
          tenmonhoc: r.tenmonhoc,
          manamhoc: r.manamhoc,
          tennamhoc: r.tennamhoc,
          mahocky: r.mahocky,
          tenhocky: r.tenhocky,
          sohocky: r.sohocky,
          nhom: [detail],
        });
      }
    }
    return grouped;
  }

  /** Sinh mã mời 7 ký tự hex (thay substr(md5(mt_rand()),0,7) của PHP). */
  private genInviteCode(): string {
    return randomBytes(8).toString('hex').slice(0, 7);
  }

  /**
   * Đếm nhóm trùng (tên+môn+năm+kỳ+giảng viên, trangthai=1). Thay isDuplicate.
   * excludeManhom: bỏ qua chính nhóm đang sửa.
   */
  private async isDuplicate(
    tennhom: string,
    mamonhoc: string,
    namhoc: number,
    hocky: number,
    giangvien: string,
    excludeManhom?: number,
  ): Promise<boolean> {
    const count = await this.prisma.nhom.count({
      where: {
        tennhom,
        mamonhoc,
        namhoc,
        hocky,
        giangvien,
        trangthai: 1,
        ...(excludeManhom != null ? { manhom: { not: excludeManhom } } : {}),
      },
    });
    return count > 0;
  }

  /** POST /module/checkDuplicate — kiểm tra trùng cho AJAX. Thay checkDuplicateAjax. */
  async checkDuplicateAjax(
    tennhom: string,
    mamonhoc: string,
    namhoc: number,
    hocky: number,
    giangvien: string,
    excludeManhom?: number,
  ): Promise<{ duplicate: boolean; message: string }> {
    const dup = await this.isDuplicate(
      tennhom,
      mamonhoc,
      namhoc,
      hocky,
      giangvien,
      excludeManhom,
    );
    return {
      duplicate: dup,
      message: dup
        ? 'Đã trùng: tên nhóm, môn học, năm học và học kỳ.'
        : 'Không trùng.',
    };
  }

  /** POST /module/add — tạo nhóm mới. Thay NhomModel::create. */
  async create(
    tennhom: string,
    ghichu: string,
    namhoc: number,
    hocky: number,
    giangvien: string,
    mamonhoc: string,
  ): Promise<IActionResult> {
    if (await this.isDuplicate(tennhom, mamonhoc, namhoc, hocky, giangvien)) {
      return {
        success: false,
        message:
          'Nhóm đã tồn tại với cùng tên, môn học, năm học, học kỳ và giảng viên.',
      };
    }
    try {
      await this.prisma.nhom.create({
        data: {
          tennhom,
          ghichu,
          mamoi: this.genInviteCode(),
          namhoc,
          hocky,
          giangvien,
          mamonhoc,
        },
      });
      return { success: true, message: 'Thêm nhóm thành công!' };
    } catch (e) {
      return {
        success: false,
        message: 'Lỗi khi thêm nhóm: ' + (e as Error).message,
      };
    }
  }

  /** POST /module/update — cập nhật nhóm. Thay NhomModel::update. */
  async update(
    manhom: number,
    tennhom: string,
    ghichu: string,
    namhoc: number,
    hocky: number,
    mamonhoc: string,
  ): Promise<IActionResult> {
    const group = await this.prisma.nhom.findUnique({ where: { manhom } });
    const giangvien = group?.giangvien ?? '';

    if (
      await this.isDuplicate(
        tennhom,
        mamonhoc,
        namhoc,
        hocky,
        giangvien,
        manhom,
      )
    ) {
      return {
        success: false,
        message:
          'Nhóm đã tồn tại với cùng tên, môn học, năm học, học kỳ và giảng viên.',
      };
    }
    try {
      await this.prisma.nhom.update({
        where: { manhom },
        data: { tennhom, ghichu, namhoc, hocky, mamonhoc },
      });
      return { success: true, message: 'Cập nhật nhóm thành công!' };
    } catch (e) {
      return {
        success: false,
        message: 'Lỗi khi cập nhật nhóm: ' + (e as Error).message,
      };
    }
  }

  /**
   * POST /module/delete — xoá cứng nhóm. Thay NhomModel::delete.
   * Chặn nếu còn thành viên (chitietnhom), thông báo (chitietthongbao) hoặc
   * đề đã giao (giaodethi) — giữ nguyên các ràng buộc kiểm tra của PHP.
   */
  async delete(manhom: number): Promise<IActionResult> {
    try {
      const memberCount = await this.prisma.chiTietNhom.count({
        where: { manhom },
      });
      if (memberCount > 0) {
        return {
          success: false,
          message: `Không thể xóa nhóm vì vẫn còn ${memberCount} thành viên trong nhóm.`,
        };
      }
      const tbCount = await this.prisma.chiTietThongBao.count({
        where: { manhom },
      });
      if (tbCount > 0) {
        return {
          success: false,
          message: `Không thể xóa nhóm vì vẫn còn ${tbCount} thông báo liên quan.`,
        };
      }
      const gdtCount = await this.prisma.giaoDeThi.count({ where: { manhom } });
      if (gdtCount > 0) {
        return {
          success: false,
          message: `Không thể xóa nhóm vì vẫn còn ${gdtCount} đề thi được giao.`,
        };
      }
      await this.prisma.nhom.delete({ where: { manhom } });
      return { success: true, message: 'Xóa nhóm thành công!' };
    } catch {
      return {
        success: false,
        message: 'Không tìm thấy nhóm hoặc không thể xóa.',
      };
    }
  }

  /** POST /module/hide — ẩn/hiện nhóm (giatri 0|1). Thay NhomModel::hide. */
  async hide(manhom: number, giatri: number): Promise<IActionResult> {
    if (giatri !== 0 && giatri !== 1) {
      return { success: false, message: 'Giá trị hiển thị không hợp lệ.' };
    }
    try {
      await this.prisma.nhom.update({
        where: { manhom },
        data: { hienthi: giatri },
      });
      return {
        success: true,
        message:
          giatri === 1 ? 'Hiển thị nhóm thành công!' : 'Ẩn nhóm thành công!',
      };
    } catch {
      return {
        success: false,
        message: 'Không tìm thấy nhóm hoặc không thể cập nhật.',
      };
    }
  }

  /** POST /module/getDetail — chi tiết 1 nhóm để sửa. Thay NhomModel::getById. */
  async getById(manhom: number) {
    const row = await this.prisma.nhom.findUnique({ where: { manhom } });
    return row ?? {};
  }

  /**
   * POST /module/getNamHoc — năm học mà GV được phân công. Thay getNamHoc.
   * Lấy từ phancong (giảng viên = user), DISTINCT theo năm học.
   */
  async getNamHoc(userId: string) {
    return this.prisma.$queryRaw`
      SELECT DISTINCT nh.manamhoc, nh.tennamhoc
      FROM phancong pc
      INNER JOIN namhoc nh ON pc.namhoc = nh.manamhoc
      WHERE pc.manguoidung = ${userId} AND pc.trangthai = 1
      ORDER BY nh.tennamhoc DESC
    `;
  }

  /**
   * POST /module/getHocKy — học kỳ của 1 năm học mà GV được phân công.
   * Thay getHocKy. manamhoc: id năm học đã chọn.
   */
  async getHocKy(userId: string, manamhoc: number) {
    return this.prisma.$queryRaw`
      SELECT DISTINCT hk.mahocky, hk.tenhocky
      FROM phancong pc
      INNER JOIN hocky hk ON pc.hocky = hk.mahocky
      WHERE pc.manguoidung = ${userId} AND pc.namhoc = ${manamhoc} AND pc.trangthai = 1
      ORDER BY hk.tenhocky ASC
    `;
  }

  // ── Trang chi tiết nhóm (class_detail.php) ──────────────────────────────────

  /**
   * Header trang chi tiết nhóm (môn/năm/kỳ/nhóm + giảng viên). Thay getDetailGroup.
   * Trả null nếu không tồn tại (controller sẽ chặn 404/403).
   */
  async getDetailGroup(manhom: number): Promise<IGroupDetail | null> {
    const rows = await this.prisma.$queryRaw<IGroupDetail[]>(Prisma.sql`
      SELECT MH.mamonhoc, MH.tenmonhoc,
             N.manhom, N.tennhom,
             NH.tennamhoc, HK.tenhocky,
             N.giangvien, ND.hoten, ND.avatar
      FROM nhom N
      JOIN nguoidung ND ON ND.id = N.giangvien
      JOIN monhoc MH ON MH.mamonhoc = N.mamonhoc
      JOIN namhoc NH ON NH.manamhoc = N.namhoc
      JOIN hocky HK ON HK.mahocky = N.hocky
      WHERE N.manhom = ${manhom}
    `);
    return rows[0] ?? null;
  }

  /** POST /module/getSvList — danh sách bạn học chung nhóm. Thay getSvList (mảng). */
  getSvList(manhom: number): Promise<IGroupStudentRow[]> {
    return this.prisma.$queryRaw<IGroupStudentRow[]>(Prisma.sql`
      SELECT ND.id, ND.avatar, ND.hoten, ND.email, ND.gioitinh, ND.ngaysinh
      FROM chitietnhom CTN
      JOIN nguoidung ND ON CTN.manguoidung = ND.id
      WHERE CTN.manhom = ${manhom}
    `);
  }

  /**
   * Build mệnh đề WHERE + ORDER BY cho danh sách SV của 1 nhóm (thay getQuery/
   * getQuerySortByName). Search theo hoten/id; sort theo id hoặc tên (từ cuối).
   * Controller kiểm chủ nhóm/admin ở từng AJAX trước khi truy vấn; manhom tham số hoá.
   */
  private buildStudentListSql(args: IGroupPaginationArgs): {
    where: Prisma.Sql;
    orderBy: Prisma.Sql;
  } {
    const manhom = Number(args.manhom) || 0;
    const input = (args.input ?? args.content ?? '').trim();

    let where = Prisma.sql`WHERE CTN.manguoidung = ND.id AND CTN.manhom = ${manhom}`;
    if (input) {
      const like = `%${input}%`;
      where = Prisma.sql`${where} AND (ND.hoten ILIKE ${like} OR ND.id ILIKE ${like})`;
    }

    let orderBy = Prisma.empty;
    if (args.custom?.function === 'sort') {
      const order =
        (args.custom.order ?? '').toLowerCase() === 'desc'
          ? Prisma.sql`DESC`
          : Prisma.sql`ASC`;
      if (args.custom.column === 'id') {
        orderBy = Prisma.sql`ORDER BY ND.id ${order}`;
      } else if (args.custom.column === 'hoten') {
        // firstname = từ cuối của họ tên (thay SUBSTRING_INDEX(hoten,' ',-1)).
        orderBy = Prisma.sql`ORDER BY substring(ND.hoten from '[^ ]+$') ${order}`;
      }
    }
    return { where, orderBy };
  }

  /** POST /module/getTotalPages (model=NhomModel) — tổng số trang SV của nhóm. */
  async countGroupStudentPages(
    args: IGroupPaginationArgs,
  ): Promise<{ totalPages: number }> {
    const limit = Number(args.limit) || 10;
    const { where } = this.buildStudentListSql(args);
    const rows = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM chitietnhom CTN, nguoidung ND
      ${where}
    `);
    const total = rows[0]?.total ?? 0;
    return { totalPages: Math.ceil(total / limit) || 0 };
  }

  /** POST /module/pagination (model=NhomModel) — 1 trang SV của nhóm (mảng). */
  listGroupStudents(args: IGroupPaginationArgs): Promise<IGroupStudentRow[]> {
    const limit = Number(args.limit) || 10;
    const page = Number(args.page) || 1;
    const offset = (page - 1) * limit;
    const { where, orderBy } = this.buildStudentListSql(args);
    return this.prisma.$queryRaw<IGroupStudentRow[]>(Prisma.sql`
      SELECT ND.id, ND.avatar, ND.hoten, ND.email, ND.gioitinh, ND.ngaysinh
      FROM chitietnhom CTN, nguoidung ND
      ${where}
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `);
  }

  /** POST /module/getInvitedCode — mã mời hiện tại của nhóm (chuỗi thô). */
  async getInvitedCode(manhom: number): Promise<string> {
    const row = await this.prisma.nhom.findUnique({
      where: { manhom },
      select: { mamoi: true },
    });
    return row?.mamoi ?? '';
  }

  /** POST /module/updateInvitedCode — sinh mã mời mới (unique). Thay updateInvitedCode. */
  async updateInvitedCode(manhom: number): Promise<boolean> {
    let mamoi: string;
    // Lặp tới khi mã mới không trùng nhóm nào (như PHP getIdFromInvitedCode).
    do {
      mamoi = this.genInviteCode();
    } while ((await this.prisma.nhom.count({ where: { mamoi } })) > 0);
    try {
      await this.prisma.nhom.update({ where: { manhom }, data: { mamoi } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * POST /module/checkAcc — kiểm tài khoản SV trước khi thêm. Thay checkAcc.
   * "0" = đã trong nhóm; "-1" = có tài khoản nhưng chưa vào nhóm; "1" = chưa có TK.
   */
  async checkAcc(mssv: string, manhom: number): Promise<string> {
    const inGroup = await this.prisma.chiTietNhom.count({
      where: { manhom, manguoidung: mssv },
    });
    if (inGroup > 0) return '0';
    const exists = await this.prisma.nguoiDung.count({ where: { id: mssv } });
    if (exists > 0) return '-1';
    return '1';
  }

  /** Cập nhật sỉ số nhóm = số bản ghi chitietnhom. Thay updateSiso. */
  private async updateSiso(manhom: number): Promise<void> {
    const siso = await this.prisma.chiTietNhom.count({ where: { manhom } });
    await this.prisma.nhom.update({ where: { manhom }, data: { siso } });
  }

  /** Thêm SV (đã có tài khoản) vào nhóm. Thay join — trả false nếu đã có. */
  async join(manhom: number, manguoidung: string): Promise<boolean> {
    const [group, student] = await Promise.all([
      this.prisma.nhom.findUnique({
        where: { manhom },
        select: { trangthai: true },
      }),
      this.prisma.nguoiDung.findUnique({
        where: { id: manguoidung },
        select: { manhomquyen: true, trangthai: true },
      }),
    ]);
    if (
      group?.trangthai !== 1 ||
      student?.trangthai !== 1 ||
      student.manhomquyen !== 2
    ) {
      return false;
    }
    const existed = await this.prisma.chiTietNhom.count({
      where: { manhom, manguoidung },
    });
    if (existed > 0) return false;
    try {
      await this.prisma.chiTietNhom.create({
        data: { manhom, manguoidung, hienthi: 1 },
      });
      await this.updateSiso(manhom);
      return true;
    } catch {
      return false;
    }
  }

  /** POST /module/addSvGroup — thêm SV có sẵn vào nhóm (alias join). */
  addSvGroup(manhom: number, mssv: string): Promise<boolean> {
    return this.join(manhom, mssv);
  }

  /**
   * POST /module/addSV — tạo tài khoản SV rồi thêm vào nhóm. Thay addSV + join.
   * KHÁC PHP: schema yêu cầu email unique (PHP không set) → sinh email placeholder
   * từ mssv (`<mssv>@sinhvien.local`) để thoả ràng buộc; manhomquyen=2 (sinh viên).
   */
  async addSV(
    manhom: number,
    mssv: string,
    hoten: string,
    password: string,
  ): Promise<boolean> {
    const salt = Number(this.config.get<string>('BCRYPT_SALT_ROUNDS') || '10');
    try {
      await this.prisma.nguoiDung.create({
        data: {
          id: mssv,
          email: `${mssv}@sinhvien.local`,
          hoten,
          matkhau: await generatePasswordHash(password, salt),
          trangthai: 1,
          manhomquyen: 2,
        },
      });
    } catch {
      return false;
    }
    return this.join(manhom, mssv);
  }

  /** POST /module/kickUser — xoá SV khỏi nhóm. Thay kickUser (boolean). */
  async kickUser(manhom: number, mssv: string): Promise<boolean> {
    try {
      await this.prisma.chiTietNhom.deleteMany({
        where: { manhom, manguoidung: mssv },
      });
      await this.updateSiso(manhom);
      return true;
    } catch {
      return false;
    }
  }

  /** POST /module/getGroupSize — sỉ số nhóm. Thay getGroupSize. */
  async getGroupSize(manhom: number): Promise<number> {
    const row = await this.prisma.nhom.findUnique({
      where: { manhom },
      select: { siso: true },
    });
    return row?.siso ?? 0;
  }

  /**
   * POST /module/addStudentsByClassCode — thêm hàng loạt SV theo tiền tố mã lớp.
   * Thay addStudentsByClassCode: bỏ qua SV đã trong nhóm; cập nhật sỉ số.
   */
  async addStudentsByClassCode(
    malop: string,
    manhom: number,
  ): Promise<IActionResult> {
    const prefix = `${malop}%`;
    const totalLop = await this.prisma.nguoiDung.count({
      where: { id: { startsWith: malop }, manhomquyen: 2, trangthai: 1 },
    });
    if (totalLop === 0) {
      return { success: false, message: 'Mã lớp không tồn tại' };
    }

    // SV thuộc lớp nhưng CHƯA có trong nhóm (LEFT JOIN ... IS NULL).
    const candidates = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT ND.id
      FROM nguoidung ND
      LEFT JOIN chitietnhom CTN
        ON ND.id = CTN.manguoidung AND CTN.manhom = ${manhom}
      WHERE ND.id LIKE ${prefix} AND CTN.manguoidung IS NULL
        AND ND.manhomquyen = 2 AND ND.trangthai = 1
    `);

    if (candidates.length === 0) {
      return { success: false, message: 'Tất cả sinh viên đã có trong nhóm' };
    }
    await this.prisma.chiTietNhom.createMany({
      data: candidates.map((c) => ({ manhom, manguoidung: c.id, hienthi: 1 })),
      skipDuplicates: true,
    });
    await this.updateSiso(manhom);
    return {
      success: true,
      message: `Đã thêm ${candidates.length} sinh viên mới vào nhóm`,
    };
  }

  /**
   * POST /module/exportExcelStudentS — xuất danh sách SV của nhóm ra .xlsx.
   * Thay `Module::exportExcelStudentS` (PHPExcel) bằng exceljs; giữ nguyên
   * 6 cột + màu header xanh lá `33FF33` + độ rộng cột của bản PHP.
   *
   * KHÁC PHP: (1) MIME data-URI dùng đúng `...spreadsheetml.sheet` thay
   * `application/vnd.ms-excel` — PHP ghi file Excel2007 (.xlsx) nhưng gắn nhầm
   * MIME của .xls (JS gốc vẫn đặt tên tải xuống `.xls`, trình duyệt mở được vì
   * data-URI không kiểm tra chéo); (2) ngày định dạng `dd/MM/yyyy` từ DateTime
   * Postgres thay chuỗi thô MySQL.
   */
  async exportStudentsExcel(manhom: number): Promise<IExcelDownload> {
    const rows = await this.prisma.$queryRaw<IExportStudentRow[]>(Prisma.sql`
      SELECT ND.id, ND.hoten, ND.email, ND.ngaythamgia, ND.ngaysinh, ND.gioitinh
      FROM chitietnhom CTN
      JOIN nguoidung ND ON CTN.manguoidung = ND.id
      WHERE CTN.manhom = ${manhom}
    `);

    const { workbook, sheet } = createWorkbook('Danh sách kết quả');
    setColumnWidths(sheet, [15, 30, 30, 20, 20, 20]);
    writeHeaderRow(
      sheet,
      1,
      ['MSSV', 'Họ và tên', 'Email', 'Ngày tham gia', 'Ngày Sinh', 'Giới tính'],
      { fill: '33FF33' },
    );

    let numRow = 2;
    for (const row of rows) {
      const line = sheet.getRow(numRow);
      line.getCell(1).value = row.id;
      line.getCell(2).value = row.hoten;
      line.getCell(3).value = row.email;
      line.getCell(4).value = formatDate(row.ngaythamgia);
      line.getCell(5).value = formatDate(row.ngaysinh);
      // PHP so sánh 0/1; Postgres trả boolean → null vẫn ra "Null" như bản gốc.
      line.getCell(6).value =
        row.gioitinh === false ? 'Nữ' : row.gioitinh === true ? 'Nam' : 'Null';
      centerCells(sheet, numRow, 1, 6);
      numRow++;
    }

    return workbookToDataUri(workbook, 'Danh sách sinh viên.xlsx');
  }
}

/** Định dạng ngày `dd/MM/yyyy`; rỗng nếu null (thay chuỗi thô MySQL của PHP). */
function formatDate(value: Date | string | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
