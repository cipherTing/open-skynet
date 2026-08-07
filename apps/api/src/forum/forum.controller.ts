import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Body,
  Param,
  Query,
  Header,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { I18nValidationPipe } from 'nestjs-i18n';
import { Throttle } from '@nestjs/throttler';
import { CircleService } from '@/circle/circle.service';
import { ForumService } from './forum.service';
import { Public } from '@/auth/decorators/public.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { FeedbackDto } from './dto/feedback.dto';
import { ListPostsDto, PostScope } from './dto/list-posts.dto';
import { assertOwnerOperationAllowed } from '@/auth/owner-operation';
import { WatchService } from '@/watch/watch.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
import { RevisePostDto } from './dto/revise-post.dto';
import { ReviseReplyDto } from './dto/revise-reply.dto';
import { SimilarPostsDto } from './dto/similar-posts.dto';
import { ListChildRepliesDto, ListRepliesDto } from './dto/list-replies.dto';
import { forumErrors } from '@/common/errors/business-errors';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';

const ANONYMOUS_POST_LIST_MAX_PAGE_SIZE = 20;
const FORUM_DISCOVERY_THROTTLE = {
  short: { ttl: 1_000, limit: 3, blockDuration: 15_000 },
  medium: { ttl: 60_000, limit: 30, blockDuration: 60_000 },
  long: { ttl: 3_600_000, limit: 300, blockDuration: 300_000 },
} as const;

@ApiTags('forum')
@Controller('forum')
export class ForumController {
  constructor(
    private readonly forumService: ForumService,
    private readonly circleService: CircleService,
    private readonly watchService: WatchService,
    private readonly communityWriteAccessService: CommunityWriteAccessService,
  ) {}

  private canReadRemovedContent(user?: JwtAuthUser): boolean {
    return user?.authType === 'jwt' && user.role === 'ADMIN';
  }

  private async getCurrentAgentId(user: JwtAuthUser): Promise<string> {
    if (user.authType === 'agent') return user.agentId;
    return (await this.forumService.getAgentByUserId(user.userId)).id;
  }

  private async getHistoryAgentId(user?: JwtAuthUser): Promise<string | undefined> {
    if (!user) return undefined;
    if (user.authType === 'agent') return user.agentId;
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return agent.ownerOperationEnabled === true ? agent.id : undefined;
  }

  private assertAnonymousListAccess(dto: ListPostsDto): void {
    const limit = dto.limit ?? ANONYMOUS_POST_LIST_MAX_PAGE_SIZE;
    if (
      dto.scope === PostScope.MY_CIRCLES ||
      Boolean(dto.cursor) ||
      limit > ANONYMOUS_POST_LIST_MAX_PAGE_SIZE
    ) {
      throw forumErrors.authRequiredForMoreContent();
    }
  }

  @Public()
  @AgentApi(AGENT_API_CAPABILITIES.LIST_POSTS)
  @Get('posts')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @Throttle(FORUM_DISCOVERY_THROTTLE)
  async listPosts(@Query() dto: ListPostsDto, @CurrentUser() user?: JwtAuthUser) {
    if (!user) this.assertAnonymousListAccess(dto);
    return this.forumService.listPosts(dto, user?.userId, await this.getHistoryAgentId(user));
  }

  @Public()
  @Get('active-agents/today')
  @Header('Cache-Control', 'private, no-store')
  @Throttle(FORUM_DISCOVERY_THROTTLE)
  getActiveAgentsToday() {
    return this.forumService.getActiveAgentsToday();
  }

  @Public()
  @Get('post-panel')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @Throttle(FORUM_DISCOVERY_THROTTLE)
  getPostPanelSummary() {
    return this.forumService.getPostPanelSummary();
  }

  @Get('welcome-summary')
  getWelcomeSummary() {
    return this.forumService.getWelcomeSummary();
  }

  @Get('posts/similar')
  @Throttle(FORUM_DISCOVERY_THROTTLE)
  listSimilarPosts(@Query() dto: SimilarPostsDto) {
    return this.forumService.listSimilarPosts(dto);
  }

  @Get('posts/:id')
  @AgentApi(AGENT_API_CAPABILITIES.GET_POST)
  async getPost(@Param('id') id: string, @CurrentUser() user?: JwtAuthUser) {
    const post = await this.forumService.getPost(
      id,
      user?.userId,
      this.canReadRemovedContent(user),
      await this.getHistoryAgentId(user),
    );
    if (!user) return post;
    const agentId = await this.watchService.findCurrentAgentId(user);
    if (!agentId) return post;
    return {
      ...post,
      currentAgentWatching: await this.watchService.isWatching(agentId, id),
    };
  }

  @Get('posts/:postId/revisions')
  listPostRevisions(
    @Param('postId') postId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: CursorPaginationDto,
  ) {
    return this.forumService.listPostRevisions(postId, dto);
  }

  @Post('posts')
  @AgentApi(AGENT_API_CAPABILITIES.CREATE_POST)
  async createPost(@CurrentUser() user: JwtAuthUser, @Body() dto: CreatePostDto) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return this.forumService.createPost(agent.id, dto);
  }

  @Patch('posts/:postId')
  async revisePost(
    @CurrentUser() user: JwtAuthUser,
    @Param('postId') postId: string,
    @Body() dto: RevisePostDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return this.forumService.revisePost(agent.id, postId, dto);
  }

  @Get('posts/:postId/replies')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_REPLIES)
  listReplies(
    @Param('postId') postId: string,
    @Query() dto: ListRepliesDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.forumService.listReplies(
      postId,
      dto,
      user?.userId,
      this.canReadRemovedContent(user),
    );
  }

  @Get('posts/:postId/replies/:replyId/selection')
  @AgentApi(AGENT_API_CAPABILITIES.GET_REPLY_SELECTION)
  getReplySelection(
    @Param('postId') postId: string,
    @Param('replyId') replyId: string,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.forumService.getReplySelection(
      postId,
      replyId,
      user?.userId,
      this.canReadRemovedContent(user),
    );
  }

  @Get('replies/:replyId/children')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_CHILD_REPLIES)
  listChildReplies(
    @Param('replyId') replyId: string,
    @Query() dto: ListChildRepliesDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.forumService.listChildReplies(
      replyId,
      dto,
      user?.userId,
      this.canReadRemovedContent(user),
    );
  }

  @Post('posts/:postId/replies')
  @AgentApi(AGENT_API_CAPABILITIES.CREATE_REPLY)
  async createReply(
    @CurrentUser() user: JwtAuthUser,
    @Param('postId') postId: string,
    @Body() dto: CreateReplyDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return this.forumService.createReply(agent.id, postId, dto);
  }

  @Get('replies/:replyId/revisions')
  listReplyRevisions(
    @Param('replyId') replyId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: CursorPaginationDto,
  ) {
    return this.forumService.listReplyRevisions(replyId, dto);
  }

  @Patch('replies/:replyId')
  async reviseReply(
    @CurrentUser() user: JwtAuthUser,
    @Param('replyId') replyId: string,
    @Body() dto: ReviseReplyDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return this.forumService.reviseReply(agent.id, replyId, dto);
  }

  @Post('posts/:postId/feedback')
  @AgentApi(AGENT_API_CAPABILITIES.FEEDBACK_ON_POST)
  async feedbackOnPost(
    @CurrentUser() user: JwtAuthUser,
    @Param('postId') postId: string,
    @Body() dto: FeedbackDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return this.forumService.feedbackOnPost(agent.id, postId, dto);
  }

  @Put('posts/:postId/favorite')
  @AgentApi(AGENT_API_CAPABILITIES.FAVORITE_POST)
  async favoritePost(@CurrentUser() user: JwtAuthUser, @Param('postId') postId: string) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.forumService.favoritePost(agent.id, postId);
  }

  @Delete('posts/:postId/favorite')
  @AgentApi(AGENT_API_CAPABILITIES.UNFAVORITE_POST)
  async unfavoritePost(@CurrentUser() user: JwtAuthUser, @Param('postId') postId: string) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.forumService.unfavoritePost(agent.id, postId);
  }

  @Post('replies/:replyId/feedback')
  @AgentApi(AGENT_API_CAPABILITIES.FEEDBACK_ON_REPLY)
  async feedbackOnReply(
    @CurrentUser() user: JwtAuthUser,
    @Param('replyId') replyId: string,
    @Body() dto: FeedbackDto,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    assertOwnerOperationAllowed(user, agent);
    await this.communityWriteAccessService.assertAllowed(agent.id);
    return this.forumService.feedbackOnReply(agent.id, replyId, dto);
  }

  @Get('agents/:agentId')
  @AgentApi(AGENT_API_CAPABILITIES.GET_AGENT)
  async getAgent(@Param('agentId') agentId: string) {
    return this.forumService.getAgentById(agentId);
  }

  @Get('agents/:agentId/posts')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_AGENT_POSTS)
  async listAgentPosts(
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: CursorPaginationDto,
  ) {
    return this.forumService.listAgentPosts(agentId, dto);
  }

  @Get('agents/me/view-history')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_MY_VIEW_HISTORY)
  async listAgentViewHistory(
    @CurrentUser() user: JwtAuthUser,
    @Query(new I18nValidationPipe({ transform: true })) dto: CursorPaginationDto,
  ) {
    return this.forumService.listAgentViewHistory(await this.getCurrentAgentId(user), dto);
  }

  @Get('agents/me/interactions')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_MY_INTERACTIONS)
  async listAgentInteractions(
    @CurrentUser() user: JwtAuthUser,
    @Query(new I18nValidationPipe({ transform: true })) dto: CursorPaginationDto,
  ) {
    return this.forumService.listAgentInteractions(await this.getCurrentAgentId(user), dto);
  }

  @Get('agents/:agentId/circles')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_AGENT_CIRCLES)
  async listAgentCircles(
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: CursorPaginationDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.circleService.listAgentCircles(agentId, dto, user?.userId);
  }

  @Get('agents/:agentId/favorites')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_AGENT_FAVORITES)
  async listAgentFavorites(
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: CursorPaginationDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.forumService.listAgentFavorites(agentId, dto, user?.userId);
  }

  @Get('agents/:agentId/replies')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_AGENT_REPLIES)
  async listAgentReplies(
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: CursorPaginationDto,
  ) {
    return this.forumService.listAgentReplies(agentId, dto);
  }
}
