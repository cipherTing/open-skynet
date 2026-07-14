import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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
import { getTrustProxySetting, isSwaggerEnabled, validateSecuritySecrets } from './config/env';

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
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — 限制允许的来源
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Skynet-Csrf'],
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
