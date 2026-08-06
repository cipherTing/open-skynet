import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  json,
  urlencoded,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  getCorsOrigins,
  getTrustProxySetting,
  isSwaggerEnabled,
  validateSecuritySecrets,
} from './config/env';
import { ApiValidationPipe } from './common/pipes/api-validation.pipe';
import { McpHttpService } from './mcp/mcp-http.service';
import { normalizeMcpError } from './mcp/mcp.errors';
import { HttpException } from '@nestjs/common';

async function bootstrap() {
  validateSecuritySecrets();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const expressApp: Express = app.getHttpAdapter().getInstance();

  expressApp.disable('etag');
  expressApp.disable('x-powered-by');
  const trustProxy = getTrustProxySetting();
  if (trustProxy !== false) app.set('trust proxy', trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: false, limit: '64kb' }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path.startsWith('/api/v1/admin') || request.path.startsWith('/api/v1/auth')) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Pragma', 'no-cache');
    }
    next();
  });
  app.enableShutdownHooks();

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // 全局验证管道
  app.useGlobalPipes(
    new ApiValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — 限制允许的来源
  const allowedOrigins = getCorsOrigins();
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Skynet-Csrf',
      'Accept-Language',
      'MCP-Protocol-Version',
      'Mcp-Method',
      'Mcp-Name',
      'Mcp-Session-Id',
      'Last-Event-ID',
    ],
    exposedHeaders: ['Content-Language', 'Mcp-Session-Id'],
  });

  if (isSwaggerEnabled()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Skynet API')
      .setDescription('AI Agent 论坛与工作站平台 API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const mcpHttpService = app.get(McpHttpService);
  const mcpNodeHandler = mcpHttpService.getNodeHandler();
  expressApp.all('/api/v1/mcp', (request: Request, response: Response) => {
    void (async () => {
      try {
        await mcpHttpService.authenticate(request, response);
        if (response.headersSent) return;
        await mcpNodeHandler(request, response, request.body);
      } catch (error) {
        const normalized = normalizeMcpError(error);
        const status =
          error instanceof HttpException
            ? error.getStatus()
            : normalized.code === 'UNAUTHORIZED'
              ? 401
              : normalized.code === 'MCP_ORIGIN_FORBIDDEN'
                ? 403
                : 500;
        if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
        if (normalized.details.retryAfterSeconds !== undefined) {
          response.setHeader('Retry-After', String(normalized.details.retryAfterSeconds));
        }
        if (!response.headersSent) {
          response.status(status).json({
            error: {
              code: normalized.code,
              message: normalized.message,
            },
          });
        }
      }
    })();
  });

  const port = process.env.API_PORT || 8081;
  await app.listen(port);
  console.log(`🚀 Skynet API 运行在 http://localhost:${port}`);
  if (isSwaggerEnabled()) {
    console.log(`📚 Swagger 文档: http://localhost:${port}/api/docs`);
  }
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
