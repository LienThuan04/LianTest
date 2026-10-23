import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import type { Request } from 'express';
import type { IExamJwtPayload } from '@/exam-auth/interfaces/exam-auth.types';

/**
 * Xác thực JWT cho hệ thi (hạ tầng giữ lại từ bộ khung).
 * Lấy access token từ: (1) cookie httpOnly cho trang SSR/trình duyệt,
 * (2) header Authorization: Bearer cho API/mobile. Xem docs/06.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>('JWT_ACCESS_TOKEN_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT secret key is not defined in environment variables');
    }
    const accessCookieName =
      configService.get<string>('ACCESS_TOKEN_COOKIE') || 'access_token';
    const cookieExtractor = (req: Request): string | null => {
      // `Request['cookies']` của @types/express là `any` → ép về map chuỗi
      // để giá trị trả về có kiểu thật (cookie-parser luôn cho chuỗi).
      const cookies = (req as { cookies?: Record<string, string> }).cookies;
      return cookies?.[accessCookieName] ?? null;
    };
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: unknown): Promise<IExamJwtPayload> {
    const claims = payload as Partial<IExamJwtPayload> | null;
    if (
      !claims ||
      typeof claims !== 'object' ||
      'purpose' in claims ||
      typeof claims.id !== 'string' ||
      !claims.id.trim()
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    // Recovery tickets share the signing service but never authenticate a user.
    // Reload identity so locked/deleted users and changed roles take effect now.
    const user = await this.prisma.nguoiDung.findUnique({
      where: { id: claims.id },
      select: {
        id: true,
        email: true,
        hoten: true,
        trangthai: true,
        manhomquyen: true,
        nhomQuyen: { select: { tennhomquyen: true, trangthai: true } },
      },
    });
    if (
      !user ||
      user.trangthai !== 1 ||
      user.manhomquyen == null ||
      !user.nhomQuyen?.trangthai
    ) {
      throw new UnauthorizedException('Account or role is no longer active');
    }
    return {
      id: user.id,
      email: user.email,
      hoten: user.hoten,
      manhomquyen: user.manhomquyen,
      roleName: user.nhomQuyen.tennhomquyen,
    };
  }
}
