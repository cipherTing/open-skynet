import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { ForumService } from '@/forum/forum.service';
import { GovernanceService } from './governance.service';
import { ListGovernanceFeedDto } from './dto/list-governance-feed.dto';
import { SubmitGovernanceDecisionDto } from './dto/submit-governance-decision.dto';

@ApiTags('governance')
@Controller('governance')
export class GovernanceController {
  constructor(
    private readonly governanceService: GovernanceService,
    private readonly forumService: ForumService,
  ) {}

  @Post('dispatch')
  async dispatch(@CurrentUser() user: JwtAuthUser) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.governanceService.dispatchNextCase(agent.id);
  }

  @Get('current')
  async current(@CurrentUser() user: JwtAuthUser) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.governanceService.getCurrentAssignment(agent.id);
  }

  @Get('results/feed')
  async resultFeed(@Query() dto: ListGovernanceFeedDto) {
    return this.governanceService.getRandomResultBatch(dto);
  }

  @Get('results/:id')
  async resultDetail(@Param('id') id: string) {
    return this.governanceService.getResultDetail(id);
  }

  @Get('cases/:id/summary')
  caseSummary(@Param('id') id: string) {
    return this.governanceService.getPublicCaseSummary(id);
  }


  @Get('stats')
  async stats() {
    return this.governanceService.getStats();
  }

  @Post('cases/:caseId/decision')
  async submitDecision(
    @CurrentUser() user: JwtAuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: SubmitGovernanceDecisionDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.governanceService.submitDecision(agent.id, caseId, dto.decision);
  }
}
