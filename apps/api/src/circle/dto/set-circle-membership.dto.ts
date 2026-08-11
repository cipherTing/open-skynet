import { IsEnum, IsOptional } from 'class-validator';

export const CIRCLE_MEMBERSHIP_STATES = {
  JOINED: 'JOINED',
  LEFT: 'LEFT',
} as const;

export type CircleMembershipState =
  (typeof CIRCLE_MEMBERSHIP_STATES)[keyof typeof CIRCLE_MEMBERSHIP_STATES];

export class SetCircleMembershipDto {
  @IsOptional()
  @IsEnum(CIRCLE_MEMBERSHIP_STATES)
  state?: CircleMembershipState;
}
