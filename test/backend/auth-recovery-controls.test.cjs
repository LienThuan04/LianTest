'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
const source = (file) => path.resolve(__dirname, '../../src', file);
const noop = () => () => {};
const exceptions = loadTypeScript(source('common/exceptions/app.exception.ts'));
const metadata = new WeakMap();
const common = {
  Injectable: noop,
  Controller: noop,
  Post: noop,
  Module: noop,
  Logger: class {
    log() {}
    error() {}
    warn() {}
  },
  ForbiddenException: exceptions.ForbiddenException,
  UnauthorizedException: exceptions.UnauthorizedException,
  SetMetadata: (key, value) => (target, _key, descriptor) => {
    const object = descriptor?.value ?? target;
    const values = metadata.get(object) ?? new Map();
    values.set(key, value);
    metadata.set(object, values);
  },
};
const { ExamAuthService } = loadTypeScript(
  source('exam-auth/exam-auth.service.ts'),
  {
    '@nestjs/common': common,
    '@nestjs/jwt': {},
    '@nestjs/config': {},
    '@prisma/client': {},
    'node:crypto': require('node:crypto'),
    '@/prisma/prisma.service': {},
    '@/email/email.service': {},
    '@/common/otp/generate-otp': { generateNumericOtp: () => '654321' },
    '@/lib/bcrypt/bcrypt': {
      generatePasswordHash: async (password) => `hashed:${password}`,
      comparePassword: async (password, hash) => hash === `hashed:${password}`,
    },
    '@/common/exceptions/app.exception': exceptions,
    '@/exam-auth/dto/exam-login.dto': {},
    '@/exam-auth/dto/exam-register.dto': {},
  },
);
const decorators = loadTypeScript(source('common/decorators/metadata.ts'), {
  '@nestjs/common': common,
});
const { ExamAuthController } = loadTypeScript(
  source('exam-auth/exam-auth.controller.ts'),
  {
    '@nestjs/common': common,
    '@nestjs/config': {},
    '@/common/decorators/metadata': decorators,
    '@/common/decorators/skip-transform.decorator': {},
    '@/exam-auth/exam-auth.service': { ExamAuthService },
    '@/exam-auth/dto/exam-login.dto': {},
    '@/exam-auth/dto/exam-register.dto': {},
  },
);

function fixture() {
  const user = {
    id: 'sv-a',
    email: 'sv-a@example.test',
    hoten: 'Student A',
    matkhau: 'hashed:old-pass',
    otp: '654321',
    trangthai: 1,
    manhomquyen: 2,
    avatar: null,
    nhomQuyen: { tennhomquyen: 'Sinh Viên', trangthai: true },
  };
  const jwt = {
    signAsync: async (payload) => JSON.stringify(payload),
    verifyAsync: async (token) => JSON.parse(token),
  };
  const config = {
    get: (key) =>
      ({ JWT_ACCESS_TOKEN_SECRET: 'server-only-key', BCRYPT_SALT_ROUNDS: '4' })[
        key
      ],
  };
  const prisma = {
    nguoiDung: {
      findUnique: async ({ where }) =>
        where.email === user.email || where.id === user.id ? { ...user } : null,
      count: async ({ where }) =>
        where.email === user.email && where.otp === user.otp ? 1 : 0,
      update: async ({ data }) => Object.assign(user, data),
      updateMany: async ({ where, data }) => {
        if (where.email !== user.email || where.matkhau !== user.matkhau)
          return { count: 0 };
        Object.assign(user, data);
        return { count: 1 };
      },
    },
  };
  const service = new ExamAuthService(prisma, jwt, config, {
    sendRegisterOtp: async () => {},
  });
  const controller = new ExamAuthController(service, config);
  const res = {
    cookies: {},
    cleared: [],
    cookie(name, token) {
      this.cookies[name] = token;
    },
    clearCookie(name) {
      this.cleared.push(name);
    },
  };
  return { user, prisma, jwt, config, service, controller, res };
}

test('inactive role cannot receive a new access token at login', async () => {
  const f = fixture();
  f.user.nhomQuyen.trangthai = false;
  await assert.rejects(
    () => f.service.login({ id: f.user.id, password: 'old-pass' }),
    (error) => error.statusCode === 403,
  );
});

test('nonactive account state cannot receive an unusable access token', async () => {
  const f = fixture();
  f.user.trangthai = 2;
  await assert.rejects(
    () => f.service.login({ id: f.user.id, password: 'old-pass' }),
    (error) => error.statusCode === 403,
  );
});

test('verified recovery ticket carries keyed version without exposing password hash or OTP', async () => {
  const f = fixture();
  const token = await f.service.signRecoveryTicket(f.user.email, true);
  const claims = JSON.parse(token);
  assert.match(claims.passwordVersion, /^[a-f0-9]{64}$/);
  assert.equal(token.includes(f.user.matkhau), false);
  assert.equal(token.includes(f.user.otp), false);
  const alternate = new ExamAuthService(
    f.prisma,
    f.jwt,
    { get: () => 'different-server-key' },
    {},
  );
  assert.equal(await alternate.readRecoveryTicket(token), null);
});

test('same verified recovery ticket resets once and fails replay', async () => {
  const f = fixture();
  const token = await f.service.signRecoveryTicket(f.user.email, true);
  const ticket = await f.service.readRecoveryTicket(token);
  assert.equal(
    (
      await f.service.resetPassword(
        ticket.email,
        'new-pass',
        ticket.passwordVersion,
      )
    ).status,
    'success',
  );
  assert.equal(
    (
      await f.service.resetPassword(
        ticket.email,
        'attacker-pass',
        ticket.passwordVersion,
      )
    ).status,
    'error',
  );
  assert.equal(f.user.matkhau, 'hashed:new-pass');
  assert.equal(await f.service.readRecoveryTicket(token), null);
});

test('concurrent reset requests for the same password version have exactly one winner', async () => {
  const f = fixture();
  const ticket = JSON.parse(
    await f.service.signRecoveryTicket(f.user.email, true),
  );
  const results = await Promise.all([
    f.service.resetPassword(ticket.email, 'first-pass', ticket.passwordVersion),
    f.service.resetPassword(
      ticket.email,
      'second-pass',
      ticket.passwordVersion,
    ),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [
    'error',
    'success',
  ]);
});

test('password changed through another flow invalidates existing recovery ticket', async () => {
  const f = fixture();
  const token = await f.service.signRecoveryTicket(f.user.email, true);
  const ticket = JSON.parse(token);
  f.user.matkhau = 'hashed:changed-in-profile';
  assert.equal(await f.service.readRecoveryTicket(token), null);
  assert.equal(
    (
      await f.service.resetPassword(
        ticket.email,
        'attacker-pass',
        ticket.passwordVersion,
      )
    ).status,
    'error',
  );
  assert.equal(f.user.matkhau, 'hashed:changed-in-profile');
});

for (const malformed of [
  { email: 'sv-a@example.test', purpose: 'recover', verified: 'true' },
  { email: 'sv-a@example.test', purpose: 'recover', verified: true },
  { email: 'sv-a@example.test', purpose: 'access', verified: false },
]) {
  test(`recovery reader rejects malformed/old ticket ${JSON.stringify(malformed)}`, async () => {
    const f = fixture();
    assert.equal(
      await f.service.readRecoveryTicket(JSON.stringify(malformed)),
      null,
    );
  });
}

test('controller preserves valid OTP recovery flow and rejects replay of copied cookie', async () => {
  const f = fixture();
  assert.equal(
    (await f.controller.sendOtp({ 'reminder-credential': f.user.email }, f.res))
      .status,
    'success',
  );
  const request = () => ({
    cookies: { recover_ticket: f.res.cookies.recover_ticket },
  });
  assert.equal(
    await f.controller.checkOtp({ otp: '654321' }, request(), f.res),
    true,
  );
  const verifiedRequest = request();
  assert.equal(
    (
      await f.controller.resetPassword(
        { password: 'new-pass' },
        verifiedRequest,
        f.res,
      )
    ).status,
    'success',
  );
  assert.equal(
    (
      await f.controller.resetPassword(
        { password: 'replay-pass' },
        verifiedRequest,
        f.res,
      )
    ).status,
    'error',
  );
  assert.equal(f.user.matkhau, 'hashed:new-pass');
  assert.deepEqual(f.res.cleared, ['recover_ticket']);
});

test('verified ticket upgrade cannot cross a password change after OTP validation', async () => {
  const f = fixture();
  const initial = JSON.parse(
    await f.service.signRecoveryTicket(f.user.email, false),
  );
  f.user.matkhau = 'hashed:changed-after-otp';
  await assert.rejects(() =>
    f.service.signRecoveryTicket(f.user.email, true, initial.passwordVersion),
  );
});

const { EmailController } = loadTypeScript(
  source('email/email.controller.ts'),
  {
    '@nestjs/common': common,
    '@/email/email.service': {},
    '@nestjs/swagger': { ApiOperation: noop },
    '@/email/dto/create-email.dto': {},
    '@/common/interceptors/transform.interceptor': {},
    '@/common/decorators/metadata': decorators,
  },
  { decorators: true },
);
const { JwtAuthGuard } = loadTypeScript(
  source('lib/passport/jwt-auth.guard.ts'),
  {
    '@nestjs/common': common,
    '@nestjs/core': {},
    '@nestjs/config': {},
    '@nestjs/passport': { AuthGuard: () => class {} },
    '@/common/decorators/metadata': decorators,
  },
);
for (const method of ['testEmail', 'sendRegisterOtp']) {
  test(`email diagnostic ${method} only authorizes configured admin`, async () => {
    const reflector = {
      getAllAndOverride: (key, targets) =>
        targets
          .map((target) => metadata.get(target)?.get(key))
          .find((value) => value !== undefined),
    };
    const guard = new JwtAuthGuard(reflector, { get: () => 'Admin' });
    const context = {
      getHandler: () => EmailController.prototype[method],
      getClass: () => EmailController,
    };
    for (const roleName of ['Sinh Viên', 'Giáo Viên']) {
      assert.throws(
        () => guard.handleRequest(null, { roleName }, undefined, context),
        (error) => error.statusCode === 403,
      );
    }
    assert.equal(
      guard.handleRequest(null, { roleName: 'Admin' }, undefined, context)
        .roleName,
      'Admin',
    );
  });
}

let throttleOptions;
loadTypeScript(
  source('core/throttler-config.module.ts'),
  {
    '@nestjs/common': common,
    '@nestjs/throttler': {
      ThrottlerModule: {
        forRoot: (options) => {
          throttleOptions = options;
          return {};
        },
      },
    },
  },
  { decorators: true },
);
for (const name of ['default', 'short-term', 'medium-term', 'long-term']) {
  test(`${name} request window retains paced attempts instead of expiring in milliseconds`, async () => {
    const settings = throttleOptions.throttlers.find(
      (entry) => entry.name === name,
    );
    let now = 0;
    const exports = {};
    vm.runInNewContext(
      fs.readFileSync(
        path.resolve(
          __dirname,
          '../../node_modules/@nestjs/throttler/dist/throttler.service.js',
        ),
        'utf8',
      ),
      {
        exports,
        require: (id) => (id === '@nestjs/common' ? common : require(id)),
        Date: { now: () => now },
        setInterval: () => ({ unref() {} }),
        clearInterval() {},
      },
    );
    const storage = new exports.ThrottlerStorageService();
    let response;
    for (let index = 0; index <= settings.limit; index++) {
      now = index * 20;
      response = await storage.increment(
        name,
        settings.ttl,
        settings.limit,
        settings.ttl,
        name,
      );
    }
    assert.equal(response.isBlocked, true);
    storage.onApplicationShutdown();
  });
}

test('diagnostic mail uses configured sender and app branding in delivered HTML', async () => {
  const outbox = [];
  const { EmailService } = loadTypeScript(source('email/email.service.ts'), {
    '@nestjs/common': common,
    '@nestjs/config': {},
    nodemailer: {
      default: {
        createTransport: () => ({
          sendMail: async (message) => {
            outbox.push(message);
            return { messageId: 'mock-id' };
          },
        }),
      },
    },
    ejs: { default: require('ejs') },
    path: { default: path },
  });
  const settings = {
    EMAIL_HOST: 'smtp.example.test',
    EMAIL_PORT: '587',
    EMAIL_AUTH_USER: 'user',
    EMAIL_AUTH_PASS: 'synthetic-password',
    EMAIL_FROM: 'test-sender@example.test',
    SUPPORT_EMAIL: 'support@example.test',
    APP_NAME: 'LianTest',
  };
  await new EmailService({ get: (key) => settings[key] }).sendTestEmail(
    'receiver@example.test',
  );
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].from, 'test-sender@example.test');
  assert.match(outbox[0].subject, /LianTest/);
  assert.match(outbox[0].html, /support@example\.test/);
  assert.match(outbox[0].html, /LianTest/);
  assert.doesNotMatch(outbox[0].html, /TikTok|Tiktok|tiktok\.com/);
});
