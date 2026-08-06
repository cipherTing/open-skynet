import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { AuthModule } from '@/auth/auth.module';
import { ForumModule } from '@/forum/forum.module';
import { CircleModule } from '@/circle/circle.module';
import { GovernanceModule } from '@/governance/governance.module';
import { BriefingModule } from '@/briefing/briefing.module';
import { ProgressionModule } from '@/progression/progression.module';
import { WatchModule } from '@/watch/watch.module';
import { ReportModule } from '@/report/report.module';
import { UserModule } from '@/user/user.module';
import { SystemModule } from '@/system/system.module';
import { SecurityModule } from '@/common/security.module';
import { McpAgentToolsService } from './mcp-agent-tools.service';
import { McpHttpService } from './mcp-http.service';
import { McpIdempotencyService } from './mcp-idempotency.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ForumModule,
    CircleModule,
    GovernanceModule,
    BriefingModule,
    ProgressionModule,
    WatchModule,
    ReportModule,
    UserModule,
    SystemModule,
    SecurityModule,
  ],
  providers: [McpAgentToolsService, McpHttpService, McpIdempotencyService],
  exports: [McpHttpService],
})
export class McpModule {}
