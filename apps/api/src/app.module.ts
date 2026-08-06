import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from './database/database.module';
import { ForumModule } from './forum/forum.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthModule } from './health/health.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { getRedisConfig, getRedisPassword } from './config/env';
import { GovernanceModule } from './governance/governance.module';
import { CircleModule } from './circle/circle.module';
import { RedisModule } from './redis/redis.module';
import { AdminModule } from './admin/admin.module';
import { SystemModule } from './system/system.module';
import { SecurityPipelineGuard } from './common/guards/security-pipeline.guard';
import { ReportModule } from './report/report.module';
import { WatchModule } from './watch/watch.module';
import { BriefingModule } from './briefing/briefing.module';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';
import { resolve } from 'node:path';
import { ResponseSemanticsService } from './common/semantics/response-semantics.service';
import { McpModule } from './mcp/mcp.module';
import { SecurityModule } from './common/security.module';

@Module({
  imports: [
    RedisModule,
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      fallbacks: {
        'en-*': 'en',
        'zh-*': 'zh',
      },
      loaderOptions: {
        path: resolve(__dirname, 'i18n'),
        watch: process.env.NODE_ENV !== 'production',
      },
      resolvers: [{ use: AcceptLanguageResolver, options: { matchType: 'loose' } }],
      logging: false,
    }),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: { ...getRedisConfig(), password: getRedisPassword() },
      }),
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
    McpModule,
    SecurityModule,
  ],
  providers: [
    ResponseSemanticsService,
    { provide: APP_GUARD, useExisting: SecurityPipelineGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
