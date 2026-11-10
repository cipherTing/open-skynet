import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import {
  StoryActivityCounter,
  StoryActivity,
  type StoryActivityKind,
} from '@/database/schemas/story-activity.schema';
import type { ListStoryActivityDto } from './dto/list-story-activity.dto';
export { STORY_ACTIVITY_KINDS } from '@/database/schemas/story-activity.schema';

export interface CreateStoryActivityInput {
  storyId: string;
  kind: StoryActivityKind;
  targetType: 'story' | 'document';
  documentId: string | null;
  revisionNumber: number | null;
  discussionId?: string | null;
  messageId?: string | null;
  caseId?: string | null;
  authorAgentId: string;
  title: string;
  summary: string;
}
export interface StoryActivityPage {
  items: StoryActivity[];
  nextSequence: number;
  hasMore: boolean;
}

@Injectable()
export class StoryActivityService {
  constructor(
    @InjectModel(StoryActivity.name) private readonly activityModel: Model<StoryActivity>,
    @InjectModel(StoryActivityCounter.name)
    private readonly counterModel: Model<StoryActivityCounter>,
  ) {}

  async append(input: CreateStoryActivityInput, session: ClientSession): Promise<StoryActivity> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { storyId: input.storyId },
        { $inc: { sequence: 1 }, $setOnInsert: { storyId: input.storyId } },
        { new: true, upsert: true, runValidators: true, session },
      )
      .exec();
    if (!counter || !Number.isSafeInteger(counter.sequence))
      throw new Error('Story activity sequence allocation failed');
    const [activity] = await this.activityModel.create([{ ...input, sequence: counter.sequence }], {
      session,
    });
    if (!activity) throw new Error('Story activity creation failed');
    return activity.toJSON<StoryActivity>();
  }

  async list(storyId: string, dto: ListStoryActivityDto): Promise<StoryActivityPage> {
    const afterSequence = dto.afterSequence ?? 0;
    const limit = dto.limit ?? 50;
    const page = await this.activityModel
      .find({ storyId, sequence: { $gt: afterSequence } })
      .sort({ sequence: 1 })
      .limit(limit + 1)
      .exec();
    const items = page.slice(0, limit).map((activity) => activity.toJSON<StoryActivity>());
    return {
      items,
      nextSequence: items.at(-1)?.sequence ?? afterSequence,
      hasMore: page.length > limit,
    };
  }

  async latestSequence(storyId: string): Promise<number> {
    const counter = await this.counterModel.findOne({ storyId }).select('sequence').exec();
    return counter?.sequence ?? 0;
  }

  async recent(storyId: string, limit = 10): Promise<StoryActivity[]> {
    const activities = await this.activityModel
      .find({ storyId })
      .sort({ sequence: -1 })
      .limit(limit)
      .exec();
    return activities.map((activity) => activity.toJSON<StoryActivity>());
  }
}
