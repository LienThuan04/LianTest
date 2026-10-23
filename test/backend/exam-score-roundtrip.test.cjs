'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { Prisma } = require('@prisma/client');
const { instanceToPlain } = require('class-transformer');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');

// Isolated source unit tests: real service + Prisma.Decimal + class-transformer;
// only framework decorators/logger, database, and unused storage are boundaries.
// These tests do not start Nest, validate DTOs, or issue HTTP requests.
const textUtils = loadTypeScript(path.join(__dirname, '../../src/common/utils/text.util.ts'));
const { ExamsService } = loadTypeScript(
  path.join(__dirname, '../../src/exams/exams.service.ts'),
  {
    '@nestjs/common': { Logger: class { error() {} } },
    '@prisma/client': { Prisma },
    '@/prisma/prisma.service': {},
    '@/storage/supabase-storage.service': {},
    '@/storage/image-cleanup': {},
    '@/common/utils/text.util': textUtils,
  },
);
const scoreFields = ['diem_tracnghiem', 'diem_tuluan', 'diem_dochieu'];

function scoreValues(row) {
  return scoreFields.map((field) => row[field]);
}

function databaseScores(values) {
  return Object.fromEntries(scoreFields.map((field, index) => [
    field, values[index] == null ? null : new Prisma.Decimal(values[index]),
  ]));
}

function examRow(values) {
  return {
    made: 42, monthi: 'MATH', tenmonhoc: 'Mathematics', nguoitao: 'GV-A',
    tende: 'Score regression', thoigianthi: 45,
    thoigianbatdau: new Date('2030-01-01T00:00:00.000Z'),
    thoigianketthuc: new Date('2030-01-01T01:00:00.000Z'),
    hienthibailam: 1, xemdiemthi: 1, xemdapan: 0,
    troncauhoi: 0, trondapan: 0, nopbaichuyentab: 0, loaide: 0,
    mcq_de: 0, mcq_tb: 0, mcq_kho: 0,
    essay_de: 0, essay_tb: 0, essay_kho: 0,
    reading_de: 0, reading_tb: 0, reading_kho: 0,
    ...databaseScores(values), trangthai: 1,
  };
}

function serialized(value) {
  return JSON.parse(JSON.stringify(instanceToPlain(value)));
}

for (const { name, input, expected } of [
  { name: 'fractional section scores', input: ['4.5', '3.25', '2.25'], expected: [4.5, 3.25, 2.25] },
  { name: 'zero section scores', input: ['0', '10', '0'], expected: [0, 10, 0] },
  { name: 'nullable legacy scores', input: [null, null, null], expected: [null, null, null] },
  { name: 'mixed nullable, zero, fractional scores', input: [null, '0', '2.5'], expected: [null, 0, 2.5] },
]) {
  // Removing numeric conversion, replacing zero with a default, or coercing null
  // into zero must break this public read/serialization contract.
  test(`getById preserves ${name} through real serialization`, async () => {
    const row = examRow(input);
    const prisma = {
      $queryRaw: async (query) => {
        assert.deepEqual(query.values, [42]);
        return [row];
      },
      deThiTuDong: { findMany: async () => [{ machuong: 7 }] },
      giaoDeThi: { findMany: async () => [{ manhom: 8 }] },
    };
    const detail = await new ExamsService(prisma, {}).getById(42);
    assert.deepEqual(scoreValues(detail), expected);
    const response = serialized(detail);
    assert.deepEqual(scoreValues(response), expected);
    assert.equal(response.made, 42);
    assert.equal(response.tenmonhoc, 'Mathematics');
    assert.deepEqual(response.chuong, [7]);
    assert.deepEqual(response.nhom, [8]);
    // Conversion belongs in the returned view; do not mutate Prisma's row.
    assert.deepEqual(scoreValues(row).map((value) => value?.toString() ?? null), input);
  });
}

test('getById returns null for an absent exam without fetching relations', async () => {
  const service = new ExamsService({ $queryRaw: async () => [] }, {});
  assert.equal(await service.getById(404), null);
});

function inMemoryDatabase() {
  let row = null;
  let hasResult = false;
  const prisma = {
    $transaction: async (operation) => operation(prisma),
    $queryRaw: async () => row ? [row] : [],
    deThi: {
      create: async ({ data }) => {
        row = { ...examRow([0, 0, 0]), ...data, ...databaseScores(scoreValues(data)) };
        return { ...row };
      },
      findUnique: async () => row ? { ...row } : null,
      update: async ({ data }) => {
        row = { ...row, ...data, ...databaseScores(scoreValues(data)) };
        return { ...row };
      },
    },
    ketQua: { count: async () => hasResult ? 1 : 0 },
    deThiTuDong: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    giaoDeThi: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    chiTietDeThi: { findMany: async () => [] },
    monHoc: { findUnique: async () => ({ tenmonhoc: 'Mathematics' }) },
    thongBao: { create: async ({ data }) => ({ matb: 9, ...data }) },
  };
  return {
    prisma,
    storedScores: () => scoreValues(row).map((value) => value.toNumber()),
    markSubmitted: () => { hasResult = true; },
  };
}

for (const hasSubmission of [false, true]) {
  // A missing conversion previously let serializer-produced objects turn into
  // invalid form strings: saving reset scores, or rejected editing used exams.
  test(`create/read/edit retains section scores (${hasSubmission ? 'with' : 'without'} a submitted result)`, async () => {
    const database = inMemoryDatabase();
    const service = new ExamsService(database.prisma, {});
    const dto = {
      mamonhoc: 'MATH', tende: 'Created exam', thoigianthi: '45', loaide: '0',
      manhom: [], chuong: [], socau: '{}',
      diem_tracnghiem: '4.5', diem_tuluan: '3.25', diem_dochieu: '2.25',
    };
    assert.deepEqual(await service.createTest('GV-A', dto), { success: true, made: 42 });
    assert.deepEqual(database.storedScores(), [4.5, 3.25, 2.25]);
    if (hasSubmission) database.markSubmitted();

    const response = serialized(await service.getById(42));
    // FormData transmits strings. Browser DOM behavior is outside this unit test.
    const formScores = Object.fromEntries(scoreFields.map((field) => [
      field, String(response[field] ?? 0),
    ]));
    const updated = await service.updateTest('GV-A', {
      ...dto, ...formScores, made: '42', tende: 'Renamed exam',
    });
    assert.deepEqual(updated, { success: true, made: 42 });
    assert.deepEqual(database.storedScores(), [4.5, 3.25, 2.25]);
    assert.deepEqual(scoreValues(serialized(await service.getById(42))), [4.5, 3.25, 2.25]);
  });
}
