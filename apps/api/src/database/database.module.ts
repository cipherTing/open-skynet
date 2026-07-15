import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { DatabaseService } from './database.service';
import { User, UserSchema } from './schemas/user.schema';
import { Agent, AgentSchema } from './schemas/agent.schema';
import { Post, PostSchema } from './schemas/post.schema';
import { Reply, ReplySchema } from './schemas/reply.schema';
import { PostRevision, PostRevisionSchema } from './schemas/post-revision.schema';
import { ReplyRevision, ReplyRevisionSchema } from './schemas/reply-revision.schema';
import { Feedback, FeedbackSchema } from './schemas/feedback.schema';
import { PostFavorite, PostFavoriteSchema } from './schemas/post-favorite.schema';
import { ViewHistory, ViewHistorySchema } from './schemas/view-history.schema';
import { InteractionHistory, InteractionHistorySchema } from './schemas/interaction-history.schema';
import { AgentProgress, AgentProgressSchema } from './schemas/agent-progress.schema';
import { AgentXpEvent, AgentXpEventSchema } from './schemas/agent-xp-event.schema';
import { BrowserSession, BrowserSessionSchema } from './schemas/browser-session.schema';
import { GovernanceCase, GovernanceCaseSchema } from './schemas/governance-case.schema';
import {
  GovernanceAssignment,
  GovernanceAssignmentSchema,
} from './schemas/governance-assignment.schema';
import {
  GovernanceDailyQuota,
  GovernanceDailyQuotaSchema,
} from './schemas/governance-daily-quota.schema';
import { GovernanceVote, GovernanceVoteSchema } from './schemas/governance-vote.schema';
import {
  AgentGovernanceProfile,
  AgentGovernanceProfileSchema,
} from './schemas/agent-governance-profile.schema';
import { Circle, CircleSchema } from './schemas/circle.schema';
import { CircleSubscription, CircleSubscriptionSchema } from './schemas/circle-subscription.schema';
import {
  CircleRuleRevision,
  CircleRuleRevisionSchema,
} from './schemas/circle-rule-revision.schema';
import {
  CircleMaintenanceLog,
  CircleMaintenanceLogSchema,
} from './schemas/circle-maintenance-log.schema';
import { Report, ReportSchema } from './schemas/report.schema';
import { ReportTargetState, ReportTargetStateSchema } from './schemas/report-target-state.schema';
import { AdminAuditLog, AdminAuditLogSchema } from './schemas/admin-audit-log.schema';
import { Announcement, AnnouncementSchema } from './schemas/announcement.schema';
import { FeatureFlag, FeatureFlagSchema } from './schemas/feature-flag.schema';
import { SecurityEvent, SecurityEventSchema } from './schemas/security-event.schema';
import { AgentNotification, AgentNotificationSchema } from './schemas/agent-notification.schema';
import {
  AgentWatchRegistry,
  AgentWatchRegistrySchema,
} from './schemas/agent-watch-registry.schema';
import { PostWatchRegistry, PostWatchRegistrySchema } from './schemas/post-watch-registry.schema';
import {
  PlatformInitialization,
  PlatformInitializationSchema,
} from './schemas/platform-initialization.schema';
import { CircleProposal, CircleProposalSchema } from './schemas/circle-proposal.schema';
import {
  CircleProposalRevision,
  CircleProposalRevisionSchema,
} from './schemas/circle-proposal-revision.schema';
import {
  CircleProposalStanceRecord,
  CircleProposalStanceSchema,
} from './schemas/circle-proposal-stance.schema';
import { CircleProposalVote, CircleProposalVoteSchema } from './schemas/circle-proposal-vote.schema';
import {
  CircleProposalComment,
  CircleProposalCommentSchema,
} from './schemas/circle-proposal-comment.schema';
import { softDeletePlugin } from './plugins/soft-delete.plugin';
import {
  ContentReviewRequest,
  ContentReviewRequestSchema,
} from './schemas/content-review-request.schema';
import {
  GovernanceCorrection,
  GovernanceCorrectionSchema,
} from './schemas/governance-correction.schema';
import {
  AgentGovernanceHistory,
  AgentGovernanceHistorySchema,
} from './schemas/agent-governance-history.schema';
import {
  PublicAccessConfig,
  PublicAccessConfigSchema,
} from './schemas/public-access-config.schema';

// Register soft-delete plugin globally for all schemas
mongoose.plugin(softDeletePlugin);

export const DATABASE_MODEL_DEFINITIONS = [
  { name: User.name, schema: UserSchema },
  { name: Agent.name, schema: AgentSchema },
  { name: Post.name, schema: PostSchema },
  { name: Reply.name, schema: ReplySchema },
  { name: PostRevision.name, schema: PostRevisionSchema },
  { name: ReplyRevision.name, schema: ReplyRevisionSchema },
  { name: Feedback.name, schema: FeedbackSchema },
  { name: PostFavorite.name, schema: PostFavoriteSchema },
  { name: ViewHistory.name, schema: ViewHistorySchema },
  { name: InteractionHistory.name, schema: InteractionHistorySchema },
  { name: AgentProgress.name, schema: AgentProgressSchema },
  { name: AgentXpEvent.name, schema: AgentXpEventSchema },
  { name: BrowserSession.name, schema: BrowserSessionSchema },
  { name: GovernanceCase.name, schema: GovernanceCaseSchema },
  { name: GovernanceAssignment.name, schema: GovernanceAssignmentSchema },
  { name: GovernanceDailyQuota.name, schema: GovernanceDailyQuotaSchema },
  { name: GovernanceVote.name, schema: GovernanceVoteSchema },
  { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
  { name: Circle.name, schema: CircleSchema },
  { name: CircleSubscription.name, schema: CircleSubscriptionSchema },
  { name: CircleRuleRevision.name, schema: CircleRuleRevisionSchema },
  { name: CircleMaintenanceLog.name, schema: CircleMaintenanceLogSchema },
  { name: Report.name, schema: ReportSchema },
  { name: ReportTargetState.name, schema: ReportTargetStateSchema },
  { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
  { name: Announcement.name, schema: AnnouncementSchema },
  { name: FeatureFlag.name, schema: FeatureFlagSchema },
  { name: SecurityEvent.name, schema: SecurityEventSchema },
  { name: AgentNotification.name, schema: AgentNotificationSchema },
  { name: AgentWatchRegistry.name, schema: AgentWatchRegistrySchema },
  { name: PostWatchRegistry.name, schema: PostWatchRegistrySchema },
  { name: PlatformInitialization.name, schema: PlatformInitializationSchema },
  { name: CircleProposal.name, schema: CircleProposalSchema },
  { name: CircleProposalRevision.name, schema: CircleProposalRevisionSchema },
  { name: CircleProposalStanceRecord.name, schema: CircleProposalStanceSchema },
  { name: CircleProposalVote.name, schema: CircleProposalVoteSchema },
  { name: CircleProposalComment.name, schema: CircleProposalCommentSchema },
  { name: ContentReviewRequest.name, schema: ContentReviewRequestSchema },
  { name: GovernanceCorrection.name, schema: GovernanceCorrectionSchema },
  { name: AgentGovernanceHistory.name, schema: AgentGovernanceHistorySchema },
  { name: PublicAccessConfig.name, schema: PublicAccessConfigSchema },
];

@Global()
@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI!),
    MongooseModule.forFeature(DATABASE_MODEL_DEFINITIONS),
  ],
  providers: [DatabaseService],
  exports: [MongooseModule, DatabaseService],
})
export class DatabaseModule {}
