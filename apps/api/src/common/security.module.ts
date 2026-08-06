import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { RedisModule } from '@/redis/redis.module';
import { RedisService } from '@/redis/redis.service';
import { AuthModule } from '@/auth/auth.module';
import { SystemModule } from '@/system/system.module';
import { getRedisConfig, getRedisPassword } from '@/config/env';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { SecurityThrottlerGuard } from './guards/security-throttler.guard';
import { SecurityPipelineGuard } from './guards/security-pipeline.guard';

@Module({
  imports: [
    RedisModule,
    AuthModule,
    SystemModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 10 },
          { name: 'medium', ttl: 10000, limit: 50 },
          { name: 'long', ttl: 60000, limit: 300 },
        ],
        storage: new ThrottlerStorageRedisService(redisService.getClient()),
        connection: { ...getRedisConfig(), password: getRedisPassword() },
      }),
    }),
  ],
  providers: [JwtAuthGuard, SecurityThrottlerGuard, SecurityPipelineGuard],
  exports: [JwtAuthGuard, SecurityThrottlerGuard, SecurityPipelineGuard],
})
export class SecurityModule {}
