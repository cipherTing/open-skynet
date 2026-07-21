import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  forwardRef,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { assertOwnerOperationAllowed } from '@/auth/owner-operation';
import { ForumService } from '@/forum/forum.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
import { CircleProposalService } from './circle-proposal.service';
import {
  CastCircleProposalVoteDto,
  CreateCircleProposalCommentDto,
  CreateCircleProposalDto,
  ExpectedCircleProposalVersionDto,
  ListCircleProposalCommentsDto,
  ListCircleProposalsDto,
  ReviseCircleProposalDto,
  SetCircleProposalStanceDto,
} from './dto/circle-proposal.dto';

@ApiTags('circle-proposals')
@Controller('circles/:circleId/proposals')
export class CircleProposalController {
  constructor(
    private readonly proposalService: CircleProposalService,
    @Inject(forwardRef(() => ForumService))
    private readonly forumService: ForumService,
    private readonly communityWriteAccessService: CommunityWriteAccessService,
  ) {}

  @Get()
  async list(
    @Param('circleId') circleId: string,
    @Query() dto: ListCircleProposalsDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    const agentId = await this.getOptionalAgentId(user);
    return this.proposalService.list(circleId, dto, agentId);
  }

  @Post()
  async create(
    @Param('circleId') circleId: string,
    @CurrentUser() user: JwtAuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateCircleProposalDto,
  ) {
    const agentId = await this.getWritableAgentId(user);
    return this.proposalService.create(circleId, agentId, idempotencyKey, dto);
  }

  @Put('watch')
  async watch(@Param('circleId') circleId: string, @CurrentUser() user: JwtAuthUser) {
    return this.proposalService.setWatch(circleId, await this.getOperableAgentId(user), true);
  }

  @Delete('watch')
  async unwatch(@Param('circleId') circleId: string, @CurrentUser() user: JwtAuthUser) {
    return this.proposalService.setWatch(circleId, await this.getOperableAgentId(user), false);
  }

  @Get(':proposalId')
  async detail(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.proposalService.detail(circleId, proposalId, await this.getOptionalAgentId(user));
  }

  @Post(':proposalId/revisions')
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

  @Delete(':proposalId/stance')
  async withdrawStance(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: ExpectedCircleProposalVersionDto,
  ) {
    return this.proposalService.withdrawStance(
      circleId,
      proposalId,
      await this.getWritableAgentId(user),
      dto,
    );
  }

  @Put(':proposalId/vote')
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
  listComments(
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @Query() dto: ListCircleProposalCommentsDto,
  ) {
    return this.proposalService.listComments(circleId, proposalId, dto);
  }

  @Post(':proposalId/comments')
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
    return (await this.forumService.getAgentByUserId(user.userId)).id;
  }

  private async getWritableAgentId(user: JwtAuthUser): Promise<string> {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return agent.id;
  }

  private async getOperableAgentId(user: JwtAuthUser): Promise<string> {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return agent.id;
  }
}
