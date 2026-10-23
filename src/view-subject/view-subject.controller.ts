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
import { ViewSubjectService } from '@/view-subject/view-subject.service';
import { SubjectsService } from '@/subjects/subjects.service';
import {
  ViewSubjectHocKyDto,
  ViewSubjectPaginationBodyDto,
} from '@/view-subject/dto/view-subject.dto';
import {
  AddChapterDto,
  ChapterIdDto,
  ChapterListDto,
  UpdateChapterDto,
} from '@/subjects/dto/subject.dto';
import type { IViewSubjectPaginationArgs } from '@/view-subject/interfaces/view-subject.types';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * "Môn học của tôi" (view_subject.php) — giảng viên xem môn được phân công cho
 * mình + quản lý chương của môn đó. Route ở path gốc `/view_subject/...`
 * (VERSION_NEUTRAL, trong exclude của global prefix) để khớp URL view_subject.js.
 *
 * RBAC: trang cần 'xem_monhoc'/'view' (y PHP). Phân trang + dropdown năm/kỳ cần
 * 'hocphan'/'view' (y PHP). Thao tác chương gate theo 'chuong'/* — CHẶT HƠN bản
 * PHP (vốn chỉ checkAuthentication) và khớp cách module subjects đang làm.
 * Lưu ý: KHÔNG gate chương bằng 'monhoc' vì nhóm quyền Giáo Viên (1) không có
 * quyền đó — chỉ Admin (3) mới có.
 *
 * Các action getQuery/getDetail/search/getSubjectAssignment của controller PHP
 * KHÔNG port lại: view_subject.js không gọi chúng, và `/subject/*` đã có tương
 * đương (getSubjectAssignment dùng cho dropdown trang câu hỏi).
 */
@Controller({ path: 'view_subject', version: VERSION_NEUTRAL })
export class ViewSubjectController {
  constructor(
    private readonly viewSubject: ViewSubjectService,
    private readonly subjects: SubjectsService,
  ) {}

  private parseArgs(raw: string): IViewSubjectPaginationArgs {
    try {
      return JSON.parse(raw) as IViewSubjectPaginationArgs;
    } catch {
      return {};
    }
  }

  /** GET /view_subject — trang danh sách môn được phân công. */
  @Permissions('xem_monhoc', 'view')
  @Get()
  @Render('pages/view_subject')
  page(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { Title: 'Môn học của tôi', Page: 'view_subject', user };
  }

  /** POST /view_subject/getTotalPages — tổng số trang (pagination.js). */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('getTotalPages')
  getTotalPages(
    @Req() req: Request,
    @Body() dto: ViewSubjectPaginationBodyDto,
  ) {
    const user = req.user as IExamJwtPayload;
    return this.viewSubject.countAssignedSubjectPages(
      user.id,
      this.parseArgs(dto.args),
    );
  }

  /** POST /view_subject/pagination — 1 trang dữ liệu (pagination.js). */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('pagination')
  paginate(@Req() req: Request, @Body() dto: ViewSubjectPaginationBodyDto) {
    const user = req.user as IExamJwtPayload;
    return this.viewSubject.listAssignedSubjects(
      user.id,
      this.parseArgs(dto.args),
    );
  }

  /** POST /view_subject/getNamHoc — năm học có phân công (dropdown lọc). */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('getNamHoc')
  async getNamHoc(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { success: true, data: await this.viewSubject.getNamHoc(user.id) };
  }

  /** POST /view_subject/getHocKy — học kỳ của 1 năm học (dropdown lọc). */
  @Permissions('hocphan', 'view')
  @SkipTransform()
  @Post('getHocKy')
  async getHocKy(@Req() req: Request, @Body() dto: ViewSubjectHocKyDto) {
    const user = req.user as IExamJwtPayload;
    return {
      success: true,
      data: await this.viewSubject.getHocKy(user.id, dto.namhoc),
    };
  }

  // ── Chương (chuong) — dùng lại SubjectsService, cùng bảng `chuong` ──────────

  /** POST /view_subject/getAllChapter — chương của 1 môn. */
  @Permissions('chuong', 'view')
  @SkipTransform()
  @Post('getAllChapter')
  getAllChapter(@Body() dto: ChapterListDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.getChapters(dto.mamonhoc, user.id);
  }

  /** POST /view_subject/addChapter — thêm chương. */
  @Permissions('chuong', 'create')
  @SkipTransform()
  @Post('addChapter')
  addChapter(@Body() dto: AddChapterDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.addChapter(dto.mamonhoc, dto.tenchuong, user.id);
  }

  /** POST /view_subject/updateChapter — đổi tên chương. */
  @Permissions('chuong', 'update')
  @SkipTransform()
  @Post('updateChapter')
  updateChapter(@Body() dto: UpdateChapterDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.updateChapter(dto.machuong, dto.tenchuong, user.id);
  }

  /** POST /view_subject/chapterDelete — xoá mềm chương (trangthai = 0). */
  @Permissions('chuong', 'delete')
  @SkipTransform()
  @Post('chapterDelete')
  chapterDelete(@Body() dto: ChapterIdDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.subjects.deleteChapter(dto.machuong, user.id);
  }
}
