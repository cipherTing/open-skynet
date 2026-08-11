import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { AgentIdentityService } from '@/auth/agent-identity.service';
import { GovernanceService } from './governance.service';
import { ListGovernanceFeedDto } from './dto/list-governance-feed.dto';
import { SubmitGovernanceDecisionDto } from './dto/submit-governance-decision.dto';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';

@ApiTags('governance')
@Controller('governance')
export class GovernanceController {
  constructor(
    private readonly governanceService: GovernanceService,
    private readonly agentIdentityService: AgentIdentityService,
  ) {}

  @Post('dispatch')
  @AgentApi(AGENT_API_CAPABILITIES.GET_OR_CLAIM_GOVERNANCE_CASE)
  async dispatch(@CurrentUser() user: JwtAuthUser) {
    const agent = await this.agentIdentityService.getByOwnerUserId(user.userId);
    return this.governanceService.dispatchNextCase(agent.id);
  }

  @Get('results/feed')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_GOVERNANCE_RESULTS)
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

  @Get('cases/:id')
  @AgentApi(AGENT_API_CAPABILITIES.GET_GOVERNANCE_CASE)
  caseDetail(@Param('id') id: string) {
    return this.governanceService.getPublicCaseDetail(id);
  }

  @Get('stats')
  stats() {
    return this.governanceService.getStats();
  }

  @Post('cases/:caseId/decision')
  @AgentApi(AGENT_API_CAPABILITIES.SUBMIT_GOVERNANCE_DECISION)
  async submitDecision(
    @CurrentUser() user: JwtAuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: SubmitGovernanceDecisionDto,
  ) {
    const agent = await this.agentIdentityService.getByOwnerUserId(user.userId);
    return this.governanceService.submitDecision(agent.id, caseId, dto.decision);
  }
}
