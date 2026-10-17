import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly transport: string;

  constructor(configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL chưa được cấu hình. Cần URL PostgreSQL hoặc Prisma Accelerate hợp lệ.',
      );
    }
    let url: URL;
    try {
      url = new URL(databaseUrl);
    } catch {
      throw new Error('DATABASE_URL không phải URL PostgreSQL hợp lệ.');
    }
    const accelerate = ['prisma:', 'prisma+postgres:'].includes(url.protocol);
    if (
      !url.hostname ||
      (!accelerate && !['postgres:', 'postgresql:'].includes(url.protocol))
    ) {
      throw new Error(
        'DATABASE_URL chỉ hỗ trợ postgres://, postgresql://, prisma:// hoặc prisma+postgres://.',
      );
    }
    // Prisma 7: adapter chỉ nhận URL TCP; URL Accelerate dùng accelerateUrl.
    // Giữ cấu hình TLS trong URL, không tắt xác minh chứng chỉ toàn cục.
    super(
      accelerate
        ? { accelerateUrl: databaseUrl }
        : {
            adapter: new PrismaPg({
              connectionString: databaseUrl,
              connectionTimeoutMillis: 10_000,
            }),
          },
    );
    this.transport = accelerate ? 'Prisma Accelerate' : 'PostgreSQL';
  }

  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      // Driver adapter có thể mở pool mà chưa kết nối thật; chỉ báo sẵn sàng
      // sau khi DB trả lời. Lỗi DB phải xuất hiện trước khi seed/chạy HTTP.
      await this.$queryRaw`SELECT 1`;
      this.logger.log(`Prisma connected via ${this.transport} successfully`);
    } catch (error) {
      this.logger.error(
        `Không thể kết nối ${this.transport}. Kiểm tra DATABASE_URL và quyền truy cập mạng.`,
      );
      await this.$disconnect().catch(() => undefined);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
