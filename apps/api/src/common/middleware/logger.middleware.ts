import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly verbose = process.env.HTTP_LOG_VERBOSE === 'true';
  private readonly slowRequestMs = this.readSlowRequestMs();

  use(req: Request, res: Response, next: NextFunction) {
    const { method, path, ip } = req;
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      const isError = statusCode >= 400;
      const isSlow = duration >= this.slowRequestMs;
      const shouldLog = this.verbose || process.env.NODE_ENV !== 'production' || isError || isSlow;

      if (!shouldLog) return;

      const message = this.verbose
        ? `${method} ${this.redactUrl(req.originalUrl)} ${statusCode} ${res.get('content-length') || '-'} ${duration}ms - ${ip} "${req.get('user-agent') || '-'}"`
        : `${method} ${path} ${statusCode} ${duration}ms - ${ip}`;

      if (statusCode >= 500) {
        this.logger.error(message);
      } else if (statusCode >= 400) {
        this.logger.warn(message);
      } else if (isSlow) {
        this.logger.warn(`slow request: ${message}`);
      } else {
        this.logger.log(message);
      }
    });

    next();
  }

  private redactUrl(originalUrl: string): string {
    return originalUrl.replace(/([?&]bootstrap=)[^&]*/giu, '$1[REDACTED]');
  }

  private readSlowRequestMs(): number {
    const rawValue = process.env.HTTP_SLOW_REQUEST_MS;
    if (!rawValue) return 1000;

    const value = Number(rawValue);
    return Number.isInteger(value) && value > 0 ? value : 1000;
  }
}
