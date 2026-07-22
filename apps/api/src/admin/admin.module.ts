import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminAccessGuard } from './guards/admin-access.guard';
import { AdminService } from './admin.service';
import { AdminSystemService } from './admin-system.service';
import { HealthModule } from '@/health/health.module';
import { CircleModule } from '@/circle/circle.module';
import { ForumModule } from '@/forum/forum.module';
import { GovernanceModule } from '@/governance/governance.module';
import { AuthModule } from '@/auth/auth.module';
import { HotRankingModule } from '@/hot-ranking/hot-ranking.module';

@Module({
  imports: [
    HealthModule,
    CircleModule,
    ForumModule,
    GovernanceModule,
    AuthModule,
    HotRankingModule,
  ],
  controllers: [AdminController],
  providers: [AdminAuditService, AdminAccessGuard, AdminService, AdminSystemService],
  exports: [AdminAuditService, AdminAccessGuard],
})
export class AdminModule {}
