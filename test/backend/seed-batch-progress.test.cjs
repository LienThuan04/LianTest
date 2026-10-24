'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seedExamDemo } = require('../helpers/seed-source.cjs');

function fixture({ count = 250, submissions = 0, failAnswers = false, failEssays = false } = {}) {
  const students = Array.from({ length: submissions }, (_, i) => `student-${i}`);
  const options = text => [{ noidungtl: text, ladapan: 1 }, { noidungtl: 'Wrong', ladapan: 0 }];
  const questions = Array.from({ length: count }, (_, i) => ({ key: `q-${i}`, mamonhoc: 'SUB', chuong: 'Chapter', loai: i === count - 1 ? 'essay' : 'mcq', dokho: 1, nguoitao: 'teacher', noidung: i < 2 ? 'Identical question' : `Question ${i}`, ...(i === count - 1 ? {} : { dapan: options(`Correct ${i}`) }) }));
  const passages = submissions ? [] : Array.from({ length: 5 }, (_, p) => ({ key: `p-${p}`, mamonhoc: 'SUB', chuong: 'Chapter', dokho: 2, nguoitao: 'teacher', tieude: 'Same passage title', noidung: p < 2 ? 'Same passage content' : `Passage ${p}`, cauhoi: Array.from({ length: 3 }, (_, q) => ({ key: `p-${p}-q-${q}`, noidung: `Reading ${p}/${q}`, dapan: options(`Reading answer ${p}/${q}`) })) }));
  const exam = { key: 'exam', tende: 'Exam', mamonhoc: 'SUB', nguoitao: 'teacher', loaide: 0, thoigianthi: 30, batdauOffsetHours: -3, ketthucOffsetHours: -2, hienthibailam: 1, xemdiemthi: 1, xemdapan: 1, troncauhoi: 0, trondapan: 0, nopbaichuyentab: 0, diem_tracnghiem: 8, diem_tuluan: 2, diem_dochieu: 0, nhom: submissions ? ['group'] : [], chuong: ['Chapter'], cauhoi: questions.map(q => q.key), ...(submissions ? { ketqua: students.map((id, i) => ({ manguoidung: id, socaudung: i % 2, thoigianlambai: 5, solanchuyentab: 0, baituluan: `Essay ${id}` })) } : {}) };
  const dataset = { referenceTime: Date.now(), base: { users: [{ id: 'teacher' }, ...students.map(id => ({ id }))] }, demo: { academicYears: submissions ? [{ tennamhoc: '2026', sohocky: 1 }] : [], subjects: [{ mamonhoc: 'SUB', tenmonhoc: 'Subject', sotinchi: 3, sotietlythuyet: 30, sotietthuchanh: 15, chuong: ['Chapter'] }], assignments: [], groups: submissions ? [{ key: 'group', tennhom: 'Group', mamoi: 'join', ghichu: '', tennamhoc: '2026', sohocky: 1, mamonhoc: 'SUB', giangvien: 'teacher', sinhvien: students }] : [], questions, readingPassages: passages, exams: [exam] } };
  const rows = { questions: [], options: [], passages: [], results: [], details: [], essays: [] };
  const calls = { question: 0, option: 0, passage: 0, result: 0, detail: 0, essay: 0, transaction: 0 };
  let questionId = 0, optionId = 0, passageId = 0, resultId = 0;
  const saveQuestion = data => { const row = { ...data, madv: data.madv ?? null, macauhoi: ++questionId }; rows.questions.push(row); return row; };
  const savePassage = data => { const row = { ...data, madv: ++passageId }; rows.passages.push(row); return row; };
  const saveResult = data => { const row = { ...data, makq: ++resultId }; rows.results.push(row); return row; };
  const ok = async () => ({ count: 0 });
  const prisma = {
    nguoiDung: { findMany: async () => dataset.base.users },
    namHoc: { create: async () => ({ manamhoc: 1 }) }, hocKy: { create: async () => ({ mahocky: 1 }) },
    monHoc: { create: ok, findUnique: async () => ({ tenmonhoc: 'Subject' }) }, chuong: { create: async () => ({ machuong: 1 }) },
    phanCong: { createMany: ok }, nhom: { create: async () => ({ manhom: 1 }) }, chiTietNhom: { createMany: ok, findMany: async () => students.map(manguoidung => ({ manguoidung })) },
    cauHoi: {
      create: async ({ data }) => { calls.question++; return saveQuestion(data); },
      createManyAndReturn: async ({ data }) => { calls.question++; return data.map(saveQuestion).reverse(); },
      findMany: async () => rows.questions,
    },
    cauTraLoi: {
      createMany: async ({ data }) => { calls.option++; if (failAnswers) throw new Error('Connection terminated unexpectedly'); rows.options.push(...data.map(row => ({ ...row, macautl: ++optionId }))); return { count: data.length }; },
      findMany: async () => rows.options,
    },
    doanVan: { create: async ({ data }) => { calls.passage++; return savePassage(data); }, createManyAndReturn: async ({ data }) => { calls.passage++; return data.map(savePassage).reverse(); } },
    deThi: { create: async () => ({ made: 1 }) }, deThiTuDong: { createMany: ok }, giaoDeThi: { createMany: ok },
    chiTietDeThi: { createMany: async ({ data }) => { rows.examDetails = data; return { count: data.length }; } },
    thongBao: { create: async () => ({ matb: 1 }) }, chiTietThongBao: { createMany: ok }, trangThaiThongBao: { createMany: ok },
    ketQua: { create: async ({ data }) => { calls.result++; return saveResult(data); }, createManyAndReturn: async ({ data }) => { calls.result++; return data.map(saveResult).reverse(); } },
    chiTietKetQua: { createMany: async ({ data }) => { calls.detail++; rows.details.push(...data); return { count: data.length }; } },
    traLoiTuLuan: { createMany: async ({ data }) => { calls.essay++; if(failEssays)throw new Error('Connection terminated unexpectedly');rows.essays.push(...data); return { count: data.length }; } },
    $transaction: async run => {
      calls.transaction++;
      const lengths = Object.fromEntries(Object.entries(rows).filter(([,v]) => Array.isArray(v)).map(([key,v]) => [key,v.length]));
      try { return await run(prisma); }
      catch (error) { for (const [key,length] of Object.entries(lengths)) rows[key].length = length; throw error; }
    },
  };
  const logs = [];
  return { dataset, rows, calls, logs, run: () => seedExamDemo(prisma, { dataset, force: true, log: line => logs.push(line) }) };
}

test('large question bank uses bounded bulk writes and reports committed progress before the final summary', async () => {
  const f = fixture(); await f.run();
  assert.equal(f.rows.questions.length,265);
  assert.ok(f.calls.question<=4,`question write round trips: ${f.calls.question}`);
  assert.ok(f.calls.option<=4,`answer write round trips: ${f.calls.option}`);
  assert.ok(f.calls.passage<=1,`passage write round trips: ${f.calls.passage}`);
  assert.ok(f.logs.some(line=>/Câu hỏi: 100\/265/.test(line)),f.logs.join('\n'));
  assert.ok(f.logs.some(line=>/Câu hỏi: 265\/265/.test(line)));
});

test('returned rows may be reversed and duplicate question text must retain distinct answers and passage ownership', async () => {
  const f=fixture();await f.run();
  for(let i=0;i<2;i++) {
    const id=f.rows.examDetails[i].macauhoi;
    assert.equal(f.rows.options.find(a=>a.macauhoi===id&&a.ladapan===1).noidungtl,`Correct ${i}`);
  }
  for(const row of f.rows.questions.filter(q=>q.loai==='reading')) {
    const [p]=/Reading (\d+)/.exec(row.noidung).slice(1);
    assert.equal(row.madv,Number(p)+1);
  }
});

test('network error aborts a question batch without leaving questions whose options were not written', async () => {
  const f=fixture({count:20,failAnswers:true});
  await assert.rejects(f.run(),/Connection terminated unexpectedly/);
  assert.equal(f.rows.questions.length,0,'failed question batch must roll back');
  assert.equal(f.rows.options.length,0);
  assert.ok(!f.logs.some(line=>/Đề thi: 1, bài làm mẫu/.test(line)));
});

test('sample results are batched and preserve each student score, choices and essay despite reversed returned IDs', async () => {
  const f=fixture({count:2,submissions:150});await f.run();
  assert.equal(f.rows.results.length,150);
  assert.ok(f.calls.result<=2,`result write round trips: ${f.calls.result}`);
  assert.ok(f.calls.detail<=2,`detail write round trips: ${f.calls.detail}`);
  assert.ok(f.calls.essay<=2,`essay write round trips: ${f.calls.essay}`);
  for(const [i,result] of f.rows.results.entries()) {
    assert.equal(result.diemthi,i%2?8:0);
    assert.equal(f.rows.essays.find(a=>a.makq===result.makq).noidung,`<p>Essay ${result.manguoidung}</p>`);
    const choice=f.rows.details.find(d=>d.makq===result.makq&&d.macauhoi===1).dapanchon;
    assert.equal(f.rows.options.find(a=>a.macautl===choice).ladapan,i%2);
  }
  assert.ok(f.logs.some(line=>/Bài làm.*100\/150/.test(line)));
});

test('an essay write failure rolls back the result and choices and never logs that batch as complete', async () => {
  const f=fixture({count:2,submissions:5,failEssays:true});
  await assert.rejects(f.run(),/Connection terminated unexpectedly/);
  assert.equal(f.calls.result,1,'result insert must be reached before the injected failure');
  assert.equal(f.rows.results.length,0);assert.equal(f.rows.details.length,0);assert.equal(f.rows.essays.length,0);
  assert.ok(!f.logs.some(line=>/Bài làm.*5\/5/.test(line)));
});
