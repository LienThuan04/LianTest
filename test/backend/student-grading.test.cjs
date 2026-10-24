'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../helpers/exam-source.cjs');
function gradingFixture() {
  const f = fixture();
  const result = { diem_tuluan: 0, trangthai_tuluan: 'Chưa chấm' };
  f.prisma.$queryRaw = async () => [{ diem_tuluan_max: 2 }];
  f.prisma.$transaction = async (run) => run({
    chamTuLuan: { deleteMany: async () => {}, createMany: async () => {} },
    ketQua: { update: async ({ data }) => Object.assign(result, data) },
  });
  return { ...f, result };
}
test('a zero essay mark completes grading and can be shown to the student', async () => {
  const f = gradingFixture();
  assert.equal((await f.service.saveEssayScore(7, 0, {31: 0})).success, true);
  assert.equal(f.result.trangthai_tuluan, 'Đã chấm');
  assert.equal(f.result.diem_tuluan, 0);
});
for (const invalid of [-1, NaN, Infinity]) {
  test(`invalid essay total ${invalid} is rejected before changing the result`, async () => {
    const f = gradingFixture();
    assert.equal((await f.service.saveEssayScore(7, invalid, {31: invalid})).success, false);
    assert.equal(f.result.trangthai_tuluan, 'Chưa chấm');
  });
  test(`invalid individual essay mark ${invalid} is rejected`, async () => {
    const f = gradingFixture();
    assert.equal((await f.service.saveEssayScore(7, 1, {31: invalid})).success, false);
    assert.equal(f.result.trangthai_tuluan, 'Chưa chấm');
  });
}
test('essay score above the exam maximum is rejected', async () => {
  const f = gradingFixture();
  assert.equal((await f.service.saveEssayScore(7, 3, {31: 3})).success, false);
  assert.equal(f.result.trangthai_tuluan, 'Chưa chấm');
});
