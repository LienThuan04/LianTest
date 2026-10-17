import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp, login, requireFixture } from './setup-app';

/**
 * Trang lỗi hệ thi (thay `myerror.php` + `error/page_404.php`/`page_403.php`).
 * Quy tắc trong `AllExceptionsFilter`: điều hướng bằng trình duyệt (GET + Accept
 * text/html + không phải XHR + ngoài `/api`) → HTML; còn lại giữ nguyên JSON.
 */
describe('Trang lỗi 404/403/500 (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('khi đã đăng nhập', () => {
    let cookie = '';

    beforeAll(async () => {
      // gv001 = giảng viên (nhóm quyền 1) trong `seed/exam-sample.ts`.
      cookie = await login(app, 'gv001');
    }, 30_000);

    it('403: giảng viên vào trang chỉ dành cho admin → trang 403 HTML', async () => {
      requireFixture(cookie, 'teacher session for authenticated error pages');
      // Quyền `phancong` chỉ seed cho nhóm quyền 3 (admin) — đúng dump gốc.
      const res = await request(server)
        .get('/assignment')
        .set('Accept', 'text/html')
        .set('Cookie', cookie);

      expect(res.status).toBe(403);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('không có quyền truy cập trang này');
    });

    it('404: mở đề thi không tồn tại → trang 404 HTML', async () => {
      requireFixture(cookie, 'teacher session for authenticated error pages');
      const res = await request(server)
        .get('/test/detail/99999999')
        .set('Accept', 'text/html')
        .set('Cookie', cookie);

      expect(res.status).toBe(404);
      expect(res.text).toContain('không được tìm thấy');
    });

    it('lỗi còn lại (tham số sai) → trang lỗi chung, không phải trang trắng', async () => {
      requireFixture(cookie, 'teacher session for authenticated error pages');
      const res = await request(server)
        .get('/module/detail/khong-phai-so')
        .set('Accept', 'text/html')
        .set('Cookie', cookie);

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('hệ thống đang gặp sự cố');
    });

    it('trang được phép vẫn render bình thường', async () => {
      requireFixture(cookie, 'teacher session for authenticated error pages');
      await request(server)
        .get('/test')
        .set('Accept', 'text/html')
        .set('Cookie', cookie)
        .expect(200);
    });
  });
});
