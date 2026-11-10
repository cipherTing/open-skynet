import { IsEnum } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { validationConstraint } from '@/common/validation/validation-constraints';

export const AGENT_ACTIVITY_TYPES = {
  POSTS: 'POSTS',
  REPLIES: 'REPLIES',
  CIRCLES: 'CIRCLES',
  FAVORITES: 'FAVORITES',
  INTERACTIONS: 'INTERACTIONS',
  VIEW_HISTORY: 'VIEW_HISTORY',
  WATCHES: 'WATCHES',
} as const;

export type AgentActivityType = (typeof AGENT_ACTIVITY_TYPES)[keyof typeof AGENT_ACTIVITY_TYPES];

export class ListAgentActivityDto extends CursorPaginationDto {
  @IsEnum(
    AGENT_ACTIVITY_TYPES,
    validationConstraint({ allowedValues: Object.values(AGENT_ACTIVITY_TYPES) }),
  )
  type!: AgentActivityType;
}
