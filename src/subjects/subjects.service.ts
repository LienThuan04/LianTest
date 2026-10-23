import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  IChapterRow,
  IPaginationArgs,
  ISubjectRow,
} from '@/subjects/interfaces/subjects.types';

/**
 * Nghiệp vụ Môn học & Chương — thay MonHocModel.php và ChuongModel.php.
 *
 * Quy ước port lại:
 *  - Thêm môn: trùng mã → trả 'exist' (JS so sánh response === 'exist').
 *  - Xoá môn / chương: xoá MỀM (trangthai = 0) — giữ dữ liệu liên quan.
 *  - Danh sách môn (phân trang) KHÔNG lọc trangthai (hiện cả môn ngưng dạy) để
 *    cột "Trạng thái" hiển thị đúng — giống MonHocModel::getQuery() gốc.
 *  - Trả boolean cho add/update/delete chương để khớp `if (response)` của subject.js.
 */
@Injectable()
export class SubjectsService {
  private readonly logger = new Logger(SubjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async assertChapterSubjectAccess(mamonhoc: string, actorId: string): Promise<void> {
    const actor = await this.prisma.nguoiDung.findUnique({
      where: { id: actorId },
      select: { manhomquyen: true, trangthai: true },
    });
    if (!actor || actor.trangthai !== 1) {
      throw new ForbiddenException('Tài khoản không có quyền truy cập.');
    }
    if (actor.manhomquyen === 3) return;
    const assigned = await this.prisma.phanCong.count({
      where: { mamonhoc, manguoidung: actorId, trangthai: 1 },
    });
    if (assigned === 0) {
      throw new ForbiddenException('Bạn không được phân công môn học này.');
    }
  }

  private async assertChapterAccess(machuong: number, actorId: string): Promise<void> {
    const chapter = await this.prisma.chuong.findUnique({
      where: { machuong },
      select: { mamonhoc: true, trangthai: true },
    });
    if (!chapter || chapter.trangthai !== 1) {
      throw new NotFoundException('Chương không tồn tại.');
    }
    await this.assertChapterSubjectAccess(chapter.mamonhoc, actorId);
  }

  // ── MÔN HỌC ────────────────────────────────────────────────────────────────

  /** Điều kiện lọc danh sách môn theo từ khoá (mã/tên) — thay getQuery(). */
  private buildWhere(args: IPaginationArgs): Prisma.MonHocWhereInput {
    const input = (args.input ?? args.content ?? '').trim();
    if (!input) return {};
    return {
      OR: [
        { mamonhoc: { contains: input, mode: 'insensitive' } },
        { tenmonhoc: { contains: input, mode: 'insensitive' } },
      ],
    };
  }

  /** POST /subject/getTotalPages — tổng số trang theo từ khoá. */
  async getTotalPages(args: IPaginationArgs): Promise<{ totalPages: number }> {
    const limit = Number(args.limit) || 10;
    const total = await this.prisma.monHoc.count({
      where: this.buildWhere(args),
    });
    return { totalPages: Math.ceil(total / limit) || 0 };
  }

  /** POST /subject/pagination — 1 trang môn học (sắp xếp theo mã tăng dần). */
  paginate(args: IPaginationArgs): Promise<ISubjectRow[]> {
    const limit = Number(args.limit) || 10;
    const page = Number(args.page) || 1;
    return this.prisma.monHoc.findMany({
      where: this.buildWhere(args),
      orderBy: { mamonhoc: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /** Tìm môn theo mã hoặc tên (trả mảng) — thay MonHocModel::search(). */
  search(input = ''): Promise<ISubjectRow[]> {
    return this.prisma.monHoc.findMany({
      where: input
        ? {
            OR: [
              { mamonhoc: { contains: input, mode: 'insensitive' } },
              { tenmonhoc: { contains: input, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { mamonhoc: 'asc' },
    });
  }

  /** Kiểm tra trùng mã môn (trả mảng bản ghi khớp) — thay checkSubject(). */
  checkSubject(mamon: string): Promise<ISubjectRow[]> {
    return this.prisma.monHoc.findMany({ where: { mamonhoc: mamon } });
  }

  /** Chi tiết 1 môn học — thay getById(). */
  getById(mamon: string): Promise<ISubjectRow | null> {
    return this.prisma.monHoc.findUnique({ where: { mamonhoc: mamon } });
  }

  /**
   * Môn học được phân công cho 1 người dùng (giảng viên) — thay
   * MonHocModel::getAllSubjectAssignment(). Dùng cho dropdown trang ngân hàng
   * câu hỏi (chỉ thao tác trên môn được phân công).
   *
   * SQL gốc: `SELECT DISTINCT monhoc.* FROM phancong JOIN monhoc ... WHERE
   * phancong.manguoidung = ? AND monhoc.trangthai = 1`. Giữ NGUYÊN hành vi gốc:
   * KHÔNG lọc theo phancong.trangthai (phân công ngưng vẫn hiện môn).
   */
  async getAllSubjectAssignment(userid: string): Promise<ISubjectRow[]> {
    const assignments = await this.prisma.phanCong.findMany({
      where: { manguoidung: userid },
      select: { mamonhoc: true },
      distinct: ['mamonhoc'],
    });
    const codes = assignments.map((a) => a.mamonhoc);
    if (codes.length === 0) return [];
    return this.prisma.monHoc.findMany({
      where: { mamonhoc: { in: codes }, trangthai: 1 },
      orderBy: { mamonhoc: 'asc' },
    });
  }

  /** Thêm môn học — thay create(). Trùng mã → 'exist'; ok → true; lỗi → false. */
  async create(
    mamon: string,
    tenmon: string,
    sotinchi: number,
    sotietlythuyet?: number,
    sotietthuchanh?: number,
  ): Promise<true | false | 'exist'> {
    const exists = await this.prisma.monHoc.findUnique({
      where: { mamonhoc: mamon },
    });
    if (exists) return 'exist';
    try {
      await this.prisma.monHoc.create({
        data: {
          mamonhoc: mamon,
          tenmonhoc: tenmon,
          sotinchi,
          sotietlythuyet: sotietlythuyet ?? 0,
          sotietthuchanh: sotietthuchanh ?? 0,
          trangthai: 1,
        },
      });
      return true;
    } catch (err) {
      this.logger.error('Thêm môn học thất bại', err as Error);
      return false;
    }
  }

  /** Cập nhật môn học (mã môn có thể đổi) — thay update(). */
  async update(
    id: string,
    mamon: string,
    tenmon: string,
    sotinchi: number,
    sotietlythuyet?: number,
    sotietthuchanh?: number,
  ): Promise<boolean> {
    try {
      await this.prisma.monHoc.update({
        where: { mamonhoc: id },
        data: {
          mamonhoc: mamon,
          tenmonhoc: tenmon,
          sotinchi,
          sotietlythuyet: sotietlythuyet ?? 0,
          sotietthuchanh: sotietthuchanh ?? 0,
        },
      });
      return true;
    } catch (err) {
      this.logger.error('Cập nhật môn học thất bại', err as Error);
      return false;
    }
  }

  /** Xoá mềm môn học (trangthai = 0) — thay delete(). */
  async delete(mamon: string): Promise<boolean> {
    try {
      await this.prisma.monHoc.update({
        where: { mamonhoc: mamon },
        data: { trangthai: 0 },
      });
      return true;
    } catch (err) {
      this.logger.error('Xoá môn học thất bại', err as Error);
      return false;
    }
  }

  // ── CHƯƠNG ───────────────────────────────────────────────────────────────

  /** Danh sách chương còn hoạt động của 1 môn — thay ChuongModel::getAll(). */
  async getChapters(mamonhoc: string, actorId: string): Promise<IChapterRow[]> {
    await this.assertChapterSubjectAccess(mamonhoc, actorId);
    return this.prisma.chuong.findMany({
      where: { mamonhoc, trangthai: 1 },
      orderBy: { machuong: 'asc' },
    });
  }

  /** Thêm chương — thay ChuongModel::insert(). */
  async addChapter(mamonhoc: string, tenchuong: string, actorId: string): Promise<boolean> {
    await this.assertChapterSubjectAccess(mamonhoc, actorId);
    try {
      await this.prisma.chuong.create({
        data: { mamonhoc, tenchuong, trangthai: 1 },
      });
      return true;
    } catch (err) {
      this.logger.error('Thêm chương thất bại', err as Error);
      return false;
    }
  }

  /** Đổi tên chương — thay ChuongModel::update(). */
  async updateChapter(machuong: number, tenchuong: string, actorId: string): Promise<boolean> {
    await this.assertChapterAccess(machuong, actorId);
    try {
      await this.prisma.chuong.update({
        where: { machuong },
        data: { tenchuong },
      });
      return true;
    } catch (err) {
      this.logger.error('Cập nhật chương thất bại', err as Error);
      return false;
    }
  }

  /** Xoá mềm chương (trangthai = 0) — thay ChuongModel::delete(). */
  async deleteChapter(machuong: number, actorId: string): Promise<boolean> {
    await this.assertChapterAccess(machuong, actorId);
    try {
      await this.prisma.chuong.update({
        where: { machuong },
        data: { trangthai: 0 },
      });
      return true;
    } catch (err) {
      this.logger.error('Xoá chương thất bại', err as Error);
      return false;
    }
  }
}
