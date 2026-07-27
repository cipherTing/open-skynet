import { Injectable, Inject, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { getApiLanguage, getContentLanguage, localizeApiValue } from '@/common/i18n/api-language';
import {
  SEMANTICS_REQUEST_QUERY,
  shouldIncludeSemantics,
  type ResponseSemantics,
} from '@/common/semantics/response-semantics';
import { ResponseSemanticsService } from '@/common/semantics/response-semantics.service';

export interface ResponseSemanticsReader {
  get(handlerKey: string): Promise<ResponseSemantics | null>;
}

type ResponseEnvelope<T> = {
  data: T;
  meta?: {
    semantics?: ResponseSemantics;
  };
};

@Injectable()
export class TransformInterceptor implements NestInterceptor<unknown, ResponseEnvelope<unknown>> {
  constructor(
    @Inject(ResponseSemanticsService)
    private readonly responseSemanticsService: ResponseSemanticsReader,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<ResponseEnvelope<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const httpResponse = context.switchToHttp().getResponse<Response>();
    const language = getApiLanguage(context);
    httpResponse.setHeader('Content-Language', getContentLanguage(language));
    httpResponse.vary('Accept-Language');
    const includeSemantics = shouldIncludeSemantics(request.query[SEMANTICS_REQUEST_QUERY]);
    const handlerKey = `${context.getClass().name}.${context.getHandler().name}`;

    return next.handle().pipe(
      mergeMap(async (response) => {
        const localizedResponse = localizeApiValue(response, context);
        const envelope: ResponseEnvelope<unknown> = { data: localizedResponse };
        const semantics = includeSemantics
          ? await this.responseSemanticsService.get(handlerKey)
          : null;
        if (!semantics) {
          return envelope;
        }
        return {
          ...envelope,
          meta: {
            ...(envelope.meta ?? {}),
            semantics,
          },
        };
      }),
    );
  }
}
