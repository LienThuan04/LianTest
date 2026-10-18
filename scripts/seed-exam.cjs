// Script một lần: seed dữ liệu hệ thi LianTest vào DB.
// Kết nối DB giống PrismaService (Accelerate hoặc postgres:// trực tiếp — xem
// `prisma-client.cjs`). Chạy: node scripts/seed-exam.cjs
// Dùng chung hàm seed với SeedDbService (chạy tự động khi SEED_DB=true).
require('dotenv/config');
const { createPrisma } = require('./prisma-client.cjs');
const { loadSeedData } = require('../dist/src/seed-db/seed-data.loader.js');
const {
  seedExamBase,
} = require('../dist/src/seed-db/seed/seed-base.seeder.js');

(async () => {
  // Validate the current JSON before creating a database client or writing rows.
  const dataset = loadSeedData();
  const prisma = createPrisma();

  try {
    await seedExamBase(prisma, { data: dataset.base, log: console.log });

    console.log('✅ Seed hệ thi xong.');
  } catch (e) {
    console.error('❌ Seed lỗi:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
