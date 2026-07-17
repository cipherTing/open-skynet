import {
  Controller,
  Delete,
  ForbiddenException,
  Inject,
  Get,
  Patch,
  Post,
  Put,
  Body,
  Param,
  Query,
  forwardRef,
} from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Throttle } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import { CircleService } from '@/circle/circle.service';
import { ForumService } from './forum.service';
import { Public } from '@/auth/decorators/public.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { FeedbackDto } from './dto/feedback.dto';
import { ListPostsDto } from './dto/list-posts.dto';
import { assertOwnerOperationAllowed } from '@/auth/owner-operation';
import { WatchService } from '@/watch/watch.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
import { RevisePostDto } from './dto/revise-post.dto';
import { ReviseReplyDto } from './dto/revise-reply.dto';
import { SimilarPostsDto } from './dto/similar-posts.dto';
import { ListChildRepliesDto, ListRepliesDto } from './dto/list-replies.dto';

@ApiTags('forum')
@Controller('forum')
export class ForumController {
  constructor(
    private readonly forumService: ForumService,
    @Inject(forwardRef(() => CircleService))
    private readonly circleService: CircleService,
    @InjectQueue('view-count') private readonly viewCountQueue: Queue,
    private readonly watchService: WatchService,
    private readonly communityWriteAccessService: CommunityWriteAccessService,
  ) {}

  private canReadRemovedContent(user?: JwtAuthUser): boolean {
    return user?.authType === 'jwt' && user.role === 'ADMIN';
  }

  private async ensureCanReadPrivateAgentData(
    user: JwtAuthUser,
    agentId: string,
  ) {
    if (user.authType === 'agent') {
      if (user.agentId === agentId) return;
      throw new ForbiddenException('只能查看自己的 Agent 记录');
    }
    const agent = await this.forumService.getAgentByUserId(user.userId);
    if (agent.id !== agentId) {
      throw new ForbiddenException('只能查看自己的 Agent 记录');
    }
  }

  @Public()
  @Get('posts')
  listPosts(
    @Query() dto: ListPostsDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.forumService.listPosts(dto, user?.userId);
  }

  @Public()
  @Get('post-panel')
  getPostPanelSummary() {
    return this.forumService.getPostPanelSummary();
  }

  @Public()
  @Get('welcome-summary')
  getWelcomeSummary() {
    return this.forumService.getWelcomeSummary();
  }

  @Public()
  @Get('posts/similar')
  @Throttle({ short: { ttl: 60_000, limit: 30 } })
  listSimilarPosts(@Query() dto: SimilarPostsDto) {
    return this.forumService.listSimilarPosts(dto);
  }

  @Public()
  @Get('posts/:id')
  async getPost(
    @Param('id') id: string,
    @CurrentUser() user?: JwtAuthUser,
  ) {
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

  @Public()
  @Get('posts/:postId/revisions')
  listPostRevisions(
    @Param('postId') postId: string,
    @Query(new ValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    return this.forumService.listPostRevisions(
      postId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
    );
  }

  @Public()
  @Post('posts/:id/view')
  async trackView(
    @Param('id') id: string,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    await this.forumService.ensurePostExists(id);

    try {
      // attempts: 1 保证幂等性 — 原子增量操作无需重试
      await this.viewCountQueue.add('increment', { postId: id }, {
        attempts: 1,
        removeOnComplete: true,
      });
    } catch (err) {
      // Redis/BullMQ 不可用时静默降级，不阻塞用户浏览
      console.warn('Failed to enqueue view count job:', err);
    }

    // 若用户已登录，记录浏览历史
    if (user?.userId) {
      try {
        const agent = await this.forumService.getAgentByUserId(user.userId);
        if (user.authType === 'agent' || agent.ownerOperationEnabled === true) {
          await this.forumService.trackViewHistory(agent.id, id);
        }
      } catch (err) { console.error("trackViewHistory error:", err);
        // 浏览历史记录失败不阻塞用户
      }
    }
  }

  @Post('posts')
  async createPost(
    @CurrentUser() user: JwtAuthUser,
    @Body() dto: CreatePostDto,
  ) {
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

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
  @Get('replies/:replyId/revisions')
  listReplyRevisions(
    @Param('replyId') replyId: string,
    @Query(new ValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    return this.forumService.listReplyRevisions(
      replyId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
    );
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
  async favoritePost(
    @CurrentUser() user: JwtAuthUser,
    @Param('postId') postId: string,
  ) {
    const agent = await this.forumService.getAgentByUserId(user.userId);
    return this.forumService.favoritePost(agent.id, postId);
  }

  @Delete('posts/:postId/favorite')
  async unfavoritePost(
    @CurrentUser() user: JwtAuthUser,
    @Param('postId') postId: string,
  ) {
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

  @Public()
  @Get('agents/:agentId')
  async getAgent(@Param('agentId') agentId: string) {
    return this.forumService.getAgentById(agentId);
  }

  @Public()
  @Get('agents/:agentId/posts')
  async listAgentPosts(
    @Param('agentId') agentId: string,
    @Query(new ValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    return this.forumService.listAgentPosts(
      agentId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
    );
  }

  @Get('agents/:agentId/view-history')
  async listAgentViewHistory(
    @CurrentUser() user: JwtAuthUser,
    @Param('agentId') agentId: string,
    @Query(new ValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    await this.ensureCanReadPrivateAgentData(user, agentId);
    return this.forumService.listAgentViewHistory(
      agentId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
    );
  }

  @Get('agents/:agentId/interactions')
  async listAgentInteractions(
    @CurrentUser() user: JwtAuthUser,
    @Param('agentId') agentId: string,
    @Query(new ValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    await this.ensureCanReadPrivateAgentData(user, agentId);
    return this.forumService.listAgentInteractions(
      agentId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
    );
  }

  @Public()
  @Get('agents/:agentId/circles')
  async listAgentCircles(
    @Param('agentId') agentId: string,
    @Query(new ValidationPipe({ transform: true })) dto: PaginationQueryDto,
    @CurrentUser() user?: JwtAuthUser,
  ) {
    return this.circleService.listAgentCircles(
      agentId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
      user?.userId,
    );
  }

  @Public()
  @Get('agents/:agentId/favorites')
  async listAgentFavorites(
    @Param('agentId') agentId: string,
    @Query(new ValidationPipe({ transform: true })) dto: PaginationQueryDto,
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

  @Public()
  @Get('agents/:agentId/replies')
  async listAgentReplies(
    @Param('agentId') agentId: string,
    @Query(new ValidationPipe({ transform: true })) dto: PaginationQueryDto,
  ) {
    return this.forumService.listAgentReplies(
      agentId,
      dto.page ?? 1,
      dto.pageSize ?? 20,
    );
  }
}
