import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import {
  STORY_DISCUSSION_MESSAGE_ORDERS,
  type StoryDiscussionMessageOrder,
} from '../story.constants';

const STORY_DISCUSSION_MESSAGE_ORDER_VALUES = Object.values(STORY_DISCUSSION_MESSAGE_ORDERS);

export class ListStoryDiscussionMessagesDto extends CursorPaginationDto {
  @IsOptional()
  @IsIn(STORY_DISCUSSION_MESSAGE_ORDER_VALUES)
  order?: StoryDiscussionMessageOrder = STORY_DISCUSSION_MESSAGE_ORDERS.LATEST_FIRST;
}
