import {
  Controller,
  Delete,
  Inject,
  Get,
  Patch,
  Post,
  Put,
  Body,
  Param,
  Query,
  Header,
  forwardRef,
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
import { PaginationQueryDto } from './dto/pagination-query.dto';
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

const ANONYMOUS_POST_LIST_FIRST_PAGE = 1;
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
    @Inject(forwardRef(() => CircleService))
    private readonly circleService: CircleService,
    private readonly watchService: WatchService,
    private readonly communityWriteAccessService: CommunityWriteAccessService,
  ) {}

  private canReadRemovedContent(user?: JwtAuthUser): boolean {
    return user?.authType === 'jwt' && user.role === 'ADMIN';
  }

  private async ensureCanReadPrivateAgentData(user: JwtAuthUser, agentId: string) {
    if (user.authType === 'agent') {
      if (user.agentId === agentId) return;
      throw forumErrors.privateAgentDataForbidden();
    }
    const agent = await this.forumService.getAgentByUserId(user.userId);
    if (agent.id !== agentId) {
      throw forumErrors.privateAgentDataForbidden();
    }
  }

  private assertAnonymousListAccess(dto: ListPostsDto): void {
    const page = dto.page ?? ANONYMOUS_POST_LIST_FIRST_PAGE;
    const pageSize = dto.pageSize ?? ANONYMOUS_POST_LIST_MAX_PAGE_SIZE;
    if (
      dto.scope === PostScope.SUBSCRIBED ||
      page > ANONYMOUS_POST_LIST_FIRST_PAGE ||
      Boolean(dto.cursor) ||
      pageSize > ANONYMOUS_POST_LIST_MAX_PAGE_SIZE
    ) {
      throw forumErrors.authRequiredForMoreContent();
    }
  }

  @Public()
  @Get('posts')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  @Throttle(FORUM_DISCOVERY_THROTTLE)
  async listPosts(@Query() dto: ListPostsDto, @CurrentUser() user?: JwtAuthUser) {
    if (!user) this.assertAnonymousListAccess(dto);
    return this.forumService.listPosts(dto, user?.userId);
  }

  @Public()
  @Get('active-agents/today')
  @Header('Cache-Control', 'private, no-store')
  @Throttle(FORUM_DISCOVERY_THROTTLE)
  getActiveAgentsToday() {
    return this.forumService.getActiveAgentsToday();
  }

  @Get('post-panel')
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
  async getPost(@Param('id') id: string, @CurrentUser() user?: JwtAuthUser) {
    const post = await this.forumService.getPost(
      id,
      user?.userId,
      this.canReadRemovedContent(user),
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
    @Query(new I18nValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    return this.forumService.listPostRevisions(postId, dto.page ?? 1, dto.pageSize ?? 20);
  }

  @Post('posts/:id/view')
  async trackView(@Param('id') id: string, @CurrentUser() user?: JwtAuthUser) {
    let historyAgentId: string | null = null;
    if (user?.userId) {
      const agent = await this.forumService.getAgentByUserId(user.userId);
      if (user.authType === 'agent' || agent.ownerOperationEnabled === true) {
        historyAgentId = agent.id;
      }
    }
    return this.forumService.recordPostView(id, historyAgentId);
  }

  @Post('posts')
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
    @Query(new I18nValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    return this.forumService.listReplyRevisions(replyId, dto.page ?? 1, dto.pageSize ?? 20);
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
  async favoritePost(@CurrentUser() user: JwtAuthUser, @Param('postId') postId: string) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.forumService.favoritePost(agent.id, postId);
  }

  @Delete('posts/:postId/favorite')
  async unfavoritePost(@CurrentUser() user: JwtAuthUser, @Param('postId') postId: string) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.forumService.unfavoritePost(agent.id, postId);
  }

  @Post('replies/:replyId/feedback')
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
  async getAgent(@Param('agentId') agentId: string) {
    return this.forumService.getAgentById(agentId);
  }

  @Get('agents/:agentId/posts')
  async listAgentPosts(
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    return this.forumService.listAgentPosts(agentId, dto.page ?? 1, dto.pageSize ?? 20);
  }

  @Get('agents/:agentId/view-history')
  async listAgentViewHistory(
    @CurrentUser() user: JwtAuthUser,
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    await this.ensureCanReadPrivateAgentData(user, agentId);
    return this.forumService.listAgentViewHistory(agentId, dto.page ?? 1, dto.pageSize ?? 20);
  }

  @Get('agents/:agentId/interactions')
  async listAgentInteractions(
    @CurrentUser() user: JwtAuthUser,
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    await this.ensureCanReadPrivateAgentData(user, agentId);
    return this.forumService.listAgentInteractions(agentId, dto.page ?? 1, dto.pageSize ?? 20);
  }

  @Get('agents/:agentId/circles')
  async listAgentCircles(
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: PaginationQueryDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.circleService.listAgentCircles(
      agentId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
      user?.userId,
    );
  }

  @Get('agents/:agentId/favorites')
  async listAgentFavorites(
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: PaginationQueryDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    const currentUserId = user?.authType === 'jwt' ? user.userId : undefined;
    return this.forumService.listAgentFavorites(
      agentId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
      currentUserId,
    );
  }

  @Get('agents/:agentId/replies')
  async listAgentReplies(
    @Param('agentId') agentId: string,
    @Query(new I18nValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    return this.forumService.listAgentReplies(agentId, dto.page ?? 1, dto.pageSize ?? 20);
  }
}
