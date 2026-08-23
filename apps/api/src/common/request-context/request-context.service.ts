import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

type RequestContext = {
  requestId: string;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(requestId: string, operation: () => T): T {
    return this.storage.run({ requestId }, operation);
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
