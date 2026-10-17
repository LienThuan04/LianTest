// Tạo PrismaClient cho các script seed chạy ngoài Nest, GIỐNG `PrismaService`:
// URL Prisma Accelerate (prisma+postgres:// hoặc prisma://) truyền qua `accelerateUrl`;
// URL postgres:// trực tiếp thì dùng driver adapter PrismaPg.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function createPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL trong .env');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL không phải URL PostgreSQL hợp lệ.');
  }
  if (!parsed.hostname) throw new Error('DATABASE_URL thiếu hostname.');
  if (['prisma:', 'prisma+postgres:'].includes(parsed.protocol)) {
    return new PrismaClient({ accelerateUrl: url });
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL chỉ hỗ trợ PostgreSQL hoặc Prisma Accelerate.');
  }
  const adapter = new PrismaPg({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

module.exports = { createPrisma };
