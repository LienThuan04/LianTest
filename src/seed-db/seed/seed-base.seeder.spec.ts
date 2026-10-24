import type { PrismaClient } from '@prisma/client';
import { comparePassword } from '@/lib/bcrypt/bcrypt';
import { loadSeedData } from '../seed-data.loader';
import { seedExamBase } from './seed-base.seeder';
import { seedExamDemo } from './exam-demo.seeder';

describe('Shared JSON seed functions', () => {
  it('uses customized account rows and hashes the configured password', async () => {
    const data = loadSeedData().base;
    data.users = [
      {
        id: 'custom-admin',
        email: 'custom@example.test',
        hoten: 'Custom administrator',
        manhomquyen: 3,
      },
    ];
    const insert = jest.fn(() => Promise.resolve({ count: 1 }));
    const users = jest.fn(
      (args: { data: { id: string; email: string; matkhau: string }[] }) =>
        Promise.resolve({ count: args.data.length }),
    );
    const prisma = {
      danhMucChucNang: { createMany: insert },
      nhomQuyen: { createMany: insert },
      chiTietQuyen: { createMany: insert },
      nguoiDung: { createMany: users },
    };
    await seedExamBase(prisma as unknown as PrismaClient, {
      data,
      password: 'custom-password',
      saltRounds: 4,
    });
    const saved = users.mock.calls[0][0].data[0];
    expect(saved.id).toBe('custom-admin');
    expect(saved.email).toBe('custom@example.test');
    expect(await comparePassword('custom-password', saved.matkhau)).toBe(true);
  });

  it('stops before creating demo rows when referenced accounts are missing in DB', async () => {
    const create = jest.fn();
    const prisma = {
      nguoiDung: { findMany: () => Promise.resolve([]) },
      namHoc: { create },
    };
    await expect(
      seedExamDemo(prisma as unknown as PrismaClient, {
        dataset: loadSeedData({ includeDemo: true }),
        force: true,
      }),
    ).rejects.toThrow('Missing seed users in the database');
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps custom IDs distinct and preserves the preflight clock during writes', async () => {
    const dataset = loadSeedData({ includeDemo: true });
    const beforeWriting = Date.now();
    const template = dataset.demo!.exams[0];
    dataset.demo = {
      academicYears: [],
      assignments: [],
      groups: [],
      readingPassages: [],
      exams: [
        {
          ...template,
          mamonhoc: 'A#B',
          nhom: [],
          chuong: [],
          cauhoi: ['custom'],
        },
      ],
      subjects: [
        {
          mamonhoc: 'A#B',
          tenmonhoc: 'First',
          sotinchi: 1,
          sotietlythuyet: 1,
          sotietthuchanh: 0,
          chuong: ['C'],
        },
        {
          mamonhoc: 'A',
          tenmonhoc: 'Second',
          sotinchi: 1,
          sotietlythuyet: 1,
          sotietthuchanh: 0,
          chuong: ['B#C'],
        },
      ],
      questions: [
        {
          key: 'custom',
          mamonhoc: 'A#B',
          chuong: 'C',
          loai: 'essay',
          dokho: 1,
          noidung: 'Explain',
          nguoitao: dataset.base.users[0].id,
        },
      ],
    };
    let chapterId = 0;
    const question = jest.fn(
      ({ data }: { data: { mamonhoc: string; machuong: number }[] }) =>
        Promise.resolve(
          data.map((row, index) => ({ ...row, macauhoi: index + 1 })),
        ),
    );
    const exam = jest.fn<
      Promise<{ made: number }>,
      [{ data: { thoigianbatdau: Date } }]
    >(() => Promise.resolve({ made: 1 }));
    const prisma = {
      nguoiDung: { findMany: () => Promise.resolve(dataset.base.users) },
      monHoc: {
        create: () => Promise.resolve({}),
        findUnique: () => Promise.resolve({ tenmonhoc: 'First' }),
      },
      chuong: { create: () => Promise.resolve({ machuong: ++chapterId }) },
      phanCong: { createMany: () => Promise.resolve({ count: 0 }) },
      cauHoi: { createManyAndReturn: question },
      deThi: { create: exam },
      chiTietDeThi: { createMany: () => Promise.resolve({ count: 1 }) },
      thongBao: { create: () => Promise.resolve({ matb: 1 }) },
      $transaction: async (run: (tx: PrismaClient) => Promise<unknown>) =>
        run(prisma as unknown as PrismaClient),
    };
    // Simulate database/clear work taking time after the JSON preflight.
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(beforeWriting + 3600000);
    try {
      await seedExamDemo(prisma as unknown as PrismaClient, {
        dataset,
        force: true,
        log: () => undefined,
      });
    } finally {
      clock.mockRestore();
    }
    expect(question.mock.calls[0][0].data[0]).toMatchObject({
      mamonhoc: 'A#B',
      machuong: 1,
    });
    expect(
      exam.mock.calls[0][0].data.thoigianbatdau.getTime(),
    ).toBeLessThanOrEqual(beforeWriting + template.batdauOffsetHours * 3600000);
  });
});
