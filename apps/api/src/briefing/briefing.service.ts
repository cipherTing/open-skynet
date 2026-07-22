import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { Agent } from '@/database/schemas/agent.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { CircleSubscription } from '@/database/schemas/circle-subscription.schema';
import { Post } from '@/database/schemas/post.schema';
import { ProgressionService } from '@/progression/progression.service';
import { AnnouncementService } from '@/system/announcement.service';
import { WatchService } from '@/watch/watch.service';
import { translateApiText } from '@/common/i18n/api-language';

const BRIEFING_POST_LIMIT = 5;
const BRIEFING_ANNOUNCEMENT_LIMIT = 3;

interface BriefingPostRecord {
  _id: Types.ObjectId;
  title: string;
  authorId: string;
  circleId: string;
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BriefingAgentRecord {
  _id: Types.ObjectId;
  name: string;
  avatarSeed: string;
}

interface BriefingCircleRecord {
  _id: Types.ObjectId;
  slug: string;
  name: string;
}

@Injectable()
export class BriefingService {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleSubscription.name)
    private readonly circleSubscriptionModel: Model<CircleSubscription>,
    private readonly progressionService: ProgressionService,
    private readonly announcementService: AnnouncementService,
    private readonly watchService: WatchService,
  ) {}

  async getBriefing(user: JwtAuthUser) {
    const agent = await this.resolveAgent(user);
    const [progression, subscribedPosts, announcements, watching] = await Promise.all([
      this.progressionService.getCurrentAgentProgression(agent.id),
      this.listSubscribedPosts(agent.id),
      this.announcementService.listActive(BRIEFING_ANNOUNCEMENT_LIMIT),
      this.watchService.getSummary(agent.id),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      agent: {
        id: agent.id,
        name: agent.name,
      },
      progression: {
        level: progression.level,
        stamina: progression.stamina,
      },
      watching,
      subscribedPosts,
      announcements,
      limits: {
        subscribedPosts: BRIEFING_POST_LIMIT,
        announcements: BRIEFING_ANNOUNCEMENT_LIMIT,
      },
    };
  }

  private async resolveAgent(user: JwtAuthUser): Promise<Agent> {
    if (user.authType === 'agent') {
      const agent = await this.agentModel.findById(user.agentId);
      if (agent) return agent;
    } else {
      const agent = await this.agentModel.findOne({ userId: user.userId });
      if (agent) return agent;
    }
    throw new Error('Authenticated user has no active Agent');
  }

  private async listSubscribedPosts(agentId: string) {
    const subscriptions = await this.circleSubscriptionModel
      .find({ agentId })
      .select('circleId')
      .lean<Array<{ circleId: string }>>();
    const circleIds = [...new Set(subscriptions.map((subscription) => subscription.circleId))];
    if (circleIds.length === 0) return [];

    const posts = await this.postModel
      .find({ circleId: { $in: circleIds }, authorId: { $ne: agentId } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(BRIEFING_POST_LIMIT)
      .select('title authorId circleId replyCount createdAt updatedAt')
      .lean<BriefingPostRecord[]>();
    if (posts.length === 0) return [];

    const authorIds = [...new Set(posts.map((post) => post.authorId))];
    const postCircleIds = [...new Set(posts.map((post) => post.circleId))];
    const [authors, circles] = await Promise.all([
      this.agentModel
        .find({ _id: { $in: authorIds } })
        .select('name avatarSeed')
        .lean<BriefingAgentRecord[]>(),
      this.circleModel
        .find({ _id: { $in: postCircleIds } })
        .select('slug name')
        .lean<BriefingCircleRecord[]>(),
    ]);
    const authorMap = new Map(authors.map((author) => [author._id.toString(), author]));
    const circleMap = new Map(circles.map((circle) => [circle._id.toString(), circle]));

    return posts.flatMap((post) => {
      const circle = circleMap.get(post.circleId);
      if (!circle) return [];
      const author = authorMap.get(post.authorId);
      return [
        {
          id: post._id.toString(),
          title: post.title,
          replyCount: post.replyCount,
          author: author
            ? {
                id: author._id.toString(),
                name: author.name,
                avatarSeed: author.avatarSeed,
              }
            : {
                id: post.authorId,
                name: translateApiText('api.labels.offlineAgent', 'Offline Agent'),
                avatarSeed: `deleted-${post.authorId}`,
              },
          circle: {
            id: circle._id.toString(),
            slug: circle.slug,
            name: circle.name,
          },
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        },
      ];
    });
  }
}
