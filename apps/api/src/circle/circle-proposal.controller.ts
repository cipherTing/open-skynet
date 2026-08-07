import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { assertOwnerOperationAllowed } from '@/auth/owner-operation';
import { AgentIdentityService } from '@/auth/agent-identity.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
import { CircleProposalService } from './circle-proposal.service';
import {
  CastCircleProposalVoteDto,
  CircleProposalDetailQueryDto,
  CreateCircleProposalCommentDto,
  CreateCircleProposalDto,
  ExpectedCircleProposalVersionDto,
  ListCircleProposalCommentsDto,
  ListCircleProposalHistoryDto,
  ListCircleProposalsDto,
  ReviseCircleProposalDto,
  SetCircleProposalStanceDto,
} from './dto/circle-proposal.dto';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';

@ApiTags('circle-proposals')
@Controller('circles/:circleId/proposals')
export class CircleProposalController {
  constructor(
    private readonly proposalService: CircleProposalService,
    private readonly agentIdentityService: AgentIdentityService,
    private readonly communityWriteAccessService: CommunityWriteAccessService,
  ) {}

  @Get()
  @AgentApi(AGENT_API_CAPABILITIES.LIST_PROPOSALS)
  async list(
    @Param('circleId') circleId: string,
    @Query() dto: ListCircleProposalsDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    const agentId = await this.getOptionalAgentId(user);
    return this.proposalService.list(circleId, dto, agentId);
  }

  @Post()
  @AgentApi(AGENT_API_CAPABILITIES.CREATE_PROPOSAL)
  async create(
    @Param('circleId') circleId: string,
    @CurrentUser() user: JwtAuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateCircleProposalDto,
  ) {
    const agentId = await this.getWritableAgentId(user);
    return this.proposalService.create(circleId, agentId, idempotencyKey, dto);
  }

  @Get(':proposalId')
  @AgentApi(AGENT_API_CAPABILITIES.GET_PROPOSAL)
  async detail(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @Query() query: CircleProposalDetailQueryDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.proposalService.detail(
      circleId,
      proposalId,
      await this.getOptionalAgentId(user),
      query,
    );
  }

  @Get(':proposalId/revisions')
  listRevisions(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @Query() dto: ListCircleProposalHistoryDto,
  ) {
    return this.proposalService.listRevisions(circleId, proposalId, dto);
  }

  @Post(':proposalId/revisions')
  @AgentApi(AGENT_API_CAPABILITIES.REVISE_PROPOSAL)
  async revise(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: JwtAuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReviseCircleProposalDto,
  ) {
    return this.proposalService.revise(
      circleId,
      proposalId,
      await this.getWritableAgentId(user),
      idempotencyKey,
      dto,
    );
  }

  @Post(':proposalId/withdraw')
  @AgentApi(AGENT_API_CAPABILITIES.WITHDRAW_PROPOSAL)
  async withdrawProposal(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: ExpectedCircleProposalVersionDto,
  ) {
    return this.proposalService.withdrawProposal(
      circleId,
      proposalId,
      await this.getWritableAgentId(user),
      dto,
    );
  }

  @Put(':proposalId/stance')
  @AgentApi(AGENT_API_CAPABILITIES.SET_PROPOSAL_STANCE)
  async setStance(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: SetCircleProposalStanceDto,
  ) {
    return this.proposalService.setStance(
      circleId,
      proposalId,
      await this.getWritableAgentId(user),
      dto,
    );
  }

  @Put(':proposalId/vote')
  @AgentApi(AGENT_API_CAPABILITIES.VOTE_ON_PROPOSAL)
  async vote(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CastCircleProposalVoteDto,
  ) {
    return this.proposalService.vote(
      circleId,
      proposalId,
      await this.getWritableAgentId(user),
      dto,
    );
  }

  @Get(':proposalId/comments')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_PROPOSAL_COMMENTS)
  listComments(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @Query() dto: ListCircleProposalCommentsDto,
  ) {
    return this.proposalService.listComments(circleId, proposalId, dto);
  }

  @Post(':proposalId/comments')
  @AgentApi(AGENT_API_CAPABILITIES.COMMENT_ON_PROPOSAL)
  async addComment(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: JwtAuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateCircleProposalCommentDto,
  ) {
    return this.proposalService.addComment(
      circleId,
      proposalId,
      await this.getWritableAgentId(user),
      idempotencyKey,
      dto,
    );
  }

  private async getOptionalAgentId(user?: JwtAuthUser): Promise<string | undefined> {
    if (!user) return undefined;
    return (await this.agentIdentityService.getByOwnerUserId(user.userId)).id;
  }

  private async getWritableAgentId(user: JwtAuthUser): Promise<string> {
    const agent = await this.agentIdentityService.getByOwnerUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return agent.id;
  }

}
