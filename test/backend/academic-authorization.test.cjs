'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');

const root = path.resolve(__dirname, '../..');
class HttpError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
class ForbiddenException extends HttpError {
  constructor(message) { super(message, 403); }
}
class NotFoundException extends HttpError {
  constructor(message) { super(message, 404); }
}
const metadata = new WeakMap();
const noopDecorator = () => () => {};
const common = {
  ForbiddenException, NotFoundException,
  Controller: noopDecorator, Get: noopDecorator, Post: noopDecorator,
  Render: noopDecorator, VERSION_NEUTRAL: 'neutral',
};
const permissionModule = loadTypeScript(path.join(root, 'src/common/decorators/permissions.decorator.ts'), {
  '@nestjs/common': { SetMetadata: (_key, value) => (target, _property, descriptor) => {
    metadata.set(descriptor?.value ?? target, value);
  } },
});

// The source loader evaluates actual class/method decorators. Only transport
// decorator effects and external dependencies are stubbed; permissions and the
// guard are real source. This is deliberately narrower than Nest HTTP coverage.
function loadController(relativePath, name, extra = {}) {
  const filename = path.join(root, relativePath);
  const imports = {
    '@nestjs/common': common,
    '@/common/decorators/permissions.decorator': permissionModule,
    '@/common/decorators/skip-transform.decorator': { SkipTransform: noopDecorator },
    ...extra,
  };
  return loadTypeScript(filename, imports, { decorators: true })[name];
}

const { PermissionsGuard } = loadTypeScript(path.join(root, 'src/lib/passport/permissions.guard.ts'), {
  '@nestjs/common': {}, '@nestjs/core': {}, '@/prisma/prisma.service': {},
  '@/common/decorators/permissions.decorator': { PERMISSIONS_KEY: 'permissions' },
  '@/common/exceptions/app.exception': { ForbiddenException },
});
const seededPermissions = JSON.parse(fs.readFileSync(path.join(root, 'src/seed-db/data/permissions.json'), 'utf8'));
async function authorize(C, method, role) {
  const guard = new PermissionsGuard({
    getAllAndOverride: (_key, targets) => targets.map((target) => metadata.get(target)).find(Boolean),
  }, { chiTietQuyen: { count: async ({ where }) => seededPermissions.filter((p) =>
    p.manhomquyen === where.manhomquyen && p.chucnang === where.chucnang && p.hanhdong === where.hanhdong,
  ).length } });
  return guard.canActivate({
    getHandler: () => C.prototype[method], getClass: () => C,
    switchToHttp: () => ({ getRequest: () => ({ user: role == null ? undefined : { id: `role-${role}`, manhomquyen: role } }) }),
  });
}

const AssignmentsController = loadController('src/assignments/assignments.controller.ts', 'AssignmentsController', {
  '@/assignments/assignments.service': {}, '@/assignments/dto/assignment.dto': {},
});
for (const method of ['getGiangVien', 'getMonHoc', 'getNamHoc', 'getHocKy', 'getTotalPages', 'paginate', 'checkDuplicate', 'addAssignment', 'checkDuplicateForUpdate', 'update', 'delete']) {
  for (const role of [2, 1]) {
    test(`assignment ${method} denies seeded ${role === 2 ? 'student' : 'teacher'} role`, async () => {
      await assert.rejects(authorize(AssignmentsController, method, role), { status: 403 });
    });
  }
  test(`assignment ${method} retains seeded administrator access`, async () => {
    assert.equal(await authorize(AssignmentsController, method, 3), true);
  });
}

const sql = (strings, ...values) => ({ strings: [...strings], values });
const { ClientService } = loadTypeScript(path.join(root, 'src/client/client.service.ts'), {
  '@nestjs/common': common, '@prisma/client': { Prisma: { sql, empty: { strings: [], values: [] } } },
  '@/prisma/prisma.service': {}, '@/class-modules/class-modules.service': {},
});
const ClientController = loadController('src/client/client.controller.ts', 'ClientController', {
  '@/client/client.service': {}, '@/client/dto/client.dto': {},
});
function allValues(query) {
  return query.values.flatMap((value) => value && Array.isArray(value.values) ? allValues(value) : [value]);
}
for (const method of ['pagination', 'getTotalPages']) {
  test(`client ${method} uses JWT identity when student A submits student B`, async () => {
    let query;
    const service = new ClientService({ $queryRaw: async (q) => { query = q; return []; } }, {});
    const controller = new ClientController(service);
    await controller[method]({ args: JSON.stringify({ manguoidung: 'student-B', page: 1, limit: 10 }) }, { user: { id: 'student-A' } });
    assert.equal(allValues(query).filter((v) => v === 'student-A').length, 2);
    assert.equal(allValues(query).includes('student-B'), false);
  });
}
test('client friend list denies a student outside the requested group', async () => {
  let rosterRead = false;
  const service = new ClientService({ chiTietNhom: { count: async () => 0 } }, {
    getSvList: async () => { rosterRead = true; return [{ id: 'student-B', email: 'fixture@example.invalid' }]; },
  });
  await assert.rejects(service.getFriendList(202, 'student-A'), { status: 403 });
  assert.equal(rosterRead, false);
});
test('client friend list retains members and removes the caller', async () => {
  const service = new ClientService({ chiTietNhom: { count: async () => 1 } }, {
    getSvList: async () => [{ id: 'student-A' }, { id: 'student-B' }],
  });
  assert.deepEqual(await service.getFriendList(101, 'student-A'), [{ id: 'student-B' }]);
});
test('student invitation join still adds the JWT user through the invitation path', async () => {
  let added;
  const service = new ClientService({ nhom: { findFirst: async () => ({ manhom: 101 }) } }, {
    join: async (...args) => { added = args; return true; },
    getDetailGroup: async () => ({ manhom: 101, tennhom: 'Fixture' }),
  });
  const controller = new ClientController(service);
  assert.deepEqual(await controller.joinGroup({ user: { id: 'student-A' } }, { mamoi: 'fixture' }), { manhom: 101, tennhom: 'Fixture' });
  assert.deepEqual(added, [101, 'student-A']);
});

const { ClassModulesService } = loadTypeScript(path.join(root, 'src/class-modules/class-modules.service.ts'), {
  crypto: require('node:crypto'), '@nestjs/common': common, '@nestjs/config': {},
  '@prisma/client': { Prisma: { sql, empty: {} } }, '@/prisma/prisma.service': {},
  '@/lib/bcrypt/bcrypt': { generatePasswordHash: async () => 'fixture-hash' },
  '@/common/utils/excel.util': {
    createWorkbook: () => ({ workbook: {}, sheet: {} }),
    setColumnWidths() {}, writeHeaderRow() {}, workbookToDataUri: async () => ({ status: 'success' }),
  },
});
const ClassModulesController = loadController('src/class-modules/class-modules.controller.ts', 'ClassModulesController', {
  '@/class-modules/class-modules.service': {}, '@/class-modules/dto/class-modules.dto': {},
});
const groupOperations = {
  update: { manhom: 202, tennhom: 'Changed', monhoc: 'M', namhoc: 1, hocky: 1 },
  delete: { manhom: 202 }, hide: { manhom: 202, giatri: 0 }, getDetail: { manhom: 202 },
  getTotalPages: { args: JSON.stringify({ manhom: 202 }) }, paginate: { args: JSON.stringify({ manhom: 202 }) },
  getSvList: { manhom: 202 }, getInvitedCode: { manhom: 202 }, updateInvitedCode: { manhom: 202 },
  checkAcc: { manhom: 202, mssv: 'student-A' }, addSvGroup: { manhom: 202, mssv: 'student-A' },
  addSV: { manhom: 202, mssv: 'new-student', hoten: 'Fixture', password: 'fixture-only' },
  addStudentsByClassCode: { manhom: 202, malop: 'fixture' },
  kickUser: { manhom: 202, manguoidung: 'student-B' }, getGroupSize: { manhom: 202 },
  exportExcelStudentS: { manhom: 202 },
};
function groupFixture(actor = 'teacher-A') {
  const persistedRole = actor === 'admin' ? 3 : actor.startsWith('student') ? 2 : 1;
  const group = { manhom: 202, giangvien: 'teacher-B', siso: 1, mamoi: 'fixture', trangthai: 1 };
  let accesses = 0;
  const restricted = async () => { accesses++; return []; };
  const prisma = {
    nguoiDung: { findUnique: async () => ({ id: actor, manhomquyen: persistedRole, trangthai: 1 }), count: async () => 0, create: restricted },
    nhom: { findUnique: async () => ({ ...group }), count: async () => 0, update: restricted, delete: restricted },
    chiTietNhom: { count: async () => 0, deleteMany: restricted, create: restricted },
    chiTietThongBao: { count: async () => 0 }, giaoDeThi: { count: async () => 0 },
    $queryRaw: restricted,
  };
  const service = new ClassModulesService(prisma, { get: () => '10' });
  return { service, controller: new ClassModulesController(service), get accesses() { return accesses; } };
}
for (const [method, dto] of Object.entries(groupOperations)) {
  test(`group ${method} denies teacher A on teacher B group before private data/side effects`, async () => {
    const fixture = groupFixture();
    await assert.rejects(async () => fixture.controller[method](dto, { user: { id: 'teacher-A', manhomquyen: 3 } }), { status: 403 });
    assert.equal(fixture.accesses, 0);
  });
}
for (const method of ['checkAcc', 'addSvGroup', 'addSV', 'addStudentsByClassCode', 'kickUser', 'getSvList', 'getGroupSize', 'exportExcelStudentS']) {
  test(`group ${method} denies student management through seeded role guard`, async () => {
    await assert.rejects(authorize(ClassModulesController, method, 2), { status: 403 });
  });
}
test('group ownership policy retains the group teacher and authoritative DB admin', async () => {
  for (const actor of ['teacher-B', 'admin']) {
    const fixture = groupFixture(actor);
    assert.deepEqual(await fixture.controller.getDetail({ manhom: 202 }, { user: { id: actor, manhomquyen: 1 } }), {
      success: true, data: { manhom: 202, giangvien: 'teacher-B', siso: 1, mamoi: 'fixture', trangthai: 1 },
    });
  }
});
test('group membership insertion refuses an administrator account', async () => {
  let inserted = false;
  const service = new ClassModulesService({
    nguoiDung: { findUnique: async () => ({ id: 'admin', manhomquyen: 3, trangthai: 1 }) },
    nhom: { findUnique: async () => ({ manhom: 202, trangthai: 1 }), update: async () => {} },
    chiTietNhom: { count: async () => 0, create: async () => { inserted = true; } },
  }, {});
  assert.equal(await service.addSvGroup(202, 'admin'), false);
  assert.equal(inserted, false);
});
test('group membership insertion retains active student account joining', async () => {
  let inserted;
  const service = new ClassModulesService({
    nguoiDung: { findUnique: async () => ({ id: 'student-A', manhomquyen: 2, trangthai: 1 }) },
    nhom: { findUnique: async () => ({ manhom: 202, trangthai: 1 }), update: async () => {} },
    chiTietNhom: { count: async () => 0, create: async ({ data }) => { inserted = data; } },
  }, {});
  assert.equal(await service.addSvGroup(202, 'student-A'), true);
  assert.deepEqual(inserted, { manhom: 202, manguoidung: 'student-A', hienthi: 1 });
});
