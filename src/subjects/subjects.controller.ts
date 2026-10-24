import {
  Body,
  Controller,
  Get,
  Post,
  Render,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { SubjectsService } from '@/subjects/subjects.service';
import {
  AddChapterDto,
  AddSubjectDto,
  ChapterIdDto,
  ChapterListDto,
  PaginationBodyDto,
  SearchSubjectDto,
  SubjectIdDto,
  UpdateChapterDto,
  UpdateSubjectDto,
} from '@/subjects/dto/subject.dto';
import type { IPaginationArgs } from '@/subjects/interfaces/subjects.types';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Môn học & Chương (SSR + AJAX) — thay controller subject.php của DHT_OneTest.
 * Route ở path gốc (VERSION_NEUTRAL, trong exclude của global prefix /api) để
 * khớp URL `/subject/...` mà subject.js gọi. AJAX dùng @SkipTransform để trả
 * nguyên shape JS gốc mong đợi (mảng / boolean / 'exist'). Xem docs/06, 08.
 *
 * RBAC: trang + đọc cần 'monhoc'/'view'; thêm/sửa/xoá môn theo hành động tương
 * ứng; thao tác chương theo 'chuong'/* (chặt hơn bản PHP vốn chỉ checkAuthentication).
 */
@Controller({ path: 'subject', version: VERSION_NEUTRAL })
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  private parseArgs(raw: string): IPaginationArgs {
    try {
      return JSON.parse(raw) as IPaginationArgs;
    } catch {
      return {};
    }
  }

  /** GET /subject — trang quản lý môn học (thay Subject::default). */
  @Permissions('monhoc', 'view')
  @Get()
  @Render('pages/subject')
  page(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { Title: 'Quản lý môn học', Page: 'subject', user };
  }

  /** POST /subject/getTotalPages — tổng số trang (pagination.js). */
  @Permissions('monhoc', 'view')
  @SkipTransform()
  @Post('getTotalPages')
  getTotalPages(@Body() dto: PaginationBodyDto) {
    return this.subjects.getTotalPages(this.parseArgs(dto.args));
  }

  /** POST /subject/pagination — 1 trang dữ liệu (pagination.js). */
  @Permissions('monhoc', 'view')
  @SkipTransform()
  @Post('pagination')
  paginate(@Body() dto: PaginationBodyDto) {
    return this.subjects.paginate(this.parseArgs(dto.args));
  }

  /** POST /subject/search — tìm môn theo mã/tên (thay search). */
  @Permissions('monhoc', 'view')
  @SkipTransform()
  @Post('search')
  search(@Body() dto: SearchSubjectDto) {
    return this.subjects.search(dto.input);
  }

  /** POST /subject/checkSubject — kiểm tra trùng mã môn (thay checkSubject). */
  @Permissions('monhoc', 'view')
  @SkipTransform()
  @Post('checkSubject')
  checkSubject(@Body() dto: SubjectIdDto) {
    return this.subjects.checkSubject(dto.mamon);
  }

  /** POST /subject/getDetail — chi tiết môn để sửa (thay getDetail). */
  @Permissions('monhoc', 'view')
  @SkipTransform()
  @Post('getDetail')
  getDetail(@Body() dto: SubjectIdDto) {
    return this.subjects.getById(dto.mamon);
  }

  /**
   * GET /subject/getSubjectAssignment — môn được phân công cho user đang đăng nhập
   * (thay subject.php::getSubjectAssignment). Dùng cho dropdown trang câu hỏi.
   * Không gate quyền riêng (như PHP): chỉ trả môn của chính user → an toàn.
   */
  @SkipTransform()
  @Get('getSubjectAssignment')
  getSubjectAssignment(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.getAllSubjectAssignment(user.id);
  }

  /** POST /subject/add — thêm môn học (thay add). */
  @Permissions('monhoc', 'create')
  @SkipTransform()
  @Post('add')
  add(@Body() dto: AddSubjectDto) {
    return this.subjects.create(
      dto.mamon,
      dto.tenmon,
      dto.sotinchi,
      dto.sotietlythuyet,
      dto.sotietthuchanh,
    );
  }

  /** POST /subject/update — cập nhật môn học (thay update). */
  @Permissions('monhoc', 'update')
  @SkipTransform()
  @Post('update')
  update(@Body() dto: UpdateSubjectDto) {
    return this.subjects.update(
      dto.id,
      dto.mamon,
      dto.tenmon,
      dto.sotinchi,
      dto.sotietlythuyet,
      dto.sotietthuchanh,
    );
  }

  /** POST /subject/delete — xoá mềm môn học (thay delete). */
  @Permissions('monhoc', 'delete')
  @SkipTransform()
  @Post('delete')
  delete(@Body() dto: SubjectIdDto) {
    return this.subjects.delete(dto.mamon);
  }

  // ── Chương (chuong) ─────────────────────────────────────────────────────────

  /** POST /subject/getAllChapter — chương của 1 môn (thay getAllChapter). */
  @Permissions('chuong', 'view')
  @SkipTransform()
  @Post('getAllChapter')
  getAllChapter(@Body() dto: ChapterListDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.getChapters(dto.mamonhoc, user.id);
  }

  /** POST /subject/addChapter — thêm chương (thay addChapter). */
  @Permissions('chuong', 'create')
  @SkipTransform()
  @Post('addChapter')
  addChapter(@Body() dto: AddChapterDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.addChapter(dto.mamonhoc, dto.tenchuong, user.id);
  }

  /** POST /subject/updateChapter — đổi tên chương (thay updateChapter). */
  @Permissions('chuong', 'update')
  @SkipTransform()
  @Post('updateChapter')
  updateChapter(@Body() dto: UpdateChapterDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.updateChapter(dto.machuong, dto.tenchuong, user.id);
  }

  /** POST /subject/chapterDelete — xoá mềm chương (thay chapterDelete). */
  @Permissions('chuong', 'delete')
  @SkipTransform()
  @Post('chapterDelete')
  chapterDelete(@Body() dto: ChapterIdDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.deleteChapter(dto.machuong, user.id);
  }
}
