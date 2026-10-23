const fs = require('node:fs');
const path = require('node:path');
const { Prisma } = require('@prisma/client');
const { loadTypeScript } = require('./load-typescript.cjs');
const root = path.resolve(__dirname, '../..');
const errors = loadTypeScript(
  path.join(root, 'src/common/exceptions/app.exception.ts'),
);
const noop = () => () => {};
class Logger {
  error() {}
  warn() {}
  log() {}
}
const metadata = new WeakMap();
const common = {
  ...errors,
  Logger,
  Injectable: noop,
  Controller: noop,
  Get: noop,
  Post: noop,
  Render: noop,
  UseInterceptors: noop,
  VERSION_NEUTRAL: 'neutral',
};
const permissionModule = loadTypeScript(
  path.join(root, 'src/common/decorators/permissions.decorator.ts'),
  {
    '@nestjs/common': {
      SetMetadata: (key, value) => (target, _name, descriptor) => {
        const subject = descriptor?.value ?? target;
        if (!metadata.has(subject)) metadata.set(subject, new Map());
        metadata.get(subject).set(key, value);
      },
    },
  },
);
const dto = loadTypeScript(path.join(root, 'src/exams/dto/exam.dto.ts'), {
  'class-transformer': {},
  'class-validator': {},
});
const { ExamsService } = loadTypeScript(
  path.join(root, 'src/exams/exams.service.ts'),
  {
    '@nestjs/common': common,
    '@prisma/client': { Prisma },
    '@/prisma/prisma.service': {},
    '@/storage/supabase-storage.service': {},
    '@/storage/image-cleanup': { removeUnreferencedImages: async () => {} },
    '@/common/utils/text.util': loadTypeScript(
      path.join(root, 'src/common/utils/text.util.ts'),
    ),
  },
);
const { ExamsController } = loadTypeScript(
  path.join(root, 'src/exams/exams.controller.ts'),
  {
    '@nestjs/common': common,
    '@nestjs/platform-express': { AnyFilesInterceptor: () => class {} },
    '@/common/config/upload.config': { MULTER_LIMITS: {} },
    '@/common/decorators/permissions.decorator': permissionModule,
    '@/common/decorators/skip-transform.decorator': { SkipTransform: noop },
    '@/exams/exams.service': { ExamsService },
    '@/exams/exams-export.service': {},
    '@/exams/dto/exam.dto': dto,
  },
  { decorators: true },
);
const { PermissionsGuard } = loadTypeScript(
  path.join(root, 'src/lib/passport/permissions.guard.ts'),
  {
    '@nestjs/common': {},
    '@nestjs/core': {},
    '@/prisma/prisma.service': {},
    '@/common/decorators/permissions.decorator': permissionModule,
    '@/common/exceptions/app.exception': errors,
  },
);
const permissions = JSON.parse(
  fs.readFileSync(path.join(root, 'src/seed-db/data/permissions.json'), 'utf8'),
);
const users = {
  'student-a': { id: 'student-a', manhomquyen: 2 },
  'student-b': { id: 'student-b', manhomquyen: 2 },
  'teacher-a': { id: 'teacher-a', manhomquyen: 1 },
  'teacher-b': { id: 'teacher-b', manhomquyen: 1 },
  admin: { id: 'admin', manhomquyen: 3 },
};

function fixture(options = {}) {
  const exam = {
    made: 42,
    nguoitao: 'teacher-a',
    monthi: 'subject-a',
    trangthai: 1,
    hienthibailam: 1,
    xemdapan: 1,
    xemdiemthi: 1,
    thoigianthi: 30,
    thoigianbatdau: new Date(Date.now() - 60000),
    thoigianketthuc: new Date(Date.now() + 3600000),
    ...options.exam,
  };
  const result = {
    makq: 7,
    made: 42,
    manguoidung: 'student-a',
    trangthai: 'Đã nộp',
    ...options.result,
  };
  const question = {
    macauhoi: 10,
    noidung: 'Controlled question',
    loai: 'mcq',
    dokho: 1,
    diem_cham_tuluan: 2,
    cautraloi: [
      {
        macautl: 100,
        macauhoi: 10,
        noidungtl: 'Controlled answer',
        ladapan: 1,
        hinhanh: null,
      },
    ],
  };
  let writes = 0;
  const prisma = {
    nguoiDung: { findUnique: async ({ where }) => users[where.id] ?? null },
    deThi: { findUnique: async () => (options.missingExam ? null : exam) },
    ketQua: {
      findUnique: async () => (options.missingResult ? null : result),
      findFirst: async () => result,
    },
    nhom: {
      findUnique: async () => ({
        manhom: 11,
        giangvien: 'teacher-a',
        trangthai: 1,
      }),
    },
    chiTietNhom: {
      count: async ({ where }) => (where.manguoidung === 'student-a' ? 1 : 0),
    },
    chiTietQuyen: {
      count: async ({ where }) =>
        permissions.filter(
          (p) =>
            p.manhomquyen === where.manhomquyen &&
            p.chucnang === where.chucnang &&
            p.hanhdong === where.hanhdong,
        ).length,
    },
    deThiTuDong: { findMany: async () => [] },
    giaoDeThi: { findMany: async () => [{ manhom: 11 }] },
    cauTraLoi: { findMany: async () => question.cautraloi },
    $queryRaw: async (query) =>
      query.sql.includes('SELECT DT.*') ? [exam] : [question],
  };
  const service = new ExamsService(prisma, {});
  const controller = new ExamsController(service, {});
  const reflector = {
    getAllAndOverride: (key, targets) =>
      targets
        .map((t) => metadata.get(t)?.get(key))
        .find((v) => v !== undefined),
  };
  async function dispatch(method, args, identity) {
    const user = users[identity];
    if (!user) throw new errors.UnauthorizedException();
    const req = { user };
    const guard = new PermissionsGuard(reflector, prisma);
    await guard.canActivate({
      getHandler: () => ExamsController.prototype[method],
      getClass: () => ExamsController,
      switchToHttp: () => ({ getRequest: () => req }),
    });
    return controller[method](...args, req);
  }
  return {
    exam,
    result,
    question,
    service,
    controller,
    prisma,
    dispatch,
    users,
    writes: () => writes,
    recordWrite: () => writes++,
  };
}
module.exports = { fixture, ExamsService, ExamsController, users, errors };
