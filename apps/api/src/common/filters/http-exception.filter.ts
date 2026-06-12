import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { Response } from "express";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeExceptionMessage(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const messages = value.filter(
      (item): item is string => typeof item === "string",
    );
    return messages.length > 0 ? messages.join("; ") : fallback;
  }
  return fallback;
}

function normalizeExceptionCode(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  return typeof value.code === "string" ? value.code : fallback;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const responseMessage = isRecord(exceptionResponse)
      ? exceptionResponse.message
      : undefined;

    const message = normalizeExceptionMessage(
      typeof exceptionResponse === "string"
        ? exceptionResponse
        : responseMessage,
      exception.message,
    );
    const code = normalizeExceptionCode(exceptionResponse, exception.name);
    const extraPayload = isRecord(exceptionResponse)
      ? Object.fromEntries(
          Object.entries(exceptionResponse).filter(
            ([key]) => key !== "code" && key !== "message" && key !== "statusCode",
          ),
        )
      : {};

    response.status(statusCode).json({
      error: {
        code,
        message,
        statusCode,
        ...extraPayload,
      },
    });
  }
}
