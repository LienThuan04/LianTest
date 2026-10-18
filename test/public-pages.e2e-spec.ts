import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createPublicTestApp } from './setup-app';

/** Public HTTP rendering and unauthenticated guards must work without Prisma. */
describe('Public pages and unauthenticated errors without a database (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;

  beforeAll(async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = '';
    try {
      app = await createPublicTestApp();
      server = app.getHttpServer();
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('404: URL không tồn tại → trang 404 HTML', async () => {
    const res = await request(server)
      .get('/khong-ton-tai-dau-nhe')
      .set('Accept', 'text/html');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('không được tìm thấy');
  });

  it('401: mở trang cần đăng nhập → xoá cookie + chuyển về /auth/signin', async () => {
    const res = await request(server)
      .get('/dashboard')
      .set('Accept', 'text/html');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/signin');
    expect(String(res.headers['set-cookie'])).toContain('access_token=;');
  });

  it('trang công khai KHÔNG bị ảnh hưởng', async () => {
    await request(server).get('/').set('Accept', 'text/html').expect(200);
    await request(server)
      .get('/auth/signin')
      .set('Accept', 'text/html')
      .expect(200);
  });

  it('tên sản phẩm là LianTest và tác giả vẫn là LianHarman', async () => {
    for (const path of ['/', '/auth/signin', '/auth/signup', '/auth/recover']) {
      const res = await request(server).get(path).expect(200);
      expect(res.text).toMatch(/<title>[^<]*LianTest[^<]*<\/title>/);
      expect(res.text).toContain('name="application-name" content="LianTest"');
      expect(res.text).toContain('name="author" content="LianHarman"');
    }
    const landing = await request(server).get('/').expect(200);
    expect(landing.text).toContain('Phát triển bởi LianHarman');
    expect(landing.text).toContain('Đăng nhập LianTest');
  });

  it('landing giới thiệu sản phẩm và demo công khai, không tải script nghiệp vụ', async () => {
    const res = await request(server).get('/').expect(200);
    expect(res.text).toContain('id="trai-nghiem"');
    expect(res.text).toContain('id="vai-tro"');
    expect(res.text).toContain('id="cau-hoi"');
    expect(res.text).toContain('data-demo-question');
    expect(res.text).toContain('href="/auth/signin"');
    expect(res.text).toContain('property="og:title"');
    expect(res.text).not.toContain('/public/js/permission.js');
    expect(res.text).not.toContain('/public/js/pages/de_thi.js');
    expect(res.text).not.toContain('/public/js/lib/jquery.min.js');
  });

  it('cookie hiện diện chỉ đổi CTA landing; protected app vẫn xác thực token', async () => {
    const cookie = `${process.env.ACCESS_TOKEN_COOKIE || 'access_token'}=invalid-demo-cookie`;
    const res = await request(server)
      .get('/')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.text).toContain('Vào ứng dụng');
    expect(res.text).toContain('href="/dashboard"');
    await request(server)
      .get('/dashboard')
      .set('Accept', 'text/html')
      .set('Cookie', cookie)
      .expect(302)
      .expect('Location', '/auth/signin');
  });

  it('AJAX (XHR) vẫn nhận JSON, không phải trang HTML', async () => {
    const res = await request(server)
      .post('/test/pagination')
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.statusCode).toBe(401);
  });

  it('route dưới /api vẫn trả JSON kể cả khi client xin text/html', async () => {
    const res = await request(server)
      .get('/api/v1/khong-co-route-nay')
      .set('Accept', 'text/html');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
