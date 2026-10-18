import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createPublicTestApp } from './setup-app';

/**
 * Khói (smoke) cho trang gốc. `GET /` là landing SSR (thay `landing.php`),
 * KHÔNG còn là "Hello World!" của khung Nest mặc định.
 */
describe('Trang gốc (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createPublicTestApp();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('GET / → landing HTML', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('Accept', 'text/html');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('<title>LianTest');
    expect(res.text).toContain('name="author" content="LianHarman"');
  });
});
