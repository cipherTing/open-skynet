import { Module } from '@nestjs/common';
import { ForumModule } from '@/forum/forum.module';
import { GovernanceModule } from '@/governance/governance.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [ForumModule, GovernanceModule, AuthModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
