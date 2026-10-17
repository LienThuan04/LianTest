import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SeedDbService } from './seed-db.service';

describe('Startup seed safety', () => {
  it.each([undefined, 'false', 'FALSE', '1', ''])(
    'preserves existing users when CLEAR_DB is %s',
    async (clear) => {
      const users = [{ id: 'existing-account' }];
      const prisma = {
        danhMucChucNang: {
          count: () => Promise.resolve(1),
          deleteMany: () => Promise.resolve({ count: 1 }),
        },
        nhomQuyen: {
          count: () => Promise.resolve(1),
          deleteMany: () => Promise.resolve({ count: 1 }),
        },
        chiTietQuyen: {
          count: () => Promise.resolve(1),
          deleteMany: () => Promise.resolve({ count: 1 }),
        },
        nguoiDung: {
          count: () => Promise.resolve(1),
          deleteMany: () => {
            users.splice(0);
            return Promise.resolve({ count: 1 });
          },
        },
      };
      const service = new SeedDbService(
        prisma as unknown as PrismaService,
        new ConfigService({ SEED_DB: 'true', CLEAR_DB: clear }),
      );
      const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const warnings = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation();
      const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      try {
        await service.onModuleInit();
        expect(users).toEqual([{ id: 'existing-account' }]);
      } finally {
        logs.mockRestore();
        warnings.mockRestore();
        errors.mockRestore();
      }
    },
  );
});
