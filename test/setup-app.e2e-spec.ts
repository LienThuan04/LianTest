import { createServer, Server } from 'node:http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { login, requireFixture } from './setup-app';

describe('E2E login prerequisites', () => {
  let server: Server;
  let app: NestExpressApplication;
  let status: number;
  let cookies: string[];

  beforeEach(() => {
    status = 201;
    cookies = [];
    server = createServer((_req, res) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      res.end(
        JSON.stringify({ message: 'Controlled authentication response' }),
      );
    });
    app = { getHttpServer: () => server } as NestExpressApplication;
  });

  afterEach(() => {
    server.close();
  });

  it('rejects HTTP 500 instead of treating a database failure as a missing account', async () => {
    status = 500;
    await expect(login(app, 'gv001')).rejects.toThrow(/gv001.*HTTP 500/);
  });

  it('rejects invalid credentials with the account and HTTP status', async () => {
    status = 401;
    await expect(login(app, 'missing-account')).rejects.toThrow(
      /missing-account.*HTTP 401/,
    );
  });

  it('rejects a successful response without a session cookie', async () => {
    await expect(login(app, 'gv001')).rejects.toThrow(/session cookie/i);
  });

  it('rejects an empty session cookie', async () => {
    cookies = ['access_token=; Path=/; HttpOnly'];
    await expect(login(app, 'gv001')).rejects.toThrow(/session cookie/i);
  });

  it('rejects an unrelated cookie instead of accepting it as authentication', async () => {
    cookies = ['recover_ticket=recovery-only; Path=/; HttpOnly'];
    await expect(login(app, 'gv001')).rejects.toThrow(/session cookie/i);
  });

  it('returns cookies from a successful authenticated response', async () => {
    cookies = [
      'access_token=session-token; Path=/; HttpOnly',
      'preference=compact; Path=/',
    ];
    await expect(login(app, 'gv001')).resolves.toBe(
      'access_token=session-token; preference=compact',
    );
  });
});

describe('E2E fixture prerequisites', () => {
  it.each([null, undefined, '', 0, false])(
    'fails with fixture setup instructions when a required value is %p',
    (value) => {
      expect(() =>
        requireFixture(value, 'seeded group with completed exam'),
      ).toThrow(/seeded group with completed exam.*seed-demo/);
    },
  );

  it('allows an available fixture through to its consumer', () => {
    const fixture = { made: 42 };
    requireFixture(fixture, 'completed exam');
    expect(fixture.made).toBe(42);
  });
});
