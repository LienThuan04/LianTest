import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SupabaseStorageService } from '@/storage/supabase-storage.service';
import { removeUnreferencedImages } from '@/storage/image-cleanup';
import { plainText } from '@/common/utils/text.util';
import type {
  IAddDetailResult,
  ICreatedTestRow,
  ICreateTestResult,
  IDeleteExamResult,
  IEssayAnswerDetail,
  IEssaySubmissionRow,
  IExamDetail,
  IExamPaginationArgs,
  IExamResultRow,
  IGetQuestionByUser,
  IGroupOption,
  IInfoTestBasic,
  IKetQuaRow,
  IManualTestQuestion,
  ISaveEssayResult,
  IStaticticalResult,
  IQuestionForTestFilter,
  IQuestionForTestRow,
  IResultDetailRow,
  ISoCauMap,
  IStartPageData,
  IStudentAnswerOption,
  IStudentQuestion,
  IStudentTestInfo,
  ISubjectOption,
} from '@/exams/interfaces/exams.types';
import type { ChiTietDeThiItemDto } from '@/exams/dto/exam.dto';
import type { CreateTestDto, UpdateTestDto } from '@/exams/dto/exam.dto';

const PAGE_SIZE = 10;

/**
 * Nghiệp vụ Đề thi — thay DeThiModel.php (phần GV quản lý đề).
 *
 * Quy ước port lại (xem [[conversion-approach]]):
 *  - Danh sách đề (getQuery "getAllCreatedTest"): dùng $queryRaw vì cần
 *    STRING_AGG (GROUP_CONCAT) + GROUP BY. Lọc theo trạng thái thời gian /
 *    môn / nhóm / từ khoá. userId lấy từ JWT, KHÔNG tin args.id (an toàn hơn PHP).
 *  - KHÁC PHP: namhoc/hocky JOIN dạng LEFT (PHP dùng INNER) để đề có nhóm gắn
 *    namhoc/hocky không hợp lệ vẫn hiện — đúng tinh thần fallback "Chưa xác định"
 *    của test.js. giaodethi/nhom/monhoc vẫn INNER (đề phải có nhóm & môn mới hiện).
 *  - Xoá đề: chặn nếu đã có thí sinh làm; dọn thông báo liên quan rồi xoá đề
 *    (cascade lo chitietdethi/dethitudong/giaodethi). Bọc $transaction.
 */
@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  /** Thư mục lưu ảnh bài làm tự luận trên bucket Supabase. */
  private static readonly ESSAY_FOLDER = 'essays';

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  /** Role permissions do not grant access to another teacher's exam. */
  async assertCanManageExam(made: number, userId: string): Promise<void> {
    if (!Number.isInteger(made) || made <= 0) {
      throw new NotFoundException('Đề thi không tồn tại');
    }
    const exam = await this.prisma.deThi.findUnique({
      where: { made },
      select: { nguoitao: true },
    });
    if (!exam) throw new NotFoundException('Đề thi không tồn tại');
    if (exam.nguoitao === userId) return;
    const actor = await this.prisma.nguoiDung.findUnique({
      where: { id: userId },
      select: { manhomquyen: true },
    });
    if (actor?.manhomquyen !== 3) {
      throw new ForbiddenException('Bạn không có quyền quản lý đề thi này');
    }
  }

  async assertCanManageResult(makq: number, userId: string): Promise<void> {
    const result = await this.prisma.ketQua.findUnique({
      where: { makq },
      select: { made: true },
    });
    if (!result) throw new NotFoundException('Không tìm thấy kết quả thi');
    await this.assertCanManageExam(result.made, userId);
  }

  async assertCanManageGroup(manhom: number, userId: string): Promise<void> {
    const group = await this.prisma.nhom.findUnique({
      where: { manhom },
      select: { giangvien: true, trangthai: true },
    });
    if (!group || group.trangthai === 0) {
      throw new NotFoundException('Không tìm thấy nhóm học phần');
    }
    if (group.giangvien === userId) return;
    const actor = await this.prisma.nguoiDung.findUnique({
      where: { id: userId },
      select: { manhomquyen: true },
    });
    if (actor?.manhomquyen !== 3) {
      throw new ForbiddenException('Bạn không có quyền quản lý nhóm này');
    }
  }

  async assertExamGroups(made: number, requested: number[]): Promise<void> {
    const assigned = await this.prisma.giaoDeThi.findMany({
      where: { made },
      select: { manhom: true },
    });
    const ids = new Set(assigned.map((group) => group.manhom));
    if (requested.some((id) => !ids.has(id))) {
      throw new ForbiddenException('Nhóm không được giao đề thi này');
    }
  }

  async assertGroupMember(manhom: number, userId: string): Promise<void> {
    const count = await this.prisma.chiTietNhom.count({
      where: { manhom, manguoidung: userId },
    });
    if (!count)
      throw new ForbiddenException('Bạn không thuộc nhóm học phần này');
  }

  async assertCanTakeExam(made: number, userId: string): Promise<void> {
    const exam = await this.prisma.deThi.findUnique({ where: { made } });
    if (!exam || exam.trangthai !== 1) {
      throw new NotFoundException('Đề thi không tồn tại');
    }
    if (!(await this.checkStudentAllowed(userId, made))) {
      throw new ForbiddenException('Bạn không được giao đề thi này');
    }
    const now = Date.now();
    if (
      (exam.thoigianbatdau && now < exam.thoigianbatdau.getTime()) ||
      (exam.thoigianketthuc && now > exam.thoigianketthuc.getTime())
    ) {
      throw new ForbiddenException('Đề thi chưa mở hoặc đã kết thúc');
    }
  }

  /** Viewing answers is a separate policy from participation or exam management. */
  async getResultDetailForUser(
    makq: number,
    userId: string,
  ): Promise<IResultDetailRow[]> {
    const result = await this.prisma.ketQua.findUnique({ where: { makq } });
    if (!result) throw new NotFoundException('Không tìm thấy kết quả thi');
    const exam = await this.prisma.deThi.findUnique({
      where: { made: result.made },
    });
    if (!exam) throw new NotFoundException('Đề thi không tồn tại');
    const actor = await this.prisma.nguoiDung.findUnique({
      where: { id: userId },
      select: { manhomquyen: true },
    });
    if (!actor?.manhomquyen)
      throw new ForbiddenException('Tài khoản không hợp lệ');
    const canManage =
      (exam.nguoitao === userId || actor.manhomquyen === 3) &&
      (await this.prisma.chiTietQuyen.count({
        where: {
          manhomquyen: actor.manhomquyen,
          chucnang: 'dethi',
          hanhdong: 'view',
        },
      })) > 0;
    if (canManage) return this.getResultDetail(makq);
    const canParticipate = await this.prisma.chiTietQuyen.count({
      where: {
        manhomquyen: actor.manhomquyen,
        chucnang: 'tgthi',
        hanhdong: 'join',
      },
    });
    if (
      result.manguoidung !== userId ||
      !canParticipate ||
      result.trangthai !== 'Đã nộp' ||
      exam.hienthibailam !== 1
    ) {
      throw new ForbiddenException('Bạn không được xem bài làm này');
    }
    const rows = await this.getResultDetail(makq);
    return rows.map((row) => ({
      ...row,
      diem_cham_tuluan: exam.xemdiemthi === 1 ? row.diem_cham_tuluan : null,
      cautraloi: row.cautraloi.map((answer) => ({
        ...answer,
        ladapan: exam.xemdapan === 1 ? answer.ladapan : 0,
      })),
    }));
  }

  /** Điều kiện lọc theo trạng thái thời gian (filter "0"|"1"|"2"). */
  private buildStateCond(filter: unknown): Prisma.Sql {
    switch (String(filter)) {
      case '0': // Chưa mở
        return Prisma.sql`AND CURRENT_TIMESTAMP < DT.thoigianbatdau`;
      case '1': // Đang mở
        return Prisma.sql`AND CURRENT_TIMESTAMP BETWEEN DT.thoigianbatdau AND DT.thoigianketthuc`;
      case '2': // Đã đóng
        return Prisma.sql`AND CURRENT_TIMESTAMP > DT.thoigianketthuc`;
      default:
        return Prisma.empty;
    }
  }

  /** Các điều kiện lọc chung (môn / nhóm / từ khoá) cho list & count. */
  private buildFilters(args: IExamPaginationArgs): Prisma.Sql {
    const conds: Prisma.Sql[] = [];
    const input = (args.input ?? args.content ?? '').trim();
    if (input) {
      const like = `%${input}%`;
      conds.push(
        Prisma.sql`AND (DT.tende ILIKE ${like} OR MH.tenmonhoc ILIKE ${like})`,
      );
    }
    if (args.subject != null && args.subject !== '') {
      conds.push(Prisma.sql`AND DT.monthi = ${String(args.subject)}`);
    }
    if (args.group != null && args.group !== '') {
      conds.push(Prisma.sql`AND GDT.manhom = ${Number(args.group)}`);
    }
    return conds.length ? Prisma.join(conds, ' ') : Prisma.empty;
  }

  /**
   * POST /test/pagination — 1 trang danh sách đề thi GV đã tạo.
   * Thay DeThiModel::getQuery("getAllCreatedTest") + base pagination.
   */
  listCreatedTests(
    userId: string,
    args: IExamPaginationArgs,
  ): Promise<ICreatedTestRow[]> {
    const limit = Number(args.limit) || PAGE_SIZE;
    const page = Math.max(Number(args.page) || 1, 1);
    const offset = (page - 1) * limit;
    const state = this.buildStateCond(args.filter);
    const filters = this.buildFilters(args);
    return this.prisma.$queryRaw<ICreatedTestRow[]>(Prisma.sql`
      SELECT DT.made, DT.tende, MH.tenmonhoc,
             DT.thoigianbatdau, DT.thoigianketthuc,
             STRING_AGG(DISTINCT N.tennhom, ', ') AS nhom,
             NH.tennamhoc, HK.tenhocky
      FROM dethi DT
      JOIN giaodethi GDT ON DT.made = GDT.made
      JOIN nhom N ON N.manhom = GDT.manhom
      JOIN monhoc MH ON DT.monthi = MH.mamonhoc
      LEFT JOIN namhoc NH ON N.namhoc = NH.manamhoc
      LEFT JOIN hocky HK ON N.hocky = HK.mahocky
      WHERE DT.nguoitao = ${userId} AND DT.trangthai = 1
      ${state} ${filters}
      GROUP BY DT.made, MH.tenmonhoc, NH.tennamhoc, HK.tenhocky
      ORDER BY DT.made DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
  }

  /** POST /test/getTotalPages — tổng số trang danh sách đề thi. */
  async countCreatedTestPages(
    userId: string,
    args: IExamPaginationArgs,
  ): Promise<{ totalPages: number }> {
    const limit = Number(args.limit) || PAGE_SIZE;
    const state = this.buildStateCond(args.filter);
    const filters = this.buildFilters(args);
    const rows = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total FROM (
        SELECT DT.made
        FROM dethi DT
        JOIN giaodethi GDT ON DT.made = GDT.made
        JOIN nhom N ON N.manhom = GDT.manhom
        JOIN monhoc MH ON DT.monthi = MH.mamonhoc
        WHERE DT.nguoitao = ${userId} AND DT.trangthai = 1
        ${state} ${filters}
        GROUP BY DT.made
      ) AS counted
    `);
    const total = rows[0]?.total ?? 0;
    return { totalPages: Math.ceil(total / limit) };
  }

  /** GET /test/get_subjects — môn được phân công cho GV (dropdown lọc). */
  getAllSubjects(userId: string): Promise<ISubjectOption[]> {
    return this.prisma.$queryRaw<ISubjectOption[]>(Prisma.sql`
      SELECT DISTINCT MH.mamonhoc, MH.tenmonhoc
      FROM monhoc MH
      JOIN phancong PC ON PC.mamonhoc = MH.mamonhoc
      WHERE PC.manguoidung = ${userId} AND PC.trangthai = 1
      ORDER BY MH.tenmonhoc ASC
    `);
  }

  /** GET /test/get_groups — tất cả nhóm còn hiệu lực (dropdown lọc). */
  async getAllGroups(): Promise<IGroupOption[]> {
    const rows = await this.prisma.nhom.findMany({
      where: { NOT: { trangthai: 0 } },
      select: { manhom: true, tennhom: true },
      orderBy: { tennhom: 'asc' },
    });
    return rows;
  }

  /**
   * POST /test/getDetail (và dùng nội bộ cho trang sửa) — chi tiết 1 đề thi
   * kèm danh sách chương (đề tự động) + nhóm được giao. Thay getById().
   */
  async getById(made: number): Promise<IExamDetail | null> {
    const rows = await this.prisma.$queryRaw<
      (Omit<IExamDetail, 'chuong' | 'nhom'> & Record<string, unknown>)[]
    >(Prisma.sql`
      SELECT DT.*, MH.tenmonhoc
      FROM dethi DT
      JOIN monhoc MH ON DT.monthi = MH.mamonhoc
      WHERE DT.made = ${made}
      LIMIT 1
    `);
    const dethi = rows[0];
    if (!dethi) return null;

    const chuongRows = await this.prisma.deThiTuDong.findMany({
      where: { made },
      select: { machuong: true },
    });
    const nhomRows = await this.prisma.giaoDeThi.findMany({
      where: { made },
      select: { manhom: true },
    });

    return {
      ...(dethi as unknown as Omit<IExamDetail, 'chuong' | 'nhom'>),
      diem_tracnghiem:
        dethi.diem_tracnghiem == null
          ? null
          : this.decToNum(dethi.diem_tracnghiem),
      diem_tuluan:
        dethi.diem_tuluan == null ? null : this.decToNum(dethi.diem_tuluan),
      diem_dochieu:
        dethi.diem_dochieu == null ? null : this.decToNum(dethi.diem_dochieu),
      chuong: chuongRows.map((r) => r.machuong),
      nhom: nhomRows.map((r) => r.manhom),
    };
  }

  /**
   * POST /test/delete — xoá đề thi. Thay DeThiModel::delete().
   * - Chặn nếu đã có kết quả (thí sinh đã làm).
   * - Dọn thông báo liên quan: như PHP gốc, xoá theo manhom được giao đề
   *   (LƯU Ý: xoá MỌI thông báo gắn các nhóm đó, không chỉ thông báo của đề này
   *   — quirk có sẵn của bản PHP, giữ nguyên hành vi).
   * - Xoá đề; cascade tự xoá chitietdethi/dethitudong/giaodethi.
   */
  async delete(made: number): Promise<IDeleteExamResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const soKetQua = await tx.ketQua.count({ where: { made } });
        if (soKetQua > 0) {
          return {
            success: false,
            message: `Không thể xóa đề thi vì đã có ${soKetQua} thí sinh hoàn thành bài thi.`,
          };
        }

        const nhomRows = await tx.giaoDeThi.findMany({
          where: { made },
          select: { manhom: true },
        });
        const manhomList = [...new Set(nhomRows.map((r) => r.manhom))];

        if (manhomList.length > 0) {
          const tbRows = await tx.chiTietThongBao.findMany({
            where: { manhom: { in: manhomList } },
            select: { matb: true },
          });
          const matbList = [...new Set(tbRows.map((r) => r.matb))];
          if (matbList.length > 0) {
            await tx.trangThaiThongBao.deleteMany({
              where: { matb: { in: matbList } },
            });
          }
          await tx.chiTietThongBao.deleteMany({
            where: { manhom: { in: manhomList } },
          });
          // Xoá thông báo không còn nhóm nào liên kết (cô lập).
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM thongbao
            WHERE matb NOT IN (SELECT matb FROM chitietthongbao)
          `);
        }

        const deleted = await tx.deThi.deleteMany({ where: { made } });
        if (deleted.count === 0) {
          throw new Error('Không tìm thấy đề thi hoặc không thể xóa.');
        }
        return { success: true, message: 'Xóa đề thi thành công!' };
      });
    } catch (e) {
      this.logger.error(`delete(${made}) lỗi: ${(e as Error).message}`);
      return { success: false, message: (e as Error).message };
    }
  }

  // ============== CHỌN CÂU HỎI CHO ĐỀ THỦ CÔNG (slice 3) ==============

  /**
   * Có quyền dethi.create HOẶC dethi.update không (cho trang chọn câu hỏi).
   * Thay điều kiện `checkPermission('dethi','create') || checkPermission('dethi','update')`
   * của PHP — PermissionsGuard chỉ kiểm 1 quyền nên kiểm OR ở đây.
   */
  async hasDethiCreateOrUpdate(manhomquyen: number): Promise<boolean> {
    const c = await this.prisma.chiTietQuyen.count({
      where: {
        manhomquyen,
        chucnang: 'dethi',
        hanhdong: { in: ['create', 'update'] },
      },
    });
    return c > 0;
  }

  /**
   * POST /test/getQuestionOfTestManual — câu hỏi hiện có của đề thủ công (theo
   * thứ tự). Thay DeThiModel::getQuestionOfTestManual. Trộn đáp án/câu hỏi nếu
   * đề bật cờ trondapan/troncauhoi. KHÁC PHP: không trả ảnh câu hỏi (PHP gốc
   * cũng chỉ select macauhoi/thutu/noidung/dokho/loai/madv) — JS sẽ nạp lại đáp
   * án (kèm ảnh) qua /question/getAnswersForMultipleQuestions.
   */
  async getQuestionOfTestManual(made: number): Promise<IManualTestQuestion[]> {
    const dethi = await this.prisma.deThi.findUnique({
      where: { made },
      select: { trondapan: true, troncauhoi: true },
    });
    const troncauhoi = dethi?.troncauhoi ?? 0;
    const trondapan = dethi?.trondapan ?? 0;

    const rows = await this.prisma.$queryRaw<
      {
        macauhoi: number;
        thutu: number | null;
        noidung: string;
        dokho: number;
        loai: string;
        madv: number | null;
      }[]
    >(Prisma.sql`
      SELECT CTDT.macauhoi, CTDT.thutu, CH.noidung, CH.dokho, CH.loai, CH.madv
      FROM chitietdethi CTDT
      JOIN cauhoi CH ON CTDT.macauhoi = CH.macauhoi
      WHERE CTDT.made = ${made}
      ORDER BY CTDT.thutu ASC
    `);

    const result: IManualTestQuestion[] = [];
    for (const row of rows) {
      const item: IManualTestQuestion = {
        macauhoi: row.macauhoi,
        thutu: row.thutu,
        noidung: row.noidung,
        noidungplaintext: row.noidung,
        dokho: row.dokho,
        loai: row.loai,
        madv: row.madv,
        cautraloi: [],
        doanvan_tieude: '',
        doanvan_noidung: '',
      };

      if (row.loai === 'mcq' || row.loai === 'reading') {
        const ans = await this.prisma.cauTraLoi.findMany({
          where: { macauhoi: row.macauhoi },
          select: { macautl: true, noidungtl: true, hinhanh: true },
        });
        // Thay getAllWithoutAnswer: hinhanh nay la public URL Supabase (dung truc tiep lam src).
        item.cautraloi = ans.map((a) => ({
          macautl: a.macautl,
          noidungtl: a.noidungtl,
          hinhanhtl: a.hinhanh ?? '',
        }));
        if (trondapan === 1) this.shuffle(item.cautraloi);
      }

      if (row.loai === 'reading' && row.madv) {
        const dv = await this.prisma.doanVan.findFirst({
          where: { madv: row.madv, trangthai: 1 },
          select: { tieude: true, noidung: true },
        });
        item.doanvan_tieude = dv?.tieude ?? '';
        item.doanvan_noidung = dv?.noidung ?? '';
      }

      result.push(item);
    }

    if (troncauhoi === 1) this.shuffle(result);
    return result;
  }

  /** Điều kiện lọc câu hỏi (chương / mức độ / loại / từ khoá) cho trang chọn câu. */
  private buildQuestionFilter(args: IExamPaginationArgs): Prisma.Sql {
    const f: IQuestionForTestFilter =
      args.filter && typeof args.filter === 'object' ? args.filter : {};
    const conds: Prisma.Sql[] = [];
    if (f.machuong)
      conds.push(Prisma.sql`AND cauhoi.machuong = ${Number(f.machuong)}`);
    if (f.dokho) conds.push(Prisma.sql`AND cauhoi.dokho = ${Number(f.dokho)}`);
    if (f.loai) conds.push(Prisma.sql`AND cauhoi.loai = ${String(f.loai)}`);
    // KHÁC PHP: PHP đọc $input (args.input/content) nên ô tìm kiếm (gửi
    // filter.keyword) vô tác dụng — ở đây ưu tiên filter.keyword để search hoạt động.
    const keyword = (f.keyword ?? args.input ?? args.content ?? '').trim();
    if (keyword)
      conds.push(Prisma.sql`AND cauhoi.noidung ILIKE ${`%${keyword}%`}`);
    return conds.length ? Prisma.join(conds, ' ') : Prisma.empty;
  }

  /**
   * POST /test/pagination (custom getQuestionsForTest) — 1 trang câu hỏi để chọn
   * vào đề thủ công. Thay DeThiModel::getQuery("getQuestionsForTest"). Chỉ câu của
   * môn đề + GV được phân công (userId từ JWT, KHÔNG tin args.id). ORDER BY macauhoi
   * cho phân trang ổn định (PHP gốc không ORDER BY).
   */
  async listQuestionsForTest(
    userId: string,
    args: IExamPaginationArgs,
  ): Promise<IQuestionForTestRow[]> {
    const mamonhoc = (args.mamonhoc ?? '').trim();
    if (!mamonhoc) return [];
    const limit = Number(args.limit) || PAGE_SIZE;
    const page = Math.max(Number(args.page) || 1, 1);
    const offset = (page - 1) * limit;
    const filters = this.buildQuestionFilter(args);
    const rows = await this.prisma.$queryRaw<
      (Omit<IQuestionForTestRow, 'hinhanh'> & { hinhanh: string | null })[]
    >(Prisma.sql`
      SELECT cauhoi.macauhoi, cauhoi.noidung, cauhoi.noidung AS noidungplaintext,
             cauhoi.dokho, cauhoi.loai, cauhoi.madv, cauhoi.machuong,
             cauhoi.mamonhoc, cauhoi.hinhanh,
             dv.noidung AS doanvan_noidung, dv.tieude AS doanvan_tieude
      FROM cauhoi
      LEFT JOIN doan_van dv ON cauhoi.madv = dv.madv
      WHERE cauhoi.trangthai = 1 AND cauhoi.mamonhoc = ${mamonhoc}
        AND EXISTS (
          SELECT 1 FROM phancong pc
          WHERE pc.mamonhoc = cauhoi.mamonhoc AND pc.manguoidung = ${userId}
        )
        ${filters}
      ORDER BY cauhoi.macauhoi ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
    // hinhanh nay la public URL Supabase (truoc la blob -> data-URI).
    return rows.map((r) => ({ ...r, hinhanh: r.hinhanh ?? null }));
  }

  /** POST /test/getTotalPages (custom getQuestionsForTest) — tổng số trang câu hỏi. */
  async countQuestionsForTestPages(
    userId: string,
    args: IExamPaginationArgs,
  ): Promise<{ totalPages: number }> {
    const mamonhoc = (args.mamonhoc ?? '').trim();
    const limit = Number(args.limit) || PAGE_SIZE;
    if (!mamonhoc) return { totalPages: 0 };
    const filters = this.buildQuestionFilter(args);
    const rows = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM cauhoi
      WHERE cauhoi.trangthai = 1 AND cauhoi.mamonhoc = ${mamonhoc}
        AND EXISTS (
          SELECT 1 FROM phancong pc
          WHERE pc.mamonhoc = cauhoi.mamonhoc AND pc.manguoidung = ${userId}
        )
        ${filters}
    `);
    const total = rows[0]?.total ?? 0;
    return { totalPages: Math.ceil(total / limit) };
  }

  /**
   * POST /test/addDetail — lưu danh sách câu hỏi cho đề thủ công. Thay
   * ChiTietDeThiModel::createMultiple: chặn nếu đã có thí sinh làm, kiểm tra câu
   * tồn tại, xoá chitietdethi cũ rồi chèn lại theo thutu. Bọc $transaction.
   */
  async addDetail(
    made: number,
    cauhoi: ChiTietDeThiItemDto[],
  ): Promise<IAddDetailResult> {
    if (!made || !cauhoi?.length) {
      return {
        success: false,
        error: 'Mã đề hoặc danh sách câu hỏi không hợp lệ',
      };
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const test = await tx.deThi.findUnique({
          where: { made },
          select: { made: true },
        });
        if (!test) return { success: false, error: 'Đề thi không tồn tại' };

        const soKetQua = await tx.ketQua.count({ where: { made } });
        if (soKetQua > 0) {
          return {
            success: false,
            error: 'Đề thi đã có thí sinh làm, không thể thay đổi câu hỏi',
          };
        }

        // Kiểm tra mọi câu hỏi tồn tại (như create() kiểm từng macauhoi).
        const ids = [...new Set(cauhoi.map((c) => c.macauhoi))];
        const existing = await tx.cauHoi.findMany({
          where: { macauhoi: { in: ids } },
          select: { macauhoi: true },
        });
        const existSet = new Set(existing.map((e) => e.macauhoi));
        for (const item of cauhoi) {
          if (!existSet.has(item.macauhoi)) {
            return {
              success: false,
              error: `Lỗi khi thêm câu hỏi với macauhoi: ${item.macauhoi}`,
            };
          }
        }

        await tx.chiTietDeThi.deleteMany({ where: { made } });
        await tx.chiTietDeThi.createMany({
          data: cauhoi.map((c) => ({
            made,
            macauhoi: c.macauhoi,
            thutu: c.thutu,
          })),
          skipDuplicates: true,
        });
        return { success: true };
      });
    } catch (e) {
      this.logger.error(`addDetail(${made}) lỗi: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  // ===================== TẠO / SỬA ĐỀ (slice 2) =====================

  /** Ép về số nguyên (mô phỏng (int) của PHP). */
  private toInt(v: unknown, def = 0): number {
    const n = parseInt(plainText(v), 10);
    return isNaN(n) ? def : n;
  }

  /** Decimal/giá trị bất kỳ → number (Prisma.Decimal an toàn qua toString). */
  private decToNum(v: unknown): number {
    if (v == null) return 0;
    return Number((v as { toString(): string }).toString());
  }

  /** "Y-m-d H:i" (flatpickr) → Date theo giờ máy chủ; rỗng/không hợp lệ → null. */
  private parseDate(s?: string): Date | null {
    const v = (s ?? '').trim();
    if (!v) return null;
    const d = new Date(v.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  /** Parse JSON socau `{ [loai]: {de,tb,kho} }`; rỗng→{}; sai cú pháp→throw. */
  private parseSoCau(raw?: string): ISoCauMap {
    if (!raw) return {};
    try {
      const o = JSON.parse(raw) as unknown;
      return o && typeof o === 'object' && !Array.isArray(o)
        ? (o as ISoCauMap)
        : {};
    } catch {
      throw new Error('Dữ liệu số câu không hợp lệ');
    }
  }

  /** Xáo trộn tại chỗ (Fisher-Yates) — thay shuffle() của PHP. */
  private shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Đếm câu dùng được theo loại/mức độ — thay CauHoiModel::getsoluongcauhoi. */
  private async countAvailable(
    tx: Prisma.TransactionClient,
    chuong: number[],
    monhoc: string,
    dokho: number,
    type: string,
  ): Promise<number> {
    const chuongCond = chuong.length
      ? Prisma.sql`AND machuong IN (${Prisma.join(chuong)})`
      : Prisma.empty;
    const rows = await tx.$queryRaw<{ cnt: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS cnt FROM cauhoi
      WHERE dokho = ${dokho} AND mamonhoc = ${monhoc}
        AND loai = ${type} AND trangthai = 1 ${chuongCond}
    `);
    return rows[0]?.cnt ?? 0;
  }

  /** Random câu mcq/essay — thay CauHoiModel::getQuestions (ORDER BY RANDOM). */
  private async getQuestions(
    tx: Prisma.TransactionClient,
    chuong: number[],
    monhoc: string,
    dokho: number,
    types: string[],
    qty: number,
  ): Promise<number[]> {
    if (!chuong.length || !types.length || qty <= 0) return [];
    const rows = await tx.$queryRaw<{ macauhoi: number }[]>(Prisma.sql`
      SELECT macauhoi FROM cauhoi
      WHERE mamonhoc = ${monhoc} AND dokho = ${dokho}
        AND loai IN (${Prisma.join(types)})
        AND machuong IN (${Prisma.join(chuong)}) AND trangthai = 1
      ORDER BY RANDOM() LIMIT ${qty}
    `);
    return rows.map((r) => r.macauhoi);
  }

  /**
   * Câu đọc hiểu — thay CauHoiModel::getReadingQuestions. PHP duyệt từng đoạn
   * (madv ASC) lấy đủ qty, mỗi đoạn lấy câu macauhoi ASC → tương đương ORDER BY
   * (madv, macauhoi) rồi LIMIT qty.
   */
  private async getReadingQuestions(
    tx: Prisma.TransactionClient,
    chuong: number[],
    monhoc: string,
    dokho: number,
    qty: number,
  ): Promise<number[]> {
    if (!chuong.length || qty <= 0) return [];
    const rows = await tx.$queryRaw<{ macauhoi: number }[]>(Prisma.sql`
      SELECT macauhoi FROM cauhoi
      WHERE mamonhoc = ${monhoc} AND dokho = ${dokho} AND loai = 'reading'
        AND machuong IN (${Prisma.join(chuong)}) AND trangthai = 1
      ORDER BY madv ASC, macauhoi ASC LIMIT ${qty}
    `);
    return rows.map((r) => r.macauhoi);
  }

  /**
   * Lấy câu theo socau & nạp vào chitietdethi — thay addQuestionsToAutoTest.
   * Trả mảng macauhoi đã thêm (để gọi sắp xếp/đảo thutu sau).
   */
  private async addQuestionsToAutoTest(
    tx: Prisma.TransactionClient,
    made: number,
    socau: ISoCauMap,
    chuong: number[],
    monhoc: string,
  ): Promise<number[]> {
    const levelMap: Record<string, number> = { de: 1, tb: 2, kho: 3 };
    const added: number[] = [];
    for (const [type, levels] of Object.entries(socau)) {
      for (const lvl of ['de', 'tb', 'kho'] as const) {
        const qty = this.toInt(levels[lvl]);
        if (qty <= 0) continue;
        const ids =
          type === 'reading'
            ? await this.getReadingQuestions(
                tx,
                chuong,
                monhoc,
                levelMap[lvl],
                qty,
              )
            : await this.getQuestions(
                tx,
                chuong,
                monhoc,
                levelMap[lvl],
                [type],
                qty,
              );
        added.push(...ids);
      }
    }
    if (added.length) {
      await tx.chiTietDeThi.createMany({
        data: added.map((macauhoi) => ({ made, macauhoi })),
        skipDuplicates: true,
      });
    }
    return added;
  }

  /** Cập nhật lại thutu theo cờ đảo (shuffle) hoặc tăng dần — dùng cho add/update. */
  private async reorderQuestions(
    tx: Prisma.TransactionClient,
    made: number,
    ids: number[],
    daocauhoi: boolean,
  ): Promise<void> {
    if (!ids.length) return;
    const ordered = daocauhoi
      ? this.shuffle([...ids])
      : [...ids].sort((a, b) => a - b);
    for (let i = 0; i < ordered.length; i++) {
      await tx.chiTietDeThi.update({
        where: { made_macauhoi: { made, macauhoi: ordered[i] } },
        data: { thutu: i + 1 },
      });
    }
  }

  /** Chèn nhóm nhận thông báo + trạng thái cho từng SV — dùng khi tạo đề. */
  private async createNotification(
    tx: Prisma.TransactionClient,
    made: number,
    userId: string,
    tende: string,
    mamonhoc: string,
    nhom: number[],
  ): Promise<void> {
    const mon = await tx.monHoc.findUnique({
      where: { mamonhoc },
      select: { tenmonhoc: true },
    });
    const tenmonhoc = mon?.tenmonhoc ?? 'Không rõ';
    const link = `./test/start/${made}`;
    const content =
      `<span style="text-decoration: underline; color: blue; cursor: pointer;" ` +
      `onclick="window.open('${link}', '_blank')">${tende} – Môn ${tenmonhoc}</span>`;

    const tb = await tx.thongBao.create({
      data: {
        noidung: content,
        thoigiantao: new Date(),
        nguoitao: userId,
        is_auto: 1,
      },
    });

    const uniqNhom = [...new Set(nhom)];
    if (!uniqNhom.length) return;
    await tx.chiTietThongBao.createMany({
      data: uniqNhom.map((manhom) => ({ matb: tb.matb, manhom })),
      skipDuplicates: true,
    });
    const members = await tx.chiTietNhom.findMany({
      where: { manhom: { in: uniqNhom } },
      select: { manguoidung: true },
      distinct: ['manguoidung'],
    });
    const userIds = [...new Set(members.map((m) => m.manguoidung))];
    if (userIds.length) {
      await tx.trangThaiThongBao.createMany({
        data: userIds.map((manguoidung) => ({ matb: tb.matb, manguoidung })),
        skipDuplicates: true,
      });
    }
  }

  /** Chèn giaodethi cho các nhóm hợp lệ (tồn tại & trangthai != 0). */
  private async assignGroups(
    tx: Prisma.TransactionClient,
    made: number,
    nhom: number[],
  ): Promise<void> {
    const uniq = [...new Set(nhom)];
    if (!uniq.length) return;
    const valid = await tx.nhom.findMany({
      where: { manhom: { in: uniq }, NOT: { trangthai: 0 } },
      select: { manhom: true },
    });
    const ids = valid.map((n) => n.manhom);
    if (ids.length) {
      await tx.giaoDeThi.createMany({
        data: ids.map((manhom) => ({ made, manhom })),
        skipDuplicates: true,
      });
    }
  }

  /**
   * POST /test/addTest — tạo đề thi. Thay Test::addTest + DeThiModel::create.
   * Gói toàn bộ (đề + chương + nhóm + câu tự động + thông báo) trong 1
   * $transaction (chặt hơn PHP, vốn không bọc transaction).
   */
  async createTest(
    userId: string,
    dto: CreateTestDto,
  ): Promise<ICreateTestResult> {
    try {
      const mamonhoc = (dto.mamonhoc ?? '').trim();
      const tende = (dto.tende ?? '').trim();
      const thoigianthi = this.toInt(dto.thoigianthi);
      const loaide = this.toInt(dto.loaide);
      const chuong = dto.chuong ?? [];
      const nhom = dto.manhom ?? [];
      const socau = this.parseSoCau(dto.socau);

      if (!mamonhoc) throw new Error('Môn học không hợp lệ.');
      if (!tende) throw new Error('Tên đề không hợp lệ.');
      if (thoigianthi <= 0) throw new Error('Thời gian thi không hợp lệ.');

      const thoigianbatdau = this.parseDate(dto.thoigianbatdau);
      const thoigianketthuc = this.parseDate(dto.thoigianketthuc);

      const xembailam = this.toInt(dto.xembailam);
      const xemdiem = this.toInt(dto.xemdiem);
      const xemdapan = this.toInt(dto.xemdapan);
      const daocauhoi = this.toInt(dto.daocauhoi);
      const daodapan = this.toInt(dto.daodapan);
      const tudongnop = this.toInt(dto.tudongnop);
      const diem_tracnghiem = Number(dto.diem_tracnghiem) || 0;
      const diem_tuluan = Number(dto.diem_tuluan) || 0;
      const diem_dochieu = Number(dto.diem_dochieu) || 0;

      const g = (t: string, l: 'de' | 'tb' | 'kho') =>
        this.toInt(socau[t]?.[l]);

      return await this.prisma.$transaction(async (tx) => {
        // Đủ câu theo loại & mức độ (chỉ đề tự động).
        if (loaide === 1 && Object.keys(socau).length) {
          for (const [type, levels] of Object.entries(socau)) {
            for (const [key, levelNum] of [
              ['de', 1],
              ['tb', 2],
              ['kho', 3],
            ] as const) {
              const qty = this.toInt(levels[key]);
              if (qty <= 0) continue;
              const available = await this.countAvailable(
                tx,
                chuong,
                mamonhoc,
                levelNum,
                type,
              );
              if (available < qty) {
                throw new Error(
                  `Không đủ câu hỏi loại ${type} mức độ ${key}: Có ${available}, yêu cầu ${qty}.`,
                );
              }
            }
          }
        }

        const created = await tx.deThi.create({
          data: {
            monthi: mamonhoc,
            nguoitao: userId,
            tende,
            thoigianthi,
            thoigianbatdau,
            thoigianketthuc,
            hienthibailam: xembailam,
            xemdiemthi: xemdiem,
            xemdapan,
            troncauhoi: daocauhoi,
            trondapan: daodapan,
            nopbaichuyentab: tudongnop,
            loaide,
            mcq_de: g('mcq', 'de'),
            mcq_tb: g('mcq', 'tb'),
            mcq_kho: g('mcq', 'kho'),
            essay_de: g('essay', 'de'),
            essay_tb: g('essay', 'tb'),
            essay_kho: g('essay', 'kho'),
            reading_de: g('reading', 'de'),
            reading_tb: g('reading', 'tb'),
            reading_kho: g('reading', 'kho'),
            diem_tracnghiem,
            diem_tuluan,
            diem_dochieu,
            trangthai: 1,
          },
        });
        const made = created.made;

        const uniqChuong = [...new Set(chuong)];
        if (uniqChuong.length) {
          await tx.deThiTuDong.createMany({
            data: uniqChuong.map((machuong) => ({ made, machuong })),
            skipDuplicates: true,
          });
        }
        await this.assignGroups(tx, made, nhom);

        if (loaide === 1 && Object.keys(socau).length) {
          const added = await this.addQuestionsToAutoTest(
            tx,
            made,
            socau,
            chuong,
            mamonhoc,
          );
          await this.reorderQuestions(tx, made, added, daocauhoi === 1);
        }

        await this.createNotification(tx, made, userId, tende, mamonhoc, nhom);
        return { success: true, made };
      });
    } catch (e) {
      this.logger.error(`createTest lỗi: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * POST /test/updateTest — cập nhật đề thi. Thay Test::updateTest +
   * DeThiModel::update. Nếu đã có thí sinh làm → chặn đổi số câu/điểm. Đề tự động
   * chưa ai làm → random lại danh sách câu. Luôn cập nhật lại thutu theo cờ đảo.
   */
  async updateTest(
    userId: string,
    dto: UpdateTestDto,
  ): Promise<ICreateTestResult> {
    try {
      const made = this.toInt(dto.made);
      if (made <= 0) throw new Error('Mã đề không hợp lệ.');

      const monthi = (dto.mamonhoc ?? '').trim();
      const tende = (dto.tende ?? '').trim();
      const thoigianthi = this.toInt(dto.thoigianthi);
      if (!tende) throw new Error('Tên đề không hợp lệ.');
      if (thoigianthi <= 0) throw new Error('Thời gian thi không hợp lệ.');

      const thoigianbatdau = this.parseDate(dto.thoigianbatdau);
      const thoigianketthuc = this.parseDate(dto.thoigianketthuc);
      const xembailam = this.toInt(dto.xembailam);
      const xemdiem = this.toInt(dto.xemdiem);
      const xemdapan = this.toInt(dto.xemdapan);
      const daocauhoi = this.toInt(dto.daocauhoi);
      const daodapan = this.toInt(dto.daodapan);
      const tudongnop = this.toInt(dto.tudongnop);
      const loaide = this.toInt(dto.loaide);
      const chuong = dto.chuong ?? [];
      const nhom = dto.manhom ?? [];
      const socau = this.parseSoCau(dto.socau);

      const diem_tracnghiem = Number(dto.diem_tracnghiem) || 0;
      const diem_tuluan = Number(dto.diem_tuluan) || 0;
      const diem_dochieu = Number(dto.diem_dochieu) || 0;
      const g = (t: string, l: 'de' | 'tb' | 'kho') =>
        this.toInt(socau[t]?.[l]);

      return await this.prisma.$transaction(async (tx) => {
        const hasResult = (await tx.ketQua.count({ where: { made } })) > 0;
        const old = await tx.deThi.findUnique({
          where: { made },
          select: {
            mcq_de: true,
            mcq_tb: true,
            mcq_kho: true,
            essay_de: true,
            essay_tb: true,
            essay_kho: true,
            reading_de: true,
            reading_tb: true,
            reading_kho: true,
            diem_tracnghiem: true,
            diem_tuluan: true,
            diem_dochieu: true,
          },
        });
        if (!old) throw new Error('Không tìm thấy đề thi.');

        if (hasResult) {
          const sameCounts =
            g('mcq', 'de') === (old.mcq_de ?? 0) &&
            g('mcq', 'tb') === (old.mcq_tb ?? 0) &&
            g('mcq', 'kho') === (old.mcq_kho ?? 0) &&
            g('essay', 'de') === (old.essay_de ?? 0) &&
            g('essay', 'tb') === (old.essay_tb ?? 0) &&
            g('essay', 'kho') === (old.essay_kho ?? 0) &&
            g('reading', 'de') === (old.reading_de ?? 0) &&
            g('reading', 'tb') === (old.reading_tb ?? 0) &&
            g('reading', 'kho') === (old.reading_kho ?? 0);
          if (!sameCounts) {
            return {
              success: false,
              error:
                'Đề đã có thí sinh làm, không được thay đổi số lượng câu hỏi!',
            };
          }
          const sameScore =
            diem_tracnghiem === this.decToNum(old.diem_tracnghiem) &&
            diem_tuluan === this.decToNum(old.diem_tuluan) &&
            diem_dochieu === this.decToNum(old.diem_dochieu);
          if (!sameScore) {
            return {
              success: false,
              error: 'Đề đã có thí sinh làm, không được thay đổi điểm!',
            };
          }
        }

        await tx.deThi.update({
          where: { made },
          data: {
            monthi,
            nguoitao: userId,
            tende,
            thoigianthi,
            thoigianbatdau,
            thoigianketthuc,
            hienthibailam: xembailam,
            xemdiemthi: xemdiem,
            xemdapan,
            troncauhoi: daocauhoi,
            trondapan: daodapan,
            nopbaichuyentab: tudongnop,
            loaide,
            mcq_de: g('mcq', 'de'),
            mcq_tb: g('mcq', 'tb'),
            mcq_kho: g('mcq', 'kho'),
            essay_de: g('essay', 'de'),
            essay_tb: g('essay', 'tb'),
            essay_kho: g('essay', 'kho'),
            reading_de: g('reading', 'de'),
            reading_tb: g('reading', 'tb'),
            reading_kho: g('reading', 'kho'),
            diem_tracnghiem,
            diem_tuluan,
            diem_dochieu,
          },
        });

        // Cập nhật chương (đề tự động) + nhóm được giao.
        await tx.deThiTuDong.deleteMany({ where: { made } });
        const uniqChuong = [...new Set(chuong)];
        if (uniqChuong.length) {
          await tx.deThiTuDong.createMany({
            data: uniqChuong.map((machuong) => ({ made, machuong })),
            skipDuplicates: true,
          });
        }
        await tx.giaoDeThi.deleteMany({ where: { made } });
        await this.assignGroups(tx, made, nhom);

        // Đề tự động & chưa ai làm → tạo lại danh sách câu hỏi.
        if (loaide === 1 && !hasResult) {
          await tx.chiTietDeThi.deleteMany({ where: { made } });
          await this.addQuestionsToAutoTest(tx, made, socau, chuong, monthi);
        }

        // Sắp xếp lại thutu theo cờ đảo trên danh sách câu hiện tại.
        const qs = await tx.chiTietDeThi.findMany({
          where: { made },
          orderBy: { thutu: 'asc' },
          select: { macauhoi: true },
        });
        await this.reorderQuestions(
          tx,
          made,
          qs.map((q) => q.macauhoi),
          daocauhoi === 1,
        );

        return { success: true, made };
      });
    } catch (e) {
      this.logger.error(`updateTest lỗi: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  // ===================== LUỒNG LÀM BÀI SV (slice 4) =====================

  /** Bản ghi ketqua của 1 SV cho 1 đề — thay KetQuaModel::getMaKQ. null nếu chưa thi. */
  async getMaKQ(made: number, userId: string): Promise<IKetQuaRow | null> {
    const kq = await this.prisma.ketQua.findFirst({
      where: { made, manguoidung: userId },
    });
    return kq;
  }

  /**
   * SV có thuộc nhóm được giao đề không — thay DeThiModel::checkStudentAllowed.
   * EXISTS giaodethi × chitietnhom theo manguoidung.
   */
  async checkStudentAllowed(userId: string, made: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ ok: number }[]>(Prisma.sql`
      SELECT 1 AS ok
      FROM giaodethi gdt
      JOIN chitietnhom ctn ON gdt.manhom = ctn.manhom
      WHERE gdt.made = ${made} AND ctn.manguoidung = ${userId}
      LIMIT 1
    `);
    return rows.length > 0;
  }

  /**
   * Dữ liệu trang vào thi (vao_thi.ejs). Thay logic Test::start: lấy đề + tính
   * tổng số câu (đề thủ công loaide==0: nếu các cột mcq_de.. = 0 thì đếm
   * chitietdethi → gán socaude) + kết quả ketqua (Check).
   */
  async getStartPageData(
    made: number,
    userId: string,
  ): Promise<IStartPageData | null> {
    const dethi = await this.getById(made);
    if (!dethi) return null;
    const Test: Record<string, unknown> = { ...dethi };

    if (Number(dethi.loaide) === 0) {
      const cols = [
        dethi.mcq_de,
        dethi.mcq_tb,
        dethi.mcq_kho,
        dethi.essay_de,
        dethi.essay_tb,
        dethi.essay_kho,
        dethi.reading_de,
        dethi.reading_tb,
        dethi.reading_kho,
      ];
      const totalFromCols = cols.reduce(
        (s: number, v) => s + (Number(v) || 0),
        0,
      );
      if (totalFromCols === 0) {
        const cnt = await this.prisma.chiTietDeThi.count({ where: { made } });
        if (cnt > 0) Test.socaude = cnt;
      }
    }

    const Check = await this.getMaKQ(made, userId);
    return { Test, Check };
  }

  /**
   * POST /test/startTest — bắt đầu làm bài: tạo bản ghi ketqua (nếu chưa có) +
   * pre-insert chitietketqua theo danh sách câu của đề (chitietdethi) để
   * getQuestionByUser join được đáp án đã lưu khi quay lại.
   * Thay KetQuaModel::start + DeThiModel::getQuestionOfTest.
   * KHÁC PHP: pre-insert dựa trên chitietdethi (tập câu cố định cho cả đề tự
   * động & thủ công) thay vì random lại qua getQuestionTestAuto — tránh tạo
   * chitietketqua "mồ côi" lệch với câu thật sự hiển thị.
   */
  async startTest(made: number, userId: string): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const existed = await tx.ketQua.findFirst({
          where: { made, manguoidung: userId },
          select: { makq: true },
        });
        const makq = existed
          ? existed.makq
          : (
              await tx.ketQua.create({
                data: { made, manguoidung: userId },
                select: { makq: true },
              })
            ).makq;

        const ctdt = await tx.chiTietDeThi.findMany({
          where: { made },
          select: { macauhoi: true },
        });
        if (ctdt.length) {
          await tx.chiTietKetQua.createMany({
            data: ctdt.map((c) => ({ makq, macauhoi: c.macauhoi })),
            skipDuplicates: true,
          });
        }
      });
      return true;
    } catch (e) {
      this.logger.error(`startTest(${made}) lỗi: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * POST /test/getQuestion — câu hỏi để SV làm bài. Thay getQuestionByUser:
   * lấy thông tin đề (nav) + câu của đề (chitietdethi JOIN cauhoi, ORDER BY thutu),
   * mỗi câu lấy đáp án (getAllWithoutAnswer); nếu SV đã lưu đáp án (dapanchon) thì
   * trả đúng 1 lựa chọn (giữ quirk PHP). Trộn đáp án/câu nếu đề bật cờ.
   */
  async getQuestionByUser(
    made: number,
    userId: string,
  ): Promise<IGetQuestionByUser> {
    const info = await this.prisma.$queryRaw<IStudentTestInfo[]>(Prisma.sql`
      SELECT d.tende, d.thoigianthi, d.thoigianbatdau, d.thoigianketthuc,
             m.tenmonhoc, d.troncauhoi, d.trondapan, d.loaide
      FROM dethi d
      JOIN monhoc m ON d.monthi = m.mamonhoc
      WHERE d.made = ${made}
      LIMIT 1
    `);
    const dethiInfo = info[0];
    if (!dethiInfo) return { dethi: {}, cauhoi: [] };

    const troncauhoi = Number(dethiInfo.troncauhoi) || 0;
    const trondapan = Number(dethiInfo.trondapan) || 0;
    const loaide = Number(dethiInfo.loaide) || 0;

    const kq = await this.prisma.ketQua.findFirst({
      where: { made, manguoidung: userId },
      select: { makq: true },
    });
    const makq = kq?.makq ?? 0;

    const rows = await this.prisma.$queryRaw<
      {
        macauhoi: number;
        noidung: string;
        dokho: number;
        loai: string;
        hinhanh: string | null;
        context: string | null;
        tieude_context: string | null;
        thutu_goc: number | null;
        dapanchon: number | null;
      }[]
    >(Prisma.sql`
      SELECT ch.macauhoi, ch.noidung, ch.dokho, ch.loai, ch.hinhanh,
             dv.noidung AS context, dv.tieude AS tieude_context,
             ctdt.thutu AS thutu_goc, ctkq.dapanchon
      FROM chitietdethi ctdt
      JOIN cauhoi ch ON ctdt.macauhoi = ch.macauhoi
      LEFT JOIN doan_van dv ON ch.madv = dv.madv
      LEFT JOIN chitietketqua ctkq
        ON ch.macauhoi = ctkq.macauhoi AND ctkq.makq = ${makq}
      WHERE ctdt.made = ${made} AND ch.trangthai = 1
      ORDER BY ctdt.thutu ASC
    `);

    const cauhoi: IStudentQuestion[] = [];
    for (const row of rows) {
      let options: IStudentAnswerOption[];
      if (row.dapanchon && (row.loai === 'mcq' || row.loai === 'reading')) {
        // Quirk PHP: đã lưu đáp án → chỉ trả lựa chọn đã chọn (để tô lại).
        options = [
          {
            macautl: row.dapanchon,
            noidungtl: String(row.dapanchon),
            hinhanhtl: '',
          },
        ];
      } else {
        options = await this.getAnswersWithoutKey(row.macauhoi);
      }
      if (trondapan && row.loai !== 'essay') this.shuffle(options);

      cauhoi.push({
        macauhoi: row.macauhoi,
        noidung: row.noidung,
        dokho: row.dokho,
        loai: row.loai,
        hinhanh: row.hinhanh ?? null, // public URL Supabase (truc tiep lam src)
        context: row.context,
        tieude_context: row.tieude_context,
        thutu: Number(row.thutu_goc) || 0,
        dapanchon: row.dapanchon,
        cautraloi: options,
      });
    }

    if (loaide === 1 && troncauhoi === 1) {
      this.shuffle(cauhoi);
      cauhoi.forEach((c, k) => (c.thutu_hien_thi = k + 1));
    }

    return { dethi: dethiInfo, cauhoi };
  }

  /** Đáp án không kèm ladapan — thay CauTraLoiModel::getAllWithoutAnswer. */
  private async getAnswersWithoutKey(
    macauhoi: number,
  ): Promise<IStudentAnswerOption[]> {
    const ans = await this.prisma.cauTraLoi.findMany({
      where: { macauhoi },
      select: { macautl: true, noidungtl: true, hinhanh: true },
    });
    return ans.map((a) => ({
      macautl: a.macautl,
      noidungtl: a.noidungtl,
      hinhanhtl: a.hinhanh ?? '', // public URL Supabase (truc tiep lam src)
    }));
  }

  /**
   * POST /test/getTimeTest — mốc kết thúc theo thời gian vào thi + thời lượng đề
   * (thoigianvaothi + thoigianthi phút). Thay DeThiModel::getTimeTest. Trả chuỗi
   * ISO (de_thi.js dựng new Date(response)). null nếu chưa có ketqua.
   */
  async getTimeTest(made: number, userId: string): Promise<string | false> {
    const kq = await this.prisma.ketQua.findFirst({
      where: { made, manguoidung: userId },
      select: { thoigianvaothi: true },
    });
    if (!kq) return false;
    const dethi = await this.prisma.deThi.findUnique({
      where: { made },
      select: { thoigianthi: true },
    });
    const minutes = Number(dethi?.thoigianthi) || 0;
    const end = new Date(kq.thoigianvaothi.getTime() + minutes * 60 * 1000);
    return end.toISOString();
  }

  /** POST /test/getTimeEndTest — mốc đóng đề (dethi.thoigianketthuc). Trả ISO. */
  async getTimeEndTest(made: number): Promise<string | false> {
    const dethi = await this.prisma.deThi.findUnique({
      where: { made },
      select: { thoigianketthuc: true },
    });
    if (!dethi?.thoigianketthuc) return false;
    return dethi.thoigianketthuc.toISOString();
  }

  /**
   * POST /test/chuyentab — +1 số lần chuyển tab; trả cờ dethi.nopbaichuyentab
   * (1 = tự nộp khi rời tab). Thay KetQuaModel::chuyentab.
   */
  async chuyentab(made: number, userId: string): Promise<number> {
    await this.prisma.ketQua.updateMany({
      where: { made, manguoidung: userId },
      data: { solanchuyentab: { increment: 1 } },
    });
    const dethi = await this.prisma.deThi.findUnique({
      where: { made },
      select: { nopbaichuyentab: true },
    });
    return Number(dethi?.nopbaichuyentab) || 0;
  }

  /**
   * POST /test/submit — nộp & chấm bài. Thay KetQuaModel::submit (đọc thẳng $_POST).
   * `body` là toàn bộ trường multipart (de_thi.js gửi FormData): made, thoigian,
   * listCauTraLoi (JSON), essay_{i}_macauhoi/noidung/thutu/image_{j} (base64).
   * - Chấm mcq/reading: điểm = (điểm_loại / tổng_câu_loại) × số_câu_đúng.
   * - Tự luận: lưu traloi_tuluan + ảnh; trangthai_tuluan = 'Chưa chấm' nếu đề có essay.
   * Chỉ chấm khi ketqua.diemthi IS NULL (chưa nộp) → tránh nộp 2 lần.
   */
  async submit(
    made: number,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<{ success: boolean; makq: number | null; message?: string }> {
    const alreadySubmitted = new Error('Bài đã nộp hoặc không tồn tại');
    const newlyUploadedImages: string[] = [];
    try {
      const kq = await this.prisma.ketQua.findFirst({
        where: { made, manguoidung: userId, diemthi: null },
        select: { makq: true, thoigianvaothi: true },
      });
      if (!kq) {
        return {
          success: false,
          makq: null,
          message: alreadySubmitted.message,
        };
      }
      const makq = kq.makq;

      // Thời gian kết thúc: ưu tiên client gửi nếu lệch <= 120s, ngược lại = now.
      let end = new Date();
      const rawTime = plainText(body.thoigian);
      if (rawTime) {
        const t = new Date(rawTime);
        if (
          !isNaN(t.getTime()) &&
          Math.abs(t.getTime() - Date.now()) <= 120000
        ) {
          end = t;
        }
      }
      const thoigianlambai = Math.max(
        Math.floor((end.getTime() - kq.thoigianvaothi.getTime()) / 1000),
        0,
      );

      // listCauTraLoi (JSON) → [{macauhoi, cautraloi, thutu}].
      type ILuaChon = {
        macauhoi: number;
        cautraloi: number;
        thutu: number;
      };
      const invalid = (message: string) => ({
        success: false,
        makq: null,
        message,
      });
      const parseId = (value: unknown): number | null => {
        const text = plainText(value);
        if (!/^\d+$/.test(text)) return null;
        const number = Number(text);
        return Number.isSafeInteger(number) ? number : null;
      };
      let submittedChoices: unknown[] = [];
      const rawList = body.listCauTraLoi;
      if (rawList != null && rawList !== '') {
        if (typeof rawList !== 'string') {
          return invalid('Danh sách câu trả lời không hợp lệ');
        }
        try {
          const parsed = JSON.parse(rawList) as unknown;
          if (!Array.isArray(parsed)) {
            return invalid('Danh sách câu trả lời không hợp lệ');
          }
          submittedChoices = parsed;
        } catch {
          return invalid('Danh sách câu trả lời không hợp lệ');
        }
      }

      // Câu của đề trên server quyết định mẫu số, kể cả câu SV bỏ trống.
      const examQuestions = await this.prisma.chiTietDeThi.findMany({
        where: { made },
        select: { macauhoi: true },
      });
      const qs = await this.prisma.cauHoi.findMany({
        where: { macauhoi: { in: examQuestions.map((q) => q.macauhoi) } },
        select: { macauhoi: true, loai: true },
      });
      const typeMap = new Map(qs.map((q) => [q.macauhoi, q.loai]));
      const listCauTraLoi: ILuaChon[] = [];
      const seenChoices = new Set<number>();
      for (const value of submittedChoices) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return invalid('Danh sách câu trả lời không hợp lệ');
        }
        const ans = value as Record<string, unknown>;
        const macauhoi = parseId(ans.macauhoi);
        const cautraloi =
          ans.cautraloi == null || ans.cautraloi === ''
            ? 0
            : parseId(ans.cautraloi);
        if (macauhoi == null || macauhoi <= 0 || cautraloi == null) {
          return invalid('Mã câu hỏi hoặc đáp án không hợp lệ');
        }
        const loai = typeMap.get(macauhoi);
        if (loai !== 'mcq' && loai !== 'reading') {
          return invalid('Câu hỏi trắc nghiệm không thuộc đề thi');
        }
        if (seenChoices.has(macauhoi)) {
          return invalid('Câu trả lời bị lặp');
        }
        seenChoices.add(macauhoi);
        listCauTraLoi.push({
          macauhoi,
          cautraloi,
          thutu: this.toInt(ans.thutu),
        });
      }

      // Đáp án phải thuộc đúng câu trước khi ghi DB hoặc upload bất kỳ ảnh nào.
      const selectedIds = listCauTraLoi
        .map((ans) => ans.cautraloi)
        .filter((id) => id > 0);
      if (selectedIds.length) {
        const selectedAnswers = await this.prisma.cauTraLoi.findMany({
          where: { macautl: { in: selectedIds } },
          select: { macautl: true, macauhoi: true },
        });
        const answerOwners = new Map(
          selectedAnswers.map((ans) => [ans.macautl, ans.macauhoi]),
        );
        for (const ans of listCauTraLoi) {
          if (
            ans.cautraloi > 0 &&
            answerOwners.get(ans.cautraloi) !== ans.macauhoi
          ) {
            return invalid('Đáp án không thuộc câu hỏi');
          }
        }
      }

      const essayIndices = new Set<string>();
      for (const key of Object.keys(body)) {
        const match = key.match(
          /^essay_(\d+)_(exists|macauhoi|noidung|thutu|image_\d+)$/,
        );
        if (match) essayIndices.add(match[1]);
      }
      const seenEssays = new Set<number>();
      for (const index of essayIndices) {
        const macauhoi = parseId(body[`essay_${index}_macauhoi`]);
        if (macauhoi == null || typeMap.get(macauhoi) !== 'essay') {
          return invalid('Câu tự luận không thuộc đề thi');
        }
        if (seenEssays.has(macauhoi)) {
          return invalid('Câu trả lời tự luận bị lặp');
        }
        seenEssays.add(macauhoi);
      }

      // Upload ảnh tự luận lên Supabase TRƯỚC transaction (tránh I/O mạng trong tx).
      const essayEntries = await this.collectEssayAnswers(body);
      newlyUploadedImages.push(
        ...essayEntries.flatMap((entry) => entry.imageUrls),
      );
      const obsoleteImages: (string | null)[] = [];

      const diemthi = await this.prisma.$transaction(async (tx) => {
        // Giành quyền nộp trong cùng transaction với bài làm và điểm. UPDATE
        // khóa hàng; request đến sau phải kiểm lại diemthi sau khi hàng mở khóa.
        const claimed = await tx.ketQua.updateMany({
          where: { makq, diemthi: null },
          data: { trangthai: 'Đã nộp' },
        });
        if (claimed.count !== 1) throw alreadySubmitted;

        let socaudungMcq = 0;
        let socaudungReading = 0;

        for (const ans of listCauTraLoi) {
          const { macauhoi, cautraloi, thutu } = ans;
          const loai = typeMap.get(macauhoi);

          await tx.chiTietKetQua.upsert({
            where: { makq_macauhoi: { makq, macauhoi } },
            create: {
              makq,
              macauhoi,
              dapanchon: cautraloi || null,
              thutu,
            },
            update: { dapanchon: cautraloi || null, thutu },
          });

          if (cautraloi === 0) continue;
          const correct = await tx.cauTraLoi.count({
            where: { macauhoi, macautl: cautraloi, ladapan: 1 },
          });
          if (correct > 0) {
            if (loai === 'reading') socaudungReading++;
            else socaudungMcq++;
          }
        }
        const socaudungTong = socaudungMcq + socaudungReading;

        // Điểm trắc nghiệm / đọc hiểu.
        const dethi = await tx.deThi.findUnique({
          where: { made },
          select: { diem_tracnghiem: true, diem_dochieu: true },
        });
        const mcqTotal = this.decToNum(dethi?.diem_tracnghiem ?? 10);
        const readingTotal = this.decToNum(dethi?.diem_dochieu ?? 0);
        let tongMcq = 0;
        let tongReading = 0;
        for (const loai of typeMap.values()) {
          if (loai === 'mcq') tongMcq++;
          else if (loai === 'reading') tongReading++;
        }
        const diemTracNghiem =
          tongMcq > 0
            ? Math.round((mcqTotal / tongMcq) * socaudungMcq * 100) / 100
            : 0;
        const diemDoChieu =
          tongReading > 0
            ? Math.round(
                (readingTotal / tongReading) * socaudungReading * 100,
              ) / 100
            : 0;
        const diem = diemTracNghiem + diemDoChieu;

        // Tự luận (ảnh đã upload → URL ở essayEntries).
        obsoleteImages.push(
          ...(await this.saveEssayAnswers(tx, makq, essayEntries)),
        );

        // Đề có câu tự luận → chờ chấm.
        const hasEssay = [...typeMap.values()].includes('essay');

        await tx.ketQua.update({
          where: { makq },
          data: {
            diemthi: diem,
            diem_dochieu: diemDoChieu,
            thoigianlambai,
            thoigianketthuc: end,
            socaudung: socaudungTong,
            trangthai: 'Đã nộp',
            trangthai_tuluan: hasEssay ? 'Chưa chấm' : 'Đã chấm',
          },
        });
        return diem;
      });

      void diemthi;
      await removeUnreferencedImages(
        this.prisma,
        this.storage,
        obsoleteImages,
        this.logger,
      );
      return { success: true, makq };
    } catch (e) {
      await removeUnreferencedImages(
        this.prisma,
        this.storage,
        newlyUploadedImages,
        this.logger,
      );
      if (e === alreadySubmitted) {
        return {
          success: false,
          makq: null,
          message: alreadySubmitted.message,
        };
      }
      this.logger.error(`submit(${made}) lỗi: ${(e as Error).message}`);
      return { success: false, makq: null, message: 'Lỗi hệ thống' };
    }
  }

  /**
   * Gom bài làm tự luận từ body multipart theo index `essay_{i}_*` + UPLOAD ảnh
   * base64 lên Supabase → URL. Chạy TRƯỚC transaction (có I/O mạng). Thay phần
   * đọc body + lưu ảnh của KetQuaModel::xuLyTuLuan.
   */
  private async collectEssayAnswers(
    body: Record<string, unknown>,
  ): Promise<
    { macauhoi: number; noidung: string; thutu: number; imageUrls: string[] }[]
  > {
    const essays = new Map<
      string,
      { macauhoi: number; noidung: string; thutu: number; images: string[] }
    >();
    for (const [key, value] of Object.entries(body)) {
      const m = key.match(
        /^essay_(\d+)_(exists|macauhoi|noidung|thutu|image_\d+)$/,
      );
      if (!m) continue;
      const idx = m[1];
      if (!essays.has(idx))
        essays.set(idx, { macauhoi: 0, noidung: '', thutu: 0, images: [] });
      const e = essays.get(idx)!;
      const v = plainText(value);
      if (key.endsWith('_macauhoi')) e.macauhoi = this.toInt(v);
      else if (key.endsWith('_noidung')) e.noidung = v.trim();
      else if (key.endsWith('_thutu')) e.thutu = this.toInt(v);
      else if (key.includes('_image_') && v) e.images.push(v);
    }

    const result: {
      macauhoi: number;
      noidung: string;
      thutu: number;
      imageUrls: string[];
    }[] = [];
    for (const e of essays.values()) {
      if (e.macauhoi <= 0) continue;
      const imageUrls: string[] = [];
      for (const b64 of e.images) {
        const url = await this.storage.uploadBase64(
          b64,
          ExamsService.ESSAY_FOLDER,
        );
        if (url) imageUrls.push(url);
      }
      result.push({
        macauhoi: e.macauhoi,
        noidung: e.noidung,
        thutu: e.thutu,
        imageUrls,
      });
    }
    return result;
  }

  /**
   * Ghi bài làm tự luận vào DB (trong transaction): chitietketqua (dapanchon NULL)
   * + traloi_tuluan (upsert theo makq+macauhoi) + hinhanh_traloi_tuluan (URL đã
   * upload sẵn). Không có I/O mạng ở đây.
   */
  private async saveEssayAnswers(
    tx: Prisma.TransactionClient,
    makq: number,
    entries: {
      macauhoi: number;
      noidung: string;
      thutu: number;
      imageUrls: string[];
    }[],
  ): Promise<(string | null)[]> {
    const obsoleteImages: (string | null)[] = [];
    for (const e of entries) {
      if (e.macauhoi <= 0) continue;

      await tx.chiTietKetQua.upsert({
        where: { makq_macauhoi: { makq, macauhoi: e.macauhoi } },
        create: { makq, macauhoi: e.macauhoi, dapanchon: null, thutu: e.thutu },
        update: { dapanchon: null, thutu: e.thutu },
      });

      const existing = await tx.traLoiTuLuan.findFirst({
        where: { makq, macauhoi: e.macauhoi },
        select: { id: true },
      });
      const traloiId = existing
        ? (
            await tx.traLoiTuLuan.update({
              where: { id: existing.id },
              data: { noidung: e.noidung },
              select: { id: true },
            })
          ).id
        : (
            await tx.traLoiTuLuan.create({
              data: { makq, macauhoi: e.macauhoi, noidung: e.noidung },
              select: { id: true },
            })
          ).id;

      const previousImages = await tx.hinhAnhTraLoiTuLuan.findMany({
        where: { traloi_id: traloiId },
        select: { hinhanh: true },
      });
      obsoleteImages.push(...previousImages.map((image) => image.hinhanh));
      await tx.hinhAnhTraLoiTuLuan.deleteMany({
        where: { traloi_id: traloiId },
      });
      for (const url of e.imageUrls) {
        await tx.hinhAnhTraLoiTuLuan.create({
          data: { traloi_id: traloiId, hinhanh: url },
        });
      }
    }
    return obsoleteImages;
  }

  /**
   * POST /test/getResultDetail — chi tiết bài làm để SV xem lại (vaothi.js).
   * Thay DeThiModel::getResultDetail: gộp câu của đề + đáp án đã chọn + bài tự
   * luận (nội dung, ảnh) + điểm GV chấm. cautraloi kèm ladapan + ảnh data-URI.
   */
  async getResultDetail(makq: number): Promise<IResultDetailRow[]> {
    const rows = await this.prisma.$queryRaw<
      Omit<IResultDetailRow, 'cautraloi'>[]
    >(Prisma.sql`
      SELECT ch.macauhoi, ch.noidung, ch.dokho, ch.loai,
             dv.noidung AS context, dv.tieude AS tieude_context,
             ct.dapanchon,
             tt.id AS traloi_id, tt.noidung AS noidung_tra_loi,
             tt.thoigianlam AS thoigianlam_tra_loi,
             ctt.diem AS diem_cham_tuluan,
             string_agg(hinh.hinhanh, '||' ORDER BY hinh.id) AS ds_hinhanh
      FROM chitietdethi ctd
      JOIN cauhoi ch ON ctd.macauhoi = ch.macauhoi
      LEFT JOIN chitietketqua ct ON ct.macauhoi = ch.macauhoi AND ct.makq = ${makq}
      LEFT JOIN traloi_tuluan tt ON tt.macauhoi = ch.macauhoi AND tt.makq = ${makq}
      LEFT JOIN cham_tuluan ctt ON ctt.macauhoi = ch.macauhoi AND ctt.makq = ${makq}
      LEFT JOIN doan_van dv ON ch.madv = dv.madv
      LEFT JOIN hinhanh_traloi_tuluan hinh ON hinh.traloi_id = tt.id
      WHERE ctd.made = (SELECT made FROM ketqua WHERE makq = ${makq} LIMIT 1)
      GROUP BY ch.macauhoi, ch.noidung, ch.dokho, ch.loai, dv.noidung, dv.tieude,
               ct.dapanchon, tt.id, tt.noidung, tt.thoigianlam, ctt.diem
      ORDER BY MIN(ct.thutu) ASC
    `);

    const result: IResultDetailRow[] = [];
    for (const row of rows) {
      const ans = await this.prisma.cauTraLoi.findMany({
        where: { macauhoi: row.macauhoi },
        select: {
          macautl: true,
          macauhoi: true,
          noidungtl: true,
          ladapan: true,
          hinhanh: true,
        },
        orderBy: { macautl: 'asc' },
      });
      result.push({
        ...row,
        cautraloi: ans.map((a) => ({
          macautl: a.macautl,
          macauhoi: a.macauhoi,
          noidungtl: a.noidungtl,
          ladapan: a.ladapan,
          hinhanh: a.hinhanh ?? null, // public URL Supabase
        })),
      });
    }
    return result;
  }

  // ========== CHI TIẾT/KẾT QUẢ ĐỀ (GV) + CHẤM TỰ LUẬN (slice 5) ==========

  /**
   * Thông tin cơ bản đề cho trang test_detail — thay DeThiModel::getInfoTestBasic.
   * Trả null nếu đề không tồn tại. Kèm danh sách nhóm được giao (manhom + tennhom)
   * để render dropdown lọc & offcanvas thông tin.
   */
  async getInfoTestBasic(made: number): Promise<IInfoTestBasic | null> {
    const rows = await this.prisma.$queryRaw<
      Omit<IInfoTestBasic, 'nhom'>[]
    >(Prisma.sql`
      SELECT DT.made, DT.tende, DT.thoigiantao, DT.loaide, DT.nguoitao,
             MH.mamonhoc, MH.tenmonhoc
      FROM dethi DT
      JOIN monhoc MH ON DT.monthi = MH.mamonhoc
      WHERE DT.made = ${made}
      LIMIT 1
    `);
    const dethi = rows[0];
    if (!dethi) return null;
    const nhom = await this.prisma.$queryRaw<
      { manhom: number; tennhom: string }[]
    >(Prisma.sql`
      SELECT GDT.manhom, N.tennhom
      FROM giaodethi GDT
      JOIN nhom N ON GDT.manhom = N.manhom
      WHERE GDT.made = ${made}
    `);
    return { ...dethi, nhom };
  }

  /** Điều kiện lọc nhóm cho bảng điểm (manhom là số hoặc mảng số). */
  private examResultManhom(manhom: IExamPaginationArgs['manhom']): Prisma.Sql {
    if (Array.isArray(manhom)) {
      const list = manhom
        .map((m) => Number(m))
        .filter((n) => Number.isFinite(n));
      if (list.length === 0) return Prisma.sql`AND FALSE`;
      return Prisma.sql`AND CTN.manhom IN (${Prisma.join(list)})`;
    }
    return Prisma.sql`AND CTN.manhom = ${Number(manhom)}`;
  }

  /** ORDER BY cho bảng điểm — whitelist cột như KetQuaModel::getQuery (sort). */
  private examResultOrder(args: IExamPaginationArgs): Prisma.Sql {
    if (args.custom?.function === 'sort') {
      const ord =
        String(args.custom?.order).toLowerCase() === 'desc'
          ? Prisma.sql`DESC`
          : Prisma.sql`ASC`;
      switch (args.custom?.column) {
        case 'manguoidung':
          return Prisma.sql`ORDER BY manguoidung ${ord}`;
        case 'diemthi':
          return Prisma.sql`ORDER BY diemthi ${ord}`;
        case 'thoigianvaothi':
          return Prisma.sql`ORDER BY thoigianvaothi ${ord}`;
        case 'thoigianlambai':
          return Prisma.sql`ORDER BY thoigianlambai ${ord}`;
        case 'solanchuyentab':
          return Prisma.sql`ORDER BY solanchuyentab ${ord}`;
        case 'hoten':
          // firstname = từ cuối của họ tên (thay SUBSTRING_INDEX(hoten,' ',-1)).
          return Prisma.sql`ORDER BY substring(hoten from '[^ ]+$') ${ord}`;
        default:
          break;
      }
    }
    return Prisma.sql`ORDER BY manguoidung ASC`;
  }

  /** Nhánh "đã thi/đang thi" (present/interrupted/all-present) — SELECT ketqua. */
  private examResultPresentSql(
    made: number,
    diemCond: Prisma.Sql,
    manhom: Prisma.Sql,
    search: Prisma.Sql,
  ): Prisma.Sql {
    return Prisma.sql`
      SELECT DISTINCT
        KQ.makq, KQ.made, KQ.manguoidung, KQ.diemthi, KQ.diem_tuluan,
        KQ.trangthai, KQ.trangthai_tuluan, KQ.thoigianvaothi, KQ.thoigianlambai,
        KQ.socaudung, KQ.solanchuyentab,
        ND.email, ND.hoten, ND.avatar, DT.thoigianbatdau, DT.thoigianketthuc
      FROM ketqua KQ
      JOIN nguoidung ND ON KQ.manguoidung = ND.id
      JOIN chitietnhom CTN ON CTN.manguoidung = ND.id
      JOIN dethi DT ON DT.made = KQ.made
      WHERE KQ.made = ${made} ${diemCond} ${manhom} ${search}
    `;
  }

  /**
   * Nhánh "vắng thi" (absent) — SV thuộc nhóm nhưng CHƯA có ketqua.
   * Thay KetQuaModel::getListAbsentFromTest. KHÁC PHP: có kèm giờ đề
   * (thoigianbatdau/thoigianketthuc) để JS tính đúng trạng thái "Vắng/Đang/Chưa".
   */
  private examResultAbsentSql(
    made: number,
    manhom: Prisma.Sql,
    search: Prisma.Sql,
  ): Prisma.Sql {
    return Prisma.sql`
      SELECT DISTINCT
        NULL::int AS makq, ${made}::int AS made, CTN.manguoidung,
        NULL::double precision AS diemthi, NULL::double precision AS diem_tuluan,
        NULL::text AS trangthai, NULL::text AS trangthai_tuluan,
        NULL::timestamp AS thoigianvaothi, NULL::int AS thoigianlambai,
        NULL::int AS socaudung, NULL::int AS solanchuyentab,
        ND.email, ND.hoten, ND.avatar, DT.thoigianbatdau, DT.thoigianketthuc
      FROM chitietnhom CTN
      JOIN nguoidung ND ON ND.id = CTN.manguoidung
      JOIN dethi DT ON DT.made = ${made}
      LEFT JOIN ketqua KQ ON CTN.manguoidung = KQ.manguoidung AND KQ.made = ${made}
      WHERE KQ.made IS NULL ${manhom} ${search}
    `;
  }

  /** Dựng câu truy vấn bảng điểm theo filter (present/interrupted/absent/all). */
  private buildExamResultQuery(
    args: IExamPaginationArgs,
    countOnly: boolean,
  ): Prisma.Sql {
    const made = Number(args.made);
    const filter = plainText(args.filter) || 'present';
    const manhom = this.examResultManhom(args.manhom);
    const input = (args.input ?? args.content ?? '').trim();
    const like = `%${input}%`;
    const search = input
      ? Prisma.sql`AND (ND.hoten ILIKE ${like} OR CTN.manguoidung ILIKE ${like})`
      : Prisma.empty;
    const order = countOnly ? Prisma.empty : this.examResultOrder(args);

    if (filter === 'all') {
      const present = this.examResultPresentSql(
        made,
        Prisma.empty,
        manhom,
        search,
      );
      const absent = this.examResultAbsentSql(made, manhom, search);
      const outerSearch = input
        ? Prisma.sql`WHERE (hoten ILIKE ${like} OR manguoidung ILIKE ${like})`
        : Prisma.empty;
      return Prisma.sql`
        SELECT * FROM ((${present}) UNION (${absent})) AS combined
        ${outerSearch} ${order}`;
    }
    if (filter === 'absent') {
      return Prisma.sql`${this.examResultAbsentSql(made, manhom, search)} ${order}`;
    }
    const diemCond =
      filter === 'interrupted'
        ? Prisma.sql`AND KQ.diemthi IS NULL`
        : Prisma.sql`AND KQ.diemthi IS NOT NULL`; // "present" mặc định
    return Prisma.sql`${this.examResultPresentSql(made, diemCond, manhom, search)} ${order}`;
  }

  /**
   * POST /test/pagination (model=KetQuaModel) — 1 trang bảng điểm thí sinh.
   * Thay KetQuaModel::getQuery. showData (test_detail.js) đọc mảng dòng này.
   */
  listExamResults(args: IExamPaginationArgs): Promise<IExamResultRow[]> {
    const limit = Number(args.limit) || PAGE_SIZE;
    const page = Math.max(Number(args.page) || 1, 1);
    const offset = (page - 1) * limit;
    const inner = this.buildExamResultQuery(args, false);
    return this.prisma.$queryRaw<IExamResultRow[]>(
      Prisma.sql`${inner} LIMIT ${limit} OFFSET ${offset}`,
    );
  }

  /** POST /test/getTotalPages (model=KetQuaModel) — tổng số trang bảng điểm. */
  async countExamResultPages(
    args: IExamPaginationArgs,
  ): Promise<{ totalPages: number }> {
    const limit = Number(args.limit) || PAGE_SIZE;
    const inner = this.buildExamResultQuery(args, true);
    const rows = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS count FROM (${inner}) AS sub`,
    );
    const total = Number(rows[0]?.count ?? 0);
    return { totalPages: Math.ceil(total / limit) };
  }

  /**
   * POST /test/getStatictical — thống kê điểm cho tab Thống kê (biểu đồ + thẻ).
   * Thay KetQuaModel::getStatictical. Giữ quirk PHP: KHÔNG DISTINCT nên SV thuộc
   * nhiều nhóm được giao đề có thể bị đếm nhiều lần (khi lọc "Tất cả").
   */
  async getStatictical(
    made: number,
    manhom: number,
  ): Promise<IStaticticalResult> {
    const nhomCond =
      manhom && manhom !== 0
        ? Prisma.sql`AND CTN.manhom = ${manhom}`
        : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { mandkq: string | null; diemthi: number | null }[]
    >(Prisma.sql`
      SELECT CTN.manguoidung, KQ.manguoidung AS mandkq, KQ.makq, KQ.made, KQ.diemthi
      FROM chitietnhom CTN
      JOIN giaodethi GDT ON CTN.manhom = GDT.manhom
      LEFT JOIN ketqua KQ ON KQ.manguoidung = CTN.manguoidung AND KQ.made = ${made}
      WHERE GDT.made = ${made} ${nhomCond}
    `);

    const diemthiBins = new Array<number>(10).fill(0);
    let tongdiem = 0;
    let soluong = 0;
    let max = 0;
    let chuanop = 0;
    let khongthi = 0;
    for (const row of rows) {
      if (row.diemthi != null) {
        tongdiem += row.diemthi;
        soluong++;
        const idx = Math.ceil(row.diemthi) > 0 ? Math.ceil(row.diemthi) - 1 : 0;
        if (idx >= 0 && idx < 10) diemthiBins[idx]++;
        if (row.diemthi > max) max = row.diemthi;
      } else if (row.mandkq != null) {
        chuanop++;
      } else {
        khongthi++;
      }
    }
    return {
      diem_trung_binh:
        soluong !== 0 ? Math.round((tongdiem / soluong) * 100) / 100 : 0,
      da_nop_bai: soluong,
      chua_nop_bai: chuanop,
      khong_thi: khongthi,
      diem_cao_nhat: max,
      thong_ke_diem: diemthiBins,
    };
  }

  /**
   * POST /test/getListEssaySubmissionsAction — danh sách SV có bài tự luận cần chấm.
   * Thay CauTraLoiModel::getAllEssaySubmissions. status: 'all'|'graded'|'ungraded'.
   * KHÁC PHP: có trả `avatar` (PHP quên map) để hiển thị ảnh SV.
   */
  async getEssaySubmissions(
    made: number,
    search: string | null,
    status: string,
  ): Promise<{ success: boolean; data: IEssaySubmissionRow[] }> {
    const s = (search ?? '').trim();
    const like = `%${s}%`;
    const searchCond = s
      ? Prisma.sql`AND (nd.hoten ILIKE ${like} OR k.manguoidung ILIKE ${like})`
      : Prisma.empty;
    const statusCond =
      status === 'graded'
        ? Prisma.sql`AND (k.diem_tuluan IS NOT NULL AND k.diem_tuluan > 0)`
        : status === 'ungraded'
          ? Prisma.sql`AND (k.diem_tuluan IS NULL OR k.diem_tuluan = 0)`
          : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      {
        makq: number;
        manguoidung: string;
        hoten: string;
        avatar: string | null;
        diemthi: number | null;
        diem_dochieu: number | null;
        diem_tuluan: number | null;
      }[]
    >(Prisma.sql`
      SELECT k.makq, k.manguoidung, COALESCE(nd.hoten, k.manguoidung) AS hoten,
             nd.avatar, k.diemthi, k.diem_dochieu, k.diem_tuluan,
             k.trangthai_tuluan, k.thoigianvaothi, k.thoigianlambai
      FROM ketqua k
      INNER JOIN (
        SELECT DISTINCT makq FROM traloi_tuluan
        WHERE makq IN (SELECT makq FROM ketqua WHERE made = ${made})
      ) tt ON tt.makq = k.makq
      LEFT JOIN nguoidung nd ON nd.id = k.manguoidung
      WHERE k.made = ${made} ${searchCond} ${statusCond}
      ORDER BY (k.thoigianvaothi + (COALESCE(k.thoigianlambai, 0) || ' seconds')::interval) DESC
    `);

    const data: IEssaySubmissionRow[] = rows.map((r) => {
      const diemTL = Math.round((r.diem_tuluan ?? 0) * 100) / 100;
      return {
        makq: r.makq,
        manguoidung: r.manguoidung,
        hoten: r.hoten,
        avatar: r.avatar,
        diemthi: r.diemthi,
        diem_dochieu: r.diem_dochieu,
        diem_tuluan_hien_tai: diemTL,
        trangthai_cham: diemTL > 0 ? 'Đã chấm' : 'Chưa chấm',
      };
    });
    return { success: true, data };
  }

  /**
   * POST /test/getEssayDetailAction — chi tiết bài làm tự luận 1 thí sinh (form chấm).
   * Thay CauTraLoiModel::getEssayAnswersByMakq. hinhanh trả base64 THUẦN (JS tự
   * thêm data:image/png;base64,). Gộp theo macauhoi (mỗi câu 1 khối + list ảnh).
   */
  async getEssayDetail(makq: number): Promise<{
    success: boolean;
    makq: number;
    manguoidung: string | null;
    hoten: string | null;
    avatar: string | null;
    tong_diem_tuluan: number;
    tong_cau: number;
    da_cham: number;
    cautraloi: IEssayAnswerDetail[];
  }> {
    const userRows = await this.prisma.$queryRaw<
      { manguoidung: string; hoten: string; avatar: string | null }[]
    >(Prisma.sql`
      SELECT kq.manguoidung, COALESCE(nd.hoten, kq.manguoidung) AS hoten, nd.avatar
      FROM ketqua kq
      LEFT JOIN nguoidung nd ON nd.id = kq.manguoidung
      WHERE kq.makq = ${makq}
      LIMIT 1
    `);
    const info = userRows[0] ?? null;

    const rows = await this.prisma.$queryRaw<
      {
        traloi_id: number;
        macauhoi: number;
        noidung_tra_loi: string | null;
        thoigianlam: Date | null;
        noidung_cauhoi: string | null;
        diem_da_cham: number | null;
      }[]
    >(Prisma.sql`
      SELECT tt.id AS traloi_id, tt.macauhoi, tt.noidung AS noidung_tra_loi,
             tt.thoigianlam, ch.noidung AS noidung_cauhoi, ct.diem AS diem_da_cham
      FROM traloi_tuluan tt
      INNER JOIN cauhoi ch ON ch.macauhoi = tt.macauhoi
      LEFT JOIN cham_tuluan ct ON ct.makq = tt.makq AND ct.macauhoi = tt.macauhoi
      WHERE tt.makq = ${makq}
      ORDER BY tt.macauhoi ASC
    `);

    const byCau = new Map<number, IEssayAnswerDetail>();
    let tongDiem = 0;
    let daCham = 0;
    for (const row of rows) {
      if (!byCau.has(row.macauhoi)) {
        const diemCham =
          row.diem_da_cham != null ? Number(row.diem_da_cham) : null;
        byCau.set(row.macauhoi, {
          macauhoi: row.macauhoi,
          noidung_cauhoi: row.noidung_cauhoi ?? '(Câu hỏi đã bị xóa)',
          noidung_tra_loi: row.noidung_tra_loi ?? '',
          thoigianlam: row.thoigianlam,
          diem_cham: diemCham,
          hinhanh: [],
        });
        if (diemCham != null) {
          tongDiem += diemCham;
          daCham++;
        }
      }
      const imgs = await this.prisma.hinhAnhTraLoiTuLuan.findMany({
        where: { traloi_id: row.traloi_id },
        select: { hinhanh: true },
        orderBy: { id: 'asc' },
      });
      const target = byCau.get(row.macauhoi)!;
      for (const im of imgs) {
        if (im.hinhanh) target.hinhanh.push(im.hinhanh); // public URL Supabase
      }
    }

    const cautraloi = [...byCau.values()];
    return {
      success: true,
      makq,
      manguoidung: info?.manguoidung ?? null,
      hoten: info?.hoten ?? null,
      avatar: info?.avatar ?? null,
      tong_diem_tuluan: Math.round(tongDiem * 100) / 100,
      tong_cau: cautraloi.length,
      da_cham: daCham,
      cautraloi,
    };
  }

  /**
   * POST /test/saveEssayScoreAction — lưu điểm tự luận (tổng + từng câu).
   * Thay KetquaModel::luuDiemTuLuan. Chặn nếu tổng vượt diem_tuluan tối đa của đề.
   * KHÁC PHP: thay "INSERT ... ON DUPLICATE KEY" bằng xoá điểm cũ (theo makq +
   * các macauhoi gửi lên) rồi createMany — vì bảng cham_tuluan không có unique
   * (makq,macauhoi) trong schema Prisma. Kết quả tương đương (ghi đè).
   */
  async saveEssayScore(
    makq: number,
    diemTong: number,
    diemTungCau: Record<string, number | string>,
  ): Promise<ISaveEssayResult> {
    if (!Number.isInteger(makq) || makq <= 0) {
      return { success: false, message: 'Mã kết quả không hợp lệ' };
    }
    const diemTongRounded = Math.round(diemTong * 100) / 100;

    const maxRows = await this.prisma.$queryRaw<{ diem_tuluan_max: number }[]>(
      Prisma.sql`
        SELECT d.diem_tuluan AS diem_tuluan_max
        FROM ketqua k
        JOIN dethi d ON k.made = d.made
        WHERE k.makq = ${makq}
        LIMIT 1
      `,
    );
    if (maxRows.length === 0) {
      return { success: false, message: 'Kết quả không tồn tại' };
    }
    const diemMax = Number(maxRows[0].diem_tuluan_max ?? 0);
    if (diemTongRounded > diemMax) {
      return {
        success: false,
        message: `Điểm chấm <span style='color:green; font-size:1.5em; font-weight:bold;'>${diemTongRounded} </span>điểm vượt quá tối đa <span style='color:red; font-size:1.5em; font-weight:bold;'>${diemMax}</span> điểm cho phần tự luận`,
      };
    }

    const rows = Object.entries(diemTungCau)
      .map(([mc, d]) => ({
        macauhoi: Number(mc),
        diem: Math.round(Number(d) * 100) / 100,
      }))
      .filter((r) => Number.isInteger(r.macauhoi) && r.macauhoi > 0);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (rows.length > 0) {
          await tx.chamTuLuan.deleteMany({
            where: { makq, macauhoi: { in: rows.map((r) => r.macauhoi) } },
          });
          await tx.chamTuLuan.createMany({
            data: rows.map((r) => ({
              makq,
              macauhoi: r.macauhoi,
              diem: r.diem,
            })),
          });
        }
        await tx.ketQua.update({
          where: { makq },
          data: {
            diem_tuluan: diemTongRounded,
            trangthai_tuluan: diemTongRounded > 0 ? 'Đã chấm' : 'Chưa chấm',
          },
        });
      });
    } catch (e) {
      return { success: false, message: 'Lỗi: ' + (e as Error).message };
    }

    return {
      success: true,
      message: 'Lưu điểm tự luận thành công!',
      diem_tuluan: diemTongRounded,
    };
  }

  /**
   * POST /test/getTestsGroupWithUserResult — đề đã giao cho 1 nhóm kèm điểm của
   * SV đang đăng nhập (offcanvas trang nhóm SV client_group). Thay
   * DeThiModel::getTestsGroupWithUserResult. Chỉ đề trangthai=1; T2 gắn điểm thi
   * của SV theo nhóm; ORDER BY made DESC.
   */
  getTestsGroupWithUserResult(
    manhom: number,
    userId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT T1.*, T2.diemthi
      FROM (
        SELECT DT.made, DT.tende, DT.thoigianbatdau, DT.thoigianketthuc
        FROM dethi DT, giaodethi GDT
        WHERE DT.made = GDT.made AND DT.trangthai = 1 AND GDT.manhom = ${manhom}
      ) T1
      LEFT JOIN (
        SELECT KQ.made, KQ.diemthi
        FROM ketqua KQ, giaodethi GDT
        WHERE KQ.made = GDT.made
          AND KQ.manguoidung = ${userId}
          AND GDT.manhom = ${manhom}
      ) T2 ON T1.made = T2.made
      ORDER BY T1.made DESC
    `);
  }

  /**
   * POST /test/getExamineeByGroup — bài làm của 1 đề, lọc theo 1 nhóm học phần
   * (kèm email/họ tên/ảnh của thí sinh). Thay
   * `KetQuaModel::getExamineeByGroup`.
   *
   * PHP có sẵn action + model này nhưng KHÔNG file JS nào gọi — port lại cho đủ
   * bề mặt API; dùng được cho màn "danh sách thí sinh theo nhóm" của 1 đề.
   * Giữ nguyên truy vấn gốc: chỉ lấy SV **đã có bản ghi `ketqua`** (SV chưa thi
   * không xuất hiện) và KHÔNG lọc `chitietnhom.hienthi`.
   */
  getExamineeByGroup(
    made: number,
    manhom: number,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT KQ.*, ND.email, ND.hoten, ND.avatar
      FROM ketqua KQ, nguoidung ND, chitietnhom CTN
      WHERE KQ.manguoidung = ND.id
        AND CTN.manguoidung = ND.id
        AND KQ.made = ${made}
        AND CTN.manhom = ${manhom}
      ORDER BY KQ.makq ASC
    `);
  }

  /**
   * POST /test/getTestGroup — đề đã giao cho 1 nhóm (tab "Đề kiểm tra" ở
   * offcanvas trang chi tiết nhóm học phần của GV). Thay
   * DeThiModel::getListTestGroup.
   *
   * KHÁC PHP: SQL gốc không lọc `dethi.trangthai` — giữ nguyên để đề tạm ẩn vẫn
   * hiện với GV. Mốc thời gian trả về đã định dạng sẵn `H:i d/m/Y` y PHP
   * (`date_format`) vì class_detail.js in thẳng chuỗi ra màn hình.
   */
  async getTestGroup(manhom: number): Promise<Record<string, unknown>[]> {
    const rows = await this.prisma.$queryRaw<
      {
        made: number;
        tende: string;
        thoigianbatdau: Date | null;
        thoigianketthuc: Date | null;
      }[]
    >(Prisma.sql`
      SELECT DT.made, DT.tende, DT.thoigianbatdau, DT.thoigianketthuc
      FROM dethi DT, giaodethi GDT
      WHERE DT.made = GDT.made AND GDT.manhom = ${manhom}
      ORDER BY DT.made DESC
    `);

    return rows.map((r) => ({
      ...r,
      thoigianbatdau: formatTestTime(r.thoigianbatdau),
      thoigianketthuc: formatTestTime(r.thoigianketthuc),
    }));
  }
}

/** `H:i d/m/Y` — y `date_format(..., "H:i d/m/Y")` của DeThiModel PHP. */
function formatTestTime(value: Date | string | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
