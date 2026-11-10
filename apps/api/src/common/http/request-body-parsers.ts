import { HttpStatus, type INestApplication } from '@nestjs/common';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { I18nMiddleware } from 'nestjs-i18n';
import { apiErrors, apiHttpException } from '@/common/i18n/api-message';

const JSON_REQUEST_BODY_MAX_BYTES = 1_048_576;
const URLENCODED_REQUEST_BODY_MAX_BYTES = 65_536;
const BODY_PARSER_ERROR_TYPES = {
  TOO_LARGE: 'entity.too.large',
  INVALID_JSON: 'entity.parse.failed',
} as const;

function isRecord(error: unknown): error is Record<string, unknown> {
  return error !== null && typeof error === 'object' && !Array.isArray(error);
}

function normalizeRequestBodyParserError(error: unknown): unknown {
  if (!isRecord(error)) return error;
  if (
    error.type === BODY_PARSER_ERROR_TYPES.TOO_LARGE &&
    error.status === HttpStatus.PAYLOAD_TOO_LARGE &&
    typeof error.limit === 'number' &&
    Number.isSafeInteger(error.limit) &&
    error.limit > 0
  ) {
    return apiHttpException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'REQUEST_BODY_TOO_LARGE',
      'api.errors.requestBodyTooLarge',
      {
        details: { maxBytes: error.limit },
      },
    );
  }
  if (
    error.type === BODY_PARSER_ERROR_TYPES.INVALID_JSON &&
    error.status === HttpStatus.BAD_REQUEST
  ) {
    return apiErrors.badRequest('INVALID_JSON', 'api.errors.invalidJson');
  }
  return error;
}

export function registerRequestBodyParsers(app: INestApplication): void {
  const i18nMiddleware = app.get(I18nMiddleware);
  app.use(i18nMiddleware.use.bind(i18nMiddleware));
  app.use(json({ limit: JSON_REQUEST_BODY_MAX_BYTES }));
  app.use(urlencoded({ extended: false, limit: URLENCODED_REQUEST_BODY_MAX_BYTES }));
  app.use((error: unknown, _request: Request, _response: Response, next: NextFunction) => {
    next(normalizeRequestBodyParserError(error));
  });
}
