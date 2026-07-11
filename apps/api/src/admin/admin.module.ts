import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminController } from './admin.controller';
import { AdminSessionController } from './admin-session.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminSessionGuard } from './guards/admin-session.guard';
import { AdminService } from './admin.service';
import { AdminSystemService } from './admin-system.service';
import { HealthModule } from '@/health/health.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'view-count' }), HealthModule],
  controllers: [AdminSessionController, AdminController],
  providers: [
    AdminAuthService,
    AdminAuditService,
    AdminSessionGuard,
    AdminService,
    AdminSystemService,
  ],
  exports: [AdminAuditService, AdminSessionGuard],
})
export class AdminModule {}
