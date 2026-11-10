import { Body, Controller, Get, Logger, Module, Post, Query } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { IsString, MinLength } from 'class-validator';
import type { INestApplication } from '@nestjs/common';
import { resolve } from 'node:path';
import request from 'supertest';
import { AcceptLanguageResolver, I18nModule, I18nService } from 'nestjs-i18n';
import { apiErrors, apiMessage } from '@/common/i18n/api-message';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import {
  TransformInterceptor,
  type ResponseSemanticsReader,
} from '@/common/interceptors/transform.interceptor';
import { InsufficientStaminaException } from '@/progression/insufficient-stamina.exception';
import { ApiValidationPipe } from '@/common/pipes/api-validation.pipe';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import type { ResponseSemantics } from '@/common/semantics/response-semantics';
import { ListPostsDto } from '@/forum/dto/list-posts.dto';
import { ListAgentActivityDto } from '@/forum/dto/list-agent-activity.dto';
import { ListRepliesDto } from '@/forum/dto/list-replies.dto';
import { CreatePostDto } from '@/forum/dto/create-post.dto';
import { CreateReplyDto } from '@/forum/dto/create-reply.dto';
import { ListNotificationsDto } from '@/notification/dto/list-notifications.dto';
import { MarkNotificationsReadDto } from '@/notification/dto/mark-notifications-read.dto';

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
  acceptedReplyCount = 0;

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

  @Get('business-data-field')
  businessDataField() {
    return { data: 'original-business-field' };
  }

  @Get('cursor-pagination')
  cursorPagination(@Query() query: CursorPaginationDto) {
    return query;
  }

  @Get('post-list-validation')
  postListValidation(@Query() query: ListPostsDto) {
    return query;
  }

  @Get('activity-validation')
  activityValidation(@Query() query: ListAgentActivityDto) {
    return query;
  }

  @Get('replies-validation')
  repliesValidation(@Query() query: ListRepliesDto) {
    return query;
  }

  @Get('notifications-validation')
  notificationsValidation(@Query() query: ListNotificationsDto) {
    return query;
  }

  @Post('notification-read-validation')
  notificationReadValidation(@Body() dto: MarkNotificationsReadDto) {
    return dto;
  }

  @Post('post-create-validation')
  postCreateValidation(@Body() dto: CreatePostDto) {
    return dto;
  }

  @Post('reply-create-validation')
  replyCreateValidation(@Body() dto: CreateReplyDto) {
    this.acceptedReplyCount += 1;
    return dto;
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
      resolvers: [{ use: AcceptLanguageResolver, options: { matchType: 'loose' } }],
      logging: false,
    }),
  ],
  controllers: [ForumController],
})
class ContractTestModule {}

describe('API language contract', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let i18n: I18nService;
  let loggerError: jest.SpiedFunction<Logger['error']>;

  beforeAll(async () => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    moduleRef = await Test.createTestingModule({ imports: [ContractTestModule] }).compile();
    i18n = moduleRef.get(I18nService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ApiValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    const successSemantics: ResponseSemantics = {
      message: 'System-generated result message in the negotiated response language.',
      'level.name': 'Human-readable name of the current level.',
      createdAt: 'Time when this record was created.',
    };
    const querySemantics: ResponseSemantics = {
      title: 'Title associated with this resource.',
    };
    const responseSemanticsReader: ResponseSemanticsReader = {
      get: async (handlerKey) => {
        if (handlerKey === 'ForumController.success') return successSemantics;
        if (handlerKey === 'ForumController.querySemantics') return querySemantics;
        return null;
      },
    };
    app.useGlobalInterceptors(new TransformInterceptor(responseSemanticsReader));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  it.each([
    [
      'en',
      'storyVersionConflict',
      { currentVersion: 3 },
      'The story changed at version 3. Read the latest version and retry your edit.',
    ],
    [
      'zh',
      'storyVersionConflict',
      { currentVersion: 3 },
      '故事已更新到第 3 版，请读取最新版本后再提交修改。',
    ],
    [
      'en',
      'storyStructureVersionConflict',
      { currentStructureVersion: 6 },
      'The directory is now at version 6. Read it again before submitting.',
    ],
    [
      'zh',
      'storyStructureVersionConflict',
      { currentStructureVersion: 6 },
      '目录已更新到第 6 版，请重新读取目录后再提交。',
    ],
    [
      'en',
      'storyEditRestricted',
      { expiresAt: '2026-11-09T14:00:00Z' },
      'This Agent temporarily cannot edit this document. The restriction ends at 2026-11-09T14:00:00Z.',
    ],
    [
      'zh',
      'storyEditRestricted',
      { expiresAt: '2026-11-09T14:00:00Z' },
      '该 Agent 暂时不能修改这份资料，限制将于 2026-11-09T14:00:00Z 结束。',
    ],
  ])('renders actionable story errors in %s for %s', (lang, key, args, expected) => {
    expect(i18n.t('api.errors.' + key, { lang, args })).toBe(expected);
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
  ])('negotiates %s as %s', async (acceptLanguage, contentLanguage, message, levelName) => {
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
  });

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

  it.each([
    ['zh', '你的验证码是：123456'],
    ['en', 'Your verification code is: 123456'],
  ])('renders a verification code into the %s email template', async (language, expected) => {
    expect(
      i18n.t('api.mail.verificationBody', {
        lang: language,
        args: { code: '123456' },
      }),
    ).toContain(expected);
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

  it('does not mistake a business data field for the global response envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/contract-test/business-data-field')
      .expect(200);
    expect(response.body).toEqual({ data: { data: 'original-business-field' } });
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

  it.each([
    ['cursor-pagination?limit=51', 'limit', 'max', { max: 50 }],
    ['cursor-pagination?limit=0', 'limit', 'min', { min: 1 }],
    [
      'post-list-validation?scope=MY_CIRCLES',
      'scope',
      'isEnum',
      { allowedValues: ['all', 'my-circles'] },
    ],
    [
      'post-list-validation?sortBy=popular',
      'sortBy',
      'isEnum',
      { allowedValues: ['hot', 'latest'] },
    ],
    ['post-list-validation?search=x', 'search', 'minLength', { minLength: 2 }],
    [`post-list-validation?search=${'x'.repeat(201)}`, 'search', 'maxLength', { maxLength: 200 }],
    [
      'replies-validation?view=FLAT',
      'view',
      'isEnum',
      { allowedValues: ['THREAD', 'CHILDREN', 'SELECTION'] },
    ],
    ['replies-validation?childLimit=11', 'childLimit', 'max', { max: 10 }],
    ['replies-validation?childLimit=0', 'childLimit', 'min', { min: 1 }],
    ['replies-validation?limit=51', 'limit', 'max', { max: 50 }],
    [
      `replies-validation?parentReplyId=${'x'.repeat(129)}`,
      'parentReplyId',
      'maxLength',
      { maxLength: 128 },
    ],
    [
      'activity-validation?type=MY_POSTS',
      'type',
      'isEnum',
      {
        allowedValues: [
          'POSTS',
          'REPLIES',
          'CIRCLES',
          'FAVORITES',
          'INTERACTIONS',
          'VIEW_HISTORY',
          'WATCHES',
        ],
      },
    ],
    [
      'notifications-validation?filter=replies',
      'filter',
      'isEnum',
      { allowedValues: ['all', 'reply', 'mention', 'announcement', 'unread'] },
    ],
  ])('returns usable constraints for %s', async (path, field, code, params) => {
    const response = await request(app.getHttpServer()).get(`/contract-test/${path}`).expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', statusCode: 400 });
    expect(response.body.error.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field,
          rules: expect.arrayContaining([expect.objectContaining({ code, params })]),
        }),
      ]),
    );
  });

  it.each([
    [[], 'arrayMinSize', { minItems: 1 }],
    [
      Array.from({ length: 101 }, () => '507f1f77bcf86cd799439011'),
      'arrayMaxSize',
      { maxItems: 100 },
    ],
  ])('returns notification batch constraints for %s', async (ids, code, params) => {
    const response = await request(app.getHttpServer())
      .post('/contract-test/notification-read-validation')
      .send({ ids })
      .expect(400);
    expect(response.body.error.validationErrors).toEqual([
      { field: 'ids', rules: [expect.objectContaining({ code, params })] },
    ]);
  });

  it('preserves full nested quote paths and omits submitted values from validation output', async () => {
    const response = await request(app.getHttpServer())
      .post('/contract-test/reply-create-validation')
      .send({
        content: 'A reply.',
        quote: {
          sourceType: 'REPLY',
          sourceId: '507f1f77bcf86cd799439011',
          sourceContentVersion: 0,
          text: 'private-quote-marker'.repeat(120),
        },
      })
      .expect(400);
    expect(response.body.error.validationErrors).toEqual(
      expect.arrayContaining([
        {
          field: 'quote.sourceContentVersion',
          rules: [expect.objectContaining({ code: 'min', params: { min: 1 } })],
        },
        {
          field: 'quote.text',
          rules: [expect.objectContaining({ code: 'maxLength', params: { maxLength: 2000 } })],
        },
      ]),
    );
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('private-quote-marker');
    expect(serialized).not.toContain('"target":');
    expect(serialized).not.toContain('"value":');
  });

  it.each([
    { name: 'empty array', quote: [] },
    {
      name: 'object array',
      quote: [
        {
          sourceType: 'REPLY',
          sourceId: '507f1f77bcf86cd799439011',
          sourceContentVersion: 1,
          text: 'A quoted passage.',
        },
      ],
    },
  ])('rejects a quote $name before entering the reply handler', async ({ quote }) => {
    const controller = moduleRef.get(ForumController);
    const acceptedBefore = controller.acceptedReplyCount;
    const response = await request(app.getHttpServer())
      .post('/contract-test/reply-create-validation')
      .send({ content: 'A reply.', quote })
      .expect(400);
    expect(response.body.error.validationErrors).toContainEqual({
      field: 'quote',
      rules: [expect.objectContaining({ code: 'isObject' })],
    });
    expect(controller.acceptedReplyCount).toBe(acceptedBefore);
  });

  it('keeps constraint codes and parameters identical across response languages', async () => {
    const english = await request(app.getHttpServer())
      .get('/contract-test/post-list-validation?scope=INVALID')
      .set('Accept-Language', 'en')
      .expect(400);
    const chinese = await request(app.getHttpServer())
      .get('/contract-test/post-list-validation?scope=INVALID')
      .set('Accept-Language', 'zh-CN')
      .expect(400);
    expect(english.body.error.validationErrors).toEqual([
      {
        field: 'scope',
        rules: [
          {
            code: 'isEnum',
            params: { allowedValues: ['all', 'my-circles'] },
            message: 'The value is not one of the supported options.',
          },
        ],
      },
    ]);
    expect(chinese.body.error.validationErrors).toEqual([
      {
        field: 'scope',
        rules: [
          {
            code: 'isEnum',
            params: { allowedValues: ['all', 'my-circles'] },
            message: '字段值不在支持的选项中。',
          },
        ],
      },
    ]);
  });

  it('reports creation length limits without returning the submitted body', async () => {
    const response = await request(app.getHttpServer())
      .post('/contract-test/post-create-validation')
      .send({
        title: 'Long draft',
        content: 'private-post-marker'.repeat(3000),
        tags: ['DISCUSSION'],
        circleName: 'A circle',
      })
      .expect(400);
    expect(response.body.error.validationErrors).toEqual(
      expect.arrayContaining([
        {
          field: 'content',
          rules: [expect.objectContaining({ code: 'maxLength', params: { maxLength: 50000 } })],
        },
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('private-post-marker');
  });

  it('accepts the documented reply filter, search scope and nested reply reference', async () => {
    await request(app.getHttpServer())
      .get('/contract-test/notifications-validation?filter=reply&limit=50')
      .expect(200);
    await request(app.getHttpServer())
      .get(
        '/contract-test/post-list-validation?scope=my-circles&sortBy=latest&search=Linux&limit=50',
      )
      .expect(200);
    await request(app.getHttpServer())
      .post('/contract-test/reply-create-validation')
      .send({
        content: 'A reply.',
        quote: {
          sourceType: 'REPLY',
          sourceId: '507f1f77bcf86cd799439011',
          sourceContentVersion: 1,
          text: 'A quoted passage.',
        },
      })
      .expect(201);
  });

  it.each([
    { content: 'A reply without a quote.' },
    { content: 'A reply with null quote.', quote: null },
  ])('preserves the existing omitted/null quote semantics for %j', async (body) => {
    await request(app.getHttpServer())
      .post('/contract-test/reply-create-validation')
      .send(body)
      .expect(201);
  });

  it.each(['page', 'pageSize'])('rejects the legacy %s cursor-list parameter', async (field) => {
    const response = await request(app.getHttpServer())
      .get(`/contract-test/cursor-pagination?limit=20&${field}=2`)
      .expect(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      statusCode: 400,
    });
    expect(response.body.error.validationErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
  });

  it('returns the stable pagination error for malformed cursor input', async () => {
    const response = await request(app.getHttpServer())
      .get(`/contract-test/cursor-pagination?cursor=${'x'.repeat(1025)}`)
      .expect(400);
    expect(response.body.error).toMatchObject({
      code: 'PAGINATION_CURSOR_INVALID',
      statusCode: 400,
    });
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
