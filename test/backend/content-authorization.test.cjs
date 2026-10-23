'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
const root = path.resolve(__dirname, '../..');
class HttpError extends Error { constructor(message, status) { super(message); this.status = status; } }
class ForbiddenException extends HttpError { constructor(message) { super(message, 403); } }
class NotFoundException extends HttpError { constructor(message) { super(message, 404); } }
class BadRequestException extends HttpError { constructor(message) { super(message, 400); } }
class Logger { error() {} }
const common = { ForbiddenException, NotFoundException, BadRequestException, Logger };
const sql = (strings, ...values) => ({ strings: [...strings], values });
const baseImports = { '@nestjs/common': common, '@prisma/client': { Prisma: { sql, empty: {}, join: (values) => values } }, '@/prisma/prisma.service': {} };
const { QuestionsService } = loadTypeScript(path.join(root, 'src/questions/questions.service.ts'), {
  ...baseImports, '@/storage/supabase-storage.service': {},
  '@/storage/image-cleanup': { removeUnreferencedImages: async () => {} }, '@/questions/question-file.parser': {},
});
const { SubjectsService } = loadTypeScript(path.join(root, 'src/subjects/subjects.service.ts'), baseImports);
const { AnnouncementsService } = loadTypeScript(path.join(root, 'src/announcements/announcements.service.ts'), baseImports);
const actors = {
  'teacher-A': { id: 'teacher-A', manhomquyen: 1, trangthai: 1 },
  'teacher-B': { id: 'teacher-B', manhomquyen: 1, trangthai: 1 },
  admin: { id: 'admin', manhomquyen: 3, trangthai: 1 },
  'student-A': { id: 'student-A', manhomquyen: 2, trangthai: 1 },
  'student-B': { id: 'student-B', manhomquyen: 2, trangthai: 1 },
};
function bankFixture(assigned = false) {
  const question = { macauhoi: 202, mamonhoc: 'subject-B', machuong: 202, nguoitao: 'teacher-B', loai: 'mcq', madv: null, hinhanh: null, noidung: 'Fixture', dokho: 1, trangthai: 1 };
  let writes = 0;
  const prisma = {
    nguoiDung: { findUnique: async ({ where }) => actors[where.id] ?? null },
    phanCong: { count: async ({ where }) => where.manguoidung === 'teacher-B' || assigned ? 1 : 0 },
    monHoc: { findUnique: async () => ({ tenmonhoc: 'Fixture' }) },
    cauHoi: {
      findUnique: async () => ({ ...question }), findMany: async () => [], count: async () => 1,
      create: async () => { writes++; return { macauhoi: 203 }; },
      update: async ({ data }) => { writes++; Object.assign(question, data); return question; },
    },
    cauTraLoi: { findMany: async () => [], deleteMany: async () => { writes++; }, create: async () => { writes++; }, createMany: async () => { writes++; } },
    chuong: {
      findUnique: async () => ({ machuong: 202, mamonhoc: 'subject-B', trangthai: 1 }),
      findMany: async () => [], create: async () => { writes++; }, update: async () => { writes++; },
    },
    $queryRaw: async () => [],
  };
  prisma.$transaction = async (callback) => callback(prisma);
  return { prisma, question, questions: new QuestionsService(prisma, {}), subjects: new SubjectsService(prisma), get writes() { return writes; } };
}
const editInput = { id: '202', mamon: 'subject-B', machuong: '202', dokho: '1', loai: 'mcq', noidung: 'Changed', cautraloi: JSON.stringify([{ content: 'A', check: true }]) };
const questionOperations = {
  getQuestionById: (service) => service.getQuestionById(202, 'teacher-A'),
  getAnswerById: (service) => service.getAnswerById(202, 'teacher-A'),
  getAnswersForMultipleQuestions: (service) => service.getAnswersForMultipleQuestions([202], 'teacher-A'),
  delete: (service) => service.delete(202, 'teacher-A'),
  editQuestion: (service) => service.editQuestion(editInput, [], 'teacher-A'),
  getQuestionBySubject: (service) => service.getQuestionBySubject('subject-B', 0, 0, '', 1, 'teacher-A'),
  getTotalPageQuestionBySubject: (service) => service.getTotalPageQuestionBySubject('subject-B', 0, 0, '', 'teacher-A'),
  getQuestionCounts: (service) => service.getQuestionCounts([], 'subject-B', ['mcq'], 'teacher-A'),
  addQuestion: (service) => service.addQuestion(editInput, [], 'teacher-A'),
  addQuestionsFromFile: (service) => service.addQuestionsFromFile('subject-B', '202', [{ type: 'essay', question: 'Fixture', level: 1 }], 'teacher-A'),
};
for (const [name, operation] of Object.entries(questionOperations)) {
  test(`question ${name} rejects an unassigned teacher before disclosure/write`, async () => {
    const fixture = bankFixture();
    await assert.rejects(operation(fixture.questions), { status: 403 });
    assert.equal(fixture.writes, 0);
  });
}
test('assigned teacher may read shared subject question but cannot steal it by editing', async () => {
  const fixture = bankFixture(true);
  assert.equal((await fixture.questions.getQuestionById(202, 'teacher-A')).macauhoi, 202);
  await assert.rejects(fixture.questions.editQuestion(editInput, [], 'teacher-A'), { status: 403 });
  assert.equal(fixture.question.nguoitao, 'teacher-B');
});
test('administrator edit retains the original question creator', async () => {
  const fixture = bankFixture();
  assert.equal((await fixture.questions.editQuestion(editInput, [], 'admin')).status, 'success');
  assert.equal(fixture.question.nguoitao, 'teacher-B');
});
test('question author can still edit and delete their own question', async () => {
  const fixture = bankFixture();
  assert.equal((await fixture.questions.editQuestion(editInput, [], 'teacher-B')).status, 'success');
  assert.equal(await fixture.questions.delete(202, 'teacher-B'), true);
  assert.equal(fixture.question.trangthai, 0);
});
for (const [name, operation] of Object.entries({
  getChapters: (service) => service.getChapters('subject-B', 'teacher-A'),
  addChapter: (service) => service.addChapter('subject-B', 'Fixture', 'teacher-A'),
  updateChapter: (service) => service.updateChapter(202, 'Changed', 'teacher-A'),
  deleteChapter: (service) => service.deleteChapter(202, 'teacher-A'),
})) {
  test(`chapter ${name} rejects teacher without active subject assignment`, async () => {
    const fixture = bankFixture();
    await assert.rejects(operation(fixture.subjects), { status: 403 });
    assert.equal(fixture.writes, 0);
  });
}
test('assigned teacher retains shared subject chapter management', async () => {
  const fixture = bankFixture(true);
  assert.equal(await fixture.subjects.addChapter('subject-B', 'Fixture', 'teacher-A'), true);
  assert.equal(await fixture.subjects.updateChapter(202, 'Changed', 'teacher-A'), true);
  assert.equal(await fixture.subjects.deleteChapter(202, 'teacher-A'), true);
});

function announcementFixture() {
  let writes = 0;
  let state = [{ matb: 303, manguoidung: 'student-A', trangthai: 'chưa xem' }, { matb: 303, manguoidung: 'student-B', trangthai: 'đã xem' }];
  const groups = { 101: { manhom: 101, giangvien: 'teacher-A', trangthai: 1 }, 202: { manhom: 202, giangvien: 'teacher-B', trangthai: 1 } };
  const prisma = {
    nguoiDung: { findUnique: async ({ where }) => actors[where.id] ?? null },
    nhom: {
      findUnique: async ({ where }) => groups[where.manhom] ?? null,
      findMany: async ({ where }) => (where.manhom.in ?? []).map((id) => groups[id]).filter(Boolean),
    },
    thongBao: {
      findUnique: async () => ({ matb: 303, nguoitao: 'teacher-B', noidung: 'Private fixture' }),
      create: async () => { writes++; return { matb: 304 }; }, update: async () => { writes++; },
    },
    chiTietThongBao: { findMany: async () => [{ manhom: 202 }], createMany: async () => { writes++; }, deleteMany: async () => { writes++; } },
    chiTietNhom: {
      count: async ({ where }) => where.manguoidung === 'student-B' ? 1 : 0,
      findMany: async () => [{ manguoidung: 'student-B' }],
    },
    trangThaiThongBao: {
      createMany: async ({ data }) => { for (const row of data) if (!state.some((old) => old.manguoidung === row.manguoidung)) state.push(row); },
      deleteMany: async ({ where }) => { state = state.filter((row) => row.matb !== where.matb || where.manguoidung.notIn.includes(row.manguoidung)); },
    },
    $queryRaw: async () => [{ matb: 303, noidung: 'Private fixture' }],
  };
  prisma.$transaction = async (callback) => callback(prisma);
  return { service: new AnnouncementsService(prisma), get writes() { return writes; }, get state() { return state; } };
}
for (const [name, operation] of Object.entries({
  getDetail: (service) => service.getDetail(303, 'student-A'),
  getAnnounce: (service) => service.getAnnounce(202, 'student-A'),
  create: (service) => service.create('Private fixture', undefined, 'teacher-A', [202]),
  updateAnnounce: (service) => service.updateAnnounce(303, 'Changed', [101], 'teacher-B'),
})) {
  test(`announcement ${name} rejects unrelated recipients or foreign target groups`, async () => {
    const fixture = announcementFixture();
    await assert.rejects(operation(fixture.service), { status: 403 });
    assert.equal(fixture.writes, 0);
  });
}
test('notice group member can still read the notice and group notices', async () => {
  const fixture = announcementFixture();
  assert.equal((await fixture.service.getDetail(303, 'student-B')).matb, 303);
  assert.equal((await fixture.service.getAnnounce(202, 'student-B'))[0].matb, 303);
});
test('notice creator/admin can still send to authorized group', async () => {
  const fixture = announcementFixture();
  assert.equal(await fixture.service.create('Fixture', undefined, 'teacher-B', [202]), 304);
  assert.equal(await fixture.service.create('Fixture', undefined, 'admin', [202]), 304);
});
test('notice target update removes obsolete recipients while retaining current read status', async () => {
  const fixture = announcementFixture();
  assert.equal(await fixture.service.updateAnnounce(303, 'Changed', [202], 'teacher-B'), true);
  assert.deepEqual(fixture.state, [{ matb: 303, manguoidung: 'student-B', trangthai: 'đã xem' }]);
});
