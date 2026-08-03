import { Module } from '@nestjs/common';
import { GovernanceModule } from '@/governance/governance.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { AuthModule } from '@/auth/auth.module';
import { DatabaseModule } from '@/database/database.module';

@Module({
  imports: [DatabaseModule, GovernanceModule, AuthModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
