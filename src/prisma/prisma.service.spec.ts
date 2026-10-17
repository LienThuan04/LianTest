import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

describe('Prisma connection configuration', () => {
  it.each(['mysql://localhost/db', 'https://example.com/db', 'broken-url'])(
    'rejects unsupported connection URL %s before opening a connection',
    (url) => {
      expect(
        () => new PrismaService(new ConfigService({ DATABASE_URL: url })),
      ).toThrow(/DATABASE_URL.*postgres|DATABASE_URL.*hợp lệ/i);
    },
  );

  it('rejects a missing URL without leaking credentials', () => {
    expect(() => new PrismaService(new ConfigService())).toThrow(
      /DATABASE_URL/,
    );
  });

  it('does not report a successful connection when the first query fails', async () => {
    const service = new PrismaService(
      new ConfigService({
        DATABASE_URL: 'postgres://test:test@localhost:1/test',
      }),
    );
    jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    jest
      .spyOn(service, '$queryRaw')
      .mockRejectedValue(new Error('unreachable'));
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      await expect(service.onModuleInit()).rejects.toThrow();
      expect(log.mock.calls.flat().join(' ')).not.toMatch(
        /connected.*success/i,
      );
    } finally {
      log.mockRestore();
      error.mockRestore();
      await service.$disconnect();
    }
  });
});
