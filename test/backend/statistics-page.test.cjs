'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
class NotFoundException extends Error {}
const { StatisticController } = loadTypeScript(
  path.resolve(__dirname, '../../src/statistic/statistic.controller.ts'),
  {
    '@nestjs/common': { NotFoundException },
    '@/common/decorators/permissions.decorator': {},
    '@/common/decorators/skip-transform.decorator': {},
    '@/statistic/statistic.service': {},
    '@/statistic/dto/statistic.dto': {},
  },
);
function fixture(empty = false) {
  const requests = [];
  const service = {
    getSemesters: async (actor) => {
      requests.push(['semesters', actor]);
      return empty
        ? []
        : [
            { mahocky: 101, tenhocky: 'Term 1', namhoc: 10 },
            { mahocky: 201, tenhocky: 'Term 1', namhoc: 20 },
          ];
    },
    getAcademicYears: async (actor) => {
      requests.push(['years', actor]);
      return empty
        ? []
        : [
            { namhoc: 20, tennamhoc: '2026-2027' },
            { namhoc: 10, tennamhoc: '2025-2026' },
          ];
    },
    getSubjectsByCreator: async (...args) => {
      requests.push(['subjects', ...args]);
      return [{ mamonhoc: 'MATH', tenmonhoc: 'Math' }];
    },
    getGroupsByCreator: async (...args) => {
      requests.push(['groups', ...args]);
      return [{ manhom: 41, tennhom: 'Group 41' }];
    },
    getTestInfo: async (made, actor) => {
      requests.push(['exam', made, actor]);
      return made === 42 ? { made, tende: 'Exam 42' } : null;
    },
    getNhomByTest: async (made) => [{ manhom: made, tennhom: 'Group' }],
  };
  return { controller: new StatisticController(service), requests };
}
const actor = { user: { id: 'admin' } };
for (const [name, semester, year, expectedSemester, expectedYear] of [
  ['default', undefined, undefined, 201, 20],
  ['valid query', '101', '10', 101, 10],
  ['year only', undefined, '10', 101, 10],
  ['mismatched pair', '101', '20', 201, 20],
  ['unknown values', '999', '999', 201, 20],
]) {
  test(`aggregate SSR ${name} selects a valid pair and preloads its dependent filters`, async () => {
    const { controller, requests } = fixture();
    const page = await controller.page(actor, undefined, semester, year);
    assert.equal(page.ShowAggregate, true);
    assert.equal(page.SelectedYear, expectedYear);
    assert.equal(page.SelectedSemester, expectedSemester);
    assert.equal(page.Subjects[0].mamonhoc, 'MATH');
    assert.equal(page.Groups[0].manhom, 41);
    assert.deepEqual(
      requests.filter((r) => r[0] === 'subjects'),
      [['subjects', 'admin', expectedSemester, expectedYear]],
    );
    assert.deepEqual(
      requests.filter((r) => r[0] === 'groups'),
      [['groups', 'admin', expectedSemester, expectedYear]],
    );
  });
}
test('aggregate SSR without any scoped exams exposes an explicit empty selection', async () => {
  const { controller, requests } = fixture(true);
  const page = await controller.page(actor);
  assert.equal(page.SelectedYear, null);
  assert.equal(page.SelectedSemester, null);
  assert.deepEqual(page.Subjects, []);
  assert.deepEqual(page.Groups, []);
  assert.equal(
    requests.some((r) => ['subjects', 'groups'].includes(r[0])),
    false,
  );
});
test('detail SSR still checks the actor and loads the selected exam groups', async () => {
  const { controller, requests } = fixture();
  const page = await controller.page(actor, '42');
  assert.equal(page.ShowAggregate, false);
  assert.equal(page.Test.made, 42);
  assert.equal(page.Nhom[0].manhom, 42);
  assert.deepEqual(requests, [['exam', 42, 'admin']]);
  await assert.rejects(controller.page(actor, '99'), NotFoundException);
});
