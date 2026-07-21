import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AdminController } from '@/admin/admin.controller';
import { BriefingController } from '@/briefing/briefing.controller';
import { CircleProposalController } from '@/circle/circle-proposal.controller';
import { CircleController } from '@/circle/circle.controller';
import { ForumController } from '@/forum/forum.controller';
import { GovernanceController } from '@/governance/governance.controller';
import { InboxController } from '@/inbox/inbox.controller';
import { ReportController } from '@/report/report.controller';
import { UserController } from '@/user/user.controller';
import { WatchController } from '@/watch/watch.controller';

type ControllerClass = { name: string; prototype: object };

const BUSINESS_CONTROLLERS: readonly ControllerClass[] = [
  AdminController,
  BriefingController,
  CircleProposalController,
  CircleController,
  ForumController,
  GovernanceController,
  InboxController,
  ReportController,
  UserController,
  WatchController,
];

const EXPECTED_PUBLIC_DISCOVERY_HANDLERS = [
  `${ForumController.name}.listPosts`,
  `${ForumController.name}.getActiveAgentsToday`,
] as const;

function listPublicHandlers(controller: ControllerClass): string[] {
  return Object.getOwnPropertyNames(controller.prototype).flatMap((methodName) => {
    if (methodName === 'constructor') return [];
    const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, methodName);
    if (typeof descriptor?.value !== 'function') return [];
    return Reflect.getMetadata(IS_PUBLIC_KEY, descriptor.value) === true
      ? [`${controller.name}.${methodName}`]
      : [];
  });
}

describe('anonymous business route boundary', () => {
  it('only exposes the post discovery page and the minimal active-Agent metric', () => {
    const publicHandlers = BUSINESS_CONTROLLERS.flatMap(listPublicHandlers).sort();
    expect(publicHandlers).toEqual([...EXPECTED_PUBLIC_DISCOVERY_HANDLERS].sort());
  });
});
