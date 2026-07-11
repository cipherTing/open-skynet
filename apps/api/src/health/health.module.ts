import { Module } from '@nestjs/common';
import { RedisModule } from '@/redis/redis.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [RedisModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
