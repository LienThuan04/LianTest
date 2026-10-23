import {
  Body,
  Controller,
  Get,
  Post,
  Render,
  Req,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@/common/decorators/metadata';
import { SkipTransform } from '@/common/decorators/skip-transform.decorator';
import { ExamAuthService } from '@/exam-auth/exam-auth.service';
import { ExamLoginDto } from '@/exam-auth/dto/exam-login.dto';
import {
  CheckOtpDto,
  ExamRegisterDto,
  ResetPasswordDto,
  SendOtpDto,
} from '@/exam-auth/dto/exam-register.dto';

/** Cookie mang "vé khôi phục mật khẩu" — thay `$_SESSION['checkMail']` của PHP. */
const RECOVERY_COOKIE = 'recover_ticket';
/** Hạn cookie vé khôi phục (ms) — khớp TTL của JWT trong service. */
const RECOVERY_COOKIE_MAXAGE = 10 * 60 * 1000;

/**
 * Xác thực hệ thi (SSR + AJAX) — thay auth.php.
 * VERSION_NEUTRAL + path nằm trong exclude của global prefix → route ở gốc:
 *   GET  /auth/signin|signup|recover|otp|changepass   (các trang)
 *   POST /auth/login | logout                          (đăng nhập/đăng xuất)
 *   POST /auth/addUser                                 (tự đăng ký)
 *   POST /auth/sendOptAuth | resendOtpAuth | checkOpt | changePassword
 *        (khôi phục mật khẩu bằng OTP email)
 *
 * Trạng thái giữa 3 bước khôi phục: PHP dùng `$_SESSION['checkMail']`; ở đây là
 * **JWT ngắn hạn (10 phút) trong cookie httpOnly** để giữ kiến trúc stateless.
 * KHÁC PHP (vá lỗ hổng): bước đổi mật khẩu đòi vé đã `verified` — tức PHẢI nhập
 * đúng OTP trước. Bản PHP chỉ cần có email trong session nên ai gọi
 * `sendOptAuth` rồi `changePassword` là đổi được mật khẩu của người khác mà
 * không cần mã OTP.
 *
 * KHÔNG port: `getUser` (trả cả bản ghi người dùng theo email — rò rỉ thông tin,
 * không JS nào gọi), `checkEmail` (không JS nào gọi), `checkLogin` (đã thay bằng
 * `/auth/login` cấp JWT).
 */
@Controller({ path: 'auth', version: VERSION_NEUTRAL })
export class ExamAuthController {
  private readonly cookieName: string;

  constructor(
    private readonly examAuthService: ExamAuthService,
    private readonly config: ConfigService,
  ) {
    this.cookieName =
      this.config.get<string>('ACCESS_TOKEN_COOKIE') || 'access_token';
  }

  /** Đặt/làm mới cookie vé khôi phục. */
  private async setRecoveryCookie(
    res: Response,
    email: string,
    verified: boolean,
    expectedVersion?: string,
  ): Promise<void> {
    const token = await this.examAuthService.signRecoveryTicket(
      email,
      verified,
      expectedVersion,
    );
    res.cookie(RECOVERY_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: RECOVERY_COOKIE_MAXAGE,
      path: '/',
    });
  }

  /** Đọc vé khôi phục từ cookie của request. */
  private readTicket(req: Request) {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    return this.examAuthService.readRecoveryTicket(cookies[RECOVERY_COOKIE]);
  }

  @Public()
  @Get('signin')
  @Render('pages/auth/signin')
  signin() {
    // = AuthCore::onLogin + view('single_layout', Page:'auth/signin')
    return { Title: 'Đăng nhập', Page: 'auth/signin' };
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: ExamLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.examAuthService.login(dto);
    res.cookie(this.cookieName, result.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1h (đồng bộ JWT_ACCESS_EXPIRE)
      path: '/',
    });
    // Không phải route render → TransformInterceptor bọc thành {statusCode,message,data}
    return {
      statusCode: 200,
      message: 'Đăng nhập thành công',
      data: result.user,
    };
  }

  @Public()
  @SkipTransform()
  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie(this.cookieName, { path: '/' });
    res.redirect('/auth/signin');
  }

  // ── ĐĂNG KÝ TÀI KHOẢN ──────────────────────────────────────────────────────

  /** GET /auth/signup — trang tạo tài khoản (thay Auth::signup). */
  @Public()
  @Get('signup')
  @Render('pages/auth/signup')
  signup() {
    return { Title: 'Đăng ký tài khoản', Page: 'auth/signup' };
  }

  /** POST /auth/addUser — tạo tài khoản sinh viên (trả {status,message}). */
  @Public()
  @SkipTransform()
  @Post('addUser')
  addUser(@Body() dto: ExamRegisterDto) {
    return this.examAuthService.register(dto);
  }

  // ── KHÔI PHỤC MẬT KHẨU ─────────────────────────────────────────────────────

  /** GET /auth/recover — bước 1: nhập email (thay Auth::recover). */
  @Public()
  @Get('recover')
  @Render('pages/auth/recover')
  recover() {
    return { Title: 'Khôi phục tài khoản', Page: 'auth/recover' };
  }

  /**
   * GET /auth/otp — bước 2: nhập mã OTP. Chưa có vé khôi phục (PHP: chưa có
   * `$_SESSION['checkMail']`) → quay lại bước 1.
   */
  @Public()
  @Get('otp')
  async otp(@Req() req: Request, @Res() res: Response) {
    const ticket = await this.readTicket(req);
    if (!ticket) return res.redirect('/auth/recover');
    return res.render('pages/auth/otp', {
      Title: 'Nhập mã OTP',
      Page: 'auth/otp',
      email: ticket.email,
    });
  }

  /**
   * GET /auth/changepass — bước 3: đặt mật khẩu mới. Đòi vé ĐÃ xác minh OTP,
   * chưa xác minh thì trả về bước nhập OTP.
   */
  @Public()
  @Get('changepass')
  async changepass(@Req() req: Request, @Res() res: Response) {
    const ticket = await this.readTicket(req);
    if (!ticket) return res.redirect('/auth/recover');
    if (!ticket.verified) return res.redirect('/auth/otp');
    return res.render('pages/auth/changepass', {
      Title: 'Nhập mật khẩu mới',
      Page: 'auth/changepass',
    });
  }

  /**
   * POST /auth/sendOptAuth — gửi OTP về email và cấp vé khôi phục (chưa xác minh).
   */
  @Public()
  @SkipTransform()
  @Post('sendOptAuth')
  async sendOtp(
    @Body() dto: SendOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = dto['reminder-credential'];
    const result = await this.examAuthService.sendRecoveryOtp(email);
    if (result.status === 'success') {
      await this.setRecoveryCookie(res, email, false);
    } else {
      res.clearCookie(RECOVERY_COOKIE, { path: '/' });
    }
    return result;
  }

  /** POST /auth/resendOtpAuth — gửi lại OTP cho email trong vé khôi phục. */
  @Public()
  @SkipTransform()
  @Post('resendOtpAuth')
  async resendOtp(@Req() req: Request) {
    const ticket = await this.readTicket(req);
    if (!ticket) {
      return {
        status: 'error',
        message: 'Không tìm thấy email để gửi lại OTP.',
      };
    }
    const result = await this.examAuthService.sendRecoveryOtp(ticket.email);
    return result.status === 'success'
      ? { status: 'success', message: 'Gửi lại OTP thành công!!' }
      : result;
  }

  /**
   * POST /auth/checkOpt — kiểm mã OTP; đúng thì NÂNG CẤP vé thành `verified`
   * để bước đổi mật khẩu được phép chạy. Trả `true|false` y PHP.
   */
  @Public()
  @SkipTransform()
  @Post('checkOpt')
  async checkOtp(
    @Body() dto: CheckOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ticket = await this.readTicket(req);
    if (!ticket) return false;

    const ok = await this.examAuthService.verifyRecoveryOtp(
      ticket.email,
      dto.otp,
    );
    if (ok)
      await this.setRecoveryCookie(
        res,
        ticket.email,
        true,
        ticket.passwordVersion,
      );
    return ok;
  }

  /**
   * POST /auth/changePassword — đặt lại mật khẩu rồi huỷ vé khôi phục.
   * Đòi vé đã xác minh OTP (xem ghi chú lỗ hổng ở đầu class).
   */
  @Public()
  @SkipTransform()
  @Post('changePassword')
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ticket = await this.readTicket(req);
    if (!ticket) {
      return { status: 'error', message: 'Không tìm thấy người dùng' };
    }
    if (!ticket.verified) {
      return { status: 'error', message: 'Vui lòng xác minh mã OTP trước' };
    }

    const result = await this.examAuthService.resetPassword(
      ticket.email,
      dto.password,
      ticket.passwordVersion,
    );
    if (result.status === 'success') {
      res.clearCookie(RECOVERY_COOKIE, { path: '/' });
    }
    return result;
  }
}
