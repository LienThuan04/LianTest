import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from '@/app.module';
import { setupAppConfig } from '@/config/app-setup.config';
import { validationConfig } from '@/config/validation.config';
import { PrismaService } from '@/prisma/prisma.service';

export function fixtureFailure(description: string): never {
  throw new Error(
    `E2E prerequisite missing: ${description}. Use a reachable test DATABASE_URL with demo fixtures (seed-demo) and check preceding test failures.`,
  );
}

export function requireFixture(
  value: unknown,
  description: string,
): asserts value {
  if (!value) fixtureFailure(description);
}

/**
 * Dựng app cho e2e ĐÚNG NHƯ `src/main.ts` (global prefix + exclude, ValidationPipe,
 * cookie-parser, EJS + thư mục views). Thiếu một trong số này thì trang SSR sẽ
 * render hỏng hoặc route ở path gốc bị đẩy sang `/api/v1` → test sai lệch với thật.
 *
 * Ép tắt auto-seed/clear TRƯỚC khi compile module. Các ca nghiệp vụ vẫn dùng CSDL
 * thật và tự dọn dữ liệu do chúng tạo; thiếu DB hoặc fixture phải báo lỗi.
 */
export async function createTestApp(): Promise<NestExpressApplication> {
  return buildTestApp(false);
}

/** Chỉ dùng cho route công khai: không dựng Prisma, không cung cấp kết quả DB giả. */
export async function createPublicTestApp(): Promise<NestExpressApplication> {
  return buildTestApp(true);
}

async function buildTestApp(
  withoutDatabase: boolean,
): Promise<NestExpressApplication> {
  process.env.SEED_DB = 'false';
  process.env.CLEAR_DB = 'false';
  process.env.SEED_DEMO_DATA = 'false';

  const builder = Test.createTestingModule({
    imports: [AppModule],
  });
  if (withoutDatabase) {
    // An unexpected database call fails instead of returning fabricated business data.
    builder.overrideProvider(PrismaService).useValue({});
  }
  const moduleFixture: TestingModule = await builder.compile();

  // `rawBody: true` y `main.ts` — vài route đọc body thô (chấm tự luận).
  const app = moduleFixture.createNestApplication<NestExpressApplication>({
    rawBody: true,
  });

  setupAppConfig(app);
  validationConfig(app);
  app.use(cookieParser()); // phải có: JwtStrategy đọc token từ cookie
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/public/' });
  app.setBaseViewsDir(join(process.cwd(), 'views'));
  app.setViewEngine('ejs');

  try {
    await app.init();
  } catch (error) {
    try {
      await app.close();
    } catch {
      // Keep the original initialization failure if shutdown also fails.
    }
    throw new Error(
      'E2E app initialization failed. Check DATABASE_URL and database availability before running business tests.',
      { cause: error },
    );
  }
  return app;
}

/**
 * Đăng nhập và trả về cookie phiên để gắn vào request tiếp theo.
 * Lỗi HTTP hoặc thiếu cookie là lỗi tiên quyết của e2e, không được bỏ qua test.
 */
export async function login(
  app: NestExpressApplication,
  id: string,
  password = process.env.DEFAULT_PASSWORD || '123456',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ id, password });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `E2E login for ${id} failed: HTTP ${res.status}. Check DATABASE_URL, demo fixtures and credentials.`,
    );
  }

  const setCookie = res.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sessionCookies = cookies
    .filter(Boolean)
    .map((c: string) => c.split(';')[0]);
  const cookieName = process.env.ACCESS_TOKEN_COOKIE || 'access_token';
  if (
    !sessionCookies.some(
      (c: string) =>
        c.startsWith(`${cookieName}=`) && c.length > cookieName.length + 1,
    )
  ) {
    throw new Error(
      `E2E login for ${id} returned HTTP ${res.status} without a non-empty session cookie (${cookieName}).`,
    );
  }
  return sessionCookies.join('; ');
}
