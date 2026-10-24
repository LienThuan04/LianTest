'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');
const template = fs.readFileSync(path.resolve(__dirname, '../../views/pages/vao_thi.ejs'), 'utf8');
function render(Check, extra = {}) {
  return ejs.render(template, {
    Test: { made: 42, tende: 'Test exam', thoigianthi: 30,
      thoigianbatdau: new Date(Date.now() - 60_000), thoigianketthuc: new Date(Date.now() + 60_000),
      xemdiemthi: 1, hienthibailam: 1, ...extra },
    Check, user: { id: 'student', hoten: 'Fixture student' }, include: () => '',
  });
}
test('entry page offers resume for an unfinished attempt', () => {
  const html = render({ makq: 7, diemthi: null, trangthai: 'Chưa nộp' });
  assert.match(html, /id="start-test"/);
  assert.match(html, /Tiếp tục/);
  assert.doesNotMatch(html, /Đã hoàn thành \(Chưa chấm\)/);
});
test('entry page offers first start while the exam is open', () => {
  assert.match(render(null), /id="start-test"/);
});
test('entry page does not offer restart for a submitted zero score', () => {
  const html = render({ makq: 7, diemthi: 0, trangthai: 'Đã nộp', trangthai_tuluan: 'Đã chấm' });
  assert.doesNotMatch(html, /id="start-test"/);
});
for (const [name, dates] of [
  ['not open', { thoigianbatdau: new Date(Date.now() + 60_000) }],
  ['closed', { thoigianketthuc: new Date(Date.now() - 60_000) }],
]) {
  test(`entry page does not offer start when ${name}`, () => {
    assert.doesNotMatch(render(null, dates), /id="start-test"/);
  });
}
