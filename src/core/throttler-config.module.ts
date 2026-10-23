import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: 100 },
        { name: 'short-term', ttl: 10_000, limit: 20 },
        { name: 'medium-term', ttl: 300_000, limit: 500 },
        { name: 'long-term', ttl: 3_600_000, limit: 1000 },
      ],
      errorMessage(context, throttlerLimitDetail) {
        return `You have made ${throttlerLimitDetail.totalHits} requests. Rate limit exceeded, Try again in ${Math.ceil(throttlerLimitDetail.ttl / 1000)} seconds. `;
      },
    }),
  ],
  exports: [ThrottlerModule],
})
export class ThrottlerConfigModule {}
