import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SupabaseStorageService } from '@/storage/supabase-storage.service';
import { removeUnreferencedImages } from '@/storage/image-cleanup';
import type {
  IAddFileResult,
  IAnswerRow,
  IIncomingAnswer,
  IIncomingOption,
  IPaginationArgs,
  IParsedEssay,
  IParsedItem,
  IParsedMcq,
  IParsedReading,
  IQuestionDetail,
  IMultiAnswerRow,
  IQuestionListRow,
  IQuestionRow,
  IReadingAnswerRow,
  IWriteQuestionInput,
  IWriteQuestionResult,
} from '@/questions/interfaces/questions.types';
import {
  extractDocxLines,
  parseEssayDocx,
  parseMcqDocx,
  parseReadingDocx,
} from '@/questions/question-file.parser';

const PAGE_SIZE = 10;

/**
 * Nghiệp vụ Ngân hàng câu hỏi — thay CauHoiModel.php + CauTraLoiModel.php.
 *
 * Quy ước port lại:
 *  - Ảnh lưu ở Supabase Storage, DB chỉ lưu public URL; MIME theo magic-bytes.
 *  - Xoá câu hỏi: xoá MỀM (trangthai = 0), giữ dữ liệu liên quan.
 *  - getQuestionBySubject: liệt kê theo môn/chương/độ khó; mỗi câu reading hiện
 *    nội dung ĐOẠN VĂN + số câu con (num_subquestions). machuong/dokho = 0 = bỏ lọc.
 *
 * Thêm/sửa nhận multipart; Word và Excel dùng chung preview rồi nhập cả lô.
 * Ảnh hết tham chiếu chỉ dọn sau khi transaction cập nhật thành công.
 */
@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  /** Thư mục lưu ảnh câu hỏi/đáp án trên bucket Supabase. */
  private static readonly FOLDER = 'questions';

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  /** Điều kiện lọc danh sách câu hỏi theo môn/chương/độ khó/nội dung. */
  private buildWhere(
    mamonhoc: string,
    machuong = 0,
    dokho = 0,
    content = '',
  ): Prisma.CauHoiWhereInput {
    return {
      mamonhoc,
      trangthai: 1,
      // Câu mcq/essay (madv null) hoặc câu con reading (loai='reading').
      OR: [{ madv: null }, { loai: 'reading' }],
      ...(machuong ? { machuong } : {}),
      ...(dokho ? { dokho } : {}),
      ...(content
        ? { noidung: { contains: content, mode: 'insensitive' as const } }
        : {}),
    };
  }

  /** POST /question/getQuestionBySubject — 1 trang câu hỏi của môn. */
  async getQuestionBySubject(
    mamonhoc: string,
    machuong = 0,
    dokho = 0,
    content = '',
    page = 1,
  ): Promise<IQuestionRow[]> {
    const where = this.buildWhere(mamonhoc, machuong, dokho, content);
    const rows = await this.prisma.cauHoi.findMany({
      where,
      orderBy: { macauhoi: 'asc' },
      skip: (Math.max(page, 1) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        macauhoi: true,
        noidung: true,
        dokho: true,
        machuong: true,
        loai: true,
        madv: true,
      },
    });

    const mon = await this.prisma.monHoc.findUnique({
      where: { mamonhoc },
      select: { tenmonhoc: true },
    });
    const tenmonhoc = mon?.tenmonhoc ?? '';

    // Nội dung đoạn văn + số câu con cho các dòng reading.
    const madvs = [
      ...new Set(
        rows.filter((r) => r.loai === 'reading' && r.madv).map((r) => r.madv!),
      ),
    ];
    const doanVanMap = new Map<number, string>();
    const subCountMap = new Map<number, number>();
    if (madvs.length) {
      const dvs = await this.prisma.doanVan.findMany({
        where: { madv: { in: madvs } },
        select: { madv: true, noidung: true },
      });
      dvs.forEach((d) => doanVanMap.set(d.madv, d.noidung));

      const counts = await this.prisma.cauHoi.groupBy({
        by: ['madv'],
        where: { madv: { in: madvs }, loai: 'reading', trangthai: 1 },
        _count: { _all: true },
      });
      counts.forEach((c) => c.madv && subCountMap.set(c.madv, c._count._all));
    }

    return rows.map((r) => ({
      macauhoi: r.macauhoi,
      noidung:
        r.loai === 'reading' && r.madv
          ? (doanVanMap.get(r.madv) ?? r.noidung)
          : r.noidung,
      dokho: r.dokho,
      machuong: r.machuong,
      loai: r.loai,
      tenmonhoc,
      num_subquestions: r.madv ? (subCountMap.get(r.madv) ?? 0) : 0,
    }));
  }

  /** POST /question/getTotalPageQuestionBySubject — tổng số trang của môn. */
  async getTotalPageQuestionBySubject(
    mamonhoc: string,
    machuong = 0,
    dokho = 0,
    content = '',
  ): Promise<number> {
    const total = await this.prisma.cauHoi.count({
      where: this.buildWhere(mamonhoc, machuong, dokho, content),
    });
    return Math.ceil(total / PAGE_SIZE);
  }

  // ── Danh sách chính trang /question (thay CauHoiModel::getQuery + base pagination) ──
  //
  // Liệt kê TẤT CẢ câu hỏi của những môn được phân công (JOIN phancong theo
  // userId) — KHÔNG cố định 1 môn như getQuestionBySubject. Gộp 2 nhánh:
  //   1. mcq/essay: mỗi câu = 1 dòng.
  //   2. reading: gộp về 1 dòng/đoạn văn (madv), noidung = đoạn văn cắt 150 ký tự,
  //      num_subquestions = số câu con.
  // Lọc tuỳ chọn mamonhoc/machuong/dokho/loai. Dùng $queryRaw vì cần UNION +
  // GROUP BY — Prisma findMany không diễn đạt được gọn.
  //
  // KHÁC bản PHP: nhánh tìm kiếm (input) VẪN ràng buộc phancong (PHP gốc bỏ
  // phancong khi search → lộ câu của môn không được phân công). Đây là sửa lỗi
  // an toàn, giữ đúng tinh thần "chỉ thấy môn mình được phân công".

  /** Bộ lọc "đang áp dụng" theo quy ước PHP !empty(): bỏ qua '', '0', 0, null. */
  private isActiveFilter(v: unknown): boolean {
    return v != null && v !== '' && v !== '0' && v !== 0;
  }

  /** Điều kiện lọc ngoài (combined.*) dùng chung cho list & count. */
  private buildListConditions(filter: Record<string, unknown>): Prisma.Sql {
    const conds: Prisma.Sql[] = [];
    if (this.isActiveFilter(filter.mamonhoc))
      conds.push(
        Prisma.sql`AND combined.mamonhoc = ${String(filter.mamonhoc)}`,
      );
    if (this.isActiveFilter(filter.machuong))
      conds.push(
        Prisma.sql`AND combined.machuong = ${Number(filter.machuong)}`,
      );
    if (this.isActiveFilter(filter.dokho))
      conds.push(Prisma.sql`AND combined.dokho = ${Number(filter.dokho)}`);
    if (this.isActiveFilter(filter.loai))
      conds.push(Prisma.sql`AND combined.loai = ${String(filter.loai)}`);
    return conds.length ? Prisma.join(conds, ' ') : Prisma.empty;
  }

  /** Truy vấn UNION mcq/essay + reading (gộp 1 dòng/đoạn văn), ràng buộc phancong. */
  private buildCombinedQuery(userId: string, input: string): Prisma.Sql {
    const like = `%${input}%`;
    const normalSearch = input
      ? Prisma.sql`AND c.noidung ILIKE ${like}`
      : Prisma.empty;
    const readingSearch = input
      ? Prisma.sql`AND (d.noidung ILIKE ${like} OR COALESCE(d.tieude, '') ILIKE ${like})`
      : Prisma.empty;
    return Prisma.sql`
      SELECT c.macauhoi, c.noidung, c.dokho, c.mamonhoc, c.machuong,
             m.tenmonhoc, c.loai, NULL::int AS madv, NULL::text AS tieude_doanvan,
             0::int AS num_subquestions
      FROM cauhoi c
      JOIN monhoc m ON c.mamonhoc = m.mamonhoc
      JOIN phancong p ON p.mamonhoc = c.mamonhoc AND p.manguoidung = ${userId}
      WHERE c.trangthai = 1 AND c.madv IS NULL ${normalSearch}
      UNION ALL
      SELECT MIN(c.macauhoi) AS macauhoi,
             LEFT(d.noidung, 150) || (CASE WHEN CHAR_LENGTH(d.noidung) > 150 THEN '...' ELSE '' END) AS noidung,
             MIN(c.dokho) AS dokho, d.mamonhoc, d.machuong, m.tenmonhoc,
             'reading' AS loai, d.madv, COALESCE(d.tieude, '') AS tieude_doanvan,
             (SELECT COUNT(*)::int FROM cauhoi sub WHERE sub.madv = d.madv AND sub.loai = 'reading' AND sub.trangthai = 1) AS num_subquestions
      FROM doan_van d
      JOIN cauhoi c ON c.madv = d.madv AND c.loai = 'reading' AND c.trangthai = 1
      JOIN monhoc m ON d.mamonhoc = m.mamonhoc
      JOIN phancong p ON p.mamonhoc = d.mamonhoc AND p.manguoidung = ${userId}
      WHERE d.trangthai = 1 ${readingSearch}
      GROUP BY d.madv, d.noidung, d.tieude, d.mamonhoc, d.machuong, m.tenmonhoc
    `;
  }

  /** POST /question/pagination — 1 trang danh sách câu hỏi (pagination.js). */
  listQuestions(
    userId: string,
    args: IPaginationArgs,
  ): Promise<IQuestionListRow[]> {
    const limit = Number(args.limit) || PAGE_SIZE;
    const page = Math.max(Number(args.page) || 1, 1);
    const offset = (page - 1) * limit;
    const input = (args.input ?? args.content ?? '').trim();
    const combined = this.buildCombinedQuery(userId, input);
    const extra = this.buildListConditions(args.filter ?? {});
    return this.prisma.$queryRaw<IQuestionListRow[]>(Prisma.sql`
      SELECT DISTINCT combined.macauhoi, combined.noidung, combined.dokho,
             combined.mamonhoc, combined.machuong, combined.tenmonhoc,
             combined.loai, combined.madv, combined.tieude_doanvan,
             combined.num_subquestions
      FROM ( ${combined} ) AS combined
      WHERE 1 = 1 ${extra}
      ORDER BY combined.macauhoi ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
  }

  /** POST /question/getTotalPages — tổng số trang danh sách (pagination.js). */
  async countQuestionPages(
    userId: string,
    args: IPaginationArgs,
  ): Promise<{ totalPages: number }> {
    const limit = Number(args.limit) || PAGE_SIZE;
    const input = (args.input ?? args.content ?? '').trim();
    const combined = this.buildCombinedQuery(userId, input);
    const extra = this.buildListConditions(args.filter ?? {});
    const rows = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total FROM (
        SELECT DISTINCT combined.macauhoi, combined.mamonhoc, combined.machuong,
               combined.dokho, combined.loai, combined.madv
        FROM ( ${combined} ) AS combined
        WHERE 1 = 1 ${extra}
      ) AS counted
    `);
    const total = rows[0]?.total ?? 0;
    return { totalPages: Math.ceil(total / limit) };
  }

  /** POST /question/getQuestionById — chi tiết 1 câu hỏi để mở modal sửa. */
  async getQuestionById(
    id: number,
  ): Promise<IQuestionDetail | { error: string }> {
    const q = await this.prisma.cauHoi.findUnique({ where: { macauhoi: id } });
    if (!q) return { error: 'not_found' };

    const base64 = q.hinhanh ?? null; // nay la public URL Supabase (khong con base64)
    const detail: IQuestionDetail = {
      macauhoi: q.macauhoi,
      noidung: q.noidung,
      dapan_dung: q.dapan_dung,
      dokho: q.dokho,
      mamonhoc: q.mamonhoc,
      machuong: q.machuong,
      nguoitao: q.nguoitao,
      trangthai: q.trangthai,
      loai: q.loai,
      madv: q.madv,
      question_image_base64: base64,
      hinhanh_base64: base64,
    };

    // Reading: lấy nội dung + tiêu đề từ đoạn văn (thay getWithDoanVan).
    if (q.loai === 'reading' && q.madv) {
      const dv = await this.prisma.doanVan.findUnique({
        where: { madv: q.madv },
        select: { noidung: true, tieude: true },
      });
      detail.noidung = dv?.noidung ?? '';
      detail.tieude = dv?.tieude ?? '';
    }
    return detail;
  }

  /** POST /question/getAnswerById — đáp án (mcq/essay) hoặc câu con + đáp án (reading). */
  async getAnswerById(id: number): Promise<IAnswerRow[] | IReadingAnswerRow[]> {
    const q = await this.prisma.cauHoi.findUnique({
      where: { macauhoi: id },
      select: { macauhoi: true, loai: true, madv: true },
    });
    if (!q) return [];

    // Reading: gom đáp án của từng câu hỏi con (thay getSubQuestions + getAll).
    if (q.loai === 'reading' && q.madv) {
      const subs = await this.prisma.cauHoi.findMany({
        where: { madv: q.madv, loai: 'reading', trangthai: 1 },
        orderBy: { macauhoi: 'asc' },
        select: { macauhoi: true, noidung: true, hinhanh: true },
      });
      const result: IReadingAnswerRow[] = [];
      for (const sub of subs) {
        const answers = await this.prisma.cauTraLoi.findMany({
          where: { macauhoi: sub.macauhoi },
          orderBy: { macautl: 'asc' },
        });
        for (const ans of answers) {
          result.push({
            macauhoicon: sub.macauhoi,
            noidung_con: sub.noidung,
            noidungtl: ans.noidungtl,
            ladapan: ans.ladapan,
            question_image_base64: sub.hinhanh ?? null,
            option_image_base64: ans.hinhanh ?? null,
          });
        }
      }
      return result;
    }

    // mcq / essay.
    const answers = await this.prisma.cauTraLoi.findMany({
      where: { macauhoi: id },
      orderBy: { macautl: 'asc' },
    });
    return answers.map((ans) => ({
      macautl: ans.macautl,
      noidungtl: ans.noidungtl,
      ladapan: ans.ladapan,
      macauhoi: ans.macauhoi,
      option_image_base64: ans.hinhanh ?? null,
    }));
  }

  /**
   * POST /question/getAnswersForMultipleQuestions — đáp án của nhiều câu hỏi (trang
   * chọn câu cho đề thủ công). Thay CauTraLoiModel::getAnswersForMultipleQuestions
   * (SELECT * cautraloi WHERE macauhoi IN (...)). ladapan → chuỗi + ảnh → data-URI.
   */
  async getAnswersForMultipleQuestions(
    ids: number[],
  ): Promise<IMultiAnswerRow[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.cauTraLoi.findMany({
      where: { macauhoi: { in: ids } },
      select: {
        macautl: true,
        macauhoi: true,
        noidungtl: true,
        ladapan: true,
        hinhanh: true,
      },
    });
    return rows.map((r) => ({
      macautl: r.macautl,
      macauhoi: r.macauhoi,
      noidungtl: r.noidungtl,
      ladapan: String(r.ladapan),
      hinhanhtl: r.hinhanh ?? null,
    }));
  }

  /** POST /question/delete — xoá mềm câu hỏi (trangthai = 0). */
  async delete(macauhoi: number): Promise<boolean> {
    try {
      await this.prisma.cauHoi.update({
        where: { macauhoi },
        data: { trangthai: 0 },
      });
      return true;
    } catch (err) {
      this.logger.error('Xoá câu hỏi thất bại', err as Error);
      return false;
    }
  }

  // ── Helper cho thêm/sửa (port từ question.php) ──────────────────────────────

  /** htmlspecialchars(ENT_QUOTES) + bỏ ký tự zero-width — thay encodeHTML(). */
  private encodeHTML(str: string | null | undefined): string {
    return (str ?? '')
      .replace(/[\u200B-\u200D]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /** Cờ "đúng/bật" theo kiểu lỏng của PHP (1 | '1' | true | 'true'). */
  private truthy(v: unknown): boolean {
    return v === 1 || v === '1' || v === true || v === 'true';
  }

  /**
   * Upload sẵn TẤT CẢ ảnh của 1 field lên Supabase → hàng đợi PUBLIC URL (FIFO).
   * Gọi TRƯỚC $transaction để không có I/O mạng trong giao dịch DB.
   */
  private async uploadQueue(
    files: Express.Multer.File[],
    field: string,
  ): Promise<string[]> {
    const matched = files.filter(
      (f) => f.fieldname === field && f.buffer?.length,
    );
    const urls: string[] = [];
    for (const f of matched) {
      const url = await this.storage.uploadImage(
        f.buffer,
        QuestionsService.FOLDER,
      );
      if (url) urls.push(url);
    }
    return urls;
  }

  /**
   * Chọn URL ảnh cho 1 option/câu hỏi con: xoá → giữ URL ảnh cũ (client gửi lại
   * đường dẫn đã lưu) → URL ảnh mới kế tiếp trong hàng đợi đã upload.
   *
   * KHÁC bản PHP (dựa trên `$_FILES` giữ ô rỗng theo vị trí): multipart Node
   * không giữ ô rỗng, nên ưu tiên ảnh cũ (URL trong `item.image`) rồi mới lấy
   * file mới — đúng ở các ca phổ biến (thêm = chỉ file; sửa = giữ URL cũ, đổi ảnh
   * = xoá URL cũ + gửi file mới). Sync (không upload) vì đã upload trước.
   */
  private pickImageUrl(queue: string[], item: IIncomingOption): string | null {
    if (this.truthy(item.delete_image)) return null;
    const kept = typeof item.image === 'string' ? item.image.trim() : '';
    if (kept && kept !== 'null') return kept;
    return queue.length ? queue.shift()! : null;
  }

  /** Ảnh câu hỏi chính: upload file đầu tiên field `hinhanh` → URL (null nếu không có). */
  private async mainImageUrl(
    files: Express.Multer.File[],
  ): Promise<string | null> {
    const f = files.find((x) => x.fieldname === 'hinhanh' && x.buffer?.length);
    if (!f) return null;
    return this.storage.uploadImage(f.buffer, QuestionsService.FOLDER);
  }

  /** Parse JSON `cautraloi`; lỗi cú pháp → null (báo lỗi cho client). */
  private parseAnswers(raw: string | undefined): IIncomingAnswer[] | null {
    try {
      const v = JSON.parse(raw ?? '[]') as unknown;
      return Array.isArray(v) ? (v as IIncomingAnswer[]) : [];
    } catch {
      return null;
    }
  }

  /**
   * POST /question/addQues — thêm câu hỏi mcq/essay/reading (multipart).
   * Thay addQues() của question.php. Ảnh chính field `hinhanh`; ảnh đáp án/câu
   * con field `option_hinhanh[]` (ảnh cũ base64 nằm trong JSON `cautraloi`).
   */
  async addQuestion(
    input: IWriteQuestionInput,
    files: Express.Multer.File[],
    nguoitao: string,
  ): Promise<IWriteQuestionResult> {
    const mamonhoc = input.mamon ?? '';
    const machuong = Number(input.machuong);
    const dokho = Number(input.dokho);
    const loai = input.loai ?? 'mcq';

    if (!mamonhoc || !input.machuong || !input.dokho) {
      return {
        status: 'error',
        message: 'Vui lòng nhập đầy đủ môn học, chương và độ khó',
      };
    }

    const answers = this.parseAnswers(input.cautraloi);
    if (answers === null) {
      return { status: 'error', message: 'Dữ liệu đáp án không hợp lệ' };
    }

    const mainImg = await this.mainImageUrl(files);
    const optQueue = await this.uploadQueue(files, 'option_hinhanh[]');

    try {
      if (loai === 'mcq' || loai === 'essay') {
        await this.prisma.$transaction(async (tx) => {
          const q = await tx.cauHoi.create({
            data: {
              noidung: this.encodeHTML((input.noidung ?? '').trim()),
              dokho,
              mamonhoc,
              machuong,
              nguoitao,
              loai,
              madv: null,
              hinhanh: mainImg,
            },
            select: { macauhoi: true },
          });

          for (const ans of answers) {
            const content = this.encodeHTML((ans.content ?? '').trim());
            const check = loai === 'mcq' && this.truthy(ans.check) ? 1 : 0;
            const optImage = this.pickImageUrl(optQueue, ans);
            if (content === '' && optImage === null) continue;
            await tx.cauTraLoi.create({
              data: {
                macauhoi: q.macauhoi,
                noidungtl: content,
                ladapan: check,
                hinhanh: optImage,
              },
            });
          }
        });
      } else if (loai === 'reading') {
        const noidungDV = this.encodeHTML((input.doanvan_noidung ?? '').trim());
        if (noidungDV === '' || answers.length === 0) {
          return {
            status: 'error',
            message: 'Vui lòng thêm nội dung và câu hỏi con',
          };
        }
        const tieudeDV = this.encodeHTML((input.doanvan_tieude ?? '').trim());

        await this.prisma.$transaction(async (tx) => {
          const dv = await tx.doanVan.create({
            data: {
              noidung: noidungDV,
              tieude: tieudeDV,
              mamonhoc,
              machuong,
              nguoitao,
            },
            select: { madv: true },
          });

          for (const sub of answers) {
            const subContent = this.encodeHTML((sub.content ?? '').trim());
            if (subContent === '') continue;
            const subQ = await tx.cauHoi.create({
              data: {
                noidung: subContent,
                dokho,
                mamonhoc,
                machuong,
                nguoitao,
                loai: 'reading',
                madv: dv.madv,
              },
              select: { macauhoi: true },
            });

            for (const opt of sub.options ?? []) {
              const optContent = this.encodeHTML((opt.content ?? '').trim());
              const check = this.truthy(opt.check) ? 1 : 0;
              const optImage = this.pickImageUrl(optQueue, opt);
              if (optContent === '' && optImage === null) continue;
              await tx.cauTraLoi.create({
                data: {
                  macauhoi: subQ.macauhoi,
                  noidungtl: optContent,
                  ladapan: check,
                  hinhanh: optImage,
                },
              });
            }
          }
        });
      } else {
        return { status: 'error', message: 'Loại câu hỏi không hợp lệ' };
      }

      return { status: 'success', message: 'Thêm câu hỏi thành công', loai };
    } catch (err) {
      this.logger.error('Thêm câu hỏi thất bại', err as Error);
      return {
        status: 'error',
        message: 'Lỗi hệ thống: ' + (err as Error).message,
      };
    }
  }

  /**
   * POST /question/editQuesion — cập nhật câu hỏi mcq/essay/reading (multipart).
   * Thay editQuesion() của question.php. mcq/essay: cập nhật câu hỏi + xoá cứng
   * rồi tạo lại đáp án. reading: cập nhật đoạn văn, xoá MỀM câu con cũ + xoá cứng
   * đáp án của chúng, tạo lại câu con/đáp án mới.
   */
  async editQuestion(
    input: IWriteQuestionInput,
    files: Express.Multer.File[],
    nguoitao: string,
  ): Promise<IWriteQuestionResult> {
    const id = Number(input.id);
    const mamonhoc = input.mamon ?? '';
    const machuong = Number(input.machuong);
    const dokho = Number(input.dokho);
    const loai = input.loai ?? 'mcq';
    const deleteQuestionImage = this.truthy(input.delete_question_image);

    if (!input.id || !mamonhoc || !input.machuong || !input.dokho) {
      return { status: 'error', message: 'Thiếu thông tin bắt buộc' };
    }

    const answers = this.parseAnswers(input.cautraloi);
    if (answers === null) {
      return { status: 'error', message: 'Dữ liệu đáp án không hợp lệ' };
    }

    const question = await this.prisma.cauHoi.findUnique({
      where: { macauhoi: id },
      select: { macauhoi: true, madv: true },
    });
    if (!question) {
      return { status: 'error', message: 'Câu hỏi không tồn tại' };
    }

    const mainImg = deleteQuestionImage ? null : await this.mainImageUrl(files);
    const optQueue = await this.uploadQueue(files, 'option_hinhanh[]');
    const obsoleteImages: (string | null)[] = [];

    try {
      if (loai === 'reading') {
        const noidungDV = this.encodeHTML((input.doanvan_noidung ?? '').trim());
        if (noidungDV === '') {
          return {
            status: 'error',
            message: 'Vui lòng nhập nội dung đoạn văn',
          };
        }
        if (answers.length === 0) {
          return { status: 'error', message: 'Phải có ít nhất 1 câu hỏi con' };
        }
        const madv = question.madv;
        if (madv === null) {
          return { status: 'error', message: 'Câu hỏi không có đoạn văn' };
        }

        await this.prisma.$transaction(async (tx) => {
          const previous = await tx.cauHoi.findUnique({
            where: { macauhoi: id },
            select: { hinhanh: true },
          });
          obsoleteImages.push(previous?.hinhanh ?? null);
          await tx.doanVan.update({
            where: { madv },
            data: {
              noidung: noidungDV,
              // tieude giữ nguyên dạng người dùng nhập như editQuesion() gốc.
              tieude: input.doanvan_tieude ?? '',
              mamonhoc,
              machuong,
              nguoitao,
            },
          });

          // Xoá MỀM câu con cũ + xoá cứng đáp án của chúng.
          const oldSubs = await tx.cauHoi.findMany({
            where: { madv, loai: 'reading', trangthai: 1 },
            select: { macauhoi: true },
          });
          for (const sub of oldSubs) {
            const oldAnswers = await tx.cauTraLoi.findMany({
              where: { macauhoi: sub.macauhoi },
              select: { hinhanh: true },
            });
            obsoleteImages.push(...oldAnswers.map((answer) => answer.hinhanh));
            await tx.cauTraLoi.deleteMany({
              where: { macauhoi: sub.macauhoi },
            });
            await tx.cauHoi.update({
              where: { macauhoi: sub.macauhoi },
              data: { trangthai: 0 },
            });
          }

          for (const subQ of answers) {
            const subContent = this.encodeHTML((subQ.content ?? '').trim());
            if (subContent === '') continue;
            const subImage = this.pickImageUrl(optQueue, subQ);
            const created = await tx.cauHoi.create({
              data: {
                noidung: subContent,
                dokho,
                mamonhoc,
                machuong,
                nguoitao,
                loai: 'reading',
                madv,
                hinhanh: subImage,
              },
              select: { macauhoi: true },
            });

            for (const opt of subQ.options ?? []) {
              const optContent = this.encodeHTML((opt.content ?? '').trim());
              if (optContent === '') continue;
              const optImage = this.pickImageUrl(optQueue, opt);
              const check = this.truthy(opt.check) ? 1 : 0;
              await tx.cauTraLoi.create({
                data: {
                  macauhoi: created.macauhoi,
                  noidungtl: optContent,
                  ladapan: check,
                  hinhanh: optImage,
                },
              });
            }
          }

          // Cập nhật bản ghi câu hỏi gốc (noidung rỗng như bản PHP).
          await tx.cauHoi.update({
            where: { macauhoi: id },
            data: {
              noidung: '',
              dokho,
              mamonhoc,
              machuong,
              nguoitao,
              loai: 'reading',
              madv,
              ...(deleteQuestionImage
                ? { hinhanh: null }
                : mainImg !== null
                  ? { hinhanh: mainImg }
                  : {}),
            },
          });
        });
      } else {
        // mcq / essay.
        const noidung = this.encodeHTML((input.noidung ?? '').trim());
        if (loai === 'mcq' && answers.length === 0) {
          return { status: 'error', message: 'Phải có ít nhất 1 đáp án' };
        }

        const validAnswers: {
          content: string;
          check: number;
          image: string | null;
        }[] = [];
        for (const ans of answers) {
          const content = this.encodeHTML((ans.content ?? '').trim());
          const deleteImage = this.truthy(ans.delete_image);
          const optImage = this.pickImageUrl(optQueue, ans);
          if (content === '' && optImage === null && !deleteImage) continue;
          validAnswers.push({
            content,
            check: this.truthy(ans.check) ? 1 : 0,
            image: optImage,
          });
        }

        await this.prisma.$transaction(async (tx) => {
          const previous = await tx.cauHoi.findUnique({
            where: { macauhoi: id },
            select: { hinhanh: true },
          });
          const oldAnswers = await tx.cauTraLoi.findMany({
            where: { macauhoi: id },
            select: { hinhanh: true },
          });
          obsoleteImages.push(
            previous?.hinhanh ?? null,
            ...oldAnswers.map((answer) => answer.hinhanh),
          );
          await tx.cauHoi.update({
            where: { macauhoi: id },
            data: {
              noidung,
              dokho,
              mamonhoc,
              machuong,
              nguoitao,
              loai,
              madv: null,
              ...(deleteQuestionImage
                ? { hinhanh: null }
                : mainImg !== null
                  ? { hinhanh: mainImg }
                  : {}),
            },
          });

          await tx.cauTraLoi.deleteMany({ where: { macauhoi: id } });
          for (const ans of validAnswers) {
            await tx.cauTraLoi.create({
              data: {
                macauhoi: id,
                noidungtl: ans.content,
                ladapan: ans.check,
                hinhanh: ans.image,
              },
            });
          }
        });
      }

      await removeUnreferencedImages(
        this.prisma,
        this.storage,
        obsoleteImages,
        this.logger,
      );
      return { status: 'success', message: 'Cập nhật câu hỏi thành công' };
    } catch (err) {
      this.logger.error('Cập nhật câu hỏi thất bại', err as Error);
      return {
        status: 'error',
        message: 'Lỗi hệ thống: ' + (err as Error).message,
      };
    }
  }

  // ── Import từ file Word (.docx) — thay xulydoanvan/xulytracnghiem/xulytuluan ──

  /** POST /question/xulydoanvan — đọc .docx → mảng khối đọc hiểu (preview). */
  async parseReadingFile(buffer: Buffer): Promise<IParsedReading[]> {
    const lines = await extractDocxLines(buffer);
    return parseReadingDocx(lines);
  }

  /** POST /question/xulytracnghiem — đọc .docx → mảng câu trắc nghiệm (preview). */
  async parseMcqFile(buffer: Buffer): Promise<IParsedMcq[]> {
    const lines = await extractDocxLines(buffer);
    return parseMcqDocx(lines);
  }

  /** POST /question/xulytuluan — đọc .docx → mảng câu tự luận (preview). */
  async parseEssayFile(buffer: Buffer): Promise<IParsedEssay[]> {
    const lines = await extractDocxLines(buffer);
    return parseEssayDocx(lines);
  }

  /**
   * POST /question/updateQuestionJSON — chuẩn hoá mảng câu hỏi preview (tự lưu).
   * Thay updateQuestionJSON(): điền mặc định level=1, đảm bảo các trường tồn tại;
   * reading thì ÉP level câu con = level của khối; essay thì option=[]/answer=null.
   */
  normalizeQuestions(items: IParsedItem[]): IParsedItem[] {
    for (const item of items) {
      if (!item.level) item.level = 1;

      if (item.type === 'reading') {
        if (item.title == null) item.title = '';
        if (item.passage == null) item.passage = '';
        if (!item.level) item.level = 1;
        if (!Array.isArray(item.questions)) item.questions = [];
        for (const sub of item.questions) {
          sub.level = item.level; // ép level câu con = level khối reading.
          if (!Array.isArray(sub.option)) sub.option = [];
          if (!sub.answer) sub.answer = 1;
          if (sub.question == null) sub.question = '';
        }
      } else if (item.type === 'mcq') {
        if (item.question == null) item.question = '';
        if (!Array.isArray(item.option)) item.option = [];
        if (!item.answer) item.answer = 1;
      } else if (item.type === 'essay') {
        if (item.question == null) item.question = '';
        // PHP gán option=[]/answer=null cho tự luận (JS không dùng) — bổ sung để khớp.
        (item as IParsedEssay & { option: unknown[]; answer: null }).option =
          [];
        (item as IParsedEssay & { option: unknown[]; answer: null }).answer =
          null;
      }
    }
    return items;
  }

  /**
   * POST /question/addQuesFile — ghi cả lô câu hỏi (đã preview) vào DB.
   * Thay addQuesFile(): mỗi mục là mcq/essay/reading. Mục/câu con sai dữ liệu bị
   * BỎ QUA và ghi vào `errors` (không làm hỏng cả lô) — giống bản PHP. Tất cả nằm
   * trong 1 transaction để đảm bảo nhất quán.
   */
  async addQuestionsFromFile(
    monhoc: string,
    chuong: string,
    items: IParsedItem[],
    nguoitao: string,
  ): Promise<IAddFileResult> {
    if (!nguoitao || !monhoc || !chuong || !Array.isArray(items)) {
      return { status: 'error', message: 'Dữ liệu không hợp lệ' };
    }

    const machuong = Number(chuong);
    const errors: string[] = [];
    let inserted = 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          if (!item || !item.type) {
            errors.push(`Mục ${idx}: Dữ liệu sai`);
            continue;
          }

          if (item.type === 'reading') {
            const passage = (item.passage ?? '').trim();
            if (passage === '') {
              errors.push(`Mục ${idx}: Đoạn văn trống`);
              continue;
            }
            const dv = await tx.doanVan.create({
              data: {
                noidung: this.encodeHTML(passage),
                tieude: item.title ?? null,
                mamonhoc: monhoc,
                machuong,
                nguoitao,
              },
              select: { madv: true },
            });

            const subQuestions = item.questions ?? [];
            for (let subIdx = 0; subIdx < subQuestions.length; subIdx++) {
              const sub = subQuestions[subIdx];
              const qText = (sub.question ?? '').trim();
              const opts = Array.isArray(sub.option) ? sub.option : [];
              const ans = Number(sub.answer ?? 0);
              if (qText === '' || opts.length < 2 || ans < 1) {
                errors.push(`Mục ${idx} câu ${subIdx}: Dữ liệu không hợp lệ`);
                continue;
              }
              const q = await tx.cauHoi.create({
                data: {
                  noidung: this.encodeHTML(qText),
                  dokho: Number(sub.level ?? 1),
                  mamonhoc: monhoc,
                  machuong,
                  nguoitao,
                  loai: 'reading',
                  madv: dv.madv,
                },
                select: { macauhoi: true },
              });
              await tx.cauTraLoi.createMany({
                data: opts.map((opt, i) => ({
                  macauhoi: q.macauhoi,
                  noidungtl: this.encodeHTML(opt),
                  ladapan: i + 1 === ans ? 1 : 0,
                })),
              });
              inserted++;
            }
            continue;
          }

          if (item.type === 'mcq') {
            const qText = (item.question ?? '').trim();
            const opts = Array.isArray(item.option) ? item.option : [];
            const ans = Number(item.answer ?? 0);
            if (qText === '' || opts.length < 2 || ans < 1) {
              errors.push(`Mục ${idx}: Dữ liệu câu hỏi không hợp lệ`);
              continue;
            }
            const q = await tx.cauHoi.create({
              data: {
                noidung: this.encodeHTML(qText),
                dokho: Number(item.level ?? 1),
                mamonhoc: monhoc,
                machuong,
                nguoitao,
                loai: 'mcq',
                madv: null,
              },
              select: { macauhoi: true },
            });
            await tx.cauTraLoi.createMany({
              data: opts.map((opt, i) => ({
                macauhoi: q.macauhoi,
                noidungtl: this.encodeHTML(opt),
                ladapan: i + 1 === ans ? 1 : 0,
              })),
            });
            inserted++;
            continue;
          }

          if (item.type === 'essay') {
            const qText = (item.question ?? '').trim();
            if (qText === '') {
              errors.push(`Mục ${idx}: Câu hỏi trống`);
              continue;
            }
            await tx.cauHoi.create({
              data: {
                noidung: this.encodeHTML(qText),
                dokho: Number(item.level ?? 1),
                mamonhoc: monhoc,
                machuong,
                nguoitao,
                loai: 'essay',
                madv: null,
              },
            });
            inserted++;
            continue;
          }

          errors.push(`Mục ${idx}: Loại câu hỏi không hợp lệ`);
        }
      });

      return { status: 'success', inserted, errors };
    } catch (err) {
      this.logger.error('Thêm câu hỏi từ file thất bại', err as Error);
      return {
        status: 'error',
        message: (err as Error).message,
        errors,
      };
    }
  }

  /**
   * Đếm số câu hỏi đang dùng được theo loại & mức độ — thay
   * CauHoiModel::getsoluongcauhoi (gọi 3 lần/loại trong question.php).
   * Trả `{ [loai]: { de, tb, kho } }` đúng shape action_test.js mong đợi.
   * Chỉ tính câu trangthai=1 (như PHP). Chương rỗng → đếm toàn môn (bỏ lọc
   * machuong, đúng PHP). Gộp 1 query GROUP BY thay vì 9 lần truy vấn.
   */
  async getQuestionCounts(
    chuong: number[],
    monhoc: string,
    loaicauhoi: string[],
  ): Promise<Record<string, { de: number; tb: number; kho: number }>> {
    const types = loaicauhoi.length ? loaicauhoi : ['mcq'];
    const result: Record<string, { de: number; tb: number; kho: number }> = {};
    for (const t of types) result[t] = { de: 0, tb: 0, kho: 0 };
    if (!monhoc) return result;

    const chuongCond = chuong.length
      ? Prisma.sql`AND machuong IN (${Prisma.join(chuong)})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      { loai: string; dokho: number; cnt: number }[]
    >(Prisma.sql`
      SELECT loai, dokho, COUNT(*)::int AS cnt
      FROM cauhoi
      WHERE mamonhoc = ${monhoc}
        AND trangthai = 1
        AND loai IN (${Prisma.join(types)})
        AND dokho IN (1, 2, 3)
        ${chuongCond}
      GROUP BY loai, dokho
    `);

    for (const r of rows) {
      const bucket = result[r.loai];
      if (!bucket) continue;
      if (r.dokho === 1) bucket.de = r.cnt;
      else if (r.dokho === 2) bucket.tb = r.cnt;
      else if (r.dokho === 3) bucket.kho = r.cnt;
    }
    return result;
  }
}
