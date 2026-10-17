const { createPrisma } = jest.requireActual<{ createPrisma: () => unknown }>(
  '../../scripts/prisma-client.cjs',
);

describe('Seed script database configuration', () => {
  const previousUrl = process.env.DATABASE_URL;
  afterEach(() => {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  it.each(['mysql://localhost/db', 'https://example.com/db', 'not-a-url'])(
    'rejects unsupported URL %s before opening a connection',
    (url) => {
      process.env.DATABASE_URL = url;
      expect(() => createPrisma()).toThrow(/DATABASE_URL/);
    },
  );
});
