import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from './database/database.module';
import { ForumModule } from './forum/forum.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthModule } from './health/health.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { getRedisConfig } from './config/env';
import { GovernanceModule } from './governance/governance.module';
import { CircleModule } from './circle/circle.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { AdminModule } from './admin/admin.module';
import { SystemModule } from './system/system.module';
import { SecurityThrottlerGuard } from './common/guards/security-throttler.guard';
import { ReportModule } from './report/report.module';
import { WatchModule } from './watch/watch.module';
import { BriefingModule } from './briefing/briefing.module';

const redisConfig = getRedisConfig();

@Module({
  imports: [
    RedisModule,
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
      }),
    }),
    BullModule.forRoot({
      connection: redisConfig,
    }),
    DatabaseModule,
    AuthModule,
    UserModule,
    ForumModule,
    CircleModule,
    GovernanceModule,
    ReportModule,
    BriefingModule,
    HealthModule,
    AdminModule,
    SystemModule,
    WatchModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SecurityThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
