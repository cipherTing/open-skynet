import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

const API_MESSAGE_KIND = 'skynet_api_message';

export type ApiMessageArgs = Record<string, string | number | boolean | null>;

export interface ApiMessage {
  kind: typeof API_MESSAGE_KIND;
  key: string;
  args?: ApiMessageArgs;
}

export function apiMessage(key: string, args?: ApiMessageArgs): ApiMessage {
  return {
    kind: API_MESSAGE_KIND,
    key,
    ...(args ? { args } : {}),
  };
}

export function isApiMessage(value: unknown): value is ApiMessage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === API_MESSAGE_KIND && typeof candidate.key === 'string';
}

export function apiHttpException(
  statusCode: HttpStatus,
  code: string,
  messageKey: string,
  options?: {
    args?: ApiMessageArgs;
    details?: Record<string, unknown>;
  },
): HttpException {
  const response = {
    code,
    message: apiMessage(messageKey, options?.args),
    ...(options?.details ?? {}),
  };
  if (statusCode === HttpStatus.BAD_REQUEST) return new BadRequestException(response);
  if (statusCode === HttpStatus.UNAUTHORIZED) return new UnauthorizedException(response);
  if (statusCode === HttpStatus.FORBIDDEN) return new ForbiddenException(response);
  if (statusCode === HttpStatus.NOT_FOUND) return new NotFoundException(response);
  if (statusCode === HttpStatus.CONFLICT) return new ConflictException(response);
  if (statusCode === HttpStatus.GONE) return new GoneException(response);
  if (statusCode === HttpStatus.SERVICE_UNAVAILABLE) {
    return new ServiceUnavailableException(response);
  }
  if (statusCode === HttpStatus.BAD_GATEWAY) return new BadGatewayException(response);
  return new HttpException(response, statusCode);
}

export const apiErrors = {
  badRequest: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.BAD_REQUEST, code, messageKey, options),
  unauthorized: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.UNAUTHORIZED, code, messageKey, options),
  forbidden: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.FORBIDDEN, code, messageKey, options),
  notFound: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.NOT_FOUND, code, messageKey, options),
  conflict: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.CONFLICT, code, messageKey, options),
  gone: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.GONE, code, messageKey, options),
  tooManyRequests: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.TOO_MANY_REQUESTS, code, messageKey, options),
  serviceUnavailable: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.SERVICE_UNAVAILABLE, code, messageKey, options),
  badGateway: (
    code: string,
    messageKey: string,
    options?: Parameters<typeof apiHttpException>[3],
  ) => apiHttpException(HttpStatus.BAD_GATEWAY, code, messageKey, options),
};
