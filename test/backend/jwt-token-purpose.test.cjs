const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
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
  avatar: null,
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
      findUnique: async ({ select }) => {
        queries++;
        if (!user) return null;
        return Object.fromEntries(
          Object.keys(select).map((key) => [key, user[key]]),
        );
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
  assert.deepEqual(result, {
    ...payload,
    email: 'updated@example.invalid',
    avatar: null,
  });
  assert.equal('matkhau' in result, false);
  assert.equal('otp' in result, false);
});

const header = fs.readFileSync(
  path.join(root, 'views/partials/header.ejs'),
  'utf8',
);

function headerAvatar(user) {
  const html = ejs.render(header, { user, Title: 'Trang bất kỳ' });
  const avatar = html.match(/class="img-avatar[^"]*" src="([^"]+)"/);
  assert.ok(avatar, 'shared header contains an avatar image');
  return avatar[1];
}

for (const role of [1, 2, 3]) {
  test(`role ${role}: shared header displays the saved avatar without opening the profile`, async () => {
    const item = strategy({
      ...account,
      manhomquyen: role,
      avatar: 'https://images.example.invalid/avatars/current.png',
    });
    const user = await item.instance.validate(payload);
    assert.equal(
      headerAvatar(user),
      'https://images.example.invalid/avatars/current.png',
    );
  });
}

test('the next page uses the updated database avatar with the same old access token', async () => {
  const current = { ...account, avatar: 'avatar2.jpg' };
  const item = strategy(current);
  const token = {
    ...payload,
    avatar: 'https://images.example.invalid/stale.png',
  };
  assert.equal(
    headerAvatar(await item.instance.validate(token)),
    '/public/media/avatars/avatar2.jpg',
  );
  current.avatar = 'https://images.example.invalid/avatars/replacement.png';
  assert.equal(
    headerAvatar(await item.instance.validate(token)),
    'https://images.example.invalid/avatars/replacement.png',
  );
});

for (const [avatar, expected] of [
  [null, '/public/media/avatars/avatar2.jpg'],
  ['ANHSV.png', '/public/media/avatars/ANHSV.png'],
]) {
  test(`shared header preserves the ${avatar === null ? 'default' : 'legacy'} avatar`, async () => {
    const item = strategy({ ...account, avatar });
    assert.equal(headerAvatar(await item.instance.validate(payload)), expected);
  });
}

test('student schedule passes the current avatar to the shared header', () => {
  const { ClientController } = loadTypeScript(
    path.join(root, 'src/client/client.controller.ts'),
    {
      '@nestjs/common': {},
      '@/common/decorators/permissions.decorator': {},
      '@/common/decorators/skip-transform.decorator': {},
      '@/client/client.service': {},
      '@/client/dto/client.dto': {},
    },
  );
  const controller = new ClientController({});
  const page = controller.testSchedule({
    user: {
      ...account,
      manhomquyen: 2,
      avatar: 'https://images.example.invalid/avatars/student.png',
    },
  });
  assert.equal(page.user_id, 'teacher-a');
  assert.equal(
    headerAvatar(page.user),
    'https://images.example.invalid/avatars/student.png',
  );
});
