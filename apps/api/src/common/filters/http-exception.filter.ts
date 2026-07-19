import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { I18nValidationException } from 'nestjs-i18n';
import {
  getApiLanguage,
  getContentLanguage,
  translateApiMessage,
} from '@/common/i18n/api-language';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeExceptionCode(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  return typeof value.code === "string" ? value.code : fallback;
}

function messageKeyForStatus(statusCode: number): string {
  if (statusCode === HttpStatus.BAD_REQUEST || statusCode === HttpStatus.UNPROCESSABLE_ENTITY) {
    return 'api.errors.badRequest';
  }
  if (statusCode === HttpStatus.UNAUTHORIZED) return 'api.errors.unauthorized';
  if (statusCode === HttpStatus.FORBIDDEN) return 'api.errors.forbidden';
  if (statusCode === HttpStatus.NOT_FOUND) return 'api.errors.notFound';
  if (statusCode === HttpStatus.CONFLICT) return 'api.errors.conflict';
  if (statusCode === HttpStatus.GONE) return 'api.errors.gone';
  if (statusCode === HttpStatus.TOO_MANY_REQUESTS) return 'api.errors.rateLimited';
  if (statusCode === HttpStatus.SERVICE_UNAVAILABLE) return 'api.errors.serviceUnavailable';
  return statusCode >= 500 ? 'api.errors.internal' : 'api.errors.badRequest';
}

function defaultCodeForStatus(statusCode: number): string {
  if (statusCode === HttpStatus.BAD_REQUEST || statusCode === HttpStatus.UNPROCESSABLE_ENTITY) {
    return 'BAD_REQUEST';
  }
  if (statusCode === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
  if (statusCode === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
  if (statusCode === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (statusCode === HttpStatus.CONFLICT) return 'CONFLICT';
  if (statusCode === HttpStatus.GONE) return 'GONE';
  if (statusCode === HttpStatus.TOO_MANY_REQUESTS) return 'RATE_LIMITED';
  if (statusCode === HttpStatus.SERVICE_UNAVAILABLE) return 'SERVICE_UNAVAILABLE';
  if (statusCode >= 500) return 'INTERNAL_SERVER_ERROR';
  return 'HTTP_ERROR';
}

function translateKey(host: ArgumentsHost, key: string): string {
  const translated = translateApiMessage(
    { kind: 'skynet_api_message', key },
    host,
  );
  return translated ?? 'The service could not complete the request.';
}

function flattenValidationErrors(
  errors: unknown,
  host: ArgumentsHost,
): Array<{ field: string; rules: Array<{ code: string; message: string }> }> {
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((error) => {
    if (!isRecord(error)) return [];
    const field = typeof error.property === 'string' ? error.property : '';
    const constraints = isRecord(error.constraints) ? Object.keys(error.constraints) : [];
    const rules = constraints.map((rule) => ({
      code: rule,
      message: translateKey(host, `api.validation.${rule}`),
    }));
    const current = field && rules.length > 0 ? [{ field, rules }] : [];
    return [...current, ...flattenValidationErrors(error.children, host)];
  });
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const language = getApiLanguage(host);
    response.setHeader('Content-Language', getContentLanguage(language));
    response.vary('Accept-Language');

    if (!(exception instanceof HttpException)) {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(error.message, error.stack);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: translateKey(host, 'api.errors.internal'),
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        },
      });
      return;
    }

    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const responseMessage = isRecord(exceptionResponse)
      ? exceptionResponse.message
      : undefined;
    const localizedMessage = translateApiMessage(responseMessage, host);
    const code = exception instanceof I18nValidationException
      ? 'VALIDATION_FAILED'
      : normalizeExceptionCode(exceptionResponse, defaultCodeForStatus(statusCode));
    const validationErrors = exception instanceof I18nValidationException
      ? flattenValidationErrors(exception.errors, host)
      : [];
    const message = localizedMessage
      ?? translateKey(
        host,
        exception instanceof I18nValidationException
          ? 'api.errors.validation'
          : messageKeyForStatus(statusCode),
      );
    const extraPayload = isRecord(exceptionResponse)
      ? Object.fromEntries(
          Object.entries(exceptionResponse).filter(
            ([key]) => !['code', 'message', 'statusCode', 'error'].includes(key),
          ),
        )
      : {};

    response.status(statusCode).json({
      error: {
        code,
        message,
        statusCode,
        ...extraPayload,
        ...(validationErrors.length > 0 ? { validationErrors } : {}),
      },
    });
  }
}
