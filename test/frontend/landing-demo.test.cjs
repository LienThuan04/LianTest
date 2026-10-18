const test = require('node:test');
const assert = require('node:assert/strict');

test('the public demo scores correct, mixed, missing and invalid selections', async () => {
  const { calculateDemoResult } = await import('../../public/js/landing/exam-demo-data.mjs');
  for (const [answers, correct] of [
    [[2, 1, 0], 3], [[2, 0, 3], 1], [[null, null, null], 0], [[-1, 99, 4], 0], [[], 0],
  ]) {
    assert.deepEqual(calculateDemoResult(answers), { correct, total: 3 });
  }
});
