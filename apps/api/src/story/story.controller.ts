import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { AgentIdentityService } from '@/auth/agent-identity.service';
import { assertOwnerOperationAllowed } from '@/auth/owner-operation';
import { STORY_AGENT_API_CAPABILITIES } from './story.constants';
import { StoryAgentApi } from './story-agent-api.decorator';
import { StoryService } from './story.service';
import { ListStoriesDto } from './dto/list-stories.dto';
import { CreateStoryDto } from './dto/create-story.dto';
import { ReviseStoryDto } from './dto/revise-story.dto';
import { CreateStoryDocumentDto } from './dto/create-story-document.dto';
import { ListStoryDocumentsDto } from './dto/list-story-documents.dto';
import { ReviseStoryDocumentDto } from './dto/revise-story-document.dto';
import { RestoreStoryDocumentDto } from './dto/restore-story-document.dto';
import { RestoreStoryDto } from './dto/restore-story.dto';
import { CompareStoryRevisionsDto } from './dto/compare-story-revisions.dto';
import { CreateStoryDiscussionDto } from './dto/create-story-discussion.dto';
import { ListStoryDiscussionsDto } from './dto/list-story-discussions.dto';
import { CreateStoryDiscussionMessageDto } from './dto/create-story-discussion-message.dto';
import { ListStoryDiscussionMessagesDto } from './dto/list-story-discussion-messages.dto';
import { CreateStoryBranchDto } from './dto/create-story-branch.dto';
import { CreateStoryReviewDto } from './dto/create-story-review.dto';
import { ListStoryReviewsDto } from './dto/list-story-reviews.dto';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { CreateStoryCollaborationCaseDto } from './dto/create-story-collaboration-case.dto';
import { VoteStoryCollaborationCaseDto } from './dto/vote-story-collaboration-case.dto';
import { AppealStoryCollaborationCaseDto } from './dto/appeal-story-collaboration-case.dto';
import { StoryCollaborationService } from './story-collaboration.service';
import type { CreateStoryCollaborationCaseDto as StoryCollaborationCaseInput } from './story-collaboration.service';
import { storyErrors } from './story.errors';

@ApiTags('stories')
@Controller('stories')
export class StoryController {
  constructor(
    private readonly storyService: StoryService,
    private readonly collaborationService: StoryCollaborationService,
    private readonly agentIdentityService: AgentIdentityService,
  ) {}

  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORIES)
  @Get()
  listStories(@Query() dto: ListStoriesDto) {
    return this.storyService.listStories(dto);
  }

  @Post()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY)
  async createStory(@CurrentUser() user: JwtAuthUser, @Body() dto: CreateStoryDto) {
    return this.storyService.createStory(await this.actor(user), dto);
  }

  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY)
  @Get(':storyId')
  getStory(@Param('storyId') storyId: string) {
    return this.storyService.getStory(storyId);
  }

  @Patch(':storyId')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.REVISE_STORY)
  async reviseStory(
    @Param('storyId') storyId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: ReviseStoryDto,
  ) {
    return this.storyService.reviseStory(storyId, await this.actor(user), dto);
  }

  @Get(':storyId/revisions')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_REVISIONS)
  listStoryRevisions(@Param('storyId') storyId: string, @Query() dto: CursorPaginationDto) {
    return this.storyService.listStoryRevisions(storyId, dto);
  }

  @Post(':storyId/restore')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.RESTORE_STORY)
  async restoreStory(
    @Param('storyId') storyId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: RestoreStoryDto,
  ) {
    return this.storyService.restoreStory(storyId, await this.actor(user), dto);
  }

  @Get(':storyId/documents')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_DOCUMENTS)
  listDocuments(@Param('storyId') storyId: string, @Query() dto: ListStoryDocumentsDto) {
    return this.storyService.listDocuments(storyId, dto.branchId ?? null, dto);
  }

  @Post(':storyId/documents')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY_DOCUMENT)
  async createDocument(
    @Param('storyId') storyId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateStoryDocumentDto,
  ) {
    return this.storyService.createDocument(storyId, await this.actor(user), dto);
  }

  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_DOCUMENT)
  @Get(':storyId/documents/:documentId')
  getDocument(@Param('storyId') storyId: string, @Param('documentId') documentId: string) {
    return this.storyService.getDocument(documentId, storyId);
  }

  @Patch(':storyId/documents/:documentId')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.REVISE_STORY_DOCUMENT)
  async reviseDocument(
    @Param('storyId') storyId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: ReviseStoryDocumentDto,
  ) {
    return this.storyService.reviseDocument(documentId, await this.actor(user), dto, storyId);
  }

  @Get(':storyId/documents/:documentId/revisions')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_DOCUMENT_REVISIONS)
  listDocumentRevisions(
    @Param('storyId') storyId: string,
    @Param('documentId') documentId: string,
    @Query() dto: CursorPaginationDto,
  ) {
    return this.storyService.listDocumentRevisions(documentId, dto, storyId);
  }

  @Post(':storyId/documents/:documentId/restore')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.RESTORE_STORY_DOCUMENT)
  async restoreDocument(
    @Param('storyId') storyId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: RestoreStoryDocumentDto,
  ) {
    return this.storyService.restoreDocument(documentId, await this.actor(user), dto, storyId);
  }

  @Post(':storyId/revisions/compare')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.COMPARE_STORY_REVISIONS)
  compareRevisions(@Param('storyId') storyId: string, @Body() dto: CompareStoryRevisionsDto) {
    return this.storyService.compareRevisions(dto, storyId);
  }

  @Get(':storyId/discussions')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_DISCUSSIONS)
  listDiscussions(@Param('storyId') storyId: string, @Query() dto: ListStoryDiscussionsDto) {
    return this.storyService.listDiscussions(storyId, dto);
  }

  @Get(':storyId/discussions/:discussionId')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_DISCUSSION)
  getDiscussion(@Param('storyId') storyId: string, @Param('discussionId') discussionId: string) {
    return this.storyService.getDiscussion(storyId, discussionId);
  }

  @Post(':storyId/discussions')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY_DISCUSSION)
  async createDiscussion(
    @Param('storyId') storyId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateStoryDiscussionDto,
  ) {
    return this.storyService.createDiscussion(storyId, await this.actor(user), dto);
  }

  @Get(':storyId/discussions/:discussionId/messages')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_DISCUSSION_MESSAGES)
  listDiscussionMessages(
    @Param('storyId') storyId: string,
    @Param('discussionId') discussionId: string,
    @Query() dto: ListStoryDiscussionMessagesDto,
  ) {
    return this.storyService.listDiscussionMessages(storyId, discussionId, dto);
  }

  @Post(':storyId/discussions/:discussionId/messages')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY_DISCUSSION_MESSAGE)
  async addDiscussionMessage(
    @Param('storyId') storyId: string,
    @Param('discussionId') discussionId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateStoryDiscussionMessageDto,
  ) {
    return this.storyService.addDiscussionMessage(
      storyId,
      discussionId,
      await this.actor(user),
      dto,
    );
  }

  @Get(':storyId/branches')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_BRANCHES)
  listBranches(@Param('storyId') storyId: string, @Query() dto: CursorPaginationDto) {
    return this.storyService.listBranches(storyId, dto);
  }

  @Post(':storyId/branches')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY_BRANCH)
  async createBranch(
    @Param('storyId') storyId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateStoryBranchDto,
  ) {
    return this.storyService.createBranch(storyId, await this.actor(user), dto);
  }

  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_BRANCH)
  @Get(':storyId/branches/:branchId')
  getBranch(@Param('storyId') storyId: string, @Param('branchId') branchId: string) {
    return this.storyService.getBranch(storyId, branchId);
  }

  @Get(':storyId/reviews')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_REVIEWS)
  listReviews(@Param('storyId') storyId: string, @Query() dto: ListStoryReviewsDto) {
    return this.storyService.listReviews(storyId, dto);
  }

  @Post(':storyId/reviews')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY_REVIEW)
  async createReview(
    @Param('storyId') storyId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateStoryReviewDto,
  ) {
    return this.storyService.createReview(storyId, await this.actor(user), dto);
  }

  @Get(':storyId/conflicts')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_CONFLICTS)
  listConflicts(@Param('storyId') storyId: string, @Query() dto: CursorPaginationDto) {
    return this.collaborationService.listConflicts(storyId, dto);
  }

  @Get(':storyId/collaboration-cases')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_COLLABORATION_CASES)
  listCases(@Param('storyId') storyId: string, @Query() dto: CursorPaginationDto) {
    return this.collaborationService.listCases(storyId, dto);
  }

  @Post(':storyId/collaboration-cases')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY_COLLABORATION_CASE)
  async createCase(
    @Param('storyId') storyId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateStoryCollaborationCaseDto,
  ) {
    return this.collaborationService.createCase(
      storyId,
      await this.actor(user),
      this.toCollaborationCaseInput(dto),
    );
  }

  @Post(':storyId/collaboration-cases/:caseId/votes')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.VOTE_STORY_COLLABORATION_CASE)
  async voteCase(
    @Param('storyId') storyId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: VoteStoryCollaborationCaseDto,
  ) {
    return this.collaborationService.voteCase(storyId, caseId, await this.actor(user), dto);
  }

  @Post(':storyId/collaboration-cases/:caseId/appeals')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.APPEAL_STORY_COLLABORATION_CASE)
  async appealCase(
    @Param('storyId') storyId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: AppealStoryCollaborationCaseDto,
  ) {
    return this.collaborationService.appealCase(storyId, caseId, await this.actor(user), dto);
  }

  private async actor(user: JwtAuthUser) {
    if (user.authType === 'agent') {
      return { agentId: user.agentId, ownerUserId: user.userId };
    }
    const agent = await this.agentIdentityService.getByOwnerUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    return { agentId: agent.id, ownerUserId: user.userId };
  }

  private toCollaborationCaseInput(
    dto: CreateStoryCollaborationCaseDto,
  ): StoryCollaborationCaseInput {
    if (dto.caseType === 'REVISION_REVIEW') {
      if (!dto.documentId || dto.revisionNumber === undefined) {
        throw storyErrors.collaborationCasePayloadInvalid();
      }
      return {
        caseType: 'REVISION_REVIEW',
        documentId: dto.documentId,
        revisionNumber: dto.revisionNumber,
        reason: dto.reason,
      };
    }
    if (!dto.targetAgentId || !dto.documentId || !dto.noticeDiscussionId || !dto.laterConflictId) {
      throw storyErrors.collaborationCasePayloadInvalid();
    }
    return {
      caseType: 'WRITE_RESTRICTION',
      targetAgentId: dto.targetAgentId,
      documentId: dto.documentId,
      noticeDiscussionId: dto.noticeDiscussionId,
      laterConflictId: dto.laterConflictId,
      reason: dto.reason,
    };
  }
}
