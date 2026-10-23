import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailService } from '@/email/email.service';
import { generateNumericOtp } from '@/common/otp/generate-otp';
import { comparePassword, generatePasswordHash } from '@/lib/bcrypt/bcrypt';
import {
  UnauthorizedException,
  ForbiddenException,
} from '@/common/exceptions/app.exception';
import { ExamLoginDto } from '@/exam-auth/dto/exam-login.dto';
import { ExamRegisterDto } from '@/exam-auth/dto/exam-register.dto';
import type {
  IAuthActionResult,
  IExamJwtPayload,
  IExamLoginResult,
  IRecoveryTicket,
} from '@/exam-auth/interfaces/exam-auth.types';

/** Hiệu lực vé khôi phục (cookie) — cũng là hạn dùng của mã OTP. */
const RECOVERY_TTL_MINUTES = 10;
/** Nhóm quyền mặc định cho tài khoản tự đăng ký: 2 = Sinh Viên. */
const SELF_SIGNUP_ROLE = 2;

/**
 * Logic xác thực hệ thi — thay NguoiDungModel (checkLogin/validateToken) của PHP.
 * Dùng JWT (stack có sẵn) thay token tự chế + $_SESSION. Xem docs/09.
 */
@Injectable()
export class ExamAuthService {
  private readonly logger = new Logger(ExamAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async login(dto: ExamLoginDto): Promise<IExamLoginResult> {
    const user = await this.prisma.nguoiDung.findUnique({
      where: { id: dto.id },
      include: { nhomQuyen: true },
    });

    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại');
    if (user.trangthai !== 1) throw new ForbiddenException('Tài khoản bị khóa');
    if (!user.matkhau)
      throw new UnauthorizedException('Tài khoản chưa đặt mật khẩu');

    const ok = await comparePassword(dto.password, user.matkhau);
    if (!ok) throw new UnauthorizedException('Mật khẩu không đúng');

    if (user.manhomquyen == null || !user.nhomQuyen)
      throw new ForbiddenException('Tài khoản chưa được gán nhóm quyền');
    if (!user.nhomQuyen.trangthai)
      throw new ForbiddenException(
        'Nhóm quyền của tài khoản đã bị vô hiệu hóa',
      );

    const payload: IExamJwtPayload = {
      id: user.id,
      email: user.email,
      hoten: user.hoten,
      manhomquyen: user.manhomquyen,
      roleName: user.nhomQuyen.tennhomquyen,
    };

    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        hoten: user.hoten,
        manhomquyen: user.manhomquyen,
        roleName: user.nhomQuyen.tennhomquyen,
        avatar: user.avatar,
      },
    };
  }

  // ── ĐĂNG KÝ TÀI KHOẢN (signup) ─────────────────────────────────────────────

  /**
   * POST /auth/addUser — tự đăng ký tài khoản sinh viên.
   * Thay `Auth::addUser` + `User::add` (trang signup.php gốc submit sang
   * `user/add`) + `NguoiDungModel::create`.
   *
   * KHÁC PHP: (1) KHÔNG dùng lại route quản trị `/user/add` — route đó nhận
   * `role`/`status` từ client nên ai cũng có thể tự tạo tài khoản **Admin**;
   * ở đây nhóm quyền bị ÉP = 2 (Sinh Viên) và trạng thái = 1. (2) `Auth::addUser`
   * gốc đọc `$_POST['id']`/`hoten` trong khi signup.js gửi `fullname` → luồng đó
   * không bao giờ chạy được; bản này khớp đúng field của form.
   */
  async register(dto: ExamRegisterDto): Promise<IAuthActionResult> {
    if (dto.password !== dto.confirm_password) {
      return { status: 'error', message: 'Mật khẩu xác nhận không khớp' };
    }

    const byEmail = await this.prisma.nguoiDung.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (byEmail) {
      return { status: 'error', message: 'Email đã được sử dụng' };
    }

    const byId = await this.prisma.nguoiDung.findUnique({
      where: { id: dto.masinhvien },
      select: { id: true },
    });
    if (byId) {
      return { status: 'error', message: 'Mã sinh viên đã được sử dụng' };
    }

    const salt = parseInt(
      this.config.get<string>('BCRYPT_SALT_ROUNDS') || '10',
      10,
    );

    try {
      await this.prisma.nguoiDung.create({
        data: {
          id: dto.masinhvien,
          email: dto.email,
          hoten: dto.hoten,
          // Quy ước chung của hệ thống: 1 = Nam, 0 = Nữ (xem user.js/account_setting).
          gioitinh:
            dto.gioitinh != null ? Boolean(Number(dto.gioitinh)) : false,
          ngaysinh: new Date(dto.ngaysinh || '2004-01-01'),
          sodienthoai: dto.sodienthoai ? Number(dto.sodienthoai) : null,
          matkhau: await generatePasswordHash(dto.password, salt),
          trangthai: 1,
          manhomquyen: SELF_SIGNUP_ROLE,
        },
      });
      return { status: 'success', message: 'Đăng ký thành công' };
    } catch (err) {
      const code = (err as Prisma.PrismaClientKnownRequestError).code;
      if (code === 'P2002') {
        return {
          status: 'error',
          message: 'Email hoặc mã sinh viên đã được sử dụng',
        };
      }
      this.logger.error('Đăng ký tài khoản thất bại', err as Error);
      return { status: 'error', message: 'Đăng ký thất bại' };
    }
  }

  // ── KHÔI PHỤC MẬT KHẨU (recover → otp → changepass) ────────────────────────

  /** MAC dùng secret server để JWT không lộ hash mật khẩu hoặc oracle đoán OTP. */
  private recoveryPasswordVersion(
    email: string,
    passwordHash: string | null,
  ): string {
    const secret = this.config.get<string>('JWT_ACCESS_TOKEN_SECRET');
    if (!secret) throw new Error('JWT access token secret is not configured');
    return createHmac('sha256', secret)
      .update(JSON.stringify(['recover-password-v1', email, passwordHash]))
      .digest('hex');
  }

  /** Ký vé gắn với mật khẩu hiện tại; đổi mật khẩu làm mọi vé cũ hết hiệu lực. */
  async signRecoveryTicket(
    email: string,
    verified: boolean,
    expectedVersion?: string,
  ): Promise<string> {
    const user = await this.prisma.nguoiDung.findUnique({
      where: { email },
      select: { matkhau: true },
    });
    if (!user) throw new UnauthorizedException('Không tìm thấy người dùng');
    const passwordVersion = this.recoveryPasswordVersion(email, user.matkhau);
    if (expectedVersion !== undefined && expectedVersion !== passwordVersion) {
      throw new UnauthorizedException('Vé khôi phục đã hết hiệu lực');
    }
    const payload: IRecoveryTicket = {
      email,
      purpose: 'recover',
      verified,
      passwordVersion,
    };
    return this.jwt.signAsync(payload, {
      expiresIn: `${RECOVERY_TTL_MINUTES}m`,
    });
  }

  /** Đọc vé khôi phục từ cookie; hỏng/hết hạn → null (thay `$_SESSION['checkMail']`). */
  async readRecoveryTicket(token?: string): Promise<IRecoveryTicket | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<IRecoveryTicket>(token);
      if (
        payload?.purpose !== 'recover' ||
        typeof payload.email !== 'string' ||
        typeof payload.verified !== 'boolean' ||
        typeof payload.passwordVersion !== 'string' ||
        !/^[a-f0-9]{64}$/.test(payload.passwordVersion)
      )
        return null;
      const user = await this.prisma.nguoiDung.findUnique({
        where: { email: payload.email },
        select: { matkhau: true },
      });
      return user &&
        payload.passwordVersion ===
          this.recoveryPasswordVersion(payload.email, user.matkhau)
        ? payload
        : null;
    } catch {
      return null;
    }
  }

  /**
   * POST /auth/sendOptAuth + /auth/resendOtpAuth — sinh OTP 6 số, lưu vào cột
   * `nguoidung.otp` rồi gửi email. Thay `Auth::sendOptAuth` +
   * `NguoiDungModel::updateOpt` + `MailAuth::sendOpt`.
   *
   * KHÁC PHP: OTP sinh bằng `crypto.randomInt` (an toàn hơn `rand()`), và email
   * gửi qua `EmailService` (nodemailer + template EJS) có sẵn của dự án.
   */
  async sendRecoveryOtp(email: string): Promise<IAuthActionResult> {
    const user = await this.prisma.nguoiDung.findUnique({
      where: { email },
      select: { hoten: true },
    });
    if (!user) {
      return {
        status: 'error',
        message: 'Email không tồn tại trong hệ thống.',
      };
    }

    const otp = generateNumericOtp(6);
    try {
      await this.prisma.nguoiDung.update({
        where: { email },
        data: { otp },
      });
    } catch (err) {
      this.logger.error('Lưu OTP thất bại', err as Error);
      return {
        status: 'error',
        message: 'Lỗi khi lưu OTP. Vui lòng thử lại.',
      };
    }

    try {
      await this.email.sendRegisterOtp(
        email,
        user.hoten,
        otp,
        `${RECOVERY_TTL_MINUTES} phút`,
      );
    } catch (err) {
      this.logger.error('Gửi email OTP thất bại', err as Error);
      // Không để lại OTP treo nếu email không đi được.
      await this.prisma.nguoiDung
        .update({ where: { email }, data: { otp: null } })
        .catch(() => undefined);
      return {
        status: 'error',
        message: 'Lỗi khi gửi email OTP. Vui lòng thử lại.',
      };
    }

    return { status: 'success', message: 'Gửi OTP thành công!!' };
  }

  /** POST /auth/checkOpt — kiểm mã OTP của email đang khôi phục. */
  async verifyRecoveryOtp(email: string, otp: string): Promise<boolean> {
    const count = await this.prisma.nguoiDung.count({
      where: { email, otp },
    });
    return count > 0;
  }

  /**
   * POST /auth/changePassword — đặt lại mật khẩu sau khi xác minh OTP, đồng thời
   * xoá OTP đã dùng. Thay `Auth::changePassword`.
   *
   * KHÁC PHP (sửa lỗi thật): PHP gọi `changePassword($email, $hash)` nhưng model
   * lại `UPDATE ... WHERE id = ?` → truyền email vào cột id, 0 dòng bị đổi và
   * luôn báo "Đổi mật khẩu thất bại". Ở đây cập nhật ĐÚNG theo email.
   */
  async resetPassword(
    email: string,
    password: string,
    passwordVersion: string,
  ): Promise<IAuthActionResult> {
    const salt = parseInt(
      this.config.get<string>('BCRYPT_SALT_ROUNDS') || '10',
      10,
    );
    try {
      const user = await this.prisma.nguoiDung.findUnique({
        where: { email },
        select: { matkhau: true },
      });
      if (
        !user ||
        passwordVersion !== this.recoveryPasswordVersion(email, user.matkhau)
      ) {
        return { status: 'error', message: 'Vé khôi phục đã hết hiệu lực' };
      }
      // Compare-and-set trong cùng câu UPDATE: hai request dùng cùng vé chỉ có
      // một request đổi được mật khẩu, kể cả khi đã đọc cùng hash trước đó.
      const result = await this.prisma.nguoiDung.updateMany({
        where: { email, matkhau: user.matkhau },
        data: {
          matkhau: await generatePasswordHash(password, salt),
          otp: null,
        },
      });
      if (result.count !== 1) {
        return { status: 'error', message: 'Vé khôi phục đã được sử dụng' };
      }
      return { status: 'success', message: 'Đổi mật khẩu thành công' };
    } catch (err) {
      this.logger.error('Đặt lại mật khẩu thất bại', err as Error);
      return { status: 'error', message: 'Đổi mật khẩu thất bại' };
    }
  }
}
