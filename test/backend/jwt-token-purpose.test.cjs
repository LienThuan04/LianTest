const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');

const root = path.resolve(__dirname, '../..');
const exceptions = loadTypeScript(
  path.join(root, 'src/common/exceptions/app.exception.ts'),
);
const { JwtStrategy } = loadTypeScript(
  path.join(root, 'src/exam-auth/passport/jwt.strategy.ts'),
  {
    'passport-jwt': {
      Strategy: class {},
      ExtractJwt: {
        fromExtractors: (items) => items,
        fromAuthHeaderAsBearerToken: () => () => null,
      },
    },
    '@nestjs/passport': {
      PassportStrategy: () =>
        class {
          constructor(options) {
            this.options = options;
          }
        },
    },
    '@nestjs/common': { ...exceptions },
    '@nestjs/config': {},
    '@/prisma/prisma.service': {},
  },
);

const payload = {
  id: 'teacher-a',
  email: 'teacher-a@example.invalid',
  hoten: 'Teacher A',
  manhomquyen: 1,
  roleName: 'Teacher',
};
const account = {
  ...payload,
  trangthai: 1,
  nhomQuyen: { tennhomquyen: 'Teacher', trangthai: true },
};
const config = {
  get: (key) =>
    key === 'JWT_ACCESS_TOKEN_SECRET' ? 'native-unit-test-only-key' : undefined,
};

function strategy(user = account) {
  let queries = 0;
  const prisma = {
    nguoiDung: {
      findUnique: async () => {
        queries++;
        return user;
      },
    },
  };
  return { instance: new JwtStrategy(config, prisma), queries: () => queries };
}

for (const [name, token] of [
  [
    'unverified recovery ticket',
    { email: 'student@example.invalid', purpose: 'recover', verified: false },
  ],
  [
    'verified recovery ticket',
    { email: 'student@example.invalid', purpose: 'recover', verified: true },
  ],
  [
    'recovery purpose with forged access-shaped claims',
    { ...payload, purpose: 'recover', verified: true },
  ],
  ['missing account identity', { email: payload.email, manhomquyen: 3 }],
  ['non-string identity', { ...payload, id: { toString: () => 'admin' } }],
  ['empty identity', { ...payload, id: '' }],
]) {
  test(`access validation rejects ${name} before a database lookup`, async () => {
    const item = strategy();
    await assert.rejects(
      async () => item.instance.validate(token),
      (error) => error.statusCode === 401 || error.getStatus?.() === 401,
    );
    assert.equal(item.queries(), 0);
  });
}

for (const [name, user] of [
  ['deleted account', null],
  ['locked account', { ...account, trangthai: 0 }],
  ['missing role relation', { ...account, nhomQuyen: null }],
  [
    'disabled role',
    { ...account, nhomQuyen: { ...account.nhomQuyen, trangthai: false } },
  ],
]) {
  test(`access validation rejects a ${name}`, async () => {
    const item = strategy(user);
    await assert.rejects(
      async () => item.instance.validate(payload),
      (error) => error.statusCode === 401 || error.getStatus?.() === 401,
    );
  });
}

test('authorization identity uses the current database role instead of stale JWT admin claims', async () => {
  const item = strategy(account);
  const result = await item.instance.validate({
    ...payload,
    manhomquyen: 3,
    roleName: 'Admin',
  });
  assert.equal(result.manhomquyen, 1);
  assert.equal(result.roleName, 'Teacher');
  assert.equal(item.queries(), 1);
});

test('a valid active account yields only the current public identity claims', async () => {
  const item = strategy({
    ...account,
    email: 'updated@example.invalid',
    matkhau: 'private-hash',
    otp: 'private-otp',
  });
  const result = await item.instance.validate(payload);
  assert.deepEqual(result, { ...payload, email: 'updated@example.invalid' });
  assert.equal('matkhau' in result, false);
  assert.equal('otp' in result, false);
});
