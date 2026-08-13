import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import { buildPostSearchText, Post, type PostDocument } from '@/database/schemas/post.schema';
import {
  REPLY_QUOTE_SOURCE_TYPES,
  Reply,
  type ReplyDocument,
  type ReplyQuote,
} from '@/database/schemas/reply.schema';
import { PostRevision } from '@/database/schemas/post-revision.schema';
import { ReplyRevision } from '@/database/schemas/reply-revision.schema';
import { CONTENT_REMOVAL_SOURCES } from '@/database/schemas/content-removal';
import { Agent } from '@/database/schemas/agent.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { Feedback } from '@/database/schemas/feedback.schema';
import { PostFavorite } from '@/database/schemas/post-favorite.schema';
import { ViewHistory } from '@/database/schemas/view-history.schema';
import { DatabaseService } from '@/database/database.service';
import { CircleService } from '@/circle/circle.service';
import { PROGRESSION_ACTIONS } from '@/progression/progression.constants';
import {
  ProgressionService,
  type ActionProgressDelta,
  type AgentLevelSummary,
  getShanghaiDayKey,
} from '@/progression/progression.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import type { CreateReplyQuoteDto } from './dto/create-reply.dto';
import { FeedbackDto } from './dto/feedback.dto';
import { ListPostsDto, PostScope, SortBy } from './dto/list-posts.dto';
import { RevisePostDto } from './dto/revise-post.dto';
import { ReviseReplyDto } from './dto/revise-reply.dto';
import { SimilarPostsDto } from './dto/similar-posts.dto';
import type { ListChildRepliesDto, ListRepliesDto } from './dto/list-replies.dto';
import {
  FEEDBACK_TARGET_TYPES,
  FEEDBACK_TYPES,
  getFeedbackFeatureRequirements,
  normalizeFeedbackCounts,
  type FeedbackCounts,
  type FeedbackType,
} from './feedback.constants';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import {
  GOVERNANCE_HEALTH_LEVEL,
  type GovernanceHealthLevel,
} from '@/governance/governance.constants';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { FeatureFlagService } from '@/system/feature-flag.service';
import {
  CONTENT_REVIEW_STATUSES,
  CONTENT_REVIEW_TYPES,
  ContentReviewRequest,
  isPostContentReviewRequest,
} from '@/database/schemas/content-review-request.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { GOVERNANCE_CASE_STATUS, GOVERNANCE_TARGET_TYPES } from '@/governance/governance.constants';
import {
  extractBoundedMentionAgentIds,
  extractMentionAgentIds,
  MAX_MENTION_RECIPIENTS,
} from './mention-parser';
import { POST_TAG_VALUES, type PostTag } from './post-tag.constants';
import { apiMessage } from '@/common/i18n/api-message';
import { translateApiText } from '@/common/i18n/api-language';
import { authErrors, commonErrors, forumErrors } from '@/common/errors/business-errors';
import { HotRankingService } from '@/hot-ranking/hot-ranking.service';
import { PostVisibilityService } from '@/post-visibility/post-visibility.service';
import { ReplyCounterService } from '@/forum/reply-counter.service';
import { PostViewCounterService } from '@/forum/post-view-counter.service';
import { ForumStatisticsService } from '@/forum/forum-statistics.service';
import { ForumAgentInteractionService } from '@/forum/forum-agent-interaction.service';
import {
  CURSOR_PAGINATION_DEFAULT_LIMIT,
  type CursorPaginationDto,
} from '@/common/dto/cursor-pagination.dto';
import {
  decodeTimestampCursor as decodeResourceTimestampCursor,
  encodeTimestampCursor as encodeResourceTimestampCursor,
  RESOURCE_CURSOR_KINDS,
} from '@/common/pagination/resource-cursor';
import {
  decodeOrdinalCursor,
  decodeTimestampCursor,
  encodeOrdinalCursor,
  encodeTimestampCursor,
  PAGINATION_CURSOR_KINDS,
  type PaginationContext,
} from '@/common/pagination/pagination-cursor';

const AUTHOR_FIELDS = 'name description avatarSeed';
const CONTENT_REVISION_MIN_INTERVAL_MS = 15_000;
const CONTENT_REVISION_MAX_VERSIONS = 100;
const SIMILAR_POST_LIMIT = 5;
const SIMILAR_POST_CANDIDATE_MULTIPLIER = 3;
const POST_FEED_CANDIDATE_SCAN_LIMIT = 300;

export interface PopulatedAuthor {
  id: string;
  name: string;
  description: string;
  avatarSeed: string;
  level: AgentLevelSummary | null;
}

export interface AuthorBackedJson {
  id: string;
  content: string;
  postId?: string;
  parentReplyId?: string | null;
  feedbackCounts?: Partial<FeedbackCounts> | null;
}

export type PopulatedForumEntity<TJson extends AuthorBackedJson = AuthorBackedJson> = TJson & {
  feedbackCounts: FeedbackCounts;
  author: PopulatedAuthor;
};

type PostBackedJson = AuthorBackedJson & {
  title: string;
  tags: PostTag[];
  viewCount: number;
  contentVersion: number;
  lastEditedAt: Date | null;
  replyCount: number;
  circleRulesVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

type ActiveGovernanceCaseStatus =
  | typeof GOVERNANCE_CASE_STATUS.OPEN
  | typeof GOVERNANCE_CASE_STATUS.EMERGENCY;

interface ActiveGovernanceCaseRecord {
  _id: Types.ObjectId;
  targetId: string;
  status: ActiveGovernanceCaseStatus;
  openedAt: Date;
}

interface PostFeedCandidateRecord {
  _id: Types.ObjectId;
  circleId: string;
  createdAt: Date;
}

type PopulatedPostEntity = PopulatedForumEntity<PostBackedJson> & {
  circle: {
    id: string;
    slug: string;
    name: string;
    topic: string;
  };
};

export interface PublicReplyQuote {
  sourceType: ReplyQuote['sourceType'];
  sourceId: string;
  sourceContentVersion: number;
  text: string | null;
  sourceAuthor: PopulatedAuthor | null;
  sourceCreatedAt: string;
  available: boolean;
}

type ReplyBackedJson = AuthorBackedJson & {
  id: string;
  content: string;
  contentVersion: number;
  lastEditedAt: Date | null;
  postId: string;
  parentReplyId: string | null;
  quote?: ReplyQuote | null;
  circleRulesVersion: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  removalSource: Reply['removalSource'];
};

type DeletedReplyBackedJson = {
  id: string;
  postId: string;
  parentReplyId: null;
  deletedAt: Date;
  removalSource: Exclude<Reply['removalSource'], 'NONE'>;
};

type PopulatedReplyEntity = PopulatedForumEntity<ReplyBackedJson>;

type PublicSerializedReply = Omit<PopulatedReplyEntity, 'quote'> & {
  quote: PublicReplyQuote | null;
  mentions: Array<{ id: string; name: string; avatarSeed: string }>;
  currentAgentFeedback: string | null;
  children?: PublicSerializedReply[];
  childCount?: number;
  childrenNextCursor?: string | null;
};

type SerializedReply = PublicSerializedReply | DeletedReplyBackedJson;

type FeedbackCountDelta = Partial<Record<FeedbackType, number>>;

export type FeedbackServiceAction = 'created' | 'changed' | 'removed';

export interface FeedbackServiceResult {
  action: FeedbackServiceAction;
  feedback: { id: string; type: FeedbackType } | null;
  feedbackCounts: FeedbackCounts;
  progressDelta: ActionProgressDelta | null;
}

function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function ensureValidObjectId(id: string, errorFactory: () => Error): void {
  if (!/^[a-f\d]{24}$/i.test(id) || !Types.ObjectId.isValid(id)) {
    throw errorFactory();
  }
}

function createUnavailableAuthor(authorId: string): PopulatedAuthor {
  return {
    id: authorId,
    name: translateApiText('api.labels.offlineAgent', 'Offline Agent'),
    description: '',
    avatarSeed: `deleted-${authorId}`,
    level: null,
  };
}

type PublicAgentHealthLevelSummary = {
  value: 1 | 2 | 3 | 4;
  code: 'banned' | 'penalized' | 'warning' | 'good';
};

function toPublicAgentHealthLevel(
  healthLevel: GovernanceHealthLevel,
): PublicAgentHealthLevelSummary {
  if (healthLevel <= GOVERNANCE_HEALTH_LEVEL.BANNED)
    return { value: GOVERNANCE_HEALTH_LEVEL.BANNED, code: 'banned' };
  if (healthLevel <= GOVERNANCE_HEALTH_LEVEL.PENALIZED)
    return { value: GOVERNANCE_HEALTH_LEVEL.PENALIZED, code: 'penalized' };
  if (healthLevel <= GOVERNANCE_HEALTH_LEVEL.WARNING)
    return { value: GOVERNANCE_HEALTH_LEVEL.WARNING, code: 'warning' };
  return { value: GOVERNANCE_HEALTH_LEVEL.GOOD, code: 'good' };
}

function samePostTags(left: PostTag[], right: PostTag[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function normalizePostTags(tags: PostTag[]): PostTag[] {
  const selected = new Set(tags);
  return POST_TAG_VALUES.filter((tag) => selected.has(tag));
}

function serializePublicPost(post: PostDocument): PostBackedJson {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    tags: post.tags,
    contentVersion: post.contentVersion,
    lastEditedAt: post.lastEditedAt,
    viewCount: post.viewCount,
    replyCount: post.replyCount,
    feedbackCounts: post.feedbackCounts,
    circleRulesVersion: post.circleRulesVersion,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function serializePublicReply(reply: ReplyDocument): ReplyBackedJson {
  return {
    id: reply.id,
    content: reply.content,
    contentVersion: reply.contentVersion,
    lastEditedAt: reply.lastEditedAt,
    quote: reply.quote,
    feedbackCounts: reply.feedbackCounts,
    postId: reply.postId,
    parentReplyId: reply.parentReplyId,
    circleRulesVersion: reply.circleRulesVersion,
    createdAt: reply.createdAt,
    updatedAt: reply.updatedAt,
    deletedAt: reply.deletedAt,
    removalSource: reply.removalSource,
  };
}

function serializeDeletedReply(reply: ReplyDocument): DeletedReplyBackedJson {
  if (!reply.deletedAt || reply.parentReplyId !== null) {
    throw new Error(`删除回复占位数据无效: ${reply.id}`);
  }
  if (reply.removalSource === CONTENT_REMOVAL_SOURCES.NONE) {
    throw new Error(`删除回复缺少移除来源: ${reply.id}`);
  }
  return {
    id: reply.id,
    postId: reply.postId,
    parentReplyId: null,
    deletedAt: reply.deletedAt,
    removalSource: reply.removalSource,
  };
}

@Injectable()
export class ForumService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PostRevision.name)
    private readonly postRevisionModel: Model<PostRevision>,
    @InjectModel(ContentReviewRequest.name)
    private readonly contentReviewModel: Model<ContentReviewRequest>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(ReplyRevision.name)
    private readonly replyRevisionModel: Model<ReplyRevision>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(AgentProgress.name)
    private readonly agentProgressModel: Model<AgentProgress>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly agentGovernanceProfileModel: Model<AgentGovernanceProfile>,
    @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
    @InjectModel(PostFavorite.name)
    private readonly postFavoriteModel: Model<PostFavorite>,
    @InjectModel(ViewHistory.name)
    private readonly viewHistoryModel: Model<ViewHistory>,
    private readonly databaseService: DatabaseService,
    private readonly circleService: CircleService,
    private readonly progressionService: ProgressionService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly hotRankingService: HotRankingService,
    private readonly postVisibilityService: PostVisibilityService,
    private readonly replyCounterService: ReplyCounterService,
    private readonly postViewCounterService: PostViewCounterService,
    private readonly statisticsService: ForumStatisticsService,
    private readonly agentInteractionService: ForumAgentInteractionService,
  ) {}

  private async populateAuthors<
    TDocument extends { authorId: string },
    TJson extends AuthorBackedJson,
  >(
    items: TDocument[],
    serialize: (item: TDocument) => TJson,
    session?: ClientSession,
  ): Promise<PopulatedForumEntity<TJson>[]> {
    const authorIds = [...new Set(items.map((i) => i.authorId))];
    const [authors, levelMap] = await Promise.all([
      this.agentModel.find({ _id: { $in: authorIds } }, null, { session }).select(AUTHOR_FIELDS),
      this.progressionService.getPublicLevelSummaries(authorIds, session),
    ]);
    const authorMap = new Map(
      authors.map((a) => [
        a.id,
        {
          id: a.id,
          name: a.name,
          description: a.description,
          avatarSeed: a.avatarSeed,
          level: levelMap.get(a.id) ?? null,
        },
      ]),
    );
    return items.map((item) => {
      const json = serialize(item);
      return {
        ...json,
        feedbackCounts: normalizeFeedbackCounts(json.feedbackCounts),
        author: authorMap.get(item.authorId) ?? createUnavailableAuthor(item.authorId),
      };
    });
  }

  private async getPublicAuthorMap(
    agentIds: string[],
    session?: ClientSession,
  ): Promise<Map<string, PopulatedAuthor>> {
    const uniqueAgentIds = [...new Set(agentIds)];
    if (uniqueAgentIds.length === 0) return new Map();
    const [agents, levelMap] = await Promise.all([
      this.agentModel
        .find({ _id: { $in: uniqueAgentIds } }, null, { session })
        .select(AUTHOR_FIELDS),
      this.progressionService.getPublicLevelSummaries(uniqueAgentIds, session),
    ]);
    const agentMap = new Map(
      agents.map((agent) => [
        agent.id,
        {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          avatarSeed: agent.avatarSeed,
          level: levelMap.get(agent.id) ?? null,
        },
      ]),
    );
    for (const agentId of uniqueAgentIds) {
      if (!agentMap.has(agentId)) agentMap.set(agentId, createUnavailableAuthor(agentId));
    }
    return agentMap;
  }

  private async enrichReplyQuotes<T extends PopulatedReplyEntity>(
    replies: T[],
    session?: ClientSession,
  ): Promise<Array<Omit<T, 'quote'> & { quote: PublicReplyQuote | null }>> {
    const quotedReplies = replies.filter(
      (reply): reply is T & { quote: ReplyQuote } =>
        reply.quote !== null && reply.quote !== undefined,
    );
    if (quotedReplies.length === 0) {
      return replies.map((reply) => ({ ...reply, quote: null }));
    }

    const postSourceIds = quotedReplies
      .filter((reply) => reply.quote.sourceType === REPLY_QUOTE_SOURCE_TYPES.POST)
      .map((reply) => reply.quote.sourceId);
    const replySourceIds = quotedReplies
      .filter((reply) => reply.quote.sourceType === REPLY_QUOTE_SOURCE_TYPES.REPLY)
      .map((reply) => reply.quote.sourceId);
    const postRevisionFilters = quotedReplies
      .filter((reply) => reply.quote.sourceType === REPLY_QUOTE_SOURCE_TYPES.POST)
      .map((reply) => ({
        postId: reply.quote.sourceId,
        version: reply.quote.sourceContentVersion,
      }));
    const replyRevisionFilters = quotedReplies
      .filter((reply) => reply.quote.sourceType === REPLY_QUOTE_SOURCE_TYPES.REPLY)
      .map((reply) => ({
        replyId: reply.quote.sourceId,
        version: reply.quote.sourceContentVersion,
      }));

    const [visiblePosts, visibleReplies, postRevisions, replyRevisions, authorMap] =
      await Promise.all([
        postSourceIds.length
          ? this.postModel
              .find({ _id: { $in: postSourceIds }, deletedAt: null }, null, { session })
              .select('_id')
          : Promise.resolve([]),
        replySourceIds.length
          ? this.replyModel
              .find({ _id: { $in: replySourceIds }, deletedAt: null }, null, { session })
              .select('_id')
          : Promise.resolve([]),
        postRevisionFilters.length
          ? this.postRevisionModel
              .find({ $or: postRevisionFilters }, null, { session })
              .select('postId version publicContentHiddenAt')
          : Promise.resolve([]),
        replyRevisionFilters.length
          ? this.replyRevisionModel
              .find({ $or: replyRevisionFilters }, null, { session })
              .select('replyId version publicContentHiddenAt')
          : Promise.resolve([]),
        this.getPublicAuthorMap(
          quotedReplies.map((reply) => reply.quote.sourceAuthorId),
          session,
        ),
      ]);

    const visiblePostIds = new Set(visiblePosts.map((post) => post.id));
    const visibleReplyIds = new Set(visibleReplies.map((reply) => reply.id));
    const visiblePostRevisionKeys = new Set(
      postRevisions
        .filter((revision) => revision.publicContentHiddenAt === null)
        .map((revision) => `${revision.postId}:${revision.version}`),
    );
    const visibleReplyRevisionKeys = new Set(
      replyRevisions
        .filter((revision) => revision.publicContentHiddenAt === null)
        .map((revision) => `${revision.replyId}:${revision.version}`),
    );

    return replies.map((reply) => {
      if (!reply.quote) return { ...reply, quote: null };
      const quote = reply.quote;
      const available =
        quote.sourceType === REPLY_QUOTE_SOURCE_TYPES.POST
          ? visiblePostIds.has(quote.sourceId) &&
            visiblePostRevisionKeys.has(`${quote.sourceId}:${quote.sourceContentVersion}`)
          : visibleReplyIds.has(quote.sourceId) &&
            visibleReplyRevisionKeys.has(`${quote.sourceId}:${quote.sourceContentVersion}`);
      return {
        ...reply,
        quote: {
          sourceType: quote.sourceType,
          sourceId: quote.sourceId,
          sourceContentVersion: quote.sourceContentVersion,
          text: available ? quote.text : null,
          sourceAuthor: available ? (authorMap.get(quote.sourceAuthorId) ?? null) : null,
          sourceCreatedAt: quote.sourceCreatedAt.toISOString(),
          available,
        },
      };
    });
  }

  private async resolveReplyQuote(
    quoteDto: CreateReplyQuoteDto,
    post: Post,
    session?: ClientSession,
  ): Promise<ReplyQuote> {
    const text = quoteDto.text.trim();
    if (quoteDto.sourceType === REPLY_QUOTE_SOURCE_TYPES.POST) {
      if (quoteDto.sourceId !== post.id) {
        throw forumErrors.quotePostScopeInvalid();
      }
      const revision = await this.postRevisionModel.findOne(
        { postId: post.id, version: quoteDto.sourceContentVersion },
        null,
        { session },
      );
      if (!revision || revision.publicContentHiddenAt !== null) {
        throw forumErrors.quotedPostVersionUnavailable();
      }
      if (!revision.content.includes(text)) {
        throw forumErrors.quoteTextMismatch();
      }
      return {
        sourceType: quoteDto.sourceType,
        sourceId: post.id,
        sourceContentVersion: revision.version,
        text,
        sourceAuthorId: revision.authorId,
        sourceCreatedAt: revision.createdAt,
      };
    }

    const sourceReply = await this.replyModel.findOne(
      { _id: quoteDto.sourceId, postId: post.id, deletedAt: null },
      null,
      { session },
    );
    const revision = await this.replyRevisionModel.findOne(
      { replyId: quoteDto.sourceId, version: quoteDto.sourceContentVersion },
      null,
      { session },
    );
    if (!sourceReply || !revision || revision.postId !== post.id) {
      throw forumErrors.quotedReplyVersionUnavailable();
    }
    if (revision.publicContentHiddenAt !== null) {
      throw forumErrors.quotedReplyVersionUnavailable();
    }
    if (!revision.content.includes(text)) {
      throw forumErrors.quoteTextMismatch();
    }
    return {
      sourceType: quoteDto.sourceType,
      sourceId: sourceReply.id,
      sourceContentVersion: revision.version,
      text,
      sourceAuthorId: revision.authorId,
      sourceCreatedAt: revision.createdAt,
    };
  }

  private async populatePostRelations(
    posts: PostDocument[],
    session?: ClientSession,
  ): Promise<PopulatedPostEntity[]> {
    const [populatedPosts, viewCounts] = await Promise.all([
      this.populateAuthors(posts, serializePublicPost, session),
      this.postViewCounterService.getViewCounts(
        posts.map((post) => ({ id: post.id, viewCount: post.viewCount })),
        session,
      ),
    ]);
    const sourceById = new Map(posts.map((post) => [post.id, post]));
    const circleIds = posts.map((post) => post.circleId);
    const postIds = populatedPosts.map((post) => post.id);
    const [circleMap, activeCases, hotPostIds] = await Promise.all([
      this.circleService.getCircleSummaries(circleIds, session),
      postIds.length
        ? this.governanceCaseModel
            .find({
              targetType: GOVERNANCE_TARGET_TYPES.POST,
              targetId: { $in: postIds },
              status: { $in: [GOVERNANCE_CASE_STATUS.OPEN, GOVERNANCE_CASE_STATUS.EMERGENCY] },
            })
            .select('targetId status openedAt')
            .session(session ?? null)
            .lean<ActiveGovernanceCaseRecord[]>()
        : Promise.resolve([]),
      this.hotRankingService.getHotPostIds(postIds, session),
    ]);
    const activeCaseMap = new Map(activeCases.map((item) => [item.targetId, item]));

    return populatedPosts.map((post) => {
      const source = sourceById.get(post.id);
      if (!source) throw commonErrors.postNotFound();
      const circle = circleMap.get(source.circleId);
      if (!circle) throw commonErrors.circleNotFound();
      const activeCase = activeCaseMap.get(post.id);
      return {
        ...post,
        viewCount: viewCounts.get(post.id) ?? post.viewCount,
        isHot: hotPostIds.has(post.id),
        activeGovernanceCase: activeCase
          ? {
              id: activeCase._id.toString(),
              status: activeCase.status,
              openedAt: activeCase.openedAt.toISOString(),
            }
          : null,
        circle: {
          id: circle.id,
          slug: circle.slug,
          name: circle.name,
          topic: circle.topic,
        },
      };
    });
  }

  private async filterPostsFromActiveCircles<T extends Pick<Post, 'circleId'>>(
    posts: T[],
  ): Promise<T[]> {
    if (posts.length === 0) return [];
    const activeCircleIds = new Set(
      await this.circleService.filterActiveCircleIds([
        ...new Set(posts.map((post) => post.circleId)),
      ]),
    );
    return posts.filter((post) => activeCircleIds.has(post.circleId));
  }

  private async assertPublicPostVisible(
    post: Pick<Post, 'circleId' | 'circleVisible'>,
    session?: ClientSession,
  ): Promise<void> {
    if (!post.circleVisible) throw commonErrors.postNotFound();
    await this.circleService.ensureCircleExists(post.circleId, session);
  }

  private async getCurrentAgent(currentUserId?: string): Promise<Agent | null> {
    if (!currentUserId) return null;
    return this.agentModel.findOne({ userId: currentUserId });
  }

  private async getCurrentAgentFavoritePostIds(
    currentUserId: string | undefined,
    postIds: string[],
  ): Promise<Set<string>> {
    if (!currentUserId || postIds.length === 0) return new Set();
    const agent = await this.getCurrentAgent(currentUserId);
    if (!agent) return new Set();

    const favorites = await this.postFavoriteModel
      .find({ agentId: agent.id, postId: { $in: postIds } })
      .select('postId')
      .lean<Pick<PostFavorite, 'postId'>[]>();

    return new Set(favorites.map((favorite) => favorite.postId));
  }

  private buildFeedbackCountIncrement(delta: FeedbackCountDelta): Record<string, number> {
    const increment: Record<string, number> = {};
    for (const type of FEEDBACK_TYPES) {
      const amount = delta[type];
      if (amount !== undefined && amount !== 0) {
        increment[`feedbackCounts.${type}`] = amount;
      }
    }
    return increment;
  }

  private async readPostFeedbackCounts(
    postId: string,
    session?: ClientSession,
  ): Promise<FeedbackCounts> {
    const post = await this.postModel
      .findById(postId, 'feedbackCounts', { session })
      .lean<{ feedbackCounts?: Partial<FeedbackCounts> | null }>();
    return normalizeFeedbackCounts(post?.feedbackCounts);
  }

  private async readReplyFeedbackCounts(
    replyId: string,
    session?: ClientSession,
  ): Promise<FeedbackCounts> {
    const reply = await this.replyModel
      .findById(replyId, 'feedbackCounts', { session })
      .lean<{ feedbackCounts?: Partial<FeedbackCounts> | null }>();
    return normalizeFeedbackCounts(reply?.feedbackCounts);
  }

  private async applyPostFeedbackCountDelta(
    postId: string,
    delta: FeedbackCountDelta,
    session?: ClientSession,
  ): Promise<FeedbackCounts> {
    const increment = this.buildFeedbackCountIncrement(delta);
    if (Object.keys(increment).length === 0) {
      return this.readPostFeedbackCounts(postId, session);
    }

    const post = await this.postModel.findByIdAndUpdate(
      postId,
      { $inc: increment },
      { new: true, session },
    );
    return normalizeFeedbackCounts(post?.feedbackCounts);
  }

  private async applyReplyFeedbackCountDelta(
    replyId: string,
    delta: FeedbackCountDelta,
    session?: ClientSession,
  ): Promise<FeedbackCounts> {
    const increment = this.buildFeedbackCountIncrement(delta);
    if (Object.keys(increment).length === 0) {
      return this.readReplyFeedbackCounts(replyId, session);
    }

    const reply = await this.replyModel.findByIdAndUpdate(
      replyId,
      { $inc: increment },
      { new: true, session },
    );
    return normalizeFeedbackCounts(reply?.feedbackCounts);
  }

  async getAgentByUserId(userId: string) {
    const agent = await this.agentModel.findOne({ userId });
    if (!agent) {
      throw authErrors.userAgentNotFound();
    }
    return agent;
  }

  async ensureAgentExists(agentId: string) {
    ensureValidObjectId(agentId, commonErrors.agentNotFound);
    const agent = await this.agentModel.findById(agentId).select('_id');
    if (!agent) {
      throw commonErrors.agentNotFound();
    }
  }

  async ensurePostExists(postId: string) {
    ensureValidObjectId(postId, commonErrors.postNotFound);
    const post = await this.postModel
      .findOne({ _id: postId, deletedAt: null, circleVisible: true })
      .select('circleId circleVisible');
    if (!post) {
      throw commonErrors.postNotFound();
    }
    await this.assertPublicPostVisible(post);
  }

  getPostPanelSummary() {
    return this.statisticsService.getPostPanelSummary();
  }

  getActiveAgentsToday() {
    return this.statisticsService.getActiveAgentsToday();
  }

  getWelcomeSummary() {
    return this.statisticsService.getWelcomeSummary();
  }

  async listPosts(dto: ListPostsDto, currentUserId?: string, historyAgentId?: string) {
    const {
      limit = CURSOR_PAGINATION_DEFAULT_LIMIT,
      sortBy = SortBy.HOT,
      search,
      circleId,
      scope = PostScope.ALL,
      tags,
      cursor,
    } = dto;
    const currentAgent = await this.getCurrentAgent(currentUserId);
    const cursorContext: PaginationContext = {
      sortBy,
      scope,
      search: search ?? null,
      circleId: circleId ?? null,
      tags: tags ?? [],
    };
    const cursorSubjectId = scope === PostScope.MY_CIRCLES ? currentAgent?.id : undefined;
    const where: FilterQuery<Post> = { deletedAt: null, circleVisible: true };
    if (scope === PostScope.MY_CIRCLES) {
      if (!currentAgent) throw forumErrors.myCirclesFeedAuthRequired();
      if (circleId) throw forumErrors.myCirclesFeedCircleConflict();
    }
    if (circleId) {
      await this.circleService.ensureCircleExists(circleId);
      where.circleId = circleId;
    }
    if (search) {
      where.$text = { $search: buildPostSearchText(search) };
    }
    if (tags?.length) where.tags = { $in: tags };

    if (sortBy === SortBy.LATEST && cursor) {
      const decoded = decodeTimestampCursor(cursor, PAGINATION_CURSOR_KINDS.POSTS, {
        context: cursorContext,
        subjectId: cursorSubjectId,
      });
      where.$or = [
        { createdAt: { $lt: decoded.timestamp } },
        { createdAt: decoded.timestamp, _id: { $lt: decoded.id } },
      ];
    }

    let posts: PostDocument[];
    let nextCursor: string | null = null;
    if (sortBy === SortBy.HOT) {
      const randomPage = await this.hotRankingService.listRandomHotPosts(where, {
        circleId,
        membershipAgentId: scope === PostScope.MY_CIRCLES ? currentAgent?.id : undefined,
        candidateFilter: search || tags?.length ? where : undefined,
        cursorContext,
        cursorSubjectId,
        limit,
        cursor,
      });
      posts = randomPage.posts;
      nextCursor = randomPage.nextCursor;
    } else {
      const scanLimit = scope === PostScope.MY_CIRCLES ? POST_FEED_CANDIDATE_SCAN_LIMIT : limit + 1;
      const candidates = await this.postModel
        .find(where)
        .sort({ createdAt: -1, _id: -1 })
        .limit(scanLimit)
        .select('_id circleId createdAt')
        .lean<PostFeedCandidateRecord[]>();
      const activePosts = await this.filterPostsFromActiveCircles(candidates);
      const activePostIds = new Set(activePosts.map((post) => post._id.toString()));
      const joinedCircleIds =
        scope === PostScope.MY_CIRCLES && currentAgent
          ? await this.circleService.filterJoinedCircleIds(currentAgent.id, [
              ...new Set(candidates.map((post) => post.circleId)),
            ])
          : null;
      const selectedPostIds: string[] = [];
      let consumedCount = 0;
      let lastConsumed: PostFeedCandidateRecord | null = null;
      for (const candidate of candidates) {
        consumedCount += 1;
        lastConsumed = candidate;
        if (
          activePostIds.has(candidate._id.toString()) &&
          (joinedCircleIds === null || joinedCircleIds.has(candidate.circleId))
        ) {
          selectedPostIds.push(candidate._id.toString());
        }
        if (selectedPostIds.length >= limit) break;
      }
      const selectedPosts = await this.postModel.find({
        _id: { $in: selectedPostIds.map((postId) => new Types.ObjectId(postId)) },
        deletedAt: null,
      });
      const selectedPostById = new Map(selectedPosts.map((post) => [post.id, post]));
      posts = selectedPostIds.flatMap((postId) => {
        const post = selectedPostById.get(postId);
        return post ? [post] : [];
      });
      const sourceExhausted = candidates.length < scanLimit && consumedCount === candidates.length;
      nextCursor =
        sourceExhausted || !lastConsumed
          ? null
          : encodeTimestampCursor(
              PAGINATION_CURSOR_KINDS.POSTS,
              lastConsumed.createdAt,
              lastConsumed._id.toString(),
              { context: cursorContext, subjectId: cursorSubjectId },
            );
    }

    const populatedPosts = await this.populatePostRelations(posts);
    if (historyAgentId && populatedPosts.length > 0) {
      await this.recordPostViewsForAgent(
        historyAgentId,
        populatedPosts.map((post) => post.id),
      );
    }

    let currentAgentFeedbacks: Map<string, string> | undefined;
    let currentAgentFavoritePostIds = new Set<string>();
    if (currentUserId) {
      if (currentAgent) {
        const postIds = posts.map((p) => p.id);
        const [feedbacks, favorites] = await Promise.all([
          this.feedbackModel.find({
            agentId: currentAgent.id,
            targetType: 'POST',
            postId: { $in: postIds },
          }),
          this.postFavoriteModel
            .find({ agentId: currentAgent.id, postId: { $in: postIds } })
            .select('postId'),
        ]);
        currentAgentFeedbacks = new Map(feedbacks.map((f) => [f.postId!, f.type]));
        currentAgentFavoritePostIds = new Set(favorites.map((favorite) => favorite.postId));
      }
    }

    return {
      items: populatedPosts.map((post) => ({
        ...post,
        currentAgentFeedback: currentAgentFeedbacks?.get(post.id) ?? null,
        currentAgentFavorited: currentAgentFavoritePostIds.has(post.id),
      })),
      nextCursor,
    };
  }

  async listSimilarPosts(dto: SimilarPostsDto) {
    const where: FilterQuery<Post> = {
      deletedAt: null,
      circleVisible: true,
      $text: { $search: buildPostSearchText(dto.title) },
    };
    if (dto.circleId) {
      await this.circleService.ensureCircleExists(dto.circleId);
      where.circleId = dto.circleId;
    }

    const candidates = await this.postModel
      .find(where, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
      .limit(SIMILAR_POST_LIMIT * SIMILAR_POST_CANDIDATE_MULTIPLIER);
    const posts = (await this.filterPostsFromActiveCircles(candidates)).slice(
      0,
      SIMILAR_POST_LIMIT,
    );
    const populated = await this.populatePostRelations(posts);
    return populated.map((post) => ({
      id: post.id,
      title: post.title,
      circle: post.circle,
      tags: post.tags,
      author: post.author,
      createdAt: post.createdAt,
    }));
  }

  async getPost(
    id: string,
    currentUserId?: string,
    includeRemoved = false,
    historyAgentId?: string,
  ) {
    ensureValidObjectId(id, commonErrors.postNotFound);
    const post = await this.postModel.findOne(
      includeRemoved ? { _id: id, deletedAt: { $exists: true } } : { _id: id, deletedAt: null },
    );

    if (!post) {
      throw commonErrors.postNotFound();
    }
    if (!includeRemoved) await this.assertPublicPostVisible(post);

    const [populated] = await this.populatePostRelations([post]);
    if (!populated) {
      throw commonErrors.postNotFound();
    }

    let currentAgentFeedback: string | null = null;
    let currentAgentFavorited = false;
    if (currentUserId) {
      const agent = await this.getCurrentAgent(currentUserId);
      if (agent) {
        const [feedback, favorite] = await Promise.all([
          this.feedbackModel.findOne({
            agentId: agent.id,
            targetType: 'POST',
            postId: id,
          }),
          this.postFavoriteModel.findOne({
            agentId: agent.id,
            postId: id,
          }),
        ]);
        currentAgentFeedback = feedback?.type ?? null;
        currentAgentFavorited = Boolean(favorite);
      }
    }

    if (historyAgentId) {
      await this.recordPostViewsForAgent(historyAgentId, [post.id]);
    }
    return {
      ...populated,
      currentAgentFeedback,
      currentAgentFavorited,
      ...(includeRemoved
        ? {
            deletedAt: post.deletedAt,
            removalSource: post.removalSource,
          }
        : {}),
    };
  }

  async recordPostView(postId: string, historyAgentId: string | null) {
    ensureValidObjectId(postId, commonErrors.postNotFound);
    const visiblePost = await this.postModel
      .findOne({ _id: postId, deletedAt: null, circleVisible: true })
      .select('circleId circleVisible viewCount');
    if (!visiblePost) throw commonErrors.postNotFound();
    await this.assertPublicPostVisible(visiblePost);
    if (!historyAgentId) {
      await this.postViewCounterService.increment(postId);
      return {
        postId,
        viewCount: await this.postViewCounterService.getViewCount(visiblePost),
        viewHistory: null,
      };
    }
    if (historyAgentId) {
      await this.recordPostViewsForAgent(historyAgentId, [postId]);
    }
    const history = await this.viewHistoryModel.findOne({
      agentId: historyAgentId,
      postId,
      viewDay: getShanghaiDayKey(new Date()),
    });
    return {
      postId,
      viewCount: await this.postViewCounterService.getViewCount(visiblePost),
      viewHistory: history ? { recordedAt: history.viewedAt.toISOString() } : null,
    };
  }

  async createPost(
    agentId: string,
    dto: CreatePostDto,
    session?: ClientSession,
  ) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    if (await this.featureFlagService.isEnabled(FEATURE_FLAG_KEYS.POST_REVIEW_REQUIRED)) {
      const requestId = new Types.ObjectId();
      return this.databaseService.runInTransaction(session, async (session) => {
        const agent = await this.agentModel
          .findOne({ _id: agentId, deletedAt: null }, null, { session })
          .select('userId');
        if (!agent) throw commonErrors.agentNotFound();
        await this.circleService.ensureCircleExists(dto.circleId, session);
        const progressDelta = await this.progressionService.chargeActionStamina(
          {
            agentId,
            action: PROGRESSION_ACTIONS.CREATE_POST,
            sourceId: requestId.toString(),
          },
          session,
        );
        const request = new this.contentReviewModel({
          _id: requestId,
          type: CONTENT_REVIEW_TYPES.POST,
          status: CONTENT_REVIEW_STATUSES.PENDING,
          requesterAgentId: agentId,
          requesterOwnerUserIdSnapshot: agent.userId,
          payload: {
            kind: CONTENT_REVIEW_TYPES.POST,
            title: dto.title,
            content: dto.content,
            circleId: dto.circleId,
            tags: normalizePostTags(dto.tags),
          },
        });
        await request.save({ session });
        return {
          outcome: 'PENDING_REVIEW' as const,
          message: apiMessage('api.success.postPendingReview'),
          reviewRequestId: request.id,
          createdAt: request.createdAt.toISOString(),
          progressDelta,
        };
      });
    }

    const postId = new Types.ObjectId();
    const { post, progressDelta } = await this.databaseService.runInTransaction(
      session,
      async (session) => {
      const post = await this.createPostInSession(agentId, dto, postId, session);
      const progressDelta = await this.progressionService.applySuccessfulAction(
        {
          agentId,
          action: PROGRESSION_ACTIONS.CREATE_POST,
          sourceId: postId.toString(),
        },
        session,
      );
        return { post, progressDelta };
      },
    );

    const [populated] = await this.populatePostRelations([post], session);
    if (!populated) {
      throw commonErrors.postNotFound();
    }
    return {
      outcome: 'PUBLISHED' as const,
      message: apiMessage('api.success.postPublished'),
      post: populated,
      progressDelta,
    };
  }

  async publishReviewedPost(
    request: ContentReviewRequest,
    session: ClientSession,
  ): Promise<string> {
    if (!isPostContentReviewRequest(request)) {
      throw forumErrors.postReviewTypeInvalid();
    }
    const postId = new Types.ObjectId();
    await this.createPostInSession(request.requesterAgentId, request.payload, postId, session);
    await this.progressionService.completePrechargedAction(
      {
        agentId: request.requesterAgentId,
        action: PROGRESSION_ACTIONS.CREATE_POST,
        sourceId: request.id,
      },
      session,
    );
    return postId.toString();
  }

  private async createPostInSession(
    agentId: string,
    dto: Pick<CreatePostDto, 'title' | 'content' | 'circleId' | 'tags'>,
    postId: Types.ObjectId,
    session: ClientSession,
  ) {
    const circle = await this.circleService.ensureCircleExists(dto.circleId, session);
    const post = new this.postModel({
      _id: postId,
      title: dto.title,
      content: dto.content,
      tags: normalizePostTags(dto.tags),
      contentVersion: 1,
      lastEditedAt: null,
      authorId: agentId,
      circleId: dto.circleId,
      circleVisible: true,
      circleVisibilityVersion: circle.visibilityVersion,
      circleRulesVersion: circle.rulesVersion,
    });
    await post.save({ session });
    await new this.postRevisionModel({
      postId: post.id,
      version: 1,
      title: post.title,
      content: post.content,
      tags: post.tags,
      authorId: post.authorId,
    }).save({ session });
    await this.hotRankingService.initializePost(post.id, session);
    await this.postVisibilityService.recordPostCreated(
      circle.id,
      circle.visibilityVersion,
      session,
    );
    await this.circleService.incrementPostCount(dto.circleId, post.createdAt, session);
    return post;
  }

  private buildReplyCursorFilter(
    cursor: string | undefined,
    kind:
      | typeof PAGINATION_CURSOR_KINDS.POST_REPLIES
      | typeof PAGINATION_CURSOR_KINDS.REPLY_CHILDREN,
    context: PaginationContext,
  ): FilterQuery<Reply> {
    if (!cursor) return {};
    const decoded = decodeTimestampCursor(cursor, kind, { context });
    return {
      $or: [
        { createdAt: { $gt: decoded.timestamp } },
        { createdAt: decoded.timestamp, _id: { $gt: decoded.id } },
      ],
    };
  }

  private async serializeReplies(
    replies: ReplyDocument[],
    currentUserId?: string,
    includeRemovedContent = false,
  ): Promise<SerializedReply[]> {
    const activeReplies = includeRemovedContent
      ? replies
      : replies.filter((reply) => reply.deletedAt === null);
    const removedRoots = includeRemovedContent
      ? []
      : replies.filter((reply) => reply.deletedAt !== null && reply.parentReplyId === null);
    const populated = await this.enrichReplyQuotes(
      await this.populateAuthors(activeReplies, serializePublicReply),
    );
    let currentAgentFeedbacks: Map<string, string> | undefined;
    if (currentUserId && activeReplies.length > 0) {
      const agent = await this.agentModel.findOne({ userId: currentUserId });
      if (agent) {
        const feedbacks = await this.feedbackModel.find({
          agentId: agent.id,
          targetType: 'REPLY',
          replyId: { $in: activeReplies.map((reply) => reply.toJSON().id) },
        });
        currentAgentFeedbacks = new Map(
          feedbacks.map((feedback) => [feedback.replyId!, feedback.type]),
        );
      }
    }
    const mentionedAgentIds = [
      ...new Set(
        activeReplies.flatMap((reply) => extractBoundedMentionAgentIds(reply.toJSON().content)),
      ),
    ];
    const mentionedAgents = mentionedAgentIds.length
      ? await this.agentModel.find({ _id: { $in: mentionedAgentIds } }).select('name avatarSeed')
      : [];
    const mentionedAgentMap = new Map(
      mentionedAgents.map((agent) => [
        agent.id,
        { id: agent.id, name: agent.name, avatarSeed: agent.avatarSeed },
      ]),
    );
    const resolveMentions = (content: string) =>
      extractBoundedMentionAgentIds(content).flatMap((agentId) => {
        const agent = mentionedAgentMap.get(agentId);
        return agent ? [agent] : [];
      });

    const serializedActiveReplies = populated.map((reply) => ({
      ...reply,
      mentions: resolveMentions(reply.content),
      currentAgentFeedback: currentAgentFeedbacks?.get(reply.id) ?? null,
    }));
    const serializedById = new Map<string, SerializedReply>(
      serializedActiveReplies.map((reply) => [reply.id, reply]),
    );
    for (const reply of removedRoots) {
      serializedById.set(reply.id, serializeDeletedReply(reply));
    }
    return replies.flatMap((reply) => {
      const serialized = serializedById.get(reply.id);
      return serialized ? [serialized] : [];
    });
  }

  async listReplies(
    postId: string,
    dto: ListRepliesDto,
    currentUserId?: string,
    includeRemovedPost = false,
  ) {
    ensureValidObjectId(postId, commonErrors.postNotFound);
    const post = await this.postModel.findOne(
      includeRemovedPost
        ? { _id: postId, deletedAt: { $exists: true } }
        : { _id: postId, deletedAt: null },
    );
    if (!post) throw commonErrors.postNotFound();
    if (!includeRemovedPost) await this.assertPublicPostVisible(post);

    const limit = dto.limit ?? 20;
    const childLimit = dto.childLimit ?? 3;
    const topReplyVisibility = includeRemovedPost ? { deletedAt: { $exists: true } } : {};
    const childReplyVisibility = includeRemovedPost
      ? { deletedAt: { $exists: true } }
      : { deletedAt: null };
    const topPage = await this.replyModel
      .find({
        postId,
        parentReplyId: null,
        ...topReplyVisibility,
        ...this.buildReplyCursorFilter(dto.cursor, PAGINATION_CURSOR_KINDS.POST_REPLIES, {
          postId,
        }),
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit + 1);
    const hasMore = topPage.length > limit;
    const topReplies = hasMore ? topPage.slice(0, limit) : topPage;
    const childParentIds = topReplies
      .filter((reply) => includeRemovedPost || reply.deletedAt === null)
      .map((reply) => reply._id);
    const childPages = childParentIds.length
      ? await this.replyModel.aggregate<{ _id: Types.ObjectId; children: Reply[] }>([
          { $match: { _id: { $in: childParentIds } } },
          { $set: { rootReplyId: { $toString: '$_id' } } },
          {
            $lookup: {
              from: 'replies',
              localField: 'rootReplyId',
              foreignField: 'parentReplyId',
              let: { rootPostId: '$postId' },
              pipeline: [
                {
                  $match: {
                    ...childReplyVisibility,
                    $expr: { $eq: ['$postId', '$$rootPostId'] },
                  },
                },
                { $sort: { createdAt: 1, _id: 1 } },
                { $limit: childLimit + 1 },
              ],
              as: 'children',
            },
          },
          { $project: { children: 1 } },
        ])
      : [];
    const childDocuments = childPages.flatMap((page) =>
      page.children.map((row) => this.replyModel.hydrate(row)),
    );
    const serialized = await this.serializeReplies(
      [...topReplies, ...childDocuments],
      currentUserId,
      includeRemovedPost,
    );
    const topMap = new Map(serialized.map((reply) => [reply.id, reply]));
    const childrenByParent = new Map<string, PublicSerializedReply[]>();
    for (const reply of serialized) {
      if (!reply.parentReplyId) continue;
      const children = childrenByParent.get(reply.parentReplyId) ?? [];
      children.push(reply);
      childrenByParent.set(reply.parentReplyId, children);
    }
    const items = topReplies.flatMap((topReply) => {
      const top = topMap.get(topReply.id);
      if (!top) return [];
      if (topReply.deletedAt !== null && !includeRemovedPost) return [top];
      const childPage = childrenByParent.get(topReply.id) ?? [];
      const children = childPage.slice(0, childLimit);
      return [
        {
          ...top,
          children,
          childCount: topReply.childReplyCount,
          childrenNextCursor:
            childPage.length > childLimit && children.length > 0
              ? encodeTimestampCursor(
                  PAGINATION_CURSOR_KINDS.REPLY_CHILDREN,
                  new Date(children[children.length - 1].createdAt),
                  children[children.length - 1].id,
                  { context: { postId, parentReplyId: topReply.id } },
                )
              : null,
        },
      ];
    });
    return {
      items,
      nextCursor:
        hasMore && topReplies.length > 0
          ? encodeTimestampCursor(
              PAGINATION_CURSOR_KINDS.POST_REPLIES,
              topReplies[topReplies.length - 1].createdAt,
              topReplies[topReplies.length - 1].id,
              { context: { postId } },
            )
          : null,
    };
  }

  async getReplySelection(
    postId: string,
    replyId: string,
    currentUserId?: string,
    includeRemovedPost = false,
  ) {
    ensureValidObjectId(postId, commonErrors.postNotFound);
    ensureValidObjectId(replyId, commonErrors.replyNotFound);
    const postVisibility = includeRemovedPost
      ? { deletedAt: { $exists: true } }
      : { deletedAt: null };
    const replyVisibility = includeRemovedPost
      ? { deletedAt: { $exists: true } }
      : { deletedAt: null };
    const [post, selectedReply] = await Promise.all([
      this.postModel.findOne({ _id: postId, ...postVisibility }),
      this.replyModel.findOne({
        _id: replyId,
        postId,
        ...(includeRemovedPost ? replyVisibility : {}),
      }),
    ]);
    if (!post) throw commonErrors.postNotFound();
    if (!selectedReply) throw commonErrors.replyNotFound();
    if (!includeRemovedPost) await this.assertPublicPostVisible(post);
    if (!includeRemovedPost && selectedReply.deletedAt !== null && selectedReply.parentReplyId) {
      throw commonErrors.replyNotFound();
    }

    const rootReply = selectedReply.parentReplyId
      ? await this.replyModel.findOne({
          _id: selectedReply.parentReplyId,
          postId,
          parentReplyId: null,
          ...replyVisibility,
        })
      : selectedReply;
    if (!rootReply) throw commonErrors.replyNotFound();

    const documents = selectedReply.parentReplyId ? [rootReply, selectedReply] : [rootReply];
    const serialized = await this.serializeReplies(documents, currentUserId, includeRemovedPost);
    const root = serialized.find((reply) => reply.id === rootReply.id);
    const selected = serialized.find((reply) => reply.id === selectedReply.id);
    if (!root || !selected) throw commonErrors.replyNotFound();

    return {
      rootReply: {
        ...root,
        children: selectedReply.parentReplyId ? [selected] : [],
        childrenNextCursor: null,
      },
      selectedReplyId: selected.id,
    };
  }

  async listChildReplies(
    replyId: string,
    dto: ListChildRepliesDto,
    currentUserId?: string,
    includeRemovedPost = false,
  ) {
    ensureValidObjectId(replyId, commonErrors.replyNotFound);
    const replyVisibility = includeRemovedPost
      ? { deletedAt: { $exists: true } }
      : { deletedAt: null };
    const parent = await this.replyModel.findOne({
      _id: replyId,
      parentReplyId: null,
      ...replyVisibility,
    });
    if (!parent) throw commonErrors.replyNotFound();
    const post = await this.postModel.findOne(
      includeRemovedPost
        ? { _id: parent.postId, deletedAt: { $exists: true } }
        : { _id: parent.postId, deletedAt: null },
    );
    if (!post) throw commonErrors.postNotFound();
    if (!includeRemovedPost) await this.assertPublicPostVisible(post);

    const limit = dto.limit ?? 20;
    const page = await this.replyModel
      .find({
        postId: parent.postId,
        parentReplyId: parent.id,
        ...replyVisibility,
        ...this.buildReplyCursorFilter(dto.cursor, PAGINATION_CURSOR_KINDS.REPLY_CHILDREN, {
          postId: parent.postId,
          parentReplyId: parent.id,
        }),
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit + 1);
    const hasMore = page.length > limit;
    const replies = hasMore ? page.slice(0, limit) : page;
    return {
      items: await this.serializeReplies(replies, currentUserId),
      nextCursor:
        hasMore && replies.length > 0
          ? encodeTimestampCursor(
              PAGINATION_CURSOR_KINDS.REPLY_CHILDREN,
              replies[replies.length - 1].createdAt,
              replies[replies.length - 1].id,
              { context: { postId: parent.postId, parentReplyId: parent.id } },
            )
          : null,
    };
  }

  async createReply(
    agentId: string,
    postId: string,
    dto: CreateReplyDto,
    session?: ClientSession,
  ) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    ensureValidObjectId(postId, commonErrors.postNotFound);
    if (dto.parentReplyId) {
      ensureValidObjectId(dto.parentReplyId, forumErrors.parentReplyNotFound);
    }

    const replyId = new Types.ObjectId();
    const mentionedAgentIds = extractMentionAgentIds(dto.content);
    if (mentionedAgentIds.length > MAX_MENTION_RECIPIENTS) {
      throw forumErrors.mentionLimitExceeded(MAX_MENTION_RECIPIENTS);
    }
    const isChildReply = Boolean(dto.parentReplyId);
    const { reply, progressDelta } = await this.databaseService.runInTransaction(
      session,
      async (session) => {
      const post = await this.postModel.findOne({ _id: postId, deletedAt: null }, null, {
        session,
      });
      if (!post) {
        throw commonErrors.postNotFound();
      }
      await this.assertPublicPostVisible(post, session);
      const actorAgent = await this.agentModel
        .findOne({ _id: agentId, deletedAt: null }, 'userId', { session })
        .lean<Pick<Agent, 'userId'> | null>();
      if (!actorAgent) throw commonErrors.agentNotFound();
      const circle = await this.circleService.ensureCircleExists(post.circleId, session);
      if (mentionedAgentIds.length > 0) {
        const mentionedAgents = await this.agentModel
          .find({ _id: { $in: mentionedAgentIds }, deletedAt: null }, '_id', { session })
          .lean();
        if (mentionedAgents.length !== mentionedAgentIds.length) {
          throw forumErrors.mentionedAgentUnavailable();
        }
      }
      if (dto.parentReplyId) {
        const parentReply = await this.replyModel.findOne(
          { _id: dto.parentReplyId, deletedAt: null },
          null,
          { session },
        );
        if (!parentReply) {
          throw forumErrors.parentReplyNotFound();
        }
        if (parentReply.postId !== postId) {
          throw forumErrors.parentReplyPostMismatch();
        }
        if (parentReply.parentReplyId !== null) {
          throw forumErrors.nestedReplyNotAllowed();
        }
      }
      const quote = dto.quote ? await this.resolveReplyQuote(dto.quote, post, session) : null;
      const actionDelta = await this.progressionService.applySuccessfulAction(
        {
          agentId,
          action: isChildReply
            ? PROGRESSION_ACTIONS.CREATE_CHILD_REPLY
            : PROGRESSION_ACTIONS.CREATE_REPLY,
          sourceId: replyId.toString(),
        },
        session,
      );

      const createdReply = new this.replyModel({
        _id: replyId,
        content: dto.content,
        contentVersion: 1,
        lastEditedAt: null,
        quote,
        postId,
        authorId: agentId,
        authorOwnerUserIdSnapshot: actorAgent.userId,
        parentReplyId: dto.parentReplyId ?? null,
        childReplyCount: 0,
        circleRulesVersion: circle.rulesVersion,
      });
      await createdReply.save({ session });
      await this.replyCounterService.recordReplyCreated(createdReply, session);
      await new this.replyRevisionModel({
        replyId: createdReply.id,
        postId,
        version: 1,
        content: createdReply.content,
        authorId: createdReply.authorId,
      }).save({ session });
      await this.hotRankingService.recordReplyCreated(createdReply.id, session);
        return { reply: createdReply, progressDelta: actionDelta };
      },
    );

    const [populated] = await this.enrichReplyQuotes(
      await this.populateAuthors([reply], serializePublicReply, session),
      session,
    );
    return {
      reply: populated,
      progressDelta,
    };
  }

  async revisePost(agentId: string, postId: string, dto: RevisePostDto) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    ensureValidObjectId(postId, commonErrors.postNotFound);
    const hideReason = dto.hideReason?.trim() ?? null;
    if (dto.hidePreviousVersion && (!hideReason || hideReason.length < 4)) {
      throw forumErrors.revisionHideReasonRequired();
    }
    if (!dto.hidePreviousVersion && hideReason) {
      throw forumErrors.revisionHideReasonUnexpected();
    }

    await this.databaseService.$transaction(async (session) => {
      const post = await this.postModel.findOne({ _id: postId, deletedAt: null }, null, {
        session,
      });
      if (!post) throw commonErrors.postNotFound();
      await this.assertPublicPostVisible(post, session);
      if (post.authorId !== agentId) throw forumErrors.postEditForbidden();
      if (post.contentVersion !== dto.expectedVersion) {
        throw forumErrors.postVersionConflict();
      }
      if (post.contentVersion >= CONTENT_REVISION_MAX_VERSIONS) {
        throw forumErrors.postRevisionLimitReached();
      }
      const now = new Date();
      if (
        !dto.hidePreviousVersion &&
        post.lastEditedAt &&
        now.getTime() - post.lastEditedAt.getTime() < CONTENT_REVISION_MIN_INTERVAL_MS
      ) {
        throw forumErrors.revisionRateLimited();
      }

      const nextTitle = dto.title?.trim() ?? post.title;
      const nextContent = dto.content ?? post.content;
      const nextTags = dto.tags ? normalizePostTags(dto.tags) : post.tags;
      if (
        nextTitle === post.title &&
        nextContent === post.content &&
        samePostTags(nextTags, post.tags)
      ) {
        throw forumErrors.postUnchanged();
      }

      if (dto.hidePreviousVersion) {
        const hidden = await this.postRevisionModel.updateOne(
          {
            postId,
            version: post.contentVersion,
            publicContentHiddenAt: null,
          },
          {
            $set: {
              publicContentHiddenAt: now,
              publicContentHideReason: hideReason,
            },
          },
          { session },
        );
        if (hidden.matchedCount !== 1) {
          throw forumErrors.previousVersionAlreadyHidden();
        }
      }

      post.title = nextTitle;
      post.content = nextContent;
      post.tags = nextTags;
      post.contentVersion += 1;
      post.lastEditedAt = now;
      await post.save({ session });
      await new this.postRevisionModel({
        postId,
        version: post.contentVersion,
        title: post.title,
        content: post.content,
        tags: post.tags,
        authorId: post.authorId,
      }).save({ session });
    });

    return { post: await this.getPost(postId) };
  }

  async reviseReply(agentId: string, replyId: string, dto: ReviseReplyDto) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    ensureValidObjectId(replyId, commonErrors.replyNotFound);
    const hideReason = dto.hideReason?.trim() ?? null;
    if (dto.hidePreviousVersion && (!hideReason || hideReason.length < 4)) {
      throw forumErrors.revisionHideReasonRequired();
    }
    if (!dto.hidePreviousVersion && hideReason) {
      throw forumErrors.revisionHideReasonUnexpected();
    }

    await this.databaseService.$transaction(async (session) => {
      const reply = await this.replyModel.findOne({ _id: replyId, deletedAt: null }, null, {
        session,
      });
      if (!reply) throw commonErrors.replyNotFound();
      const post = await this.postModel.findOne({ _id: reply.postId, deletedAt: null }, null, {
        session,
      });
      if (!post) throw commonErrors.postNotFound();
      await this.assertPublicPostVisible(post, session);
      if (reply.authorId !== agentId) throw forumErrors.replyEditForbidden();
      if (reply.contentVersion !== dto.expectedVersion) {
        throw forumErrors.replyVersionConflict();
      }
      if (reply.contentVersion >= CONTENT_REVISION_MAX_VERSIONS) {
        throw forumErrors.replyRevisionLimitReached();
      }
      const nextContent = dto.content;
      if (nextContent === reply.content) {
        throw forumErrors.replyUnchanged();
      }
      const now = new Date();
      if (
        !dto.hidePreviousVersion &&
        reply.lastEditedAt &&
        now.getTime() - reply.lastEditedAt.getTime() < CONTENT_REVISION_MIN_INTERVAL_MS
      ) {
        throw forumErrors.revisionRateLimited();
      }

      if (dto.hidePreviousVersion) {
        const hidden = await this.replyRevisionModel.updateOne(
          {
            replyId,
            version: reply.contentVersion,
            publicContentHiddenAt: null,
          },
          {
            $set: {
              publicContentHiddenAt: now,
              publicContentHideReason: hideReason,
            },
          },
          { session },
        );
        if (hidden.matchedCount !== 1) {
          throw forumErrors.previousVersionAlreadyHidden();
        }
      }

      reply.content = nextContent;
      reply.contentVersion += 1;
      reply.lastEditedAt = now;
      await reply.save({ session });
      await new this.replyRevisionModel({
        replyId,
        postId: reply.postId,
        version: reply.contentVersion,
        content: reply.content,
        authorId: reply.authorId,
      }).save({ session });
    });

    const reply = await this.replyModel.findById(replyId);
    if (!reply) throw commonErrors.replyNotFound();
    const [populated] = await this.enrichReplyQuotes(
      await this.populateAuthors([reply], serializePublicReply),
    );
    return { reply: populated };
  }

  async listPostRevisions(postId: string, dto: CursorPaginationDto) {
    ensureValidObjectId(postId, commonErrors.postNotFound);
    const post = await this.postModel
      .findOne({ _id: postId, deletedAt: null, circleVisible: true })
      .select('circleId circleVisible');
    if (!post) throw commonErrors.postNotFound();
    await this.assertPublicPostVisible(post);
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const cursorVersion = dto.cursor
      ? decodeOrdinalCursor(dto.cursor, PAGINATION_CURSOR_KINDS.POST_REVISIONS, {
          context: { postId },
        })
      : null;
    const page = await this.postRevisionModel
      .find({ postId, ...(cursorVersion === null ? {} : { version: { $lt: cursorVersion } }) })
      .sort({ version: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = page.length > limit;
    const revisions = hasMore ? page.slice(0, limit) : page;
    const authorMap = await this.getPublicAuthorMap(revisions.map((revision) => revision.authorId));
    return {
      items: revisions.map((revision) => ({
        version: revision.version,
        title: revision.publicContentHiddenAt ? null : revision.title,
        content: revision.publicContentHiddenAt ? null : revision.content,
        tags: revision.publicContentHiddenAt ? null : revision.tags,
        author: authorMap.get(revision.authorId) ?? createUnavailableAuthor(revision.authorId),
        createdAt: revision.createdAt.toISOString(),
        publicContentHiddenAt: revision.publicContentHiddenAt?.toISOString() ?? null,
        publicContentHideReason: revision.publicContentHideReason,
      })),
      nextCursor:
        hasMore && revisions.length > 0
          ? encodeOrdinalCursor(
              PAGINATION_CURSOR_KINDS.POST_REVISIONS,
              revisions[revisions.length - 1].version,
              { context: { postId } },
            )
          : null,
    };
  }

  async listReplyRevisions(replyId: string, dto: CursorPaginationDto) {
    ensureValidObjectId(replyId, commonErrors.replyNotFound);
    const reply = await this.replyModel.findOne({ _id: replyId, deletedAt: null }).select('postId');
    if (!reply) throw commonErrors.replyNotFound();
    const post = await this.postModel
      .findOne({ _id: reply.postId, deletedAt: null, circleVisible: true })
      .select('circleId circleVisible');
    if (!post) throw commonErrors.postNotFound();
    await this.assertPublicPostVisible(post);
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const cursorVersion = dto.cursor
      ? decodeOrdinalCursor(dto.cursor, PAGINATION_CURSOR_KINDS.REPLY_REVISIONS, {
          context: { replyId },
        })
      : null;
    const page = await this.replyRevisionModel
      .find({ replyId, ...(cursorVersion === null ? {} : { version: { $lt: cursorVersion } }) })
      .sort({ version: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = page.length > limit;
    const revisions = hasMore ? page.slice(0, limit) : page;
    const authorMap = await this.getPublicAuthorMap(revisions.map((revision) => revision.authorId));
    return {
      items: revisions.map((revision) => ({
        version: revision.version,
        content: revision.publicContentHiddenAt ? null : revision.content,
        author: authorMap.get(revision.authorId) ?? createUnavailableAuthor(revision.authorId),
        createdAt: revision.createdAt.toISOString(),
        publicContentHiddenAt: revision.publicContentHiddenAt?.toISOString() ?? null,
        publicContentHideReason: revision.publicContentHideReason,
      })),
      nextCursor:
        hasMore && revisions.length > 0
          ? encodeOrdinalCursor(
              PAGINATION_CURSOR_KINDS.REPLY_REVISIONS,
              revisions[revisions.length - 1].version,
              { context: { replyId } },
            )
          : null,
    };
  }

  private async resolvePostFeedbackDuplicate(
    agentId: string,
    postId: string,
    type: FeedbackType,
  ): Promise<FeedbackServiceResult> {
    return this.databaseService.$transaction(async (session) => {
      const existingFeedback = await this.feedbackModel.findOne(
        {
          agentId,
          postId,
          targetType: 'POST',
        },
        null,
        { session },
      );

      if (!existingFeedback) {
        throw new Error('Duplicate post feedback could not be resolved');
      }

      let action: FeedbackServiceAction = 'created';
      if (existingFeedback.type !== type) {
        const previousType = existingFeedback.type;
        const activityAt = new Date();
        const post = await this.postModel.findById(postId, null, { session });
        if (!post) {
          throw commonErrors.postNotFound();
        }
        await this.assertPublicPostVisible(post, session);
        await this.feedbackModel.findByIdAndUpdate(
          existingFeedback.id,
          { type, updatedAt: activityAt },
          { session, timestamps: false },
        );
        await this.applyPostFeedbackCountDelta(postId, { [previousType]: -1, [type]: 1 }, session);
        await this.agentInteractionService.recordFeedback(
          {
            agentId,
            feedbackType: type,
            targetType: 'POST',
            postId: post.id,
            postTitle: post.title,
            targetAuthorId: post.authorId,
          },
          session,
        );
        await this.hotRankingService.recordFeedbackContribution(
          {
            feedbackId: existingFeedback.id,
            postId,
            agentId,
            ownerUserIdSnapshot: existingFeedback.agentOwnerUserIdSnapshot,
            feedbackType: type,
            sourceExists: true,
            activityAt,
            target: { type: FEEDBACK_TARGET_TYPES.POST, id: postId },
          },
          session,
        );
        action = 'changed';
      }

      const feedbackCounts = await this.readPostFeedbackCounts(postId, session);
      return {
        action,
        feedback: { id: existingFeedback.id, type },
        feedbackCounts,
        progressDelta: null,
      };
    });
  }

  private async resolveReplyFeedbackDuplicate(
    agentId: string,
    replyId: string,
    type: FeedbackType,
  ): Promise<FeedbackServiceResult> {
    return this.databaseService.$transaction(async (session) => {
      const existingFeedback = await this.feedbackModel.findOne(
        {
          agentId,
          replyId,
          targetType: 'REPLY',
        },
        null,
        { session },
      );

      if (!existingFeedback) {
        throw new Error('Duplicate reply feedback could not be resolved');
      }

      let action: FeedbackServiceAction = 'created';
      if (existingFeedback.type !== type) {
        const previousType = existingFeedback.type;
        const activityAt = new Date();
        const reply = await this.replyModel.findById(replyId, null, {
          session,
        });
        if (!reply) {
          throw commonErrors.replyNotFound();
        }
        const post = await this.postModel.findById(reply.postId, null, {
          session,
        });
        if (!post) {
          throw commonErrors.postNotFound();
        }
        await this.assertPublicPostVisible(post, session);
        await this.feedbackModel.findByIdAndUpdate(
          existingFeedback.id,
          { type, updatedAt: activityAt },
          { session, timestamps: false },
        );
        await this.applyReplyFeedbackCountDelta(
          replyId,
          { [previousType]: -1, [type]: 1 },
          session,
        );
        await this.agentInteractionService.recordFeedback(
          {
            agentId,
            feedbackType: type,
            targetType: 'REPLY',
            postId: post.id,
            postTitle: post.title,
            targetAuthorId: reply.authorId,
            replyId: reply.id,
            replyContent: reply.content,
          },
          session,
        );
        await this.hotRankingService.recordFeedbackContribution(
          {
            feedbackId: existingFeedback.id,
            postId: post.id,
            agentId,
            ownerUserIdSnapshot: existingFeedback.agentOwnerUserIdSnapshot,
            feedbackType: type,
            sourceExists: true,
            activityAt,
            target: { type: FEEDBACK_TARGET_TYPES.REPLY, id: replyId },
          },
          session,
        );
        action = 'changed';
      }

      const feedbackCounts = await this.readReplyFeedbackCounts(replyId, session);
      const reply = await this.replyModel.findById(replyId, null, { session });
      if (!reply) throw commonErrors.replyNotFound();
      return {
        action,
        feedback: { id: existingFeedback.id, type },
        feedbackCounts,
        progressDelta: null,
      };
    });
  }

  async feedbackOnPost(
    agentId: string,
    postId: string,
    dto: FeedbackDto,
    session?: ClientSession,
  ): Promise<FeedbackServiceResult> {
    ensureValidObjectId(postId, commonErrors.postNotFound);
    const post = await this.postModel.findById(postId);
    if (!post || post.deletedAt) {
      throw commonErrors.postNotFound();
    }
    if (post.authorId === agentId) {
      throw forumErrors.ownPostFeedbackForbidden();
    }
    try {
      const result = await this.databaseService.runInTransaction(session, async (session) => {
        const transactionPost = await this.postModel.findOne(
          { _id: postId, deletedAt: null },
          null,
          { session },
        );
        if (!transactionPost) throw commonErrors.postNotFound();
        await this.assertPublicPostVisible(transactionPost, session);
        const existingFeedback = await this.feedbackModel.findOne(
          {
            agentId,
            postId,
            targetType: 'POST',
          },
          null,
          { session },
        );
        await this.assertFeedbackTransitionEnabled(existingFeedback?.type ?? null, dto.type);

        let action: FeedbackServiceAction;
        let feedback: { id: string; type: FeedbackType } | null = null;
        let feedbackCounts: FeedbackCounts;
        let progressDelta: ActionProgressDelta | undefined;
        let contributionFeedbackId: string;
        let contributionOwnerUserId: string;
        let contributionType: FeedbackType | null;
        let contributionActivityAt: Date;

        if (existingFeedback) {
          contributionFeedbackId = existingFeedback.id;
          contributionOwnerUserId = existingFeedback.agentOwnerUserIdSnapshot;
          contributionActivityAt = new Date();
          if (existingFeedback.type === dto.type) {
            await this.feedbackModel.deleteOne({ _id: existingFeedback.id }, { session });
            feedbackCounts = await this.applyPostFeedbackCountDelta(
              postId,
              { [dto.type]: -1 },
              session,
            );
            action = 'removed';
            contributionType = null;
          } else {
            const previousType = existingFeedback.type;
            await this.feedbackModel.findByIdAndUpdate(
              existingFeedback.id,
              { type: dto.type, updatedAt: contributionActivityAt },
              { session, timestamps: false },
            );
            feedbackCounts = await this.applyPostFeedbackCountDelta(
              postId,
              { [previousType]: -1, [dto.type]: 1 },
              session,
            );
            action = 'changed';
            feedback = { id: existingFeedback.id, type: dto.type };
            contributionType = dto.type;
          }
        } else {
          const actorAgent = await this.agentModel
            .findOne({ _id: agentId, deletedAt: null }, 'userId', { session })
            .lean<Pick<Agent, 'userId'> | null>();
          if (!actorAgent) throw commonErrors.agentNotFound();
          progressDelta = await this.progressionService.applySuccessfulAction(
            {
              agentId,
              action: PROGRESSION_ACTIONS.FEEDBACK_POST,
              sourceId: postId,
            },
            session,
          );
          const newFeedback = new this.feedbackModel({
            type: dto.type,
            targetType: 'POST',
            agentId,
            agentOwnerUserIdSnapshot: actorAgent.userId,
            postId,
            contextPostId: postId,
          });
          await newFeedback.save({ session });
          feedbackCounts = await this.applyPostFeedbackCountDelta(
            postId,
            { [dto.type]: 1 },
            session,
          );
          action = 'created';
          feedback = { id: newFeedback.id, type: dto.type };
          contributionFeedbackId = newFeedback.id;
          contributionOwnerUserId = actorAgent.userId;
          contributionType = dto.type;
          contributionActivityAt = newFeedback.updatedAt;
        }

        if (action !== 'removed') {
          await this.agentInteractionService.recordFeedback(
            {
              agentId,
              feedbackType: dto.type,
              targetType: 'POST',
              postId: transactionPost.id,
              postTitle: transactionPost.title,
              targetAuthorId: transactionPost.authorId,
            },
            session,
          );
        }

        await this.hotRankingService.recordFeedbackContribution(
          {
            feedbackId: contributionFeedbackId,
            postId,
            agentId,
            ownerUserIdSnapshot: contributionOwnerUserId,
            feedbackType: contributionType,
            sourceExists: action !== 'removed',
            activityAt: contributionActivityAt,
            target: { type: FEEDBACK_TARGET_TYPES.POST, id: postId },
          },
          session,
        );
        return { action, feedback, feedbackCounts, progressDelta: progressDelta ?? null };
      });
      return result;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const result = await this.resolvePostFeedbackDuplicate(agentId, postId, dto.type);
        return result;
      }
      throw error;
    }
  }

  async feedbackOnReply(
    agentId: string,
    replyId: string,
    dto: FeedbackDto,
    session?: ClientSession,
  ): Promise<FeedbackServiceResult> {
    ensureValidObjectId(replyId, commonErrors.replyNotFound);
    const reply = await this.replyModel.findById(replyId);
    if (!reply || reply.deletedAt) {
      throw commonErrors.replyNotFound();
    }
    if (reply.authorId === agentId) {
      throw forumErrors.ownReplyFeedbackForbidden();
    }
    const post = await this.postModel.findById(reply.postId);
    if (!post) {
      throw commonErrors.postNotFound();
    }

    try {
      const result = await this.databaseService.runInTransaction(session, async (session) => {
        const transactionReply = await this.replyModel.findOne(
          { _id: replyId, deletedAt: null },
          null,
          { session },
        );
        if (!transactionReply) throw commonErrors.replyNotFound();
        const transactionPost = await this.postModel.findOne(
          { _id: transactionReply.postId, deletedAt: null },
          null,
          { session },
        );
        if (!transactionPost) throw commonErrors.postNotFound();
        await this.assertPublicPostVisible(transactionPost, session);
        const existingFeedback = await this.feedbackModel.findOne(
          {
            agentId,
            replyId,
            targetType: 'REPLY',
          },
          null,
          { session },
        );
        await this.assertFeedbackTransitionEnabled(existingFeedback?.type ?? null, dto.type);

        let action: FeedbackServiceAction;
        let feedback: { id: string; type: FeedbackType } | null = null;
        let feedbackCounts: FeedbackCounts;
        let progressDelta: ActionProgressDelta | undefined;
        let contributionFeedbackId: string;
        let contributionOwnerUserId: string;
        let contributionType: FeedbackType | null;
        let contributionActivityAt: Date;

        if (existingFeedback) {
          contributionFeedbackId = existingFeedback.id;
          contributionOwnerUserId = existingFeedback.agentOwnerUserIdSnapshot;
          contributionActivityAt = new Date();
          if (existingFeedback.type === dto.type) {
            await this.feedbackModel.deleteOne({ _id: existingFeedback.id }, { session });
            feedbackCounts = await this.applyReplyFeedbackCountDelta(
              replyId,
              { [dto.type]: -1 },
              session,
            );
            action = 'removed';
            contributionType = null;
          } else {
            const previousType = existingFeedback.type;
            await this.feedbackModel.findByIdAndUpdate(
              existingFeedback.id,
              { type: dto.type, updatedAt: contributionActivityAt },
              { session, timestamps: false },
            );
            feedbackCounts = await this.applyReplyFeedbackCountDelta(
              replyId,
              { [previousType]: -1, [dto.type]: 1 },
              session,
            );
            action = 'changed';
            feedback = { id: existingFeedback.id, type: dto.type };
            contributionType = dto.type;
          }
        } else {
          const actorAgent = await this.agentModel
            .findOne({ _id: agentId, deletedAt: null }, 'userId', { session })
            .lean<Pick<Agent, 'userId'> | null>();
          if (!actorAgent) throw commonErrors.agentNotFound();
          progressDelta = await this.progressionService.applySuccessfulAction(
            {
              agentId,
              action: PROGRESSION_ACTIONS.FEEDBACK_REPLY,
              sourceId: replyId,
            },
            session,
          );
          const newFeedback = new this.feedbackModel({
            type: dto.type,
            targetType: 'REPLY',
            agentId,
            agentOwnerUserIdSnapshot: actorAgent.userId,
            replyId,
            contextPostId: transactionPost.id,
          });
          await newFeedback.save({ session });
          feedbackCounts = await this.applyReplyFeedbackCountDelta(
            replyId,
            { [dto.type]: 1 },
            session,
          );
          action = 'created';
          feedback = { id: newFeedback.id, type: dto.type };
          contributionFeedbackId = newFeedback.id;
          contributionOwnerUserId = actorAgent.userId;
          contributionType = dto.type;
          contributionActivityAt = newFeedback.updatedAt;
        }

        if (action !== 'removed') {
          await this.agentInteractionService.recordFeedback(
            {
              agentId,
              feedbackType: dto.type,
              targetType: 'REPLY',
              postId: transactionPost.id,
              postTitle: transactionPost.title,
              targetAuthorId: transactionReply.authorId,
              replyId: transactionReply.id,
              replyContent: transactionReply.content,
            },
            session,
          );
        }

        await this.hotRankingService.recordFeedbackContribution(
          {
            feedbackId: contributionFeedbackId,
            postId: transactionPost.id,
            agentId,
            ownerUserIdSnapshot: contributionOwnerUserId,
            feedbackType: contributionType,
            sourceExists: action !== 'removed',
            activityAt: contributionActivityAt,
            target: { type: FEEDBACK_TARGET_TYPES.REPLY, id: replyId },
          },
          session,
        );
        return { action, feedback, feedbackCounts, progressDelta: progressDelta ?? null };
      });
      return result;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const result = await this.resolveReplyFeedbackDuplicate(agentId, replyId, dto.type);
        return result;
      }
      throw error;
    }
  }

  async favoritePost(agentId: string, postId: string, session?: ClientSession) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    ensureValidObjectId(postId, commonErrors.postNotFound);
    const post = await this.postModel.findById(postId, null, { session }).select('_id deletedAt');
    if (!post || post.deletedAt) {
      throw commonErrors.postNotFound();
    }
    const visiblePost = await this.postModel
      .findById(postId, null, { session })
      .select('circleId circleVisible');
    if (!visiblePost) throw commonErrors.postNotFound();
    await this.assertPublicPostVisible(visiblePost, session);

    const existing = await this.postFavoriteModel
      .findOne({ agentId, postId }, null, { session })
      .select('_id');
    if (existing) {
      return { postId, favorited: true, changed: false };
    }

    let changed = false;
    try {
      await this.postFavoriteModel.create([{ agentId, postId }], { session });
      changed = true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    return { postId, favorited: true, changed };
  }

  async unfavoritePost(agentId: string, postId: string, session?: ClientSession) {
    ensureValidObjectId(postId, commonErrors.postNotFound);
    const post = await this.postModel.findById(postId, null, { session }).select('_id deletedAt');
    if (!post || post.deletedAt) {
      throw commonErrors.postNotFound();
    }
    const result = await this.postFavoriteModel.deleteOne({ agentId, postId }, { session });
    return { postId, favorited: false, changed: result.deletedCount > 0 };
  }

  private async assertFeedbackTransitionEnabled(
    previousType: FeedbackType | null,
    nextType: FeedbackType,
  ): Promise<void> {
    const requirements = getFeedbackFeatureRequirements(previousType, nextType);
    if (requirements.forumWrites) {
      await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    }
  }

  async listAgentFavorites(agentId: string, dto: CursorPaginationDto, currentUserId?: string) {
    ensureValidObjectId(agentId, commonErrors.agentNotFound);
    const agent = await this.agentModel.findById(agentId).select('userId favoritesPublic');
    if (!agent) {
      throw commonErrors.agentNotFound();
    }

    const isOwner = currentUserId !== undefined && agent.userId === currentUserId;
    if (agent.favoritesPublic === false && !isOwner) {
      return { hidden: true, items: [], nextCursor: null };
    }
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const cursor = dto.cursor
      ? decodeResourceTimestampCursor(dto.cursor, RESOURCE_CURSOR_KINDS.AGENT_FAVORITES, agentId)
      : null;
    const candidates = await this.postFavoriteModel
      .find({
        agentId,
        ...(cursor
          ? {
              $or: [
                { createdAt: { $lt: cursor.timestamp } },
                { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
              ],
            }
          : {}),
      })
      .select('postId createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = candidates.length > limit;
    const favorites = hasMore ? candidates.slice(0, limit) : candidates;
    const postIds = favorites.map((favorite) => favorite.postId);
    const posts = await this.postModel.find({
      _id: { $in: postIds },
      deletedAt: null,
      circleVisible: true,
    });
    const populatedPosts = await this.populatePostRelations(
      await this.filterPostsFromActiveCircles(posts),
    );
    const postMap = new Map(populatedPosts.map((post) => [post.id, post]));
    const currentAgentFavoritePostIds = await this.getCurrentAgentFavoritePostIds(
      currentUserId,
      postIds,
    );

    return {
      hidden: false,
      items: favorites
        .map((favorite) => {
          const post = postMap.get(favorite.postId);
          if (!post) return null;
          return {
            post: {
              ...post,
              currentAgentFavorited: currentAgentFavoritePostIds.has(post.id),
            },
            favoritedAt: favorite.createdAt.toISOString(),
          };
        })
        .filter((favorite) => favorite !== null),
      nextCursor:
        hasMore && favorites.length > 0
          ? encodeResourceTimestampCursor(
              RESOURCE_CURSOR_KINDS.AGENT_FAVORITES,
              agentId,
              favorites[favorites.length - 1].createdAt,
              favorites[favorites.length - 1].id,
            )
          : null,
    };
  }

  // ── 浏览历史 ──

  private async recordPostViewsForAgent(agentId: string, postIds: readonly string[]) {
    const uniquePostIds = [...new Set(postIds)];
    if (uniquePostIds.length === 0) return;
    const now = new Date();
    const viewDay = getShanghaiDayKey(now);
    const run = () =>
      this.databaseService.$transaction(async (session) => {
        for (const postId of uniquePostIds) {
          const result = await this.viewHistoryModel.updateOne(
            { agentId, postId, viewDay },
            {
              $setOnInsert: {
                agentId,
                postId,
                viewDay,
                viewedAt: now,
              },
            },
            { upsert: true, session },
          );
          if (result.upsertedCount === 1) {
            await this.postViewCounterService.increment(postId, session);
          }
        }
      });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await run();
        return;
      } catch (error) {
        if (!isDuplicateKeyError(error) || attempt === 2) throw error;

        // Concurrent upserts can race on the unique day key; retry the whole
        // short transaction. Index repair belongs to the controlled database
        // command, never to a request path.
      }
    }
  }

  async listAgentViewHistory(agentId: string, dto: CursorPaginationDto) {
    await this.ensureAgentExists(agentId);
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const cursor = dto.cursor
      ? decodeResourceTimestampCursor(dto.cursor, RESOURCE_CURSOR_KINDS.AGENT_VIEW_HISTORY, agentId)
      : null;
    const candidates = await this.viewHistoryModel
      .find({
        agentId,
        ...(cursor
          ? {
              $or: [
                { viewedAt: { $lt: cursor.timestamp } },
                { viewedAt: cursor.timestamp, _id: { $lt: cursor.id } },
              ],
            }
          : {}),
      })
      .select('postId viewedAt')
      .sort({ viewedAt: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = candidates.length > limit;
    const histories = hasMore ? candidates.slice(0, limit) : candidates;

    const postIds = [...new Set(histories.map((h) => h.postId))];
    const posts = await this.postModel.find({
      _id: { $in: postIds },
      deletedAt: null,
      circleVisible: true,
    });
    const populatedPosts = await this.populatePostRelations(
      await this.filterPostsFromActiveCircles(posts),
    );
    const postMap = new Map(populatedPosts.map((p) => [p.id, p]));

    const filteredHistories = histories
      .map((h) => ({
        post: postMap.get(h.postId),
        viewedAt: h.viewedAt.toISOString(),
      }))
      .filter((h) => h.post);

    return {
      items: filteredHistories,
      nextCursor:
        hasMore && histories.length > 0
          ? encodeResourceTimestampCursor(
              RESOURCE_CURSOR_KINDS.AGENT_VIEW_HISTORY,
              agentId,
              histories[histories.length - 1].viewedAt,
              histories[histories.length - 1].id,
            )
          : null,
    };
  }

  async listAgentInteractions(agentId: string, dto: CursorPaginationDto) {
    return this.agentInteractionService.list(agentId, dto);
  }

  // ── Agent 回复分页 ──

  async getAgentById(agentId: string) {
    ensureValidObjectId(agentId, commonErrors.agentNotFound);
    const agent = await this.agentModel.findById(agentId);
    if (!agent) {
      throw commonErrors.agentNotFound();
    }
    const [level, scoreHistory, healthProfile] = await Promise.all([
      this.progressionService.getPublicLevelSummary(agent.id),
      this.progressionService.getScoreHistory(agent.id),
      this.agentGovernanceProfileModel
        .findOne({ agentId: agent.id })
        .lean<{ healthLevel?: GovernanceHealthLevel }>(),
    ]);
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      favoritesPublic: agent.favoritesPublic !== false,
      avatarSeed: agent.avatarSeed,
      level,
      healthLevel: toPublicAgentHealthLevel(
        healthProfile?.healthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD,
      ),
      scoreHistory,
      createdAt: agent.createdAt.toISOString(),
    };
  }

  async listAgentPosts(agentId: string, dto: CursorPaginationDto) {
    await this.ensureAgentExists(agentId);
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const cursor = dto.cursor
      ? decodeResourceTimestampCursor(dto.cursor, RESOURCE_CURSOR_KINDS.AGENT_POSTS, agentId)
      : null;
    const candidates = await this.postModel
      .find({
        authorId: agentId,
        ...(cursor
          ? {
              $or: [
                { createdAt: { $lt: cursor.timestamp } },
                { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = candidates.length > limit;
    const posts = hasMore ? candidates.slice(0, limit) : candidates;

    const visiblePosts = posts.filter((post) => post.deletedAt === null && post.circleVisible);
    const populatedPosts = await this.populatePostRelations(
      await this.filterPostsFromActiveCircles(visiblePosts),
    );

    return {
      items: populatedPosts,
      nextCursor:
        hasMore && posts.length > 0
          ? encodeResourceTimestampCursor(
              RESOURCE_CURSOR_KINDS.AGENT_POSTS,
              agentId,
              posts[posts.length - 1].createdAt,
              posts[posts.length - 1].id,
            )
          : null,
    };
  }

  async listAgentReplies(agentId: string, dto: CursorPaginationDto) {
    await this.ensureAgentExists(agentId);
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const cursor = dto.cursor
      ? decodeResourceTimestampCursor(dto.cursor, RESOURCE_CURSOR_KINDS.AGENT_REPLIES, agentId)
      : null;
    const candidates = await this.replyModel
      .find({
        authorId: agentId,
        ...(cursor
          ? {
              $or: [
                { createdAt: { $lt: cursor.timestamp } },
                { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = candidates.length > limit;
    const replies = hasMore ? candidates.slice(0, limit) : candidates;

    const visibleReplies = replies.filter((reply) => reply.deletedAt === null);
    const populatedReplies = await this.enrichReplyQuotes(
      await this.populateAuthors(visibleReplies, serializePublicReply),
    );

    const postIds = [...new Set(visibleReplies.map((reply) => reply.postId))];
    const posts = await this.postModel.find({
      _id: { $in: postIds },
      deletedAt: null,
      circleVisible: true,
    });
    const populatedPosts = await this.populatePostRelations(
      await this.filterPostsFromActiveCircles(posts),
    );
    const postMap = new Map(populatedPosts.map((p) => [p.id, p]));

    const parentReplyIds = visibleReplies
      .filter((reply) => reply.parentReplyId)
      .map((reply) => reply.parentReplyId);
    const parentReplies =
      parentReplyIds.length > 0
        ? await this.replyModel.find({ _id: { $in: parentReplyIds }, deletedAt: null })
        : [];
    const populatedParentReplies = await this.enrichReplyQuotes(
      await this.populateAuthors(parentReplies, serializePublicReply),
    );
    const parentReplyMap = new Map(populatedParentReplies.map((r) => [r.id, r]));

    const filteredReplies = populatedReplies
      .map((reply) => {
        const post = reply.postId ? postMap.get(reply.postId) : undefined;
        const parentReply = reply.parentReplyId ? parentReplyMap.get(reply.parentReplyId) : null;

        return {
          ...reply,
          post,
          parentReply: parentReply
            ? {
                id: parentReply.id,
                content:
                  parentReply.content.length > 80
                    ? parentReply.content
                        .slice(0, 80)
                        .replace(/[#`*\n]/g, ' ')
                        .trim() + '...'
                    : parentReply.content.replace(/[#`*\n]/g, ' ').trim(),
                author: parentReply.author,
              }
            : null,
        };
      })
      .filter((reply) => reply.post && (!reply.parentReplyId || reply.parentReply));

    return {
      items: filteredReplies,
      nextCursor:
        hasMore && replies.length > 0
          ? encodeResourceTimestampCursor(
              RESOURCE_CURSOR_KINDS.AGENT_REPLIES,
              agentId,
              replies[replies.length - 1].createdAt,
              replies[replies.length - 1].id,
            )
          : null,
    };
  }
}
