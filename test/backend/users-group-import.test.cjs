'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');

// Real source methods and permission metadata; only Nest/DB/hash boundaries are
// substituted. This suite does not boot Nest, call HTTP or use a real database.
const source = (file) => path.resolve(__dirname, '../../src', file);
const noop = () => () => {};
const metadata = new WeakMap();
const common = {
  Injectable: noop,
  Controller: noop,
  Get: noop,
  Post: noop,
  Render: noop,
  UseInterceptors: noop,
  VERSION_NEUTRAL: Symbol('neutral'),
  Logger: class {
    error() {}
    warn() {}
    log() {}
  },
  SetMetadata: (key, value) => (_target, _property, descriptor) => {
    const handler = descriptor.value;
    const values = metadata.get(handler) ?? new Map();
    values.set(key, value);
    metadata.set(handler, values);
  },
};
const exceptions = loadTypeScript(source('common/exceptions/app.exception.ts'));
const permissions = loadTypeScript(
  source('common/decorators/permissions.decorator.ts'),
  {
    '@nestjs/common': common,
  },
);
const { UsersService } = loadTypeScript(source('users/users.service.ts'), {
  '@nestjs/common': common,
  '@prisma/client': {},
  '@nestjs/config': {},
  '@/prisma/prisma.service': {},
  '@/common/exceptions/app.exception': exceptions,
  '@/lib/bcrypt/bcrypt': {
    generatePasswordHash: async (password) => `test-hash:${password}`,
  },
  '@/common/utils/excel.util': {},
  '@/users/dto/create-user.dto': {},
  '@/users/dto/update-user.dto': {},
});
const { UsersController } = loadTypeScript(
  source('users/users.controller.ts'),
  {
    '@nestjs/common': common,
    '@nestjs/platform-express': { FileInterceptor: () => class {} },
    '@/common/config/upload.config': { MULTER_LIMITS: {} },
    '@/common/decorators/permissions.decorator': permissions,
    '@/common/decorators/skip-transform.decorator': { SkipTransform: noop },
    '@/users/users.service': { UsersService },
    '@/users/dto/create-user.dto': {},
    '@/users/dto/update-user.dto': {},
    '@/users/dto/user-query.dto': {},
  },
  { decorators: true },
);
const { PermissionsGuard } = loadTypeScript(
  source('lib/passport/permissions.guard.ts'),
  {
    '@nestjs/common': common,
    '@nestjs/core': {},
    '@/prisma/prisma.service': {},
    '@/common/decorators/permissions.decorator': permissions,
    '@/common/exceptions/app.exception': exceptions,
  },
);

const studentRow = (overrides = {}) => ({
  mssv: 'new-student',
  email: 'new-student@example.test',
  fullname: 'New Student',
  nhomquyen: 2,
  trangthai: 1,
  ...overrides,
});
const updateDto = (id, overrides = {}) => ({
  id,
  email: `${id}@example.test`,
  hoten: id,
  ...overrides,
});
const forbidden = (error) => error.statusCode === 403;

function fixture() {
  const accounts = new Map(
    [
      ['sv-a', { id: 'sv-a', manhomquyen: 2, trangthai: 1 }],
      ['sv-b', { id: 'sv-b', manhomquyen: 2, trangthai: 1 }],
      ['gv-a', { id: 'gv-a', manhomquyen: 1, trangthai: 1 }],
      ['gv-b', { id: 'gv-b', manhomquyen: 1, trangthai: 1 }],
      ['admin', { id: 'admin', manhomquyen: 3, trangthai: 1 }],
      ['custom', { id: 'custom', manhomquyen: 9, trangthai: 1 }],
    ].map(([id, data]) => [
      id,
      {
        ...data,
        email: `${id}@example.test`,
        hoten: id,
        avatar: 'ANHSV.png',
        matkhau: `private-hash:${id}`,
        otp: 'private-otp',
        token: 'private-token',
        googleid: 'private-google-id',
        ngaysinh: null,
        ngaythamgia: new Date('2020-01-01'),
      },
    ]),
  );
  const groups = new Map([
    [11, { manhom: 11, giangvien: 'gv-a', trangthai: 1, siso: 0 }],
    [22, { manhom: 22, giangvien: 'gv-b', trangthai: 1, siso: 0 }],
    [33, { manhom: 33, giangvien: 'gv-a', trangthai: 0, siso: 0 }],
  ]);
  const members = [];
  const pick = (row, select) =>
    !row
      ? null
      : !select
        ? { ...row }
        : Object.fromEntries(
            Object.keys(select)
              .filter((key) => select[key])
              .map((key) => [key, row[key]]),
          );
  const prisma = {
    nguoiDung: {
      findUnique: async ({ where, select }) => {
        const row =
          where.id !== undefined
            ? accounts.get(where.id)
            : [...accounts.values()].find(
                (value) => value.email === where.email,
              );
        return pick(row, select);
      },
      create: async ({ data }) => {
        if (accounts.has(data.id))
          throw Object.assign(new Error('Duplicate ID'), { code: 'P2002' });
        accounts.set(data.id, { ...data });
        return { ...data };
      },
      update: async ({ where, data }) => {
        const row = accounts.get(where.id);
        if (!row) throw new Error('Missing account');
        Object.assign(row, data);
        if (data.nhomQuyen)
          row.manhomquyen = data.nhomQuyen.connect.manhomquyen;
        return { ...row };
      },
    },
    nhom: {
      findUnique: async ({ where, select }) =>
        pick(groups.get(where.manhom), select),
      update: async ({ where, data }) =>
        Object.assign(groups.get(where.manhom), data),
    },
    chiTietNhom: {
      findFirst: async ({ where }) =>
        members.find(
          (member) =>
            member.manhom === where.manhom &&
            member.manguoidung === where.manguoidung,
        ) ?? null,
      create: async ({ data }) => {
        if (!groups.has(data.manhom)) throw new Error('Unknown group');
        members.push({ ...data });
        return data;
      },
      count: async ({ where }) =>
        members.filter((member) => member.manhom === where.manhom).length,
    },
    chiTietQuyen: {
      count: async ({ where }) =>
        [1, 3, 9].includes(where.manhomquyen) &&
        ['hocphan', 'nguoidung'].includes(where.chucnang) &&
        ['create', 'update', 'delete', 'view'].includes(where.hanhdong)
          ? 1
          : 0,
    },
  };
  const service = new UsersService(prisma, { get: () => '4' });
  const controller = new UsersController(service);
  const reflector = {
    getAllAndOverride: (key, targets) =>
      targets
        .map((target) => metadata.get(target)?.get(key))
        .find((value) => value !== undefined),
  };
  const guard = new PermissionsGuard(reflector, prisma);
  const context = (method, id) => ({
    getHandler: () => controller[method],
    getClass: () => UsersController,
    switchToHttp: () => ({ getRequest: () => ({ user: accounts.get(id) }) }),
  });
  return {
    accounts,
    groups,
    members,
    prisma,
    service,
    controller,
    guard,
    context,
  };
}

test('group import route denies student role through its actual permission metadata', async () => {
  const f = fixture();
  await assert.rejects(
    () => f.guard.canActivate(f.context('addFileExcelGroup', 'sv-a')),
    forbidden,
  );
});

for (const actor of ['sv-a', 'sv-b', 'gv-b', undefined]) {
  test(`group import rejects ${actor ?? 'missing actor'} before creating accounts`, async () => {
    const f = fixture();
    await assert.rejects(
      () =>
        f.service.addStudentsFromFile(
          [studentRow({ nhomquyen: 3 })],
          'password123',
          11,
          actor,
        ),
      forbidden,
    );
    assert.equal(f.accounts.has('new-student'), false);
    assert.deepEqual(f.members, []);
  });
}

for (const group of [33, 999]) {
  test(`group import rejects inactive/missing group ${group} before creating accounts`, async () => {
    const f = fixture();
    await assert.rejects(() =>
      f.service.addStudentsFromFile(
        [studentRow({ nhomquyen: 3 })],
        'password123',
        group,
        'gv-a',
      ),
    );
    assert.equal(f.accounts.has('new-student'), false);
  });
}

for (const actor of ['gv-a', 'admin']) {
  test(`authorized ${actor} group import forces student role/status despite crafted row`, async () => {
    const f = fixture();
    const result = await f.service.addStudentsFromFile(
      [studentRow({ nhomquyen: 3, trangthai: 0 })],
      'password123',
      11,
      actor,
    );
    assert.equal(result.status, 'success');
    assert.equal(f.accounts.get('new-student').manhomquyen, 2);
    assert.equal(f.accounts.get('new-student').trangthai, 1);
    assert.equal(f.groups.get(11).siso, 1);
    assert.deepEqual(f.members, [
      { manhom: 11, manguoidung: 'new-student', hienthi: 1 },
    ]);
  });
}

test('group import preserves existing student password and avoids duplicate membership', async () => {
  const f = fixture();
  const row = studentRow({ mssv: 'sv-b' });
  assert.equal(
    (await f.service.addStudentsFromFile([row], 'newpassword', 11, 'gv-a'))
      .status,
    'success',
  );
  await f.service.addStudentsFromFile([row], 'anotherpassword', 11, 'gv-a');
  assert.equal(f.accounts.get('sv-b').matkhau, 'private-hash:sv-b');
  assert.equal(f.members.length, 1);
  assert.equal(f.groups.get(11).siso, 1);
});

for (const target of ['gv-b', 'admin']) {
  test(`group student import does not attach existing ${target} as a student`, async () => {
    const f = fixture();
    const result = await f.service.addStudentsFromFile(
      [studentRow({ mssv: target })],
      'password123',
      11,
      'gv-a',
    );
    assert.equal(result.status, 'error');
    assert.deepEqual(f.members, []);
  });
}

test('controller uses authenticated actor for group import end to end through real service', async () => {
  const f = fixture();
  const result = await f.controller.addFileExcelGroup(
    { user: f.accounts.get('gv-a') },
    {
      listuser: JSON.stringify([studentRow()]),
      password: 'password123',
      group: 11,
    },
  );
  assert.equal(result.status, 'success');
  assert.equal(f.accounts.get('new-student').manhomquyen, 2);
});

test('user detail omits secrets while retaining editable profile fields', async () => {
  const f = fixture();
  const detail = await f.service.getDetail('admin');
  for (const key of ['matkhau', 'otp', 'token', 'googleid'])
    assert.equal(Object.hasOwn(detail, key), false, key);
  assert.equal(detail.id, 'admin');
  assert.equal(detail.email, 'admin@example.test');
  assert.equal(detail.manhomquyen, 3);
  assert.equal(detail.trangthai, 1);
});

test('teacher cannot promote self to admin', async () => {
  const f = fixture();
  await assert.rejects(
    () => f.service.update(updateDto('gv-a', { role: 3 }), 'gv-a'),
    forbidden,
  );
  assert.equal(f.accounts.get('gv-a').manhomquyen, 1);
});

test('teacher cannot grant a custom privileged role', async () => {
  const f = fixture();
  await assert.rejects(
    () => f.service.update(updateDto('sv-a', { role: 9 }), 'gv-a'),
    forbidden,
  );
  assert.equal(f.accounts.get('sv-a').manhomquyen, 2);
});

for (const method of ['update', 'delete', 'setStatus']) {
  test(`teacher cannot ${method} an existing admin`, async () => {
    const f = fixture();
    const action =
      method === 'update'
        ? () =>
            f.service.update(
              updateDto('admin', { password: 'attacker-password' }),
              'gv-a',
            )
        : method === 'delete'
          ? () => f.service.delete('admin', 'gv-a')
          : () => f.service.setStatus('admin', 0, 'gv-a');
    await assert.rejects(action, forbidden);
    assert.equal(f.accounts.get('admin').trangthai, 1);
    assert.equal(f.accounts.get('admin').matkhau, 'private-hash:admin');
  });
}

test('teacher retains authorized student management and admin retains admin-role assignment', async () => {
  const f = fixture();
  assert.equal(
    (
      await f.service.update(
        updateDto('sv-a', { hoten: 'Edited Student', role: 2 }),
        'gv-a',
      )
    ).status,
    'success',
  );
  assert.equal(f.accounts.get('sv-a').hoten, 'Edited Student');
  assert.equal(await f.service.setStatus('sv-a', 0, 'gv-a'), true);
  assert.equal(f.accounts.get('sv-a').trangthai, 0);
  assert.equal(
    (await f.service.update(updateDto('gv-b', { role: 3 }), 'admin')).status,
    'success',
  );
  assert.equal(f.accounts.get('gv-b').manhomquyen, 3);
});

test('generic user import denies teacher admin-role escalation before creation', async () => {
  const f = fixture();
  await assert.rejects(
    () =>
      f.service.addUsersFromFile(
        [studentRow({ nhomquyen: 3 })],
        'password123',
        'gv-a',
      ),
    forbidden,
  );
  assert.equal(f.accounts.has('new-student'), false);
});

test('generic user import retains configured roles for authorized admin', async () => {
  const f = fixture();
  assert.equal(
    (
      await f.service.addUsersFromFile(
        [studentRow({ nhomquyen: 3 })],
        'password123',
        'admin',
      )
    ).status,
    'success',
  );
  assert.equal(f.accounts.get('new-student').manhomquyen, 3);
});

test('teacher cannot import a custom privileged role', async () => {
  const f = fixture();
  await assert.rejects(
    () =>
      f.service.addUsersFromFile(
        [studentRow({ nhomquyen: 9 })],
        'password123',
        'gv-a',
      ),
    forbidden,
  );
  assert.equal(f.accounts.has('new-student'), false);
});

for (const method of ['addStudentsFromFile', 'addUsersFromFile']) {
  test(`${method} reports malformed JSON rows without an unhandled TypeError`, async () => {
    const f = fixture();
    const args =
      method === 'addStudentsFromFile'
        ? [[null], 'password123', 11, 'gv-a']
        : [[null], 'password123', 'gv-a'];
    assert.equal((await f.service[method](...args)).status, 'error');
    assert.equal(f.accounts.size, 6);
    assert.deepEqual(f.members, []);
  });
}
