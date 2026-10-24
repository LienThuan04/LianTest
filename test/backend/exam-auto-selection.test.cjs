'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../helpers/exam-source.cjs');

for (const loai of ['mcq', 'essay', 'reading']) {
  test(`automatic ${loai} exam without a chapter filter includes the requested questions`, async () => {
    const f = fixture();
    const saved = [];
    const tx = {
      $queryRaw: async (sql) => sql.sql.includes('COUNT(*)') ? [{ cnt: 2 }] : [{ macauhoi: 11 }, { macauhoi: 12 }],
      deThi: { create: async () => ({ made: 42 }) },
      chiTietDeThi: {
        createMany: async ({ data }) => { saved.push(...data); },
        update: async () => {},
      },
      monHoc: { findUnique: async () => ({ tenmonhoc: 'Môn fixture' }) },
      thongBao: { create: async () => ({ matb: 1 }) },
    };
    f.prisma.$transaction = async (run) => run(tx);
    const result = await f.service.createTest('teacher-a', {
      mamonhoc: 'subject-a', tende: 'Đề toàn môn', thoigianthi: '30', loaide: '1',
      chuong: [], manhom: [], socau: JSON.stringify({ [loai]: { de: 2, tb: 0, kho: 0 } }),
    });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(saved, [{ made: 42, macauhoi: 11 }, { made: 42, macauhoi: 12 }]);
  });
}
