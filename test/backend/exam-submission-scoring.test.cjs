'use strict';

const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const path = require('node:path');
const test = require('node:test');
const { Prisma } = require('@prisma/client');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');

const root = path.join(__dirname, '../..');
const logger = { Logger: class { error() {} warn() {} } };
const textUtils = loadTypeScript(path.join(root, 'src/common/utils/text.util.ts'));
const imageCleanup = loadTypeScript(path.join(root, 'src/storage/image-cleanup.ts'), {
  '@nestjs/common': logger, '@prisma/client': { Prisma },
});
const { ExamsService } = loadTypeScript(path.join(root, 'src/exams/exams.service.ts'), {
  '@nestjs/common': logger, '@prisma/client': { Prisma },
  '@/prisma/prisma.service': {}, '@/storage/supabase-storage.service': {},
  '@/storage/image-cleanup': imageCleanup, '@/common/utils/text.util': textUtils,
});

// Source unit tests, not HTTP/DTO/Nest DI tests. Database and Storage are explicit
// boundaries; service methods, Decimal conversion, essay helpers and cleanup run
// from current source. Fixtures include questions outside the exam deliberately.
const questions = [
  { macauhoi: 11, loai: 'mcq' }, { macauhoi: 12, loai: 'mcq' },
  { macauhoi: 21, loai: 'reading' }, { macauhoi: 22, loai: 'reading' },
  { macauhoi: 31, loai: 'essay' }, { macauhoi: 98, loai: 'essay' },
  { macauhoi: 99, loai: 'mcq' },
];
const answers = [
  { macautl: 101, macauhoi: 11, ladapan: 1 },
  { macautl: 102, macauhoi: 11, ladapan: 0 },
  { macautl: 103, macauhoi: 12, ladapan: 1 },
  { macautl: 104, macauhoi: 12, ladapan: 0 },
  { macautl: 201, macauhoi: 21, ladapan: 1 },
  { macautl: 202, macauhoi: 21, ladapan: 0 },
  { macautl: 203, macauhoi: 22, ladapan: 1 },
  { macautl: 204, macauhoi: 22, ladapan: 0 },
  { macautl: 99901, macauhoi: 99, ladapan: 1 },
];
const asset = (name) => `https://fixture.invalid/images/${name}.png`;

function matches(value, condition) {
  if (condition === undefined) return true;
  if (condition && typeof condition === 'object' && condition.in) {
    return condition.in.includes(value);
  }
  return value === condition;
}

function harness(options = {}) {
  const examIds = options.examIds ?? [11, 12, 21, 22, 31];
  let state = {
    choices: [], result: null,
    essays: [{ id: 301, makq: 7, macauhoi: 31, noidung: 'Previous essay' }],
    images: options.images ?? [],
  };
  const trace = [];
  const transactionContext = new AsyncLocalStorage();
  let transactionQueue = Promise.resolve();
  let resultReads = 0;
  let releaseReads;
  const readsReady = new Promise((resolve) => { releaseReads = resolve; });
  let uploads = 0;
  let commitFailures = options.failCommit ? Infinity : options.failCommits ?? 0;
  const delegates = (draft) => ({
    chiTietKetQua: {
      upsert: async ({ where, create, update }) => {
        trace.push('choice-write');
        const row = draft.choices.find((entry) =>
          entry.macauhoi === where.makq_macauhoi.macauhoi,
        );
        if (row) Object.assign(row, update);
        else draft.choices.push({ ...create });
        return row ?? create;
      },
    },
    cauTraLoi: {
      count: async ({ where }) => answers.filter((row) =>
        Object.entries(where).every(([key, value]) => matches(row[key], value)),
      ).length,
    },
    deThi: { findUnique: async () => ({
      diem_tracnghiem: new Prisma.Decimal(options.mcqTotal ?? 6),
      diem_dochieu: new Prisma.Decimal(options.readingTotal ?? 4),
    }) },
    traLoiTuLuan: {
      findFirst: async ({ where }) => draft.essays.find((row) =>
        row.makq === where.makq && row.macauhoi === where.macauhoi,
      ) ?? null,
      update: async ({ where, data }) => {
        trace.push('essay-write');
        const row = draft.essays.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }) => {
        trace.push('essay-write');
        const row = { id: 302 + draft.essays.length, ...data };
        draft.essays.push(row);
        return row;
      },
    },
    hinhAnhTraLoiTuLuan: {
      findMany: async ({ where }) => draft.images.filter((row) => row.traloi_id === where.traloi_id),
      deleteMany: async ({ where }) => {
        trace.push('image-write');
        draft.images = draft.images.filter((row) => row.traloi_id !== where.traloi_id);
        return { count: 1 };
      },
      create: async ({ data }) => {
        trace.push('image-write');
        draft.images.push({ ...data });
        return data;
      },
    },
    ketQua: {
      updateMany: async ({ where, data }) => {
        assert.equal(where.makq, 7);
        assert.equal(where.diemthi, null);
        assert.equal(data.trangthai, 'Đã nộp');
        trace.push('claim');
        if (draft.result) return { count: 0 };
        draft.claimed = true;
        return { count: 1 };
      },
      update: async ({ data }) => {
        trace.push('result-write');
        draft.result = { ...data };
        return data;
      },
    },
    $queryRaw: async () => [{
      cnt: questions.filter((row) => examIds.includes(row.macauhoi) && row.loai === 'essay').length,
    }],
  });
  const prisma = {
    ketQua: { findFirst: async () => {
      const snapshot = options.completed || state.result ? null : {
        makq: 7, thoigianvaothi: new Date(Date.now() - 120000),
      };
      if (options.concurrentReads && resultReads < 2) {
        resultReads++;
        if (resultReads === 2) releaseReads();
        await readsReady;
      }
      return snapshot;
    } },
    chiTietDeThi: { findMany: async ({ where }) => {
      assert.equal(where.made, 42);
      return examIds.map((macauhoi) => ({ macauhoi }));
    } },
    cauHoi: { findMany: async ({ where }) => questions.filter((row) =>
      matches(row.macauhoi, where.macauhoi),
    ) },
    cauTraLoi: { findMany: async ({ where }) => answers.filter((row) =>
      Object.entries(where).every(([key, value]) => matches(row[key], value)),
    ) },
    $queryRaw: async () => state.images.map((row) => ({ url: row.hinhanh })),
    $transaction: (callback) => {
      // Serialize transactions touching this result, modeling the row update
      // lock and predicate recheck. Both initial reads can still see null.
      const operation = transactionQueue.then(() => transactionContext.run(true, async () => {
        trace.push('transaction');
        const draft = structuredClone(state);
        const result = await callback(delegates(draft));
        if (commitFailures > 0) {
          commitFailures--;
          throw new Error('Fixture commit rejected');
        }
        state = draft;
        trace.push('commit');
        return result;
      }));
      transactionQueue = operation.catch(() => {});
      return operation;
    },
  };
  const storage = {
    uploadBase64: async (value, folder) => {
      assert.notEqual(transactionContext.getStore(), true, 'upload must precede its transaction');
      assert.equal(folder, 'essays');
      trace.push('upload');
      return options.uploadUrls?.[uploads++] ?? asset('new-essay');
    },
    ownedObjectPath: (url) => url?.startsWith('https://fixture.invalid/images/')
      ? url.slice('https://fixture.invalid/images/'.length) : null,
    remove: async (url) => {
      assert.notEqual(transactionContext.getStore(), true, 'cleanup must follow its transaction');
      if (url === asset('old-essay')) assert.equal(trace.includes('commit'), true);
      trace.push(`remove:${url}`);
    },
  };
  return {
    service: new ExamsService(prisma, storage),
    trace,
    state: () => state,
  };
}

function choice(macauhoi, cautraloi, thutu = 1) {
  return { macauhoi, cautraloi, thutu };
}
function essay(macauhoi = 31, index = 0, image = false) {
  return {
    [`essay_${index}_exists`]: '1', [`essay_${index}_macauhoi`]: String(macauhoi),
    [`essay_${index}_noidung`]: 'Submitted essay', [`essay_${index}_thutu`]: '5',
    ...(image ? { [`essay_${index}_image_0`]: 'data:image/png;base64,bmV3' } : {}),
  };
}
function body(choices, extra = {}) {
  return { listCauTraLoi: JSON.stringify(choices), ...extra };
}

test('omitted MCQ questions stay in the server denominator', async () => {
  const h = harness();
  assert.deepEqual(await h.service.submit(42, 'SV-A', body([choice(11, 101)])), { success: true, makq: 7 });
  assert.equal(h.state().result.diemthi, 3); // 6 section points / 2 exam questions.
  assert.equal(h.state().result.socaudung, 1);
});

test('omitted reading questions stay in the server denominator', async () => {
  const h = harness();
  assert.equal((await h.service.submit(42, 'SV-A', body([choice(21, 201)]))).success, true);
  assert.equal(h.state().result.diemthi, 2); // 4 section points / 2 exam questions.
  assert.equal(h.state().result.diem_dochieu, 2);
});

test('valid mixed MCQ, reading, essay and image submission retains its flow', async () => {
  const h = harness({ images: [{ traloi_id: 301, hinhanh: asset('old-essay') }] });
  const result = await h.service.submit(42, 'SV-A', body([
    choice(11, 101, 1), choice(12, 104, 2), choice(21, 201, 3), choice(22, 0, 4),
  ], essay(31, 0, true)));
  assert.deepEqual(result, { success: true, makq: 7 });
  assert.equal(h.state().result.diemthi, 5);
  assert.equal(h.state().result.diem_dochieu, 2);
  assert.equal(h.state().result.socaudung, 2);
  assert.equal(h.state().result.trangthai, 'Đã nộp');
  assert.equal(h.state().result.trangthai_tuluan, 'Chưa chấm');
  assert.equal(h.state().essays[0].noidung, 'Submitted essay');
  assert.deepEqual(h.state().images, [{ traloi_id: 301, hinhanh: asset('new-essay') }]);
  assert.deepEqual(h.state().choices.map((row) => [row.macauhoi, row.dapanchon]), [
    [11, 101], [12, 104], [21, 201], [22, null], [31, null],
  ]);
  assert.ok(h.trace.indexOf('upload') < h.trace.indexOf('transaction'));
  assert.ok(h.trace.indexOf(`remove:${asset('old-essay')}`) > h.trace.indexOf('commit'));
});

test('all correct questions earn each section maximum exactly once', async () => {
  const h = harness();
  await h.service.submit(42, 'SV-A', body([
    choice(11, 101), choice(12, 103), choice(21, 201), choice(22, 203),
  ]));
  assert.equal(h.state().result.diemthi, 10);
  assert.equal(h.state().result.diem_dochieu, 4);
  assert.equal(h.state().result.socaudung, 4);
});

for (const { name, entries } of [
  { name: 'all valid wrong answers', entries: [choice(11, 102), choice(12, 104), choice(21, 202), choice(22, 204)] },
  { name: 'all explicit unanswered questions', entries: [choice(11, 0), choice(12, 0), choice(21, 0), choice(22, 0)] },
  { name: 'all omitted questions', entries: [] },
]) {
  test(`${name} score zero and still await the exam essay`, async () => {
    const h = harness();
    assert.equal((await h.service.submit(42, 'SV-A', body(entries))).success, true);
    assert.equal(h.state().result.diemthi, 0);
    assert.equal(h.state().result.socaudung, 0);
    assert.equal(h.state().result.trangthai_tuluan, 'Chưa chấm');
  });
}

const invalidCases = [
  ['duplicate identical choices', body([choice(11, 101), choice(11, 101)], essay(31, 0, true))],
  ['duplicate conflicting choices', body([choice(11, 101), choice(11, 102)], essay(31, 0, true))],
  ['question outside this exam', body([choice(99, 99901)], essay(31, 0, true))],
  ['nonexistent question', body([choice(999, 101)], essay(31, 0, true))],
  ['nonexistent answer', body([choice(11, 999)], essay(31, 0, true))],
  ['answer belonging to another exam question', body([choice(11, 103)], essay(31, 0, true))],
  ['answer belonging to a question outside this exam', body([choice(11, 99901)], essay(31, 0, true))],
  ['negative answer ID', body([choice(11, -101)], essay(31, 0, true))],
  ['partially numeric question ID', body([choice('11invalid', 101)], essay(31, 0, true))],
  ['malformed choice JSON', { listCauTraLoi: '[bad', ...essay(31, 0, true) }],
  ['choice JSON object instead of array', { listCauTraLoi: '{}', ...essay(31, 0, true) }],
  ['null choice entry', body([null], essay(31, 0, true))],
  ['primitive choice entry', body([11], essay(31, 0, true))],
  ['essay question in multiple-choice payload', body([choice(31, 0)], essay(31, 0, true))],
  ['essay question outside this exam', body([], essay(98, 0, true))],
  ['MCQ question submitted as essay', body([], essay(11, 0, true))],
  ['duplicate essay question under different indices', body([], { ...essay(31, 0, true), ...essay(31, 1, true) })],
  ['essay fields without a question ID', body([], { essay_0_exists: '1', essay_0_image_0: 'data:image/png;base64,bmV3' })],
];
for (const [name, payload] of invalidCases) {
  // These must fail before uploading even valid essay attachments or persisting
  // any answer. Invalid IDs must never become FK-less detail/essay rows.
  test(`rejects ${name} before uploads and persistence`, async () => {
    const h = harness();
    const result = await h.service.submit(42, 'SV-A', payload);
    assert.equal(result.success, false);
    assert.equal(result.makq, null);
    assert.ok(result.message && result.message !== 'Lỗi hệ thống', 'validation should return a clear message');
    assert.deepEqual(h.trace, []);
    assert.equal(h.state().result, null);
    assert.deepEqual(h.state().choices, []);
  });
}

test('completed submission cannot upload or replace saved answers', async () => {
  const h = harness({ completed: true });
  const result = await h.service.submit(42, 'SV-A', body([choice(11, 101)], essay(31, 0, true)));
  assert.equal(result.success, false);
  assert.deepEqual(h.trace, []);
  assert.equal(h.state().result, null);
});

test('failed commit preserves old essay attachments and skips storage cleanup', async () => {
  const previous = [{ traloi_id: 301, hinhanh: asset('old-essay') }];
  const h = harness({ failCommit: true, images: previous });
  assert.equal((await h.service.submit(42, 'SV-A', body([], essay(31)))).success, false);
  assert.deepEqual(h.state().images, previous);
  assert.equal(h.state().result, null);
  assert.equal(h.trace.some((event) => event.startsWith('remove:')), false);
});

test('exam with no essay is immediately marked graded', async () => {
  const h = harness({ examIds: [11, 12] });
  assert.equal((await h.service.submit(42, 'SV-A', body([choice(11, 101), choice(12, 0)]))).success, true);
  assert.equal(h.state().result.diemthi, 3);
  assert.equal(h.state().result.trangthai_tuluan, 'Đã chấm');
});

test('concurrent submissions claim the result once and cannot overwrite its score', async () => {
  const h = harness({ concurrentReads: true });
  const results = await Promise.all([
    h.service.submit(42, 'SV-A', body([choice(11, 101)])),
    h.service.submit(42, 'SV-A', body([choice(12, 104)])),
  ]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results[0].success, true);
  assert.equal(results[1].message, 'Bài đã nộp hoặc không tồn tại');
  assert.equal(h.state().result.diemthi, 3);
  assert.equal(h.trace.filter((event) => event === 'result-write').length, 1);
});

test('losing concurrent submit removes only its newly uploaded unreferenced images', async () => {
  const winner = asset('winner-essay');
  const loser = asset('loser-essay');
  const h = harness({
    concurrentReads: true,
    images: [{ traloi_id: 301, hinhanh: asset('old-essay') }],
    uploadUrls: [winner, loser],
  });
  const results = await Promise.all([
    h.service.submit(42, 'SV-A', body([choice(11, 101)], essay(31, 0, true))),
    h.service.submit(42, 'SV-A', body([choice(12, 104)], essay(31, 0, true))),
  ]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.deepEqual(h.state().images, [{ traloi_id: 301, hinhanh: winner }]);
  assert.equal(h.trace.includes(`remove:${loser}`), true);
  assert.equal(h.trace.includes(`remove:${winner}`), false);
  assert.equal(h.trace.includes(`remove:${asset('old-essay')}`), true);
});

test('losing concurrent submit retains an upload URL referenced by the winner', async () => {
  const h = harness({ concurrentReads: true });
  const results = await Promise.all([
    h.service.submit(42, 'SV-A', body([choice(11, 101)], essay(31, 0, true))),
    h.service.submit(42, 'SV-A', body([choice(12, 104)], essay(31, 0, true))),
  ]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.deepEqual(h.state().images, [{ traloi_id: 301, hinhanh: asset('new-essay') }]);
  assert.equal(h.trace.includes(`remove:${asset('new-essay')}`), false);
});

test('failed commit cleans a new upload while preserving prior attachments', async () => {
  const previous = [{ traloi_id: 301, hinhanh: asset('old-essay') }];
  const h = harness({ failCommit: true, images: previous });
  const result = await h.service.submit(42, 'SV-A', body([], essay(31, 0, true)));
  assert.equal(result.success, false);
  assert.deepEqual(h.state().images, previous);
  assert.equal(h.trace.includes(`remove:${asset('new-essay')}`), true);
  assert.equal(h.trace.includes(`remove:${asset('old-essay')}`), false);
});

test('failed transaction rolls back its claim so the student can retry', async () => {
  const h = harness({ failCommits: 1 });
  assert.equal((await h.service.submit(42, 'SV-A', body([choice(11, 101)]))).success, false);
  assert.equal(h.state().result, null);
  assert.equal((await h.service.submit(42, 'SV-A', body([choice(11, 101)]))).success, true);
  assert.equal(h.state().result.diemthi, 3);
});
