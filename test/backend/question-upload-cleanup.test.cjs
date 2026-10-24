'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { Prisma } = require('@prisma/client');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
const root = path.resolve(__dirname, '../..');
class HttpError extends Error {}
class Logger {
  error() {}
  warn() {}
}
const common = {
  ForbiddenException: HttpError,
  NotFoundException: HttpError,
  Logger,
};
const { removeUnreferencedImages } = loadTypeScript(
  path.join(root, 'src/storage/image-cleanup.ts'),
  {
    '@nestjs/common': common,
    '@prisma/client': { Prisma },
  },
);
const { QuestionsService } = loadTypeScript(
  path.join(root, 'src/questions/questions.service.ts'),
  {
    '@nestjs/common': common,
    '@prisma/client': { Prisma },
    '@/prisma/prisma.service': {},
    '@/storage/supabase-storage.service': {},
    '@/storage/image-cleanup': { removeUnreferencedImages },
    '@/questions/question-file.parser': {},
  },
);
const asset = (name) =>
  `https://fixture.invalid/storage/v1/object/public/test/questions/${name}.png`;
const oldMain = asset('old-main');
const oldOption = asset('shared-option');
const file = (fieldname) => ({
  fieldname,
  buffer: Buffer.from('fixture-image'),
});
const files = () => [
  file('hinhanh'),
  file('option_hinhanh[]'),
  file('option_hinhanh[]'),
];
const input = (extra = {}) => ({
  id: '11',
  mamon: 'TEST',
  machuong: '1',
  dokho: '1',
  loai: 'mcq',
  noidung: 'Question',
  cautraloi: JSON.stringify([{ content: 'A', check: true }, { content: 'B' }]),
  ...extra,
});

function fixture(options = {}) {
  let inTransaction = false;
  let uploaded = 0;
  let question = {
    macauhoi: 11,
    nguoitao: 'teacher',
    mamonhoc: 'TEST',
    trangthai: 1,
    hinhanh: oldMain,
    madv: null,
  };
  let answers = [{ hinhanh: oldOption }];
  const objects = new Set([oldMain, oldOption]);
  const referencedElsewhere = new Set([
    oldOption,
    ...(options.sharedNew ? [asset('new-1')] : []),
  ]);
  const storage = {
    ownedObjectPath: (url) =>
      typeof url === 'string' &&
      url.startsWith('https://fixture.invalid/storage/v1/object/public/test/')
        ? new URL(url).pathname
        : null,
    uploadImage: async () => {
      assert.equal(
        inTransaction,
        false,
        'upload must happen before the DB transaction',
      );
      uploaded++;
      if (uploaded === options.failUpload)
        throw new Error('Fixture upload failed');
      const url = asset(`new-${uploaded}`);
      objects.add(url);
      return url;
    },
    remove: async (url) => {
      assert.equal(inTransaction, false);
      objects.delete(url);
    },
  };
  const prisma = {
    nguoiDung: { findUnique: async () => ({ manhomquyen: 1, trangthai: 1 }) },
    phanCong: { count: async () => 1 },
    cauHoi: {
      findUnique: async () => ({ ...question }),
      create: async ({ data }) => {
        question = { ...question, ...data };
        answers = [];
        return { macauhoi: 11 };
      },
      update: async ({ data }) => {
        question = { ...question, ...data };
        return question;
      },
    },
    cauTraLoi: {
      findMany: async () => answers.map((row) => ({ ...row })),
      deleteMany: async () => {
        answers = [];
      },
      create: async ({ data }) => {
        answers.push({ ...data });
      },
    },
    $queryRaw: async () => {
      assert.equal(
        inTransaction,
        false,
        'cleanup must query committed or rolled-back state',
      );
      if (options.failCleanup)
        throw new Error('Fixture reference query failed');
      return [
        question.hinhanh,
        ...answers.map((row) => row.hinhanh),
        ...referencedElsewhere,
      ]
        .filter(Boolean)
        .map((url) => ({ url }));
    },
    $transaction: async (run) => {
      const beforeQuestion = { ...question };
      const beforeAnswers = answers.map((row) => ({ ...row }));
      inTransaction = true;
      try {
        const result = await run(prisma);
        if (options.failCommit) throw new Error('Fixture commit failed');
        return result;
      } catch (error) {
        question = beforeQuestion;
        answers = beforeAnswers;
        throw error;
      } finally {
        inTransaction = false;
      }
    },
  };
  return {
    service: new QuestionsService(prisma, storage),
    objects,
    get question() {
      return question;
    },
    get answers() {
      return answers;
    },
    get uploaded() {
      return uploaded;
    },
  };
}

for (const mode of ['add', 'edit']) {
  const run = (f, data = input(), attachments = files()) =>
    mode === 'add'
      ? f.service.addQuestion(data, attachments, 'teacher')
      : f.service.editQuestion(data, attachments, 'teacher');
  test(`${mode}: partial upload failure removes every completed upload`, async () => {
    const f = fixture({ failUpload: 3 });
    await run(f).catch(() => {});
    assert.deepEqual([...f.objects].sort(), [oldMain, oldOption].sort());
    assert.equal(f.question.hinhanh, oldMain);
  });
  test(`${mode}: commit failure removes new images and preserves original references`, async () => {
    const f = fixture({ failCommit: true });
    assert.equal((await run(f)).status, 'error');
    assert.deepEqual([...f.objects].sort(), [oldMain, oldOption].sort());
    assert.equal(f.question.hinhanh, oldMain);
  });
  test(`${mode}: successful write retains saved images and removes unused uploads`, async () => {
    const f = fixture();
    const result = await run(
      f,
      input({ cautraloi: JSON.stringify([{ content: 'A', check: true }]) }),
    );
    assert.equal(result.status, 'success');
    assert.ok(f.objects.has(f.question.hinhanh));
    assert.ok(f.objects.has(f.answers[0].hinhanh));
    assert.equal(f.objects.has(asset('new-3')), false);
    assert.ok(
      f.objects.has(oldOption),
      'another saved row still references this image',
    );
  });
  test(`${mode}: cleanup query failure does not turn a committed write into an error`, async () => {
    const f = fixture({ failCleanup: true });
    assert.equal((await run(f)).status, 'success');
    assert.ok(f.objects.has(f.question.hinhanh));
  });
  test(`${mode}: failed write retains an uploaded URL referenced by another row`, async () => {
    const f = fixture({ failCommit: true, sharedNew: true });
    assert.equal((await run(f)).status, 'error');
    assert.deepEqual(
      [...f.objects].sort(),
      [oldMain, oldOption, asset('new-1')].sort(),
    );
  });
  test(`${mode}: rejected reading input leaves no uploaded objects`, async () => {
    const f = fixture();
    const result = await run(
      f,
      input({ loai: 'reading', doanvan_noidung: '', cautraloi: '[]' }),
    );
    assert.equal(result.status, 'error');
    assert.deepEqual([...f.objects].sort(), [oldMain, oldOption].sort());
  });
}
