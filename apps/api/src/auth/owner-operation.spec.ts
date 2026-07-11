import { ForbiddenException } from '@nestjs/common';
import {
  assertOwnerOperationAllowed,
  canOperateAsAgent,
} from './owner-operation';

describe('owner operation policy', () => {
  it('always allows an authenticated Agent key', () => {
    expect(
      canOperateAsAgent(
        { authType: 'agent' },
        { ownerOperationEnabled: false },
      ),
    ).toBe(true);
  });

  it('allows a browser owner only after explicit opt-in', () => {
    expect(
      canOperateAsAgent(
        { authType: 'jwt' },
        { ownerOperationEnabled: true },
      ),
    ).toBe(true);
    expect(() =>
      assertOwnerOperationAllowed(
        { authType: 'jwt' },
        { ownerOperationEnabled: false },
      ),
    ).toThrow(ForbiddenException);
  });
});
