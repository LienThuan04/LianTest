// seed-db.service.ts
import { PrismaService } from '@/prisma/prisma.service';
import { errorMessage } from '@/common/utils/text.util';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  examRoles,
  examResources,
  examPermissions,
  examUsers,
} from '@/seed-db/seed/exam-sample';
import { ConfigService } from '@nestjs/config';
import { generatePasswordHash } from '@/lib/bcrypt/bcrypt';
import { clearExamDemo, seedExamDemo } from '@/seed-db/seed/exam-demo.seeder';

@Injectable()
export class SeedDbService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(SeedDbService.name);

  // ─── Hệ thi OnTest (nguoidung / nhomquyen / chitietquyen / danhmucchucnang) ───

  private async seedExamResources() {
    const existing = await this.prisma.danhMucChucNang.count();
    if (existing > 0) {
      this.logger.warn(`danhmucchucnang đã có ${existing} bản ghi. Bỏ qua.`);
      return;
    }
    const result = await this.prisma.danhMucChucNang.createMany({
      data: examResources,
      skipDuplicates: true,
    });
    this.logger.log(`Seeded ${result.count} chức năng (danhmucchucnang).`);
  }

  private async seedExamRoles() {
    const existing = await this.prisma.nhomQuyen.count();
    if (existing > 0) {
      this.logger.warn(`nhomquyen đã có ${existing} bản ghi. Bỏ qua.`);
      return;
    }
    const result = await this.prisma.nhomQuyen.createMany({
      data: examRoles,
      skipDuplicates: true,
    });
    this.logger.log(`Seeded ${result.count} nhóm quyền (nhomquyen).`);
  }

  private async seedExamPermissions() {
    const existing = await this.prisma.chiTietQuyen.count();
    if (existing > 0) {
      this.logger.warn(`chitietquyen đã có ${existing} bản ghi. Bỏ qua.`);
      return;
    }
    const result = await this.prisma.chiTietQuyen.createMany({
      data: examPermissions,
      skipDuplicates: true,
    });
    this.logger.log(`Seeded ${result.count} chi tiết quyền (chitietquyen).`);
  }

  private async seedExamUsers() {
    const existing = await this.prisma.nguoiDung.count();
    if (existing > 0) {
      this.logger.warn(`nguoidung đã có ${existing} bản ghi. Bỏ qua.`);
      return;
    }
    const saltRounds = parseInt(
      this.configService.get<string>('BCRYPT_SALT_ROUNDS') || '10',
      10,
    );
    const defaultPassword =
      this.configService.get<string>('DEFAULT_PASSWORD') || '123456';
    const data = await Promise.all(
      examUsers.map(async (u) => ({
        id: u.id,
        email: u.email,
        hoten: u.hoten,
        manhomquyen: u.manhomquyen,
        matkhau: await generatePasswordHash(defaultPassword, saltRounds),
        trangthai: 1,
      })),
    );
    const result = await this.prisma.nguoiDung.createMany({
      data,
      skipDuplicates: true,
    });
    this.logger.log(
      `Seeded ${result.count} người dùng (nguoidung). Mật khẩu mặc định: "${defaultPassword}".`,
    );
  }

  private async seedExam() {
    // Thứ tự dependency: resource + role trước → permission + user sau.
    await this.seedExamResources();
    await this.seedExamRoles();
    await this.seedExamPermissions();
    await this.seedExamUsers();
  }

  // ─── Dữ liệu mẫu NGHIỆP VỤ (monhoc/phancong/nhom/cauhoi/dethi) — Phase 7 slice 2 ───

  /**
   * Ghi dữ liệu mẫu nghiệp vụ. Chạy SAU seedExam() vì nhóm/phân công/bài làm đều trỏ
   * tới id người dùng cố định trong `exam-sample.ts`.
   * `force` = true khi vừa clear xong (bỏ kiểm tra "DB đã có dữ liệu").
   */
  private async seedExamDemoData(force: boolean) {
    const result = await seedExamDemo(this.prisma, {
      force,
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
    try {
      this.logger.log('Starting database seeding...');
      // Hệ thi OnTest
      await this.seedExam();
      if (seedDemo) await this.seedExamDemoData(force);

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
      // Hệ thi OnTest — xoá theo thứ tự khoá ngoại
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
    // môn học/nhóm/câu hỏi/đề thi để chạy thử. Xem `seed/exam-demo.data.ts`.
    const shouldSeedDemo =
      this.configService.get<string>('SEED_DEMO_DATA') === 'true';

    // Log cấu hình
    this.logger.log(
      `SEED_DB: ${shouldSeed}, CLEAR_DB: ${shouldClear}, SEED_DEMO_DATA: ${shouldSeedDemo}`,
    );

    if (shouldSeed) {
      try {
        if (shouldClear) {
          // Xoá dữ liệu nghiệp vụ TRƯỚC bảng người dùng: clear() xoá nguoidung nên
          // nếu giữ lại nhóm/đề/bài làm thì chúng thành bản ghi mồ côi (FK dạng
          // scalar nên DB không chặn). Chỉ làm khi bật dữ liệu mẫu để không lỡ tay
          // xoá dữ liệu thật của người dùng.
          if (shouldSeedDemo) await this.clearDemoData();
          await this.clear();
          this.logger.log('Database cleared before seeding.');
        }
        await this.seed(shouldSeedDemo, shouldClear);
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
