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
  const examQuestions = options.questions ?? questions;
  const availableAnswers = options.answers ?? answers;
  const examIds = options.examIds ?? [11, 12, 21, 22, 31];
  let state = {
    choices: options.choices ?? [],
    result: null,
    essays: [{ id: 301, makq: 7, macauhoi: 31, noidung: 'Previous essay' }],
    images: options.images ?? [],
  };
  const trace = [];
  const errors = [];
  const transactionContext = new AsyncLocalStorage();
  let transactionQueue = Promise.resolve();
  let resultReads = 0;
  let releaseReads;
  const readsReady = new Promise((resolve) => {
    releaseReads = resolve;
  });
  let uploads = 0;
  let commitFailures = options.failCommit
    ? Infinity
    : (options.failCommits ?? 0);
  const delegates = (draft) => ({
    chiTietKetQua: {
      deleteMany: async ({ where }) => {
        const before = draft.choices.length;
        draft.choices = draft.choices.filter(
          (row) =>
            !Object.entries(where).every(([key, value]) =>
              matches(row[key], value),
            ),
        );
        return { count: before - draft.choices.length };
      },
      createMany: async ({ data }) => {
        if (options.failDetailInsert)
          throw new Error('Fixture detail insert failed');
        trace.push('choice-write');
        draft.choices.push(...structuredClone(data));
        return { count: data.length };
      },
      upsert: async ({ where, create, update }) => {
        trace.push('choice-write');
        const row = draft.choices.find(
          (entry) => entry.macauhoi === where.makq_macauhoi.macauhoi,
        );
        if (row) Object.assign(row, update);
        else draft.choices.push({ ...create });
        return row ?? create;
      },
    },
    cauTraLoi: {
      findMany: async ({ where }) =>
        (options.transactionAnswers ?? availableAnswers).filter((row) =>
          Object.entries(where).every(([key, value]) =>
            matches(row[key], value),
          ),
        ),
      count: async ({ where }) =>
        availableAnswers.filter((row) =>
          Object.entries(where).every(([key, value]) =>
            matches(row[key], value),
          ),
        ).length,
    },
    deThi: {
      findUnique: async () => ({
        diem_tracnghiem: new Prisma.Decimal(options.mcqTotal ?? 6),
        diem_dochieu: new Prisma.Decimal(options.readingTotal ?? 4),
      }),
    },
    traLoiTuLuan: {
      findFirst: async ({ where }) =>
        draft.essays.find(
          (row) => row.makq === where.makq && row.macauhoi === where.macauhoi,
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
      findMany: async ({ where }) =>
        draft.images.filter((row) => row.traloi_id === where.traloi_id),
      deleteMany: async ({ where }) => {
        trace.push('image-write');
        draft.images = draft.images.filter(
          (row) => row.traloi_id !== where.traloi_id,
        );
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
    $queryRaw: async () => [
      {
        cnt: examQuestions.filter(
          (row) => examIds.includes(row.macauhoi) && row.loai === 'essay',
        ).length,
      },
    ],
  });
  const prisma = {
    ketQua: {
      findFirst: async () => {
        const snapshot =
          options.completed || state.result
            ? null
            : {
                makq: 7,
                thoigianvaothi: new Date(Date.now() - 120000),
              };
        if (options.concurrentReads && resultReads < 2) {
          resultReads++;
          if (resultReads === 2) releaseReads();
          await readsReady;
        }
        return snapshot;
      },
    },
    chiTietDeThi: {
      findMany: async ({ where }) => {
        assert.equal(where.made, 42);
        return examIds.map((macauhoi) => ({ macauhoi }));
      },
    },
    cauHoi: {
      findMany: async ({ where }) =>
        examQuestions.filter((row) => matches(row.macauhoi, where.macauhoi)),
    },
    cauTraLoi: {
      findMany: async ({ where }) =>
        availableAnswers.filter((row) =>
          Object.entries(where).every(([key, value]) =>
            matches(row[key], value),
          ),
        ),
    },
    $queryRaw: async () => state.images.map((row) => ({ url: row.hinhanh })),
    $transaction: (callback, config = {}) => {
      // Serialize transactions touching this result, modeling the row update
      // lock and predicate recheck. Both initial reads can still see null.
      const operation = transactionQueue.then(() =>
        transactionContext.run(true, async () => {
          trace.push('transaction');
          const draft = structuredClone(state);
          const tx = delegates(draft);
          let elapsed = 0;
          // Deterministic DB round-trip latency without wall-clock sleeps. All
          // current service queries execute through the same transaction budget.
          for (const [model, methods] of Object.entries(tx)) {
            if (typeof methods !== 'object') continue;
            for (const [method, run] of Object.entries(methods)) {
              methods[method] = async (...args) => {
                trace.push(`query:${model}.${method}`);
                elapsed += options.queryLatencyMs ?? 0;
                if (elapsed > (config.timeout ?? 5000)) {
                  throw new Error(
                    `Transaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was ${config.timeout ?? 5000} ms, however ${elapsed} ms passed since the start of the transaction.`,
                  );
                }
                return run(...args);
              };
            }
          }
          const result = await callback(tx);
          if (commitFailures > 0) {
            commitFailures--;
            throw new Error('Fixture commit rejected');
          }
          state = draft;
          trace.push('commit');
          return result;
        }),
      );
      transactionQueue = operation.catch(() => {});
      return operation;
    },
  };
  const storage = {
    uploadBase64: async (value, folder) => {
      assert.notEqual(
        transactionContext.getStore(),
        true,
        'upload must precede its transaction',
      );
      assert.equal(folder, 'essays');
      trace.push('upload');
      const index = uploads++;
      if (options.failUpload === index + 1)
        throw new Error('Fixture upload failed');
      return options.uploadUrls?.[index] ?? asset('new-essay');
    },
    ownedObjectPath: (url) =>
      url?.startsWith('https://fixture.invalid/images/')
        ? url.slice('https://fixture.invalid/images/'.length)
        : null,
    remove: async (url) => {
      assert.notEqual(
        transactionContext.getStore(),
        true,
        'cleanup must follow its transaction',
      );
      if (url === asset('old-essay'))
        assert.equal(trace.includes('commit'), true);
      trace.push(`remove:${url}`);
    },
  };
  const service = new ExamsService(prisma, storage);
  service.logger = { error: (message) => errors.push(message), warn() {} };
  return {
    service,
    errors,
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

test('100-question submit survives remote DB latency without per-question transaction round trips', async (t) => {
  const examQuestions = Array.from({ length: 100 }, (_, i) => ({
    macauhoi: i + 1,
    loai: 'mcq',
  }));
  const correctAnswers = examQuestions.map((q) => ({
    macauhoi: q.macauhoi,
    macautl: q.macauhoi + 1000,
    ladapan: 1,
  }));
  const h = harness({
    questions: examQuestions,
    answers: correctAnswers,
    examIds: examQuestions.map((q) => q.macauhoi),
    queryLatencyMs: 100,
    mcqTotal: 10,
  });
  const result = await h.service.submit(
    42,
    'SV-A',
    body(correctAnswers.map((a, i) => choice(a.macauhoi, a.macautl, i + 1))),
  );
  assert.equal(result.success, true, h.errors.join('\n'));
  assert.equal(h.state().result.diemthi, 10);
  assert.equal(h.state().result.socaudung, 100);
  assert.equal(h.state().choices.length, 100);
  const queryCount = h.trace.filter((event) =>
    event.startsWith('query:'),
  ).length;
  assert.ok(
    queryCount <= 8,
    'transaction queries must stay bounded as the exam grows',
  );
  t.diagnostic(
    `100 questions: ${queryCount} transaction delegate calls, ${queryCount * 100} ms simulated DB time`,
  );
});

test('submit allows a short fixed batch to exceed the default five-second transaction budget', async () => {
  const h = harness({ examIds: [11, 12], queryLatencyMs: 1200 });
  const result = await h.service.submit(
    42,
    'SV-A',
    body([choice(11, 101), choice(12, 0)]),
  );
  assert.equal(result.success, true, h.errors.join('\n'));
  assert.equal(h.state().result.diemthi, 3);
});

test('replacing submitted choices preserves omitted draft rows and another attempt', async () => {
  const h = harness({
    examIds: [11, 12],
    choices: [
      { makq: 7, macauhoi: 11, dapanchon: 102, thutu: 99 },
      { makq: 7, macauhoi: 12, dapanchon: 103, thutu: 2 },
      { makq: 8, macauhoi: 11, dapanchon: 102, thutu: 1 },
    ],
  });
  assert.equal(
    (await h.service.submit(42, 'SV-A', body([choice(11, 0, 3)]))).success,
    true,
  );
  assert.deepEqual(
    h.state().choices.find((row) => row.makq === 7 && row.macauhoi === 11),
    { makq: 7, macauhoi: 11, dapanchon: null, thutu: 3 },
  );
  assert.deepEqual(
    h.state().choices.find((row) => row.makq === 7 && row.macauhoi === 12),
    { makq: 7, macauhoi: 12, dapanchon: 103, thutu: 2 },
  );
  assert.equal(h.state().choices.find((row) => row.makq === 8).dapanchon, 102);
});

test('bulk insert failure rolls back deleted draft answers and the submission claim', async () => {
  const previous = [{ makq: 7, macauhoi: 11, dapanchon: 102, thutu: 1 }];
  const h = harness({
    examIds: [11, 12],
    choices: previous,
    failDetailInsert: true,
  });
  assert.equal(
    (await h.service.submit(42, 'SV-A', body([choice(11, 101)]))).success,
    false,
  );
  assert.deepEqual(h.state().choices, previous);
  assert.equal(h.state().result, null);
  assert.ok(
    h.errors.some((message) =>
      message.includes('Fixture detail insert failed'),
    ),
  );
  assert.equal(h.trace.includes('commit'), false);
});

test('grading checks answer ownership again in the transaction snapshot', async () => {
  const h = harness({
    examIds: [11, 12],
    transactionAnswers: [{ macautl: 101, macauhoi: 12, ladapan: 1 }],
  });
  assert.equal(
    (await h.service.submit(42, 'SV-A', body([choice(11, 101)]))).success,
    true,
  );
  assert.equal(h.state().result.socaudung, 0);
  assert.equal(h.state().result.diemthi, 0);
});

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

for (const secondEssay of [false, true]) {
  test(`partial essay upload failure cleans preceding uploads (${secondEssay ? 'two answers' : 'one answer'})`, async () => {
    const previous = [{ traloi_id: 301, hinhanh: asset('old-essay') }];
    const h = harness({ failUpload: 2, images: previous, examIds: [31, 98] });
    const payload = secondEssay
      ? { ...essay(31, 0, true), ...essay(98, 1, true) }
      : { ...essay(31, 0, true), essay_0_image_1: 'data:image/png;base64,bmV3' };
    assert.equal((await h.service.submit(42, 'SV-A', body([], payload))).success, false);
    assert.deepEqual(h.state().images, previous);
    assert.equal(h.trace.includes('transaction'), false);
    assert.equal(h.trace.includes(`remove:${asset('new-essay')}`), true);
    assert.equal(h.trace.includes(`remove:${asset('old-essay')}`), false);
  });
}

test('failed transaction rolls back its claim so the student can retry', async () => {
  const h = harness({ failCommits: 1 });
  assert.equal((await h.service.submit(42, 'SV-A', body([choice(11, 101)]))).success, false);
  assert.equal(h.state().result, null);
  assert.equal((await h.service.submit(42, 'SV-A', body([choice(11, 101)]))).success, true);
  assert.equal(h.state().result.diemthi, 3);
});
