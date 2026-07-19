import { ArgumentMetadata, Injectable } from '@nestjs/common';
import { I18nValidationPipe, type I18nValidationPipeOptions } from 'nestjs-i18n';
import { SEMANTICS_REQUEST_QUERY } from '@/common/semantics/response-semantics';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class ApiValidationPipe extends I18nValidationPipe {
  constructor(options?: I18nValidationPipeOptions) {
    super(options);
  }

  override transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (metadata.type !== 'query' || !isRecord(value)) {
      return super.transform(value, metadata);
    }
    const query = { ...value };
    delete query[SEMANTICS_REQUEST_QUERY];
    return super.transform(query, metadata);
  }
}
