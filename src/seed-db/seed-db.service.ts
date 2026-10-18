// seed-db.service.ts
import { PrismaService } from '@/prisma/prisma.service';
import { errorMessage } from '@/common/utils/text.util';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { loadSeedData } from './seed-data.loader';
import { seedExamBase } from './seed/seed-base.seeder';
import type { IBaseSeedData, ISeedDataset } from './seed/seed-data.types';
import { ConfigService } from '@nestjs/config';
import { clearExamDemo, seedExamDemo } from '@/seed-db/seed/exam-demo.seeder';

@Injectable()
export class SeedDbService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(SeedDbService.name);

  // ─── Hệ thi LianTest (nguoidung / nhomquyen / chitietquyen / danhmucchucnang) ───

  private async seedExam(data: IBaseSeedData) {
    await seedExamBase(this.prisma, {
      data,
      password: this.configService.get<string>('DEFAULT_PASSWORD') || '123456',
      saltRounds: Number.parseInt(
        this.configService.get<string>('BCRYPT_SALT_ROUNDS') || '10',
        10,
      ),
      skipExistingTables: true,
      log: (message) => this.logger.log(message),
    });
  }

  /**
   * Ghi dữ liệu mẫu nghiệp vụ. Chạy SAU seedExam() vì nhóm/phân công/bài làm đều trỏ
   * tới id người dùng cố định trong `data/users.json`.
   * `force` = true khi vừa clear xong (bỏ kiểm tra "DB đã có dữ liệu").
   */
  private async seedExamDemoData(force: boolean, data: ISeedDataset) {
    const result = await seedExamDemo(this.prisma, {
      force,
      dataset: data,
      log: (message) => this.logger.log(message),
    });
    if (result.skipped) return;
    this.logger.log(
      `Seeded dữ liệu mẫu nghiệp vụ: ${result.monhoc} môn học, ${result.chuong} chương, ` +
        `${result.cauhoi} câu hỏi, ${result.nhom} nhóm học phần, ${result.dethi} đề thi, ` +
        `${result.ketqua} bài làm mẫu.`,
    );
  }

  /** Xoá dữ liệu mẫu nghiệp vụ (KHÔNG đụng 4 bảng RBAC — `clear()` lo phần đó). */
  async clearDemoData() {
    await clearExamDemo(this.prisma, {
      log: (message) => this.logger.log(message),
    });
  }

  async seed(seedDemo = false, force = false) {
    const data = loadSeedData({ includeDemo: seedDemo });
    await this.seedPrepared(data, seedDemo, force);
  }

  private async seedPrepared(
    data: ISeedDataset,
    seedDemo: boolean,
    force: boolean,
  ) {
    try {
      this.logger.log('Starting database seeding...');
      // Hệ thi LianTest
      await this.seedExam(data.base);
      if (seedDemo) await this.seedExamDemoData(force, data);

      this.logger.log('Database seeding completed successfully.');
    } catch (error) {
      this.logger.error(
        `Error during database seeding: ${errorMessage(error)}`,
      );
      throw error;
    }
  }

  async clear() {
    try {
      // Hệ thi LianTest — xoá theo thứ tự khoá ngoại
      await this.prisma.chiTietQuyen.deleteMany();
      await this.prisma.nguoiDung.deleteMany();
      await this.prisma.nhomQuyen.deleteMany();
      await this.prisma.danhMucChucNang.deleteMany();

      this.logger.log('Cleared database records successfully.');
    } catch (error) {
      this.logger.error(
        `Error during clearing database: ${errorMessage(error)}`,
      );
      throw error;
    }
  }

  async onModuleInit() {
    const shouldSeed = this.configService.get<string>('SEED_DB') === 'true';
    // Chỉ xoá khi được bật rõ ràng. Thiếu biến/sai chính tả phải giữ dữ liệu.
    const shouldClear = this.configService.get<string>('CLEAR_DB') === 'true';
    // Dữ liệu mẫu nghiệp vụ là TUỲ CHỌN (mặc định TẮT) — chỉ bật khi muốn có sẵn
    // môn học/nhóm/câu hỏi/đề thi để chạy thử. Xem `data/README.md`.
    const shouldSeedDemo =
      this.configService.get<string>('SEED_DEMO_DATA') === 'true';

    // Log cấu hình
    this.logger.log(
      `SEED_DB: ${shouldSeed}, CLEAR_DB: ${shouldClear}, SEED_DEMO_DATA: ${shouldSeedDemo}`,
    );

    if (shouldSeed) {
      try {
        const data = loadSeedData({ includeDemo: shouldSeedDemo });
        if (shouldClear) {
          // Xoá dữ liệu nghiệp vụ TRƯỚC bảng người dùng: clear() xoá nguoidung nên
          // nếu giữ lại nhóm/đề/bài làm thì chúng thành bản ghi mồ côi (FK dạng
          // scalar nên DB không chặn). Chỉ làm khi bật dữ liệu mẫu để không lỡ tay
          // xoá dữ liệu thật của người dùng.
          if (shouldSeedDemo) await this.clearDemoData();
          await this.clear();
          this.logger.log('Database cleared before seeding.');
        }
        await this.seedPrepared(data, shouldSeedDemo, shouldClear);
      } catch (error) {
        this.logger.error(`Seeding failed: ${errorMessage(error)}`);
        // Có thể throw error để app không start nếu seed thất bại
        throw error;
      }
    } else {
      this.logger.log('SEED_DB is not enabled. Skipping database seeding.');
    }
  }
}
