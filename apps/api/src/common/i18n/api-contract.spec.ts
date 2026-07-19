import {
  Body,
  Controller,
  Get,
  Logger,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import type { INestApplication } from '@nestjs/common';
import { resolve } from 'node:path';
import request from 'supertest';
import {
  AcceptLanguageResolver,
  I18nModule,
} from 'nestjs-i18n';
import { apiErrors, apiMessage } from '@/common/i18n/api-message';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { InsufficientStaminaException } from '@/progression/insufficient-stamina.exception';
import { ApiValidationPipe } from '@/common/pipes/api-validation.pipe';

class TestBodyDto {
  @IsString()
  @MinLength(3)
  value!: string;
}

class TestQueryDto {
  @IsString()
  value!: string;
}

@Controller('contract-test')
class ForumController {
  @Get('success')
  success() {
    return {
      message: apiMessage('api.success.loggedOut'),
      level: { name: apiMessage('api.progression.levels.1.name') },
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
    };
  }

  @Get('query-semantics')
  querySemantics(@Query() query: TestQueryDto) {
    return { title: query.value };
  }

  @Get('error')
  error() {
    throw apiErrors.conflict('POST_VERSION_CONFLICT', 'api.errors.postVersionConflict');
  }

  @Post('validation')
  validation(@Body() dto: TestBodyDto) {
    return dto;
  }

  @Get('unknown')
  unknown() {
    throw new Error('private internal failure detail');
  }

  @Get('rate-limit')
  rateLimit() {
    throw apiErrors.tooManyRequests('RATE_LIMITED', 'api.errors.rateLimited', {
      details: { retryAfterSeconds: 2 },
    });
  }

  @Get('stamina')
  stamina() {
    throw new InsufficientStaminaException({
      currentStamina: 1,
      requiredStamina: 8,
      nextRecoverAt: '2026-07-19T01:00:00.000Z',
    });
  }

}

@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      fallbacks: { 'en-*': 'en', 'zh-*': 'zh' },
      loaderOptions: { path: resolve(__dirname, '../../i18n'), watch: false },
      resolvers: [
        { use: AcceptLanguageResolver, options: { matchType: 'loose' } },
      ],
      logging: false,
    }),
  ],
  controllers: [ForumController],
})
class ContractTestModule {}

describe('API language contract', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let loggerError: jest.SpiedFunction<Logger['error']>;

  beforeAll(async () => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    moduleRef = await Test.createTestingModule({ imports: [ContractTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ApiValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await moduleRef.close();
    loggerError.mockRestore();
  });

  it.each([
    [undefined, 'en', 'Signed out successfully.', 'Vacant'],
    ['en-US', 'en', 'Signed out successfully.', 'Vacant'],
    ['zh', 'zh-CN', '已退出登录。', '虚位'],
    ['zh-CN;q=0.9,en;q=0.8', 'zh-CN', '已退出登录。', '虚位'],
    ['fr-FR', 'en', 'Signed out successfully.', 'Vacant'],
  ])(
    'negotiates %s as %s',
    async (acceptLanguage, contentLanguage, message, levelName) => {
      const pending = request(app.getHttpServer()).get('/contract-test/success');
      if (acceptLanguage) pending.set('Accept-Language', acceptLanguage);
      const response = await pending.expect(200);
      expect(response.headers['content-language']).toBe(contentLanguage);
      expect(response.headers.vary).toContain('Accept-Language');
      expect(response.body.data).toEqual({
        message,
        level: { name: levelName },
        createdAt: '2026-07-19T00:00:00.000Z',
      });
    },
  );

  it('localizes a stable business error without changing its code', async () => {
    const response = await request(app.getHttpServer())
      .get('/contract-test/error')
      .set('Accept-Language', 'zh-CN')
      .expect(409);
    expect(response.headers['content-language']).toBe('zh-CN');
    expect(response.body.error).toMatchObject({
      code: 'POST_VERSION_CONFLICT',
      message: '帖子已经发生变化，请读取最新版本后再修改。',
      statusCode: 409,
    });
  });

  it('returns a Chinese message and English field semantics together', async () => {
    const response = await request(app.getHttpServer())
      .get('/contract-test/success?includeSemantics=1')
      .set('Accept-Language', 'zh-CN')
      .expect(200);
    expect(response.body.data.message).toBe('已退出登录。');
    expect(response.body.meta.semantics.message).toBe(
      'System-generated result message in the negotiated response language.',
    );
  });

  it('keeps includeSemantics out of DTO validation', async () => {
    const response = await request(app.getHttpServer())
      .get('/contract-test/query-semantics?value=hello&includeSemantics=1')
      .expect(200);
    expect(response.body).toMatchObject({
      data: { title: 'hello' },
      meta: { semantics: { title: 'Title associated with this resource.' } },
    });
  });

  it('localizes DTO validation details', async () => {
    const response = await request(app.getHttpServer())
      .post('/contract-test/validation')
      .set('Accept-Language', 'zh-CN')
      .send({ value: 'x' })
      .expect(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: '请求字段校验失败。',
    });
    expect(response.body.error.validationErrors).toEqual([
      {
        field: 'value',
        rules: [{ code: 'minLength', message: '字段值短于允许长度。' }],
      },
    ]);
  });

  it('does not expose an unknown internal exception message', async () => {
    const response = await request(app.getHttpServer())
      .get('/contract-test/unknown')
      .set('Accept-Language', 'en')
      .expect(500);
    expect(response.body.error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'The service could not complete the request.',
      statusCode: 500,
    });
    expect(JSON.stringify(response.body)).not.toContain('private internal failure detail');
  });

  it('localizes rate-limit and stamina errors while preserving details', async () => {
    const rateLimit = await request(app.getHttpServer())
      .get('/contract-test/rate-limit')
      .set('Accept-Language', 'zh-CN')
      .expect(429);
    expect(rateLimit.body.error).toMatchObject({
      code: 'RATE_LIMITED',
      message: '请求过于频繁，请稍后再试。',
      retryAfterSeconds: 2,
    });

    const stamina = await request(app.getHttpServer())
      .get('/contract-test/stamina')
      .set('Accept-Language', 'en')
      .expect(409);
    expect(stamina.body.error).toMatchObject({
      code: 'INSUFFICIENT_STAMINA',
      message: 'There is not enough stamina to perform this action.',
      currentStamina: 1,
      requiredStamina: 8,
      nextRecoverAt: '2026-07-19T01:00:00.000Z',
    });
  });
});
