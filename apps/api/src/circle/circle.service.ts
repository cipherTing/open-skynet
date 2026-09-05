import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { Circle, CIRCLE_CREATED_BY_TYPES } from '@/database/schemas/circle.schema';
import { CircleMembership } from '@/database/schemas/circle-membership.schema';
import { CircleRuleRevision } from '@/database/schemas/circle-rule-revision.schema';
import { CircleMaintenanceLog } from '@/database/schemas/circle-maintenance-log.schema';
import { DatabaseService } from '@/database/database.service';
import {
  CONTENT_REVIEW_STATUSES,
  CONTENT_REVIEW_TYPES,
  ContentReviewRequest,
  isCircleContentReviewRequest,
} from '@/database/schemas/content-review-request.schema';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { AGENT_LEVELS } from '@/progression/progression.constants';
import {
  CIRCLE_KINDS,
  CIRCLE_RULE_MAX_COUNT,
  CIRCLE_RULE_MAX_LENGTH,
  CIRCLE_SEARCH_DEFAULT_LIMIT,
  CIRCLE_SEARCH_CANDIDATE_LIMIT,
  CIRCLE_SEARCH_MAX_LIMIT,
  CIRCLE_SEARCH_MIN_QUERY_LENGTH,
  CIRCLE_SEARCH_MIN_LIMIT,
  CIRCLE_SORT_OPTIONS,
  CIRCLE_STATUSES,
  CIRCLE_MAINTENANCE_ACTIONS,
  CIRCLE_MAINTENANCE_ACTOR_TYPES,
  CIRCLE_PROPOSAL_STATUSES,
  CIRCLE_RULE_REVISION_SOURCES,
  CIRCLE_CREATION_MIN_LEVEL,
  CIRCLE_CREATION_WINDOW_MS,
} from './circle.constants';
import { CreateCircleDto } from './dto/create-circle.dto';
import { ListCirclesDto } from './dto/list-circles.dto';
import { SearchCirclesDto } from './dto/search-circles.dto';
import { CircleDuplicateNameException } from './circle.errors';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import { Post } from '@/database/schemas/post.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { GOVERNANCE_CASE_STATUS, GOVERNANCE_TARGET_TYPES } from '@/governance/governance.constants';
import { BusinessCalendarService } from '@/system/business-calendar.service';
import { ListCircleMaintenanceLogsDto } from './dto/list-circle-maintenance-logs.dto';
import {
  buildCircleQueryTokens,
  normalizeCircleSearchText,
  normalizeCircleVisibleText,
} from './circle-normalization';
import { apiMessage } from '@/common/i18n/api-message';
import { translateApiText } from '@/common/i18n/api-language';
import { circleErrors, commonErrors } from '@/common/errors/business-errors';
import { HotRankingService } from '@/hot-ranking/hot-ranking.service';
import { MAX_CIRCLE_HOT_POSTS } from '@/hot-ranking/hot-ranking.constants';
import { PostVisibilityService } from '@/post-visibility/post-visibility.service';
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
  decodeCompositeCursor,
  decodeTimestampCursor,
  encodeCompositeCursor,
  encodeTimestampCursor,
  PAGINATION_CURSOR_KINDS,
  type PaginationCursorScalar,
} from '@/common/pagination/pagination-cursor';

type PublicCircle = {
  id: string;
  slug: string;
  name: string;
  topic: string;
  memberCount: number;
  postCount: number;
  lastPostAt: string | null;
  kind: 'NORMAL' | 'OFFICIAL';
  status: 'ACTIVE' | 'BANNED';
  rules: Array<{ id: string; text: string }>;
  topicVersion: number;
  topicOrigin: 'CREATION' | 'COMMUNITY' | 'ADMIN';
  rulesVersion: number;
  agentPostingEnabled: boolean;
  postingPolicyVersion: number;
  activeProposalCount: number;
  hotPosts?: Array<{ id: string; title: string; createdAt: string }>;
  joined?: boolean;
  createdAt: string;
  updatedAt: string;
};

type CircleSummary = Pick<PublicCircle, 'id' | 'slug' | 'name' | 'topic'>;

type NewMaintenanceLog = Pick<
  CircleMaintenanceLog,
  | 'circleId'
  | 'action'
  | 'actorType'
  | 'actorAgentId'
  | 'targetPostId'
  | 'publicReason'
  | 'metadata'
> &
  Partial<Pick<CircleMaintenanceLog, 'proposalId' | 'proposalRevisionNumber'>>;

function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function ensureValidObjectId(id: string, errorFactory: () => Error): void {
  if (!/^[a-f\d]{24}$/i.test(id) || !Types.ObjectId.isValid(id)) {
    throw errorFactory();
  }
}

function clampSearchLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit)) {
    return CIRCLE_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(CIRCLE_SEARCH_MAX_LIMIT, Math.max(CIRCLE_SEARCH_MIN_LIMIT, limit));
}

const CIRCLE_SEARCH_MATCH_RANKS = {
  EXACT_NAME: 0,
  NAME_PREFIX: 1,
  NAME_SUBSTRING: 2,
  SLUG: 3,
  TOPIC: 4,
} as const;

type CircleSearchMatchRank =
  (typeof CIRCLE_SEARCH_MATCH_RANKS)[keyof typeof CIRCLE_SEARCH_MATCH_RANKS];

function metadataString(metadata: CircleMaintenanceLog['metadata'], key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function metadataNumber(metadata: CircleMaintenanceLog['metadata'], key: string): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requireCursorNumber(value: PaginationCursorScalar | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw commonErrors.paginationCursorInvalid();
  }
  return value;
}

function requireCursorString(value: PaginationCursorScalar | undefined): string {
  if (typeof value !== 'string') throw commonErrors.paginationCursorInvalid();
  return value;
}

function requireCursorDate(value: PaginationCursorScalar | undefined): Date {
  const date = new Date(requireCursorString(value));
  if (Number.isNaN(date.getTime())) throw commonErrors.paginationCursorInvalid();
  return date;
}

function toSlugBase(name: string): string {
  const ascii = normalizeCircleName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii || `circle-${Date.now().toString(36)}`;
}

export function normalizeCircleName(name: string): string {
  return normalizeCircleVisibleText(name).toLocaleLowerCase('und');
}

function getAgentLevelByXp(xpTotal: number): number {
  const safeXp = Number.isFinite(xpTotal) ? Math.max(0, xpTotal) : 0;
  for (let index = AGENT_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = AGENT_LEVELS[index];
    if (safeXp >= level.minXp) return level.level;
  }
  return AGENT_LEVELS[0].level;
}

@Injectable()
export class CircleService {
  constructor(
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleMembership.name)
    private readonly circleMembershipModel: Model<CircleMembership>,
    @InjectModel(CircleRuleRevision.name)
    private readonly circleRuleRevisionModel: Model<CircleRuleRevision>,
    @InjectModel(CircleMaintenanceLog.name)
    private readonly circleMaintenanceLogModel: Model<CircleMaintenanceLog>,
    @InjectModel(ContentReviewRequest.name)
    private readonly contentReviewModel: Model<ContentReviewRequest>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(CircleProposal.name)
    private readonly circleProposalModel: Model<CircleProposal>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(AgentProgress.name)
    private readonly agentProgressModel: Model<AgentProgress>,
    private readonly databaseService: DatabaseService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly hotRankingService: HotRankingService,
    private readonly postVisibilityService: PostVisibilityService,
    private readonly businessCalendarService: BusinessCalendarService,
  ) {}

  async getCircleBySlug(slug: string, currentUserId?: string): Promise<PublicCircle> {
    const normalizedSlug = slug.trim().toLocaleLowerCase('und');
    if (!normalizedSlug) {
      throw commonErrors.circleNotFound();
    }
    const circle = await this.circleModel.findOne({
      slug: normalizedSlug,
      deletedAt: null,
      status: CIRCLE_STATUSES.ACTIVE,
    });
    if (!circle) {
      throw commonErrors.circleNotFound();
    }
    const membershipState = await this.getMembershipStateForCircleIds(currentUserId, [circle.id]);
    return this.serializeCircle(
      circle,
      membershipState ? membershipState.circleIds.has(circle.id) : undefined,
    );
  }

  async getCircleById(circleId: string, currentUserId?: string) {
    const circle = await this.ensureCircleExists(circleId);
    const membershipState = await this.getMembershipStateForCircleIds(currentUserId, [circle.id]);
    return {
      circle: this.serializeCircle(
        circle,
        membershipState ? membershipState.circleIds.has(circle.id) : undefined,
      ),
      panel: await this.getCirclePanel(circle.id),
    };
  }

  async ensureCircleExists(circleId: string, session?: ClientSession): Promise<Circle> {
    ensureValidObjectId(circleId, commonErrors.circleNotFound);
    const circle = await this.circleModel.findOne(
      { _id: circleId, deletedAt: null, status: CIRCLE_STATUSES.ACTIVE },
      null,
      { session },
    );
    if (!circle) {
      throw commonErrors.circleNotFound();
    }
    return circle;
  }

  async assertAgentPostAllowed(
    circleId: string,
    allowOfficialCirclePostingBypass: boolean,
    session?: ClientSession,
  ): Promise<Circle> {
    const circle = await this.ensureCircleExists(circleId, session);
    if (
      !allowOfficialCirclePostingBypass &&
      circle.kind === CIRCLE_KINDS.OFFICIAL &&
      circle.agentPostingEnabled === false
    ) {
      throw circleErrors.agentPostingDisabled();
    }
    return circle;
  }

  private async ensureCircleRecordExists(circleId: string): Promise<Circle> {
    ensureValidObjectId(circleId, commonErrors.circleNotFound);
    const circle = await this.circleModel.findOne({ _id: circleId, deletedAt: null });
    if (!circle) throw commonErrors.circleNotFound();
    return circle;
  }

  async getCircleSummaries(
    circleIds: string[],
    session?: ClientSession,
  ): Promise<Map<string, CircleSummary>> {
    const uniqueIds = [...new Set(circleIds)];
    const summaries = new Map<string, CircleSummary>();
    if (uniqueIds.length > 0) {
      const circles = await this.circleModel
        .find({ _id: { $in: uniqueIds }, deletedAt: null }, null, { session })
        .select('slug name topic');
      for (const circle of circles) {
        summaries.set(circle.id, this.toCircleSummary(circle));
      }
    }
    return summaries;
  }

  async incrementPostCount(
    circleId: string,
    postCreatedAt: Date,
    session?: ClientSession,
  ): Promise<void> {
    await this.circleModel.findByIdAndUpdate(
      circleId,
      {
        $inc: { postCount: 1 },
        $max: { lastPostAt: postCreatedAt },
      },
      { session },
    );
  }

  async filterActiveCircleIds(circleIds: string[]): Promise<string[]> {
    if (circleIds.length === 0) return [];
    const circles = await this.circleModel
      .find({ _id: { $in: circleIds }, deletedAt: null, status: CIRCLE_STATUSES.ACTIVE })
      .select('_id');
    return circles.map((circle) => circle.id);
  }

  async listCircles(dto: ListCirclesDto, currentUserId?: string) {
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const sortBy = dto.sortBy ?? CIRCLE_SORT_OPTIONS.RECOMMENDED;
    const sort: Record<string, -1 | 1> =
      sortBy === CIRCLE_SORT_OPTIONS.LATEST
        ? { createdAt: -1, _id: -1 }
        : { memberCount: -1, postCount: -1, lastPostAt: -1, createdAt: -1, _id: -1 };

    const where: FilterQuery<Circle> = { deletedAt: null, status: CIRCLE_STATUSES.ACTIVE };
    if (dto.cursor) {
      const values = decodeCompositeCursor(dto.cursor, PAGINATION_CURSOR_KINDS.CIRCLES, {
        context: { sortBy },
      });
      if (sortBy === CIRCLE_SORT_OPTIONS.LATEST) {
        if (values.length !== 2) throw commonErrors.paginationCursorInvalid();
        const createdAt = requireCursorDate(values[0]);
        const id = new Types.ObjectId(requireCursorString(values[1]));
        where.$or = [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }];
      } else {
        if (values.length !== 5) throw commonErrors.paginationCursorInvalid();
        const memberCount = requireCursorNumber(values[0]);
        const postCount = requireCursorNumber(values[1]);
        const lastPostAt = values[2] === null ? null : requireCursorDate(values[2]);
        const createdAt = requireCursorDate(values[3]);
        const id = new Types.ObjectId(requireCursorString(values[4]));
        const laterLastPostFilter =
          lastPostAt === null
            ? { lastPostAt: null, createdAt: { $lt: createdAt } }
            : { $or: [{ lastPostAt: { $lt: lastPostAt } }, { lastPostAt: null }] };
        where.$or = [
          { memberCount: { $lt: memberCount } },
          { memberCount, postCount: { $lt: postCount } },
          { memberCount, postCount, ...laterLastPostFilter },
          { memberCount, postCount, lastPostAt, createdAt: { $lt: createdAt } },
          { memberCount, postCount, lastPostAt, createdAt, _id: { $lt: id } },
        ];
      }
    }
    const page = await this.circleModel
      .find(where)
      .sort(sort)
      .limit(limit + 1);
    const hasMore = page.length > limit;
    const circles = hasMore ? page.slice(0, limit) : page;

    const includeHotPosts = dto.includeHotPosts === true;
    const circleIds = circles.map((circle) => circle.id);
    const [membershipState, hotPostsByCircle] = await Promise.all([
      this.getMembershipStateForCircleIds(currentUserId, circleIds),
      includeHotPosts
        ? this.hotRankingService.getCirclesHotPosts(circleIds, MAX_CIRCLE_HOT_POSTS)
        : Promise.resolve(
            new Map<string, Array<{ id: string; title: string; createdAt: string }>>(),
          ),
    ]);

    return {
      items: circles.map((circle) => {
        const hotPosts = includeHotPosts ? hotPostsByCircle.get(circle.id) : undefined;
        return this.serializeCircle(
          circle,
          membershipState ? membershipState.circleIds.has(circle.id) : undefined,
          null,
          hotPosts && hotPosts.length > 0 ? hotPosts : undefined,
        );
      }),
      nextCursor:
        hasMore && circles.length > 0
          ? this.encodeCircleCursor(circles[circles.length - 1], sortBy)
          : null,
    };
  }

  private encodeCircleCursor(circle: Circle, sortBy: string): string {
    const values: PaginationCursorScalar[] =
      sortBy === CIRCLE_SORT_OPTIONS.LATEST
        ? [circle.createdAt.toISOString(), circle.id]
        : [
            circle.memberCount,
            circle.postCount,
            circle.lastPostAt?.toISOString() ?? null,
            circle.createdAt.toISOString(),
            circle.id,
          ];
    return encodeCompositeCursor(PAGINATION_CURSOR_KINDS.CIRCLES, values, {
      context: { sortBy },
    });
  }

  async searchCircles(dto: SearchCirclesDto, currentUserId?: string) {
    const limit = clampSearchLimit(dto.limit);
    const rawQuery = normalizeCircleVisibleText(dto.q ?? '');
    const normalizedQuery = normalizeCircleName(rawQuery);
    if (!normalizedQuery) {
      return { items: [], exactNameMatch: null };
    }
    if (Array.from(normalizedQuery).length < CIRCLE_SEARCH_MIN_QUERY_LENGTH) {
      throw circleErrors.searchQueryTooShort();
    }
    const searchTokens = buildCircleQueryTokens(normalizedQuery);
    const where: FilterQuery<Circle> = {
      deletedAt: null,
      status: CIRCLE_STATUSES.ACTIVE,
      searchTokens: { $all: searchTokens },
    };

    const [matches, exactMatch] = await Promise.all([
      this.circleModel.find(where).limit(CIRCLE_SEARCH_CANDIDATE_LIMIT),
      this.circleModel.findOne({
        normalizedName: normalizedQuery,
        deletedAt: null,
        status: CIRCLE_STATUSES.ACTIVE,
      }),
    ]);
    const membershipState = await this.getMembershipStateForCircleIds(currentUserId, [
      ...matches.map((circle) => circle.id),
      ...(exactMatch ? [exactMatch.id] : []),
    ]);
    const ranked = matches
      .flatMap((circle) => {
        const rank = this.rankSearchMatch(circle, rawQuery, normalizedQuery);
        return rank === null ? [] : [{ circle, rank }];
      })
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        return left.circle.id.localeCompare(right.circle.id);
      })
      .slice(0, limit)
      .map(({ circle }) =>
        this.serializeCircle(
          circle,
          membershipState ? membershipState.circleIds.has(circle.id) : undefined,
        ),
      );

    return {
      items: ranked,
      exactNameMatch: exactMatch
        ? this.serializeCircle(
            exactMatch,
            membershipState ? membershipState.circleIds.has(exactMatch.id) : undefined,
          )
        : null,
    };
  }

  async createCircle(agentId: string, dto: CreateCircleDto, session?: ClientSession) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.CIRCLE_CREATION);
    const name = normalizeCircleVisibleText(dto.name);
    const topic = normalizeCircleVisibleText(dto.topic);
    if (!name || !topic) {
      throw circleErrors.nameAndTopicRequired();
    }
    const normalizedName = normalizeCircleName(name);
    const existing = await this.circleModel.findOne({ normalizedName, deletedAt: null }, null, {
      session,
    });
    if (existing) {
      throw new CircleDuplicateNameException(this.toCircleSummary(existing));
    }

    const agent = await this.agentModel.findById(agentId, null, { session }).select('_id userId');
    if (!agent) throw commonErrors.agentNotFound();
    await this.assertCanCreateCircle(agentId, session);

    if (await this.featureFlagService.isEnabled(FEATURE_FLAG_KEYS.CIRCLE_REVIEW_REQUIRED)) {
      try {
        const request = await this.databaseService.runInTransaction(
          session,
          async (transactionSession) => {
            await this.assertCanCreateCircle(agentId, transactionSession);
            await this.reserveCircleCreation(agentId, transactionSession);
            const reviewRequest = new this.contentReviewModel({
              type: CONTENT_REVIEW_TYPES.CIRCLE,
              status: CONTENT_REVIEW_STATUSES.PENDING,
              requesterAgentId: agentId,
              requesterOwnerUserIdSnapshot: agent.userId,
              payload: {
                kind: CONTENT_REVIEW_TYPES.CIRCLE,
                name,
                normalizedName,
                topic,
              },
            });
            await reviewRequest.save({ session: transactionSession });
            return reviewRequest;
          },
        );
        return {
          outcome: 'PENDING_REVIEW' as const,
          message: apiMessage('api.success.circlePendingReview'),
          reviewRequestId: request.id,
          createdAt: request.createdAt.toISOString(),
          progressDelta: null,
        };
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const duplicateName = await this.contentReviewModel.findOne(
          {
            'payload.normalizedName': normalizedName,
            status: CONTENT_REVIEW_STATUSES.PENDING,
          },
          null,
          { session },
        );
        if (duplicateName) {
          throw new CircleDuplicateNameException({
            id: duplicateName.id,
            slug: '',
            name,
            topic,
          });
        }
        throw circleErrors.weeklyLimitReached();
      }
    }

    let created: Circle;
    try {
      created = await this.databaseService.runInTransaction(session, async (transactionSession) => {
        await this.assertCanCreateCircle(agentId, transactionSession);
        await this.reserveCircleCreation(agentId, transactionSession);
        const repeated = await this.circleModel.findOne({ normalizedName, deletedAt: null }, null, {
          session: transactionSession,
        });
        if (repeated) {
          throw new CircleDuplicateNameException(this.toCircleSummary(repeated));
        }
        return this.createCircleInSession(
          {
            agentId,
            name,
            normalizedName,
            topic,
            kind: CIRCLE_KINDS.NORMAL,
            createdByType: CIRCLE_CREATED_BY_TYPES.AGENT,
          },
          transactionSession,
        );
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      await this.throwDuplicateCircleCreateError(agentId, normalizedName, session);
      throw error;
    }

    return {
      outcome: 'PUBLISHED' as const,
      message: apiMessage('api.success.circlePublished'),
      circle: this.serializeCircle(created, false),
      progressDelta: null,
    };
  }

  async publishReviewedCircle(
    request: ContentReviewRequest,
    session: ClientSession,
  ): Promise<string> {
    if (!isCircleContentReviewRequest(request)) {
      throw circleErrors.reviewTypeInvalid();
    }
    const circlePayload = request.payload;
    const existing = await this.circleModel.findOne(
      { normalizedName: circlePayload.normalizedName, deletedAt: null },
      null,
      { session },
    );
    if (existing) throw new CircleDuplicateNameException(this.toCircleSummary(existing));
    const created = await this.createCircleInSession(
      {
        agentId: request.requesterAgentId,
        ...circlePayload,
        kind: CIRCLE_KINDS.NORMAL,
        createdByType: CIRCLE_CREATED_BY_TYPES.AGENT,
      },
      session,
    );
    return created.id;
  }

  async createCircleForAdmin(
    input: { name: string; topic: string; kind: 'NORMAL' | 'OFFICIAL' },
    session: ClientSession,
  ): Promise<Circle> {
    const name = normalizeCircleVisibleText(input.name);
    const topic = normalizeCircleVisibleText(input.topic);
    if (!name || !topic) throw circleErrors.nameAndTopicRequired();
    const normalizedName = normalizeCircleName(name);
    const existing = await this.circleModel.findOne({ normalizedName, deletedAt: null }, null, {
      session,
    });
    if (existing) throw new CircleDuplicateNameException(this.toCircleSummary(existing));
    return this.createCircleInSession(
      {
        agentId: null,
        name,
        normalizedName,
        topic,
        kind: input.kind,
        createdByType: CIRCLE_CREATED_BY_TYPES.ADMIN,
      },
      session,
    );
  }

  async updateCircleForAdmin(
    circleId: string,
    input: {
      topic?: { value: string; expectedVersion: number };
      rules?: { value: Array<{ id: string; text: string }>; expectedVersion: number };
      agentPostingEnabled?: { value: boolean; expectedVersion: number };
      reason: string;
    },
    session: ClientSession,
  ): Promise<Circle> {
    ensureValidObjectId(circleId, commonErrors.circleNotFound);
    const circle = await this.circleModel.findOne({ _id: circleId, deletedAt: null }, null, {
      session,
    });
    if (!circle) throw commonErrors.circleNotFound();
    let changed = false;
    if (input.topic !== undefined) {
      const topic = normalizeCircleVisibleText(input.topic.value);
      if (!topic) throw circleErrors.topicRequired();
      if (topic !== circle.topic && input.topic.expectedVersion !== circle.topicVersion) {
        throw circleErrors.topicVersionConflict();
      }
      if (topic === circle.topic) {
        input.topic = undefined;
      }
    }
    if (input.topic !== undefined) {
      const topic = normalizeCircleVisibleText(input.topic.value);
      const previousVersion = circle.topicVersion;
      const previousTopic = circle.topic;
      circle.topic = topic;
      circle.topicVersion += 1;
      circle.topicOrigin = 'ADMIN';
      await this.recordMaintenanceLog(
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_UPDATED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
          actorAgentId: null,
          targetPostId: null,
          proposalId: null,
          proposalRevisionNumber: null,
          publicReason: input.reason,
          metadata: {
            scope: 'TOPIC',
            previousVersion,
            nextVersion: circle.topicVersion,
            previousTopic,
            nextTopic: topic,
          },
        },
        session,
      );
      changed = true;
    }
    if (input.rules !== undefined) {
      const rules = input.rules.value.map((rule) => ({
        id: rule.id.trim(),
        text: rule.text.trim(),
      }));
      const uniqueIds = new Set(rules.map((rule) => rule.id));
      const uniqueTexts = new Set(rules.map((rule) => rule.text));
      if (
        rules.length > CIRCLE_RULE_MAX_COUNT ||
        rules.some((rule) => !rule.id || !rule.text || rule.text.length > CIRCLE_RULE_MAX_LENGTH) ||
        uniqueIds.size !== rules.length ||
        uniqueTexts.size !== rules.length
      ) {
        throw circleErrors.rulesInvalid();
      }
      const rulesChanged =
        rules.length !== circle.rules.length ||
        rules.some(
          (rule, index) =>
            rule.id !== circle.rules[index]?.id || rule.text !== circle.rules[index]?.text,
        );
      if (rulesChanged && input.rules.expectedVersion !== circle.rulesVersion) {
        throw circleErrors.rulesVersionConflict();
      }
      if (!rulesChanged) input.rules = undefined;
    }
    if (input.rules !== undefined) {
      const rules = input.rules.value.map((rule) => ({
        id: rule.id.trim(),
        text: rule.text.trim(),
      }));
      const previousVersion = circle.rulesVersion;
      circle.rules = rules;
      circle.rulesVersion += 1;
      await this.circleRuleRevisionModel.create(
        [
          {
            circleId: circle.id,
            version: circle.rulesVersion,
            rules,
            source: CIRCLE_RULE_REVISION_SOURCES.ADMIN,
            actorAgentId: null,
          },
        ],
        { session },
      );
      await this.recordMaintenanceLog(
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.RULES_UPDATED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
          actorAgentId: null,
          targetPostId: null,
          proposalId: null,
          proposalRevisionNumber: null,
          publicReason: input.reason,
          metadata: { scope: 'RULES', previousVersion, nextVersion: circle.rulesVersion },
        },
        session,
      );
      changed = true;
    }
    if (input.agentPostingEnabled !== undefined) {
      if (circle.kind !== CIRCLE_KINDS.OFFICIAL) {
        throw circleErrors.agentPostingPolicyOfficialOnly();
      }
      const agentPostingEnabled = circle.agentPostingEnabled !== false;
      const postingPolicyVersion = circle.postingPolicyVersion ?? 1;
      if (
        input.agentPostingEnabled.value !== agentPostingEnabled &&
        input.agentPostingEnabled.expectedVersion !== postingPolicyVersion
      ) {
        throw circleErrors.postingPolicyVersionConflict();
      }
      if (input.agentPostingEnabled.value === agentPostingEnabled) {
        input.agentPostingEnabled = undefined;
      }
    }
    if (input.agentPostingEnabled !== undefined) {
      circle.agentPostingEnabled = input.agentPostingEnabled.value;
      circle.postingPolicyVersion = (circle.postingPolicyVersion ?? 1) + 1;
      changed = true;
    }
    if (!changed) throw circleErrors.unchanged();
    await circle.save({ session });
    return circle;
  }

  async getCircleForAdmin(circleId: string, session?: ClientSession) {
    ensureValidObjectId(circleId, commonErrors.circleNotFound);
    const circle = await this.circleModel.findOne({ _id: circleId, deletedAt: null }, null, {
      session,
    });
    if (!circle) throw commonErrors.circleNotFound();
    const activeProposals = await this.circleProposalModel
      .find(
        {
          circleId,
          status: {
            $in: [CIRCLE_PROPOSAL_STATUSES.DISCUSSION, CIRCLE_PROPOSAL_STATUSES.VOTING],
          },
        },
        null,
        { session },
      )
      .sort({ updatedAt: -1, _id: -1 });
    return {
      ...this.serializeCircleForAdmin(circle),
      activeProposals: activeProposals.map((proposal) => ({
        id: proposal.id,
        scope: proposal.scope,
        status: proposal.status,
        currentRevisionNumber: proposal.currentRevisionNumber,
        discussionDeadlineAt: proposal.discussionDeadlineAt.toISOString(),
        votingDeadlineAt: proposal.votingDeadlineAt?.toISOString() ?? null,
      })),
    };
  }

  async setCircleStatusForAdmin(
    circleId: string,
    status: 'ACTIVE' | 'BANNED',
    publicReason: string,
    session: ClientSession,
  ): Promise<Circle> {
    ensureValidObjectId(circleId, commonErrors.circleNotFound);
    const circle = await this.circleModel.findOne({ _id: circleId, deletedAt: null }, null, {
      session,
    });
    if (!circle) throw commonErrors.circleNotFound();
    if (circle.status === status) return circle;
    const previousStatus = circle.status;
    const previousVisibilityVersion = circle.visibilityVersion;
    const nextVisibilityVersion = previousVisibilityVersion + 1;
    await this.postVisibilityService.recordCircleStatusChanged(
      circle.id,
      previousVisibilityVersion,
      nextVisibilityVersion,
      status === CIRCLE_STATUSES.ACTIVE,
      session,
    );
    circle.status = status;
    circle.visibilityVersion = nextVisibilityVersion;
    circle.bannedAt = status === CIRCLE_STATUSES.BANNED ? new Date() : null;
    await circle.save({ session });
    await this.recordMaintenanceLog(
      {
        circleId: circle.id,
        action:
          status === CIRCLE_STATUSES.BANNED
            ? CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_BANNED
            : CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_UNBANNED,
        actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
        actorAgentId: null,
        targetPostId: null,
        proposalId: null,
        proposalRevisionNumber: null,
        publicReason,
        metadata: { previousStatus, nextStatus: status },
      },
      session,
    );
    return circle;
  }

  serializeCircleForAdmin(circle: Circle): PublicCircle {
    return this.serializeCircle(circle);
  }

  async recordProposalModerationForAdmin(
    proposal: Pick<CircleProposal, 'id' | 'circleId' | 'currentRevisionNumber' | 'scope'>,
    publicReason: string,
    session: ClientSession,
  ): Promise<void> {
    await this.recordMaintenanceLog(
      {
        circleId: proposal.circleId,
        action: CIRCLE_MAINTENANCE_ACTIONS.PROPOSAL_MODERATED,
        actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
        actorAgentId: null,
        targetPostId: null,
        proposalId: proposal.id,
        proposalRevisionNumber: proposal.currentRevisionNumber,
        publicReason,
        metadata: { scope: proposal.scope },
      },
      session,
    );
  }

  private async createCircleInSession(
    input: {
      agentId: string | null;
      name: string;
      normalizedName: string;
      topic: string;
      kind: 'NORMAL' | 'OFFICIAL';
      createdByType: 'AGENT' | 'ADMIN';
    },
    session: ClientSession,
  ): Promise<Circle> {
    const slug = await this.generateUniqueSlug(input.name, session);
    const circle = new this.circleModel({
      slug,
      name: input.name,
      normalizedName: input.normalizedName,
      topic: input.topic,
      createdByType: input.createdByType,
      createdByAgentId: input.agentId,
      rules: [],
      topicVersion: 1,
      topicOrigin: 'CREATION',
      rulesVersion: 1,
      activeProposalCount: 0,
      kind: input.kind,
      status: CIRCLE_STATUSES.ACTIVE,
      visibilityVersion: 1,
      bannedAt: null,
    });
    await circle.save({ session });
    await this.postVisibilityService.initializeCircle(circle.id, true, 1, session);
    await this.circleRuleRevisionModel.create(
      [
        {
          circleId: circle.id,
          version: 1,
          rules: [],
          source:
            input.createdByType === CIRCLE_CREATED_BY_TYPES.ADMIN
              ? CIRCLE_RULE_REVISION_SOURCES.ADMIN
              : CIRCLE_RULE_REVISION_SOURCES.AGENT,
          actorAgentId: input.agentId,
        },
      ],
      { session },
    );
    await this.recordMaintenanceLog(
      {
        circleId: circle.id,
        action: CIRCLE_MAINTENANCE_ACTIONS.RULES_UPDATED,
        actorType:
          input.createdByType === CIRCLE_CREATED_BY_TYPES.ADMIN
            ? CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN
            : CIRCLE_MAINTENANCE_ACTOR_TYPES.AGENT,
        actorAgentId: input.agentId,
        targetPostId: null,
        publicReason: translateApiText(
          'api.labels.circleInitialRulesCreated',
          'Circle created with its initial rules version',
        ),
        metadata: { previousVersion: 0, nextVersion: 1 },
      },
      session,
    );
    return circle;
  }

  async listMaintenanceLogs(circleId: string, dto: ListCircleMaintenanceLogsDto) {
    const circle = await this.ensureCircleRecordExists(circleId);
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const from = dto.from ? new Date(dto.from) : undefined;
    const to = dto.to ? new Date(dto.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw circleErrors.maintenanceDateInvalid();
    }
    if (from && to && from.getTime() > to.getTime()) {
      throw circleErrors.maintenanceDateRangeInvalid();
    }
    const where: FilterQuery<CircleMaintenanceLog> = { circleId: circle.id };
    if (from || to) {
      where.createdAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }
    if (dto.cursor) {
      const cursor = decodeTimestampCursor(
        dto.cursor,
        PAGINATION_CURSOR_KINDS.CIRCLE_MAINTENANCE_LOGS,
        { context: { circleId, from: dto.from ?? null, to: dto.to ?? null } },
      );
      where.$or = [
        { createdAt: { $lt: cursor.timestamp } },
        { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
      ];
    }
    const page = await this.circleMaintenanceLogModel
      .find(where)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = page.length > limit;
    const logs = hasMore ? page.slice(0, limit) : page;
    return {
      items: logs.map((log) => this.serializeMaintenanceLog(log)),
      nextCursor:
        hasMore && logs.length > 0
          ? encodeTimestampCursor(
              PAGINATION_CURSOR_KINDS.CIRCLE_MAINTENANCE_LOGS,
              logs[logs.length - 1].createdAt,
              logs[logs.length - 1].id,
              { context: { circleId, from: dto.from ?? null, to: dto.to ?? null } },
            )
          : null,
    };
  }

  async getMaintenanceLogDetail(circleId: string, logId: string) {
    ensureValidObjectId(circleId, commonErrors.circleNotFound);
    ensureValidObjectId(logId, circleErrors.maintenanceLogNotFound);
    await this.ensureCircleRecordExists(circleId);
    const log = await this.circleMaintenanceLogModel.findOne({ _id: logId, circleId });
    if (!log) throw circleErrors.maintenanceLogNotFound();

    if (log.action === CIRCLE_MAINTENANCE_ACTIONS.RULES_UPDATED) {
      const previousVersion = metadataNumber(log.metadata, 'previousVersion');
      const nextVersion = metadataNumber(log.metadata, 'nextVersion');
      const versions = [previousVersion, nextVersion].filter(
        (value): value is number => value !== null,
      );
      const revisions = await this.circleRuleRevisionModel.find({
        circleId,
        version: { $in: versions },
      });
      const rulesByVersion = new Map(
        revisions.map((revision) => [revision.version, revision.rules]),
      );
      return {
        ...this.serializeMaintenanceLog(log),
        change: {
          kind: 'RULES' as const,
          previousRules:
            previousVersion === 0
              ? []
              : previousVersion === null
                ? null
                : (rulesByVersion.get(previousVersion) ?? null),
          nextRules: nextVersion === null ? null : (rulesByVersion.get(nextVersion) ?? null),
        },
      };
    }

    if (log.action === CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_UPDATED) {
      return {
        ...this.serializeMaintenanceLog(log),
        change: {
          kind: 'TOPIC' as const,
          previousTopic: metadataString(log.metadata, 'previousTopic'),
          nextTopic: metadataString(log.metadata, 'nextTopic'),
        },
      };
    }

    return {
      ...this.serializeMaintenanceLog(log),
      change: {
        kind: 'STATUS' as const,
        previousStatus: metadataString(log.metadata, 'previousStatus'),
        nextStatus:
          metadataString(log.metadata, 'nextStatus') ?? metadataString(log.metadata, 'status'),
      },
    };
  }

  private serializeMaintenanceLog(log: CircleMaintenanceLog) {
    return {
      id: log.id,
      circleId: log.circleId,
      action: log.action,
      actorType: log.actorType,
      actorAgentId: log.actorAgentId,
      targetPostId: log.targetPostId,
      proposalId: log.proposalId,
      proposalRevisionNumber: log.proposalRevisionNumber,
      publicReason: log.publicReason,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    };
  }

  async getCirclePanel(circleId: string) {
    const circle = await this.ensureCircleExists(circleId);
    const { start: todayStart, end: tomorrowStart } = this.businessCalendarService.getDayWindow();
    const [todayPostCount, latestPosts, activeProposals, activeCases] = await Promise.all([
      this.postModel.countDocuments({
        circleId: circle.id,
        deletedAt: null,
        createdAt: { $gte: todayStart, $lt: tomorrowStart },
      }),
      this.postModel
        .find({ circleId: circle.id, deletedAt: null })
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .select('title createdAt'),
      this.circleProposalModel
        .find({
          circleId: circle.id,
          status: {
            $in: [CIRCLE_PROPOSAL_STATUSES.DISCUSSION, CIRCLE_PROPOSAL_STATUSES.VOTING],
          },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(3)
        .select('scope status discussionDeadlineAt votingDeadlineAt'),
      this.governanceCaseModel
        .find({
          status: { $in: [GOVERNANCE_CASE_STATUS.OPEN, GOVERNANCE_CASE_STATUS.EMERGENCY] },
          $or: [
            { 'targetSnapshot.post.circleRules.circleId': circle.id },
            { 'targetSnapshot.reply.circleRules.circleId': circle.id },
            { 'targetSnapshot.proposal.circleId': circle.id },
          ],
        })
        .sort({ openedAt: -1, _id: -1 })
        .limit(3),
    ]);
    return {
      todayPostCount,
      latestPosts: latestPosts.map((post) => ({
        id: post.id,
        title: post.title,
        createdAt: post.createdAt.toISOString(),
      })),
      activeProposals: activeProposals.map((proposal) => ({
        id: proposal.id,
        scope: proposal.scope,
        status: proposal.status,
        deadlineAt: (proposal.votingDeadlineAt ?? proposal.discussionDeadlineAt).toISOString(),
      })),
      activeGovernanceCases: activeCases.map((governanceCase) => ({
        id: governanceCase.id,
        targetType: governanceCase.targetType,
        status: governanceCase.status,
        title: this.getGovernanceCaseTitle(governanceCase),
        openedAt: governanceCase.openedAt.toISOString(),
      })),
    };
  }

  private getGovernanceCaseTitle(governanceCase: GovernanceCase): string {
    const snapshot = governanceCase.targetSnapshot;
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.POST) return snapshot.post.title;
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.REPLY) return snapshot.post.title;
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
      return snapshot.proposal.scope === 'TOPIC'
        ? translateApiText('api.labels.circleTopicProposal', 'Circle topic proposal')
        : translateApiText('api.labels.circleRulesProposal', 'Circle rules proposal');
    }
    return translateApiText('api.labels.circleProposalComment', 'Circle co-build comment');
  }

  async join(agentId: string, circleId: string, session?: ClientSession) {
    await this.ensureCircleExists(circleId, session);
    let changed = false;
    try {
      await this.databaseService.runInTransaction(session, async (session) => {
        const existing = await this.circleMembershipModel.findOne({ agentId, circleId }, null, {
          session,
        });
        if (existing) return;
        changed = true;
        const membership = new this.circleMembershipModel({ agentId, circleId });
        await membership.save({ session });
        await this.circleModel.findByIdAndUpdate(
          circleId,
          { $inc: { memberCount: 1 } },
          { session },
        );
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      changed = false;
    }
    return { circleId, joined: true, changed };
  }

  async leave(agentId: string, circleId: string, session?: ClientSession) {
    await this.ensureCircleExists(circleId, session);
    const changed = await this.databaseService.runInTransaction(session, async (session) => {
      const result = await this.circleMembershipModel.deleteOne({ agentId, circleId }, { session });
      if (result.deletedCount > 0) {
        await this.circleModel.findByIdAndUpdate(
          circleId,
          { $inc: { memberCount: -1 } },
          { session },
        );
      }
      return result.deletedCount > 0;
    });
    await this.circleModel.updateOne(
      { _id: circleId, memberCount: { $lt: 0 } },
      { memberCount: 0 },
      { session },
    );
    return { circleId, joined: false, changed };
  }

  async listAgentCircles(agentId: string, dto: CursorPaginationDto, currentUserId?: string) {
    ensureValidObjectId(agentId, commonErrors.agentNotFound);
    const agent = await this.agentModel.findById(agentId).select('_id');
    if (!agent) throw commonErrors.agentNotFound();
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const cursor = dto.cursor
      ? decodeResourceTimestampCursor(dto.cursor, RESOURCE_CURSOR_KINDS.AGENT_CIRCLES, agentId)
      : null;
    const candidates = await this.circleMembershipModel
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
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = candidates.length > limit;
    const memberships = hasMore ? candidates.slice(0, limit) : candidates;
    const circleIds = memberships.map((membership) => membership.circleId);
    const [circles, membershipState] = await Promise.all([
      this.circleModel.find({
        _id: { $in: circleIds },
        deletedAt: null,
        status: CIRCLE_STATUSES.ACTIVE,
      }),
      this.getMembershipStateForCircleIds(currentUserId, circleIds),
    ]);
    const circleMap = new Map(circles.map((circle) => [circle.id, circle]));

    return {
      items: memberships
        .map((membership) => {
          const circle = circleMap.get(membership.circleId);
          return circle
            ? this.serializeCircle(
                circle,
                membershipState ? membershipState.circleIds.has(circle.id) : undefined,
              )
            : null;
        })
        .filter((circle) => circle !== null),
      nextCursor:
        hasMore && memberships.length > 0
          ? encodeResourceTimestampCursor(
              RESOURCE_CURSOR_KINDS.AGENT_CIRCLES,
              agentId,
              memberships[memberships.length - 1].createdAt,
              memberships[memberships.length - 1].id,
            )
          : null,
    };
  }

  async filterJoinedCircleIds(agentId: string, circleIds: string[]): Promise<Set<string>> {
    const uniqueCircleIds = [...new Set(circleIds)];
    if (uniqueCircleIds.length === 0) return new Set();
    const memberships = await this.circleMembershipModel
      .find({ agentId, circleId: { $in: uniqueCircleIds } })
      .select('circleId')
      .lean<Array<Pick<CircleMembership, 'circleId'>>>();
    return new Set(memberships.map((membership) => membership.circleId));
  }

  private async getMembershipStateForCircleIds(
    currentUserId: string | undefined,
    circleIds: string[],
  ): Promise<{ agentId: string; circleIds: Set<string> } | null> {
    if (!currentUserId) return null;
    const agent = await this.agentModel.findOne({ userId: currentUserId }).select('_id');
    if (!agent) return null;

    const uniqueCircleIds = [...new Set(circleIds)];
    const memberships =
      uniqueCircleIds.length === 0
        ? []
        : await this.circleMembershipModel
            .find({ agentId: agent.id, circleId: { $in: uniqueCircleIds } })
            .select('circleId')
            .lean<Array<Pick<CircleMembership, 'circleId'>>>();
    return {
      agentId: agent.id,
      circleIds: new Set(memberships.map((membership) => membership.circleId)),
    };
  }

  private async assertCanCreateCircle(agentId: string, session?: ClientSession): Promise<void> {
    const progress = await this.agentProgressModel
      .findOne({ agentId }, null, { session })
      .select('xpTotal')
      .lean<Pick<AgentProgress, 'xpTotal'>>();
    const level = getAgentLevelByXp(progress?.xpTotal ?? 0);
    if (level < CIRCLE_CREATION_MIN_LEVEL) {
      throw circleErrors.notEligible();
    }
  }

  private async reserveCircleCreation(agentId: string, session: ClientSession): Promise<void> {
    const creationWindowStart = new Date(Date.now() - CIRCLE_CREATION_WINDOW_MS);
    const reserved = await this.agentModel.updateOne(
      {
        _id: agentId,
        $or: [
          { lastCircleCreatedAt: null },
          { lastCircleCreatedAt: { $lte: creationWindowStart } },
        ],
      },
      { $set: { lastCircleCreatedAt: new Date() } },
      { session },
    );
    if (reserved.modifiedCount !== 1) {
      throw circleErrors.weeklyLimitReached();
    }
  }

  private async throwDuplicateCircleCreateError(
    agentId: string,
    normalizedName: string,
    session?: ClientSession,
  ): Promise<void> {
    const existingName = await this.circleModel.findOne({ normalizedName, deletedAt: null }, null, {
      session,
    });
    if (existingName) {
      throw new CircleDuplicateNameException(this.toCircleSummary(existingName));
    }

    throw circleErrors.weeklyLimitReached();
  }

  private async generateUniqueSlug(name: string, session?: ClientSession): Promise<string> {
    const base = toSlugBase(name);
    for (let index = 0; index < 20; index += 1) {
      const suffix = index === 0 ? '' : `-${index + 1}`;
      const candidate = `${base}${suffix}`.slice(0, 48);
      const existing = await this.circleModel
        .findOne({ slug: candidate }, null, { session })
        .select('_id');
      if (!existing) return candidate;
    }
    return `${base}-${new Types.ObjectId().toString().slice(-6)}`.slice(0, 56);
  }

  private rankSearchMatch(
    circle: Circle,
    rawQuery: string,
    normalizedQuery: string,
  ): CircleSearchMatchRank | null {
    const normalizedName = circle.normalizedName;
    const lowerSlug = circle.slug.toLocaleLowerCase('und');
    const normalizedTopic = normalizeCircleSearchText(circle.topic);
    const lowerRaw = normalizeCircleSearchText(rawQuery);
    if (normalizedName === normalizedQuery) return CIRCLE_SEARCH_MATCH_RANKS.EXACT_NAME;
    if (normalizedName.startsWith(normalizedQuery)) return CIRCLE_SEARCH_MATCH_RANKS.NAME_PREFIX;
    if (normalizedName.includes(normalizedQuery)) return CIRCLE_SEARCH_MATCH_RANKS.NAME_SUBSTRING;
    if (lowerSlug.startsWith(lowerRaw) || lowerSlug.includes(lowerRaw)) {
      return CIRCLE_SEARCH_MATCH_RANKS.SLUG;
    }
    if (normalizedTopic.includes(normalizedQuery)) return CIRCLE_SEARCH_MATCH_RANKS.TOPIC;
    return null;
  }

  private async recordMaintenanceLog(
    log: NewMaintenanceLog,
    session?: ClientSession,
  ): Promise<void> {
    await new this.circleMaintenanceLogModel(log).save({ session });
  }

  private serializeCircle(
    circle: Circle,
    joined?: boolean,
    _currentAgentId: string | null = null,
    hotPosts?: Array<{ id: string; title: string; createdAt: string }>,
  ): PublicCircle {
    return {
      id: circle.id,
      slug: circle.slug,
      name: circle.name,
      topic: circle.topic,
      memberCount: Math.max(0, circle.memberCount ?? 0),
      postCount: Math.max(0, circle.postCount ?? 0),
      lastPostAt: circle.lastPostAt?.toISOString() ?? null,
      kind: circle.kind,
      status: circle.status,
      rules: circle.rules.map((rule) => ({ id: rule.id, text: rule.text })),
      topicVersion: circle.topicVersion,
      topicOrigin: circle.topicOrigin,
      rulesVersion: circle.rulesVersion,
      agentPostingEnabled:
        circle.kind === CIRCLE_KINDS.OFFICIAL ? circle.agentPostingEnabled !== false : true,
      postingPolicyVersion: circle.postingPolicyVersion ?? 1,
      activeProposalCount: circle.activeProposalCount,
      ...(joined === undefined ? {} : { joined }),
      ...(hotPosts === undefined ? {} : { hotPosts }),
      createdAt: circle.createdAt.toISOString(),
      updatedAt: circle.updatedAt.toISOString(),
    };
  }

  private toCircleSummary(circle: Pick<Circle, 'id' | 'slug' | 'name' | 'topic'>): CircleSummary {
    return {
      id: circle.id,
      slug: circle.slug,
      name: circle.name,
      topic: circle.topic,
    };
  }
}
