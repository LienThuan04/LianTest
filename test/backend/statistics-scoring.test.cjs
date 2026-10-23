'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { loadTypeScript } = require('../helpers/load-typescript.cjs');
const sql = (strings, ...values) => ({ strings: [...strings], values });
const { StatisticService } = loadTypeScript(path.resolve(__dirname, '../../src/statistic/statistic.service.ts'), {
  '@nestjs/common': {}, '@prisma/client': { Prisma: { sql, empty: { strings: [], values: [] } } }, '@/prisma/prisma.service': {},
});
function statisticFixture(rows) {
  let calls = 0;
  return new StatisticService({ $queryRaw: async () => ++calls === 1 ? rows : [{ total: 0n }] });
}
for (const mode of ['detail', 'aggregate']) {
  const run = (service) => mode === 'detail' ? service.getStatisticalData(101, 0) : service.getAggregatedStatisticalData('teacher-A', 1, 1);
  test(`${mode} statistics charts a perfect score in the final interval`, async () => {
    const result = await run(statisticFixture([
      { makq: 1, diemthi: 10, thoigianvaothi: new Date(0) },
      { makq: 2, diemthi: 9, thoigianvaothi: new Date(0) },
    ]));
    assert.equal(result.da_nop_bai, 2);
    assert.deepEqual(result.thong_ke_diem, [0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
  });
  test(`${mode} statistics counts one result once when a student belongs to overlapping groups`, async () => {
    const result = await run(statisticFixture([
      { makq: 1, diemthi: 2, thoigianvaothi: new Date(0) },
      { makq: 1, diemthi: 2, thoigianvaothi: new Date(0) },
      { makq: 2, diemthi: 8, thoigianvaothi: new Date(0) },
    ]));
    assert.equal(result.da_nop_bai, 2);
    assert.equal(result.diem_trung_binh, 5);
    assert.equal(result.thong_ke_diem.reduce((a, b) => a + b, 0), 2);
  });
}
