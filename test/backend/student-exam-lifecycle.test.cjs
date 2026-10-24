'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('../helpers/exam-source.cjs');

function activeFixture(options = {}) {
  return fixture({ ...options, result: {
    diemthi: null, trangthai: 'Chưa nộp',
    thoigianvaothi: new Date(Date.now() - 60_000), ...options.result,
  } });
}

for (const [name, exam] of [
  ['not opened', { thoigianbatdau: new Date(Date.now() + 60_000) }],
  ['closed', { thoigianketthuc: new Date(Date.now() - 3 * 60_000) }],
  ['deleted', { trangthai: 0 }],
]) {
  test(`student cannot load questions when exam is ${name}`, async () => {
    const f = activeFixture({ exam });
    await assert.rejects(f.dispatch('getQuestion', [{ made: 42 }], 'student-a'));
  });
}
test('student outside assigned group cannot load questions', async () => {
  const f = activeFixture();
  f.prisma.$queryRaw = async () => [];
  await assert.rejects(f.dispatch('getQuestion', [{ made: 42 }], 'student-b'), /giao đề|nhóm/);
});
for (const method of ['getQuestion', 'getTimeTest', 'getTimeEndTest', 'chuyentab']) {
  test(`${method} rejects a submitted attempt`, async () => {
    const f = activeFixture({ result: { diemthi: 0, trangthai: 'Đã nộp' } });
    await assert.rejects(f.dispatch(method, [{ made: 42, dethi: 42 }], 'student-a'), /nộp|hoàn thành/);
  });
  test(`${method} requires the student to start an attempt`, async () => {
    const f = activeFixture();
    f.prisma.ketQua.findFirst = async () => null;
    await assert.rejects(f.dispatch(method, [{ made: 42, dethi: 42 }], 'student-a'), /bắt đầu|vào thi/);
  });
}
test('questions cannot be loaded beyond the individual attempt duration', async () => {
  const f = activeFixture({ result: { thoigianvaothi: new Date(Date.now() - 33 * 60_000) } });
  await assert.rejects(f.dispatch('getQuestion', [{ made: 42 }], 'student-a'), /thời gian|hết hạn/);
});
test('expired reload within transport grace still loads the draft question structure', async () => {
  const f = activeFixture({ result: { thoigianvaothi: new Date(Date.now() - 30 * 60_000 - 5_000) } });
  await f.service.assertCanTakeExam(42, 'student-a', 'questions');
  const actions = [];
  await f.controller.takeTestPage('42', {user:f.users['student-a']}, {
    render: view=>actions.push(view), redirect:url=>actions.push(url),
  });
  assert.deepEqual(actions, ['pages/de_thi']);
});
test('taking page requires assignment, even when the URL is entered directly', async () => {
  const f = activeFixture();
  f.prisma.$queryRaw = async () => [];
  const rendered = [];
  await assert.rejects(f.controller.takeTestPage('42', { user: f.users['student-b'] }, {
    render: (...args) => rendered.push(args), redirect: () => {},
  }), /giao đề|nhóm/);
  assert.equal(rendered.length, 0);
});
test('taking page redirects an assigned student who has not started', async () => {
  const f = activeFixture();
  f.prisma.ketQua.findFirst = async () => null;
  const actions = [];
  await f.controller.takeTestPage('42', { user: f.users['student-a'] }, {
    render: () => actions.push('render'), redirect: (url) => actions.push(url),
  });
  assert.deepEqual(actions, ['/test/start/42']);
});
test('taking page renders for the assigned student with an active attempt', async () => {
  const f = activeFixture();
  const actions = [];
  await f.controller.takeTestPage('42', { user: f.users['student-a'] }, {
    render: (view) => actions.push(view), redirect: (url) => actions.push(url),
  });
  assert.deepEqual(actions, ['pages/de_thi']);
});
test('resumed question retains all options and the selected choice without answer keys', async () => {
  const f = activeFixture();
  f.prisma.$queryRaw = async (query) => query.sql.includes('SELECT d.tende')
    ? [{ tende: 'Exam', troncauhoi: 0, trondapan: 0, loaide: 0 }]
    : [{ macauhoi: 10, noidung: 'Question', loai: 'mcq', thutu_goc: 1, dapanchon: 100 }];
  f.prisma.cauTraLoi.findMany = async () => [
    { macautl: 100, noidungtl: 'A', hinhanh: null },
    { macautl: 101, noidungtl: 'B', hinhanh: null },
  ];
  const payload = await f.service.getQuestionByUser(42, 'student-a');
  assert.equal(payload.cauhoi[0].dapanchon, 100);
  assert.deepEqual(payload.cauhoi[0].cautraloi.map((a) => a.noidungtl), ['A', 'B']);
  assert.ok(payload.cauhoi[0].cautraloi.every((a) => !Object.hasOwn(a, 'ladapan')));
});
