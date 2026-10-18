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
import { Public } from '@/common/decorators/metadata';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { DashboardEmailDto } from '@/pages/dto/dashboard.dto';
import { PagesService } from '@/pages/pages.service';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Trang SSR gốc (không prefix /api, VERSION_NEUTRAL):
 *   GET /          landing (công khai) — thay landing.php
 *   GET /dashboard cần đăng nhập (JwtAuthGuard global) — thay dashboard.php
 *   POST /dashboard/{checkEmail,checkEmailExist,updateEmail} — onboarding email
 *
 * Ví dụ gắn RBAC cho route nội bộ:
 *   @Permissions('dashboard', 'view')   // cần seed chitietquyen tương ứng
 */
@Controller({ version: VERSION_NEUTRAL })
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Public()
  @Get()
  @Render('pages/landing')
  landing(@Req() req: Request) {
    // Landing công khai: chỉ cần biết đã đăng nhập chưa để đổi nút
    // (Đăng nhập <-> Dashboard) — kiểm sự hiện diện cookie, không cần verify.
    const cookieName = process.env.ACCESS_TOKEN_COOKIE || 'access_token';
    const isLoggedIn = !!req.cookies?.[cookieName];
    return { Title: 'LianTest', isLoggedIn };
  }

  @Get('dashboard')
  @Render('pages/dashboard')
  dashboard(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return { Title: 'Bảng điều khiển', Page: 'dashboard', user };
  }

  // ── AJAX onboarding email (dashboard.js) ────────────────────────────────────
  // Không gate quyền riêng (như PHP: chỉ checkAuthentication) vì user chỉ đọc/
  // sửa email của CHÍNH mình — id lấy từ JWT, không tin body.

  /** POST /dashboard/checkEmail — email hiện tại ('' = chưa có → hiện modal). */
  @SkipTransform()
  @Post('dashboard/checkEmail')
  checkEmail(@Req() req: Request) {
    const user = req.user as IExamJwtPayload;
    return this.pages.getEmail(user.id);
  }

  /** POST /dashboard/checkEmailExist — email đã có người dùng chưa. */
  @SkipTransform()
  @Post('dashboard/checkEmailExist')
  checkEmailExist(@Body() dto: DashboardEmailDto) {
    return this.pages.checkEmailExist(dto.email);
  }

  /** POST /dashboard/updateEmail — lưu email cho user đang đăng nhập. */
  @SkipTransform()
  @Post('dashboard/updateEmail')
  updateEmail(@Req() req: Request, @Body() dto: DashboardEmailDto) {
    const user = req.user as IExamJwtPayload;
    return this.pages.updateEmail(user.id, dto.email);
  }
}
