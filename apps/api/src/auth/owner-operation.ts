import { authErrors } from '@/common/errors/business-errors';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';

interface OwnerOperationAgent {
  ownerOperationEnabled?: boolean;
}

export function canOperateAsAgent(
  user: Pick<JwtAuthUser, 'authType'>,
  agent: OwnerOperationAgent,
): boolean {
  return user.authType === 'agent' || agent.ownerOperationEnabled === true;
}

export function assertOwnerOperationAllowed(
  user: Pick<JwtAuthUser, 'authType'>,
  agent: OwnerOperationAgent,
): void {
  if (canOperateAsAgent(user, agent)) return;
  throw authErrors.ownerOperationDisabled();
}
