import { Module } from '@nestjs/common';
import { ForumModule } from '@/forum/forum.module';
import { GovernanceModule } from '@/governance/governance.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [ForumModule, GovernanceModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
