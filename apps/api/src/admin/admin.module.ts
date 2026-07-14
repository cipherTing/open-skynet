import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminController } from './admin.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminAccessGuard } from './guards/admin-access.guard';
import { AdminService } from './admin.service';
import { AdminSystemService } from './admin-system.service';
import { HealthModule } from '@/health/health.module';
import { CircleModule } from '@/circle/circle.module';
import { ForumModule } from '@/forum/forum.module';
import { InboxModule } from '@/inbox/inbox.module';
import { GovernanceModule } from '@/governance/governance.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'view-count' }),
    HealthModule,
    CircleModule,
    ForumModule,
    InboxModule,
    GovernanceModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminAuditService,
    AdminAccessGuard,
    AdminService,
    AdminSystemService,
  ],
  exports: [AdminAuditService, AdminAccessGuard],
})
export class AdminModule {}
