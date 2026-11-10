import { Body, Controller, Logger, Module, Post, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { resolve } from 'node:path';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';
import request from 'supertest';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { ApiValidationPipe } from '@/common/pipes/api-validation.pipe';
import { CreateStoryDocumentDto } from '@/story/dto/create-story-document.dto';
import { registerRequestBodyParsers } from './request-body-parsers';

@Controller('request-body-probe')
class RequestBodyProbeController {
  acceptedCount = 0;

  @Post()
  accept(@Body() dto: CreateStoryDocumentDto) {
    this.acceptedCount += 1;
    return { length: dto.content.length };
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
  controllers: [RequestBodyProbeController],
})
class RequestBodyProbeModule {}

describe('production request body boundary over HTTP', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let controller: RequestBodyProbeController;
  let loggerError: jest.SpiedFunction<Logger['error']>;

  beforeAll(async () => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    moduleRef = await Test.createTestingModule({ imports: [RequestBodyProbeModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    registerRequestBodyParsers(app);
    app.useGlobalPipes(
      new ApiValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    controller = moduleRef.get(RequestBodyProbeController);
    await app.listen(0);
  });

  beforeEach(() => {
    controller.acceptedCount = 0;
  });
  afterAll(async () => {
    await app.close();
    await moduleRef.close();
    loggerError.mockRestore();
  });

  it.each(['utf8', 'ascii-escaped'])(
    'accepts a 50000-character Chinese chapter encoded as %s',
    async (encoding) => {
      const serialized = JSON.stringify({
        kind: 'chapter',
        title: '潮汐',
        content: '潮'.repeat(50_000),
        changeSummary: '写入完整章节。',
      });
      const wire =
        encoding === 'ascii-escaped'
          ? serialized.replace(
              /[\u0080-\uffff]/g,
              (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
            )
          : serialized;
      await request(app.getHttpServer())
        .post('/request-body-probe')
        .set('Content-Type', 'application/json')
        .send(wire)
        .expect(201)
        .expect({ length: 50_000 });
      expect(controller.acceptedCount).toBe(1);
    },
  );

  it('accepts 50000 astral characters in ASCII-escaped JSON without truncation', async () => {
    const wire = JSON.stringify({
      kind: 'chapter',
      title: '星际航行',
      content: '🚀'.repeat(50_000),
      changeSummary: '记录完整航程。',
    }).replace(
      /[\u0080-\uffff]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
    await request(app.getHttpServer())
      .post('/request-body-probe')
      .set('Content-Type', 'application/json')
      .send(wire)
      .expect(201)
      .expect({ length: 100_000 });
    expect(controller.acceptedCount).toBe(1);
  });

  it('accepts a complete body above 50000 characters within the JSON byte limit', async () => {
    await request(app.getHttpServer())
      .post('/request-body-probe')
      .send({
        kind: 'chapter',
        title: '潮汐',
        content: '潮'.repeat(60_000),
        changeSummary: '一次提交完整正文。',
      })
      .expect(201)
      .expect({ length: 60_000 });
    expect(controller.acceptedCount).toBe(1);
  });

  it.each([
    [
      'application/json',
      JSON.stringify({ content: 'private-body-marker' + 'x'.repeat(1_048_576) }),
      1_048_576,
    ],
    [
      'application/x-www-form-urlencoded',
      'content=private-body-marker' + 'x'.repeat(65_536),
      65_536,
    ],
  ])('rejects an oversized %s body before the handler', async (contentType, wire, maxBytes) => {
    const response = await request(app.getHttpServer())
      .post('/request-body-probe')
      .set('Content-Type', contentType)
      .send(wire)
      .expect(413);
    expect(response.body).toEqual({
      error: {
        code: 'REQUEST_BODY_TOO_LARGE',
        message: 'The request body exceeds the allowed byte limit.',
        statusCode: 413,
        maxBytes,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('private-body-marker');
    expect(response.body.error).not.toHaveProperty('stack');
    expect(controller.acceptedCount).toBe(0);
  });

  it.each([
    ['en', 'The request body contains invalid JSON.'],
    ['zh-CN', '请求正文不是有效的 JSON。'],
  ])(
    'reports invalid JSON safely in %s without entering the handler',
    async (language, message) => {
      const response = await request(app.getHttpServer())
        .post('/request-body-probe')
        .set('Accept-Language', language)
        .set('Content-Type', 'application/json')
        .send('{"content":"private-body-marker",')
        .expect(400);
      expect(response.body).toEqual({ error: { code: 'INVALID_JSON', message, statusCode: 400 } });
      expect(JSON.stringify(response.body)).not.toContain('private-body-marker');
      expect(response.body.error).not.toHaveProperty('stack');
      expect(controller.acceptedCount).toBe(0);
    },
  );
});
