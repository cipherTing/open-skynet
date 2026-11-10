import {
  Body,
  Headers,
  ParseIntPipe,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import { CreateStoryReviewDto } from './dto/create-story-review.dto';
import { ListStoryReviewsDto } from './dto/list-story-reviews.dto';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { CreateStoryCollaborationCaseDto } from './dto/create-story-collaboration-case.dto';
import { VoteStoryCollaborationCaseDto } from './dto/vote-story-collaboration-case.dto';
import { AppealStoryCollaborationCaseDto } from './dto/appeal-story-collaboration-case.dto';
import { StoryCollaborationService } from './story-collaboration.service';
import type { CreateStoryCollaborationCaseDto as StoryCollaborationCaseInput } from './story-collaboration.service';
import { storyErrors } from './story.errors';
import { StoryCommandService } from './story-command.service';
import { ListStoryDirectoryDto } from './dto/list-story-directory.dto';
import { ListStoryActivityDto } from './dto/list-story-activity.dto';
import {
  ChangeStoryDocumentStateDto,
  MoveStoryDocumentDto,
} from './dto/change-story-document-state.dto';

@ApiTags('stories')
@Controller('stories')
export class StoryController {
  constructor(
    private readonly storyService: StoryService,
    private readonly collaborationService: StoryCollaborationService,
    private readonly agentIdentityService: AgentIdentityService,
    private readonly commandService: StoryCommandService,
  ) {}

  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORIES)
  @Get()
  listStories(@Query() dto: ListStoriesDto) {
    return this.storyService.listStories(dto);
  }

  @Post()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY)
  async createStory(
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateStoryDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const actor = await this.actor(user);
    return this.commandService.execute(actor.agentId, key, 'CREATE_STORY', null, dto, () =>
      this.storyService.createStory(actor, dto),
    );
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
    return this.storyService.listDocuments(storyId, dto);
  }

  @Post(':storyId/documents')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.CREATE_STORY_DOCUMENT)
  async createDocument(
    @Param('storyId') storyId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreateStoryDocumentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const actor = await this.actor(user);
    return this.commandService.execute(actor.agentId, key, 'CREATE_DOCUMENT', storyId, dto, () =>
      this.storyService.createDocument(storyId, actor, dto),
    );
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
    @Headers('idempotency-key') key?: string,
  ) {
    const actor = await this.actor(user);
    return this.commandService.execute(actor.agentId, key, 'CREATE_DISCUSSION', storyId, dto, () =>
      this.storyService.createDiscussion(storyId, actor, dto),
    );
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
    @Headers('idempotency-key') key?: string,
  ) {
    const actor = await this.actor(user);
    return this.commandService.execute(
      actor.agentId,
      key,
      'CREATE_MESSAGE',
      storyId,
      { discussionId, input: dto },
      () => this.storyService.addDiscussionMessage(storyId, discussionId, actor, dto),
    );
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
    @Headers('idempotency-key') key?: string,
  ) {
    const actor = await this.actor(user);
    return this.commandService.execute(actor.agentId, key, 'CREATE_REVIEW', storyId, dto, () =>
      this.storyService.createReview(storyId, actor, dto),
    );
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
    @Headers('idempotency-key') key?: string,
  ) {
    const actor = await this.actor(user);
    return this.commandService.execute(actor.agentId, key, 'CREATE_CASE', storyId, dto, () =>
      this.collaborationService.createCase(storyId, actor, this.toCollaborationCaseInput(dto)),
    );
  }

  @Post(':storyId/collaboration-cases/:caseId/votes')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.VOTE_STORY_COLLABORATION_CASE)
  async voteCase(
    @Param('storyId') storyId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: VoteStoryCollaborationCaseDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const actor = await this.actor(user);
    return this.commandService.execute(
      actor.agentId,
      key,
      'VOTE_CASE',
      storyId,
      { caseId, input: dto },
      () => this.collaborationService.voteCase(storyId, caseId, actor, dto),
    );
  }

  @Post(':storyId/collaboration-cases/:caseId/appeals')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.APPEAL_STORY_COLLABORATION_CASE)
  async appealCase(
    @Param('storyId') storyId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: AppealStoryCollaborationCaseDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const actor = await this.actor(user);
    return this.commandService.execute(
      actor.agentId,
      key,
      'APPEAL_CASE',
      storyId,
      { caseId, input: dto },
      () => this.collaborationService.appealCase(storyId, caseId, actor, dto),
    );
  }

  @Get(':storyId/directory')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_DIRECTORY)
  listDirectory(@Param('storyId') storyId: string, @Query() dto: ListStoryDirectoryDto) {
    return this.storyService.listDirectory(storyId, dto);
  }

  @Get(':storyId/reading-start')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_READING_START)
  getReadingStart(@Param('storyId') storyId: string, @Query() dto: CursorPaginationDto) {
    return this.storyService.getReadingStart(storyId, dto);
  }

  @Get(':storyId/documents/:documentId/location')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_DOCUMENT_LOCATION)
  getDocumentLocation(@Param('storyId') storyId: string, @Param('documentId') documentId: string) {
    return this.storyService.getDocumentLocation(storyId, documentId);
  }

  @Get(':storyId/documents/:documentId/references')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_DOCUMENT_REFERENCES)
  listDocumentReferences(
    @Param('storyId') storyId: string,
    @Param('documentId') documentId: string,
    @Query() dto: CursorPaginationDto,
  ) {
    return this.storyService.listDocumentReferences(storyId, documentId, dto);
  }

  @Get(':storyId/revisions/:revisionNumber')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_REVISION)
  getStoryRevision(
    @Param('storyId') storyId: string,
    @Param('revisionNumber', ParseIntPipe) revisionNumber: number,
  ) {
    return this.storyService.getStoryRevision(storyId, revisionNumber);
  }

  @Get(':storyId/documents/:documentId/revisions/:revisionNumber')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_DOCUMENT_REVISION)
  getDocumentRevision(
    @Param('storyId') storyId: string,
    @Param('documentId') documentId: string,
    @Param('revisionNumber', ParseIntPipe) revisionNumber: number,
  ) {
    return this.storyService.getDocumentRevision(storyId, documentId, revisionNumber);
  }

  @Get(':storyId/activity')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.LIST_STORY_ACTIVITY)
  listActivity(@Param('storyId') storyId: string, @Query() dto: ListStoryActivityDto) {
    return this.storyService.listActivity(storyId, dto);
  }

  @Get(':storyId/discussions/:discussionId/messages/:messageId')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_DISCUSSION_MESSAGE)
  getDiscussionMessage(
    @Param('storyId') storyId: string,
    @Param('discussionId') discussionId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.storyService.getDiscussionMessage(storyId, discussionId, messageId);
  }

  @Get(':storyId/collaboration-cases/:caseId')
  @Public()
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.GET_STORY_COLLABORATION_CASE)
  getCase(@Param('storyId') storyId: string, @Param('caseId') caseId: string) {
    return this.collaborationService.getCase(storyId, caseId);
  }

  @Patch(':storyId/documents/:documentId/position')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.MOVE_STORY_DOCUMENT)
  async moveDocument(
    @Param('storyId') storyId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: MoveStoryDocumentDto,
  ) {
    return this.storyService.moveDocument(storyId, documentId, await this.actor(user), dto);
  }

  @Post(':storyId/documents/:documentId/withdraw')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.WITHDRAW_STORY_DOCUMENT)
  async withdrawDocument(
    @Param('storyId') storyId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: ChangeStoryDocumentStateDto,
  ) {
    return this.storyService.withdrawDocument(storyId, documentId, await this.actor(user), dto);
  }

  @Post(':storyId/documents/:documentId/reinstate')
  @StoryAgentApi(STORY_AGENT_API_CAPABILITIES.REINSTATE_STORY_DOCUMENT)
  async reinstateDocument(
    @Param('storyId') storyId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: MoveStoryDocumentDto,
  ) {
    return this.storyService.reinstateDocument(storyId, documentId, await this.actor(user), dto);
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
    if (
      !dto.targetAgentId ||
      !dto.documentId ||
      !dto.addressedDiscussionId ||
      !dto.laterConflictId
    ) {
      throw storyErrors.collaborationCasePayloadInvalid();
    }
    return {
      caseType: 'WRITE_RESTRICTION',
      targetAgentId: dto.targetAgentId,
      documentId: dto.documentId,
      addressedDiscussionId: dto.addressedDiscussionId,
      laterConflictId: dto.laterConflictId,
      reason: dto.reason,
    };
  }
}
