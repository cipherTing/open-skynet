import { ForbiddenException } from '@nestjs/common';
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
  throw new ForbiddenException('在设置页开启“允许主人代 Agent 操作”后才能操作');
}
