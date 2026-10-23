import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Render,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { AnnouncementsService } from '@/announcements/announcements.service';
import {
  AnnouncementManhomDto,
  AnnouncementPaginationBodyDto,
  MatbDto,
  SendAnnouncementDto,
  UpdateAnnouncementDto,
} from '@/announcements/dto/announcement.dto';
import type { IAnnouncementPaginationArgs } from '@/announcements/interfaces/announcement.types';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Thông báo (teacher_announcement.php) — GV gửi thông báo cho nhóm học phần;
 * SV đọc ở chuông header + offcanvas nhóm.
 * Route ở path gốc `/teacher_announcement/...` (VERSION_NEUTRAL, trong exclude
 * global prefix). AJAX dùng @SkipTransform để trả nguyên shape JS gốc mong đợi.
 *
 * RBAC: trang danh sách cần 'thongbao'/'view'; tạo/sửa/xoá theo hành động tương
 * ứng. Các route đọc (getAnnounce/getNotifications/getUnreadCount/markAsRead/
 * getDetail/getListAnnounce) chỉ cần đăng nhập như PHP (checkAuthentication).
 */
@Controller({ path: 'teacher_announcement', version: VERSION_NEUTRAL })
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  private parseArgs(raw: string): IAnnouncementPaginationArgs {
    try {
      return JSON.parse(raw) as IAnnouncementPaginationArgs;
    } catch {
      return {};
    }
  }

  /** Chặn thao tác lên thông báo của người khác (KHÁC PHP: PHP không kiểm). */
  private async assertOwner(matb: number, userId: string): Promise<void> {
    await this.announcements.assertCanManageAnnouncement(matb, userId);
  }

  /** GET /teacher_announcement — trang quản lý thông báo (thay default). */
  @Permissions('thongbao', 'view')
  @Get()
  @Render('pages/teacher_announcement')
  page(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { Title: 'Thông báo', Page: 'teacher_announcement', user };
  }

  /** GET /teacher_announcement/add — form tạo & gửi thông báo. */
  @Permissions('thongbao', 'create')
  @Get('add')
  @Render('pages/add_announce')
  add(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return {
      Title: 'Tạo và gửi thông báo',
      Page: 'teacher_announcement',
      Action: 'create',
      user,
    };
  }

  /**
   * GET /teacher_announcement/update/:matb — form cập nhật thông báo.
   * Kiểm tồn tại + người tạo == user đăng nhập (404/403), như PHP.
   */
  @Permissions('thongbao', 'update')
  @Get('update/:matb')
  @Render('pages/add_announce')
  async update(@Param('matb', ParseIntPipe) matb: number, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    await this.assertOwner(matb, user.id);
    return {
      Title: 'Cập nhật thông báo',
      Page: 'teacher_announcement',
      Action: 'update',
      user,
    };
  }

  // ── AJAX ────────────────────────────────────────────────────────────────────

  /** POST /teacher_announcement/sendAnnouncement — tạo & gửi (trả mã thông báo). */
  @Permissions('thongbao', 'create')
  @SkipTransform()
  @Post('sendAnnouncement')
  sendAnnouncement(@Req() req: Request, @Body() dto: SendAnnouncementDto) {
    const user = req.user as IExamJwtPayload;
    return this.announcements.create(
      dto.noticeText,
      dto.thoigiantao,
      user.id,
      dto.manhom,
    );
  }

  /** POST /teacher_announcement/updateAnnounce — sửa nội dung + nhóm nhận. */
  @Permissions('thongbao', 'update')
  @SkipTransform()
  @Post('updateAnnounce')
  async updateAnnounce(
    @Req() req: Request,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    const user = req.user as IExamJwtPayload;
    await this.assertOwner(dto.matb, user.id);
    return this.announcements.updateAnnounce(dto.matb, dto.noidung, dto.manhom, user.id);
  }

  /** POST /teacher_announcement/deleteAnnounce — xoá thông báo. */
  @Permissions('thongbao', 'delete')
  @SkipTransform()
  @Post('deleteAnnounce')
  async deleteAnnounce(@Req() req: Request, @Body() dto: MatbDto) {
    const user = req.user as IExamJwtPayload;
    await this.assertOwner(dto.matb, user.id);
    return this.announcements.deleteAnnounce(dto.matb, user.id);
  }

  /** POST /teacher_announcement/getDetail — chi tiết 1 thông báo (trang sửa). */
  @SkipTransform()
  @Post('getDetail')
  getDetail(@Body() dto: MatbDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.announcements.getDetail(dto.matb, user.id);
  }

  /** POST /teacher_announcement/getAnnounce — thông báo của 1 nhóm (offcanvas). */
  @SkipTransform()
  @Post('getAnnounce')
  getAnnounce(@Body() dto: AnnouncementManhomDto, @Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.announcements.getAnnounce(dto.manhom, user.id);
  }

  /** POST /teacher_announcement/getListAnnounce — thông báo GV đã tạo (mảng). */
  @SkipTransform()
  @Post('getListAnnounce')
  getListAnnounce(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.announcements.getAll(user.id);
  }

  /** POST /teacher_announcement/getNotifications — 5 thông báo mới (chuông). */
  @SkipTransform()
  @Post('getNotifications')
  getNotifications(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.announcements.getNotifications(user.id);
  }

  /** POST /teacher_announcement/markAsRead — đánh dấu đã xem tất cả. */
  @SkipTransform()
  @Post('markAsRead')
  async markAsRead(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { success: await this.announcements.markAllAsRead(user.id) };
  }

  /** POST /teacher_announcement/getUnreadCount — số thông báo chưa xem. */
  @SkipTransform()
  @Post('getUnreadCount')
  async getUnreadCount(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { count: await this.announcements.countUnread(user.id) };
  }

  /** POST /teacher_announcement/getTotalPages — tổng số trang danh sách. */
  @SkipTransform()
  @Post('getTotalPages')
  getTotalPages(
    @Req() req: Request,
    @Body() dto: AnnouncementPaginationBodyDto,
  ) {
    const user = req.user as IExamJwtPayload;
    return this.announcements.countPages(this.parseArgs(dto.args), user.id);
  }

  /** POST /teacher_announcement/pagination — 1 trang danh sách (mảng). */
  @SkipTransform()
  @Post('pagination')
  pagination(@Req() req: Request, @Body() dto: AnnouncementPaginationBodyDto) {
    const user = req.user as IExamJwtPayload;
    return this.announcements.listAnnouncements(
      this.parseArgs(dto.args),
      user.id,
    );
  }
}
