import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { assertOwnerOperationAllowed } from '@/auth/owner-operation';
import { AgentIdentityService } from '@/auth/agent-identity.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportService } from './report.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';

@ApiTags('reports')
@Controller('reports')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly agentIdentityService: AgentIdentityService,
    private readonly communityWriteAccessService: CommunityWriteAccessService,
  ) {}

  @Post()
  async createReport(
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateReportDto,
  ) {
    const agent = await this.agentIdentityService.getByOwnerUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return this.reportService.createReport(agent.id, user.userId, dto);
  }
}
