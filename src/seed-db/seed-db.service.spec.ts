import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { SeedDbService } from './seed-db.service';
import * as seedLoader from './seed-data.loader';

describe('Startup seed safety', () => {
  it('validates edited JSON before clearing or writing any table', async () => {
    const remove = jest.fn();
    const prisma = {
      chiTietQuyen: { deleteMany: remove },
      nguoiDung: { deleteMany: remove },
      nhomQuyen: { deleteMany: remove },
      danhMucChucNang: { deleteMany: remove },
    };
    const loader = jest
      .spyOn(seedLoader, 'loadSeedData')
      .mockImplementation(() => {
        throw new Error('users.json: invalid JSON syntax');
      });
    const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      const service = new SeedDbService(
        prisma as unknown as PrismaService,
        new ConfigService({ SEED_DB: 'true', CLEAR_DB: 'true' }),
      );
      await expect(service.onModuleInit()).rejects.toThrow(
        'users.json: invalid JSON syntax',
      );
      expect(remove).not.toHaveBeenCalled();
    } finally {
      loader.mockRestore();
      logs.mockRestore();
      errors.mockRestore();
    }
  });

  it('does not load seed JSON when startup seeding is disabled', async () => {
    const loader = jest
      .spyOn(seedLoader, 'loadSeedData')
      .mockImplementation(() => {
        throw new Error('missing data directory');
      });
    const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    try {
      const service = new SeedDbService(
        {} as PrismaService,
        new ConfigService({ SEED_DB: 'false', CLEAR_DB: 'true' }),
      );
      await service.onModuleInit();
      expect(loader).not.toHaveBeenCalled();
    } finally {
      loader.mockRestore();
      logs.mockRestore();
    }
  });
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
