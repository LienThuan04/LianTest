import type { PrismaClient } from '@prisma/client';
import { generatePasswordHash } from '@/lib/bcrypt/bcrypt';
import { loadSeedData } from '../seed-data.loader';
import type { IBaseSeedData } from './seed-data.types';

export interface ISeedBaseOptions {
  data?: IBaseSeedData;
  password?: string;
  saltRounds?: number;
  /** Startup preserves whole existing tables; CLI uses row-level skipDuplicates. */
  skipExistingTables?: boolean;
  log?: (message: string) => void;
}

/** Shared by Nest startup and the standalone CLI; no data is loaded at import time. */
export async function seedExamBase(
  prisma: PrismaClient,
  options: ISeedBaseOptions = {},
) {
  const data = options.data ?? loadSeedData().base;
  const password =
    options.password ?? (process.env.DEFAULT_PASSWORD || '123456');
  const saltRounds =
    options.saltRounds ??
    Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  if (!Number.isInteger(saltRounds) || saltRounds < 4 || saltRounds > 31) {
    throw new Error('BCRYPT_SALT_ROUNDS must be an integer from 4 to 31.');
  }
  const log = options.log ?? (() => undefined);
  async function seedTable(
    name: string,
    count: () => Promise<number>,
    insert: () => Promise<{ count: number }>,
  ) {
    if (options.skipExistingTables) {
      const existing = await count();
      if (existing > 0) {
        log(`${name}: ${existing} existing records; skipped.`);
        return 0;
      }
    }
    const result = await insert();
    log(`${name}: +${result.count}`);
    return result.count;
  }
  const resources = await seedTable(
    'danhmucchucnang',
    () => prisma.danhMucChucNang.count(),
    () =>
      prisma.danhMucChucNang.createMany({
        data: data.resources,
        skipDuplicates: true,
      }),
  );
  const roles = await seedTable(
    'nhomquyen',
    () => prisma.nhomQuyen.count(),
    () =>
      prisma.nhomQuyen.createMany({ data: data.roles, skipDuplicates: true }),
  );
  const permissions = await seedTable(
    'chitietquyen',
    () => prisma.chiTietQuyen.count(),
    () =>
      prisma.chiTietQuyen.createMany({
        data: data.permissions,
        skipDuplicates: true,
      }),
  );
  const users = await seedTable(
    'nguoidung',
    () => prisma.nguoiDung.count(),
    async () => {
      const users = await Promise.all(
        data.users.map(async (user) => ({
          ...user,
          matkhau: await generatePasswordHash(password, saltRounds),
          trangthai: 1,
        })),
      );
      return prisma.nguoiDung.createMany({ data: users, skipDuplicates: true });
    },
  );
  return { resources, roles, permissions, users };
}
