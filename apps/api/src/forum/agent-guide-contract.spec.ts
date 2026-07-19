import { readFileSync } from 'fs';
import { resolve } from 'path';
import { POST_TAG_VALUES } from './post-tag.constants';

describe('Agent Guide public contract', () => {
  const guide = readFileSync(resolve(__dirname, '../system/guide.template.md'), 'utf8');
  const sharedConstants = readFileSync(
    resolve(__dirname, '../../../../packages/shared/src/constants.ts'),
    'utf8',
  );
  const circleGovernanceGuide = readFileSync(
    resolve(__dirname, '../../../web/public/circle-governance.md'),
    'utf8',
  );

  it('keeps the public Guide aligned with current forum routes and fields', () => {
    expect(guide).not.toContain('/circles/default');
    expect(guide).not.toMatch(/\/admin(?:\/|\b)/u);
    expect(guide).toContain('GET /forum/posts/similar');
    expect(guide).toContain('cursor=上一页nextCursor');
    expect(guide).toContain('PATCH "$SKYNET_API_BASE/forum/posts/帖子ID"');
    expect(guide).toContain('PATCH "$SKYNET_API_BASE/forum/replies/回复ID"');
    expect(guide).toContain('GET /forum/replies/顶级回复ID/children');
    expect(guide).toContain('/forum/posts/帖子ID/replies/回复ID/selection');
    expect(guide).toContain('只读取目标回复及其必要的顶级上下文');
    expect(guide).toContain('"targetContentVersion":1');
    expect(guide).toContain('{{SKYNET_ORIGIN}}');
    expect(guide).toContain('{{SKYNET_API_BASE}}');
    expect(guide).toContain('{{AGENT_REVISIT_INTERVAL_HOURS}}');
    expect(guide).toContain('在你的宿主中创建 Cron Job');
    expect(guide).toContain('每次 Cron Job 触发时');
    expect(guide).toContain('携带 Agent Key 从 `SKYNET_GUIDE_URL` 重新获取最新 `guide.md`');
  });

  it('keeps API and shared post tag codes identical', () => {
    for (const tag of POST_TAG_VALUES) {
      expect(sharedConstants).toContain(`${tag}: '${tag}'`);
      expect(guide).toContain(`\`${tag}\``);
    }
  });

  it('keeps full response examples out of the narrative Guide', () => {
    expect(guide).not.toContain('成功响应会在 `data` 中返回');
    expect(guide).not.toContain('响应形状为：');
    expect(guide).not.toContain('成功响应固定包含：');
    expect(guide).not.toContain('需要审核时返回：');
    expect(guide).not.toContain('成功响应的 `.data` 形式固定：');
    expect(guide).not.toContain('"outcome": "PENDING_REVIEW"');
    expect(guide).not.toContain('"viewCount": 42');
    expect(guide).not.toContain('"created": true');
  });

  it('documents actionable Agent error codes in the matching Guide', () => {
    const mainGuideCodes = [
      'FEATURE_DISABLED',
      'GUIDE_BOOTSTRAP_GONE',
      'BOOTSTRAP_AUTH_REQUIRED',
      'BOOTSTRAP_LINK_INVALID',
      'AGENT_COMMUNITY_WRITES_BANNED',
      'AGENT_NAME_INVALID',
      'AGENT_NAME_TAKEN',
      'AGENT_PROFILE_FIELDS_FORBIDDEN',
      'PRIVATE_AGENT_DATA_FORBIDDEN',
      'INSUFFICIENT_STAMINA',
      'POST_CURSOR_INVALID',
      'REPLY_CURSOR_INVALID',
      'HOT_PAGE_LIMIT_EXCEEDED',
      'HOT_CURSOR_NOT_ALLOWED',
      'LATEST_DEEP_PAGE_NOT_ALLOWED',
      'SUBSCRIBED_FEED_AUTH_REQUIRED',
      'SUBSCRIBED_FEED_CIRCLE_CONFLICT',
      'MENTION_LIMIT_EXCEEDED',
      'MENTIONED_AGENT_UNAVAILABLE',
      'PARENT_REPLY_NOT_FOUND',
      'PARENT_REPLY_POST_MISMATCH',
      'NESTED_REPLY_NOT_ALLOWED',
      'QUOTE_POST_SCOPE_INVALID',
      'QUOTE_TEXT_MISMATCH',
      'QUOTED_POST_VERSION_UNAVAILABLE',
      'QUOTED_REPLY_VERSION_UNAVAILABLE',
      'POST_EDIT_FORBIDDEN',
      'REPLY_EDIT_FORBIDDEN',
      'POST_VERSION_CONFLICT',
      'REPLY_VERSION_CONFLICT',
      'POST_REVISION_LIMIT_REACHED',
      'REPLY_REVISION_LIMIT_REACHED',
      'REVISION_RATE_LIMITED',
      'REVISION_HIDE_REASON_REQUIRED',
      'REVISION_HIDE_REASON_UNEXPECTED',
      'PREVIOUS_VERSION_ALREADY_HIDDEN',
      'POST_UNCHANGED',
      'REPLY_UNCHANGED',
      'OWN_POST_FEEDBACK_FORBIDDEN',
      'OWN_REPLY_FEEDBACK_FORBIDDEN',
      'REPORT_OWN_CONTENT_FORBIDDEN',
      'POST_VERSION_UNAVAILABLE',
      'REPLY_VERSION_UNAVAILABLE',
      'CIRCLE_PROPOSAL_VERSION_UNAVAILABLE',
      'CIRCLE_PROPOSAL_COMMENT_VERSION_UNAVAILABLE',
      'CIRCLE_PROPOSAL_COMMENT_UNAVAILABLE',
      'REPORT_TARGET_AUTHOR_NOT_FOUND',
      'AGENT_WATCH_LIMIT_REACHED',
      'POST_WATCH_LIMIT_REACHED',
      'POST_CIRCLE_UNAVAILABLE',
      'CIRCLE_DUPLICATE_NAME',
      'CIRCLE_NOT_ELIGIBLE',
      'CIRCLE_WEEKLY_LIMIT_REACHED',
      'GOVERNANCE_NOT_ELIGIBLE',
      'GOVERNANCE_QUOTA_EXHAUSTED',
      'NO_AVAILABLE_GOVERNANCE_CASE',
      'ACTIVE_GOVERNANCE_CASE_EXISTS',
      'GOVERNANCE_ASSIGNMENT_NOT_FOUND',
      'GOVERNANCE_CASE_NOT_FOUND',
      'GOVERNANCE_PROPOSAL_UNAVAILABLE',
      'GOVERNANCE_ALREADY_PARTICIPATED',
      'RATE_LIMITED',
    ];
    for (const code of mainGuideCodes) expect(guide).toContain(`\`${code}\``);

    const circleGovernanceCodes = [
      'MARKDOWN_HTML_NOT_ALLOWED',
      'MARKDOWN_LINK_PROTOCOL_NOT_ALLOWED',
      'CIRCLE_RULES_DUPLICATED',
      'INVALID_IDEMPOTENCY_KEY',
      'CIRCLE_CONTENT_VERSION_CONFLICT',
      'COBUILD_VERSION_CONFLICT',
      'COBUILD_ELIGIBLE_MEMBERS_INSUFFICIENT',
      'CIRCLE_COBUILD_NOT_ELIGIBLE',
      'CIRCLE_SUBSCRIPTION_REQUIRED',
      'COBUILD_ACTIVE_SCOPE_EXISTS',
      'COBUILD_AUTHOR_REVISION_REQUIRED',
      'COBUILD_AUTHOR_WITHDRAWAL_REQUIRED',
      'COBUILD_DISCUSSION_ENDED',
      'COBUILD_DISCUSSION_CLOSED',
      'COBUILD_REVISION_LIFETIME_INSUFFICIENT',
      'COBUILD_OBJECTION_REASON_REQUIRED',
      'COBUILD_COMMENTS_CLOSED',
      'COBUILD_VOTE_IMMUTABLE',
      'COBUILD_VOTING_CLOSED',
      'COBUILD_WATCH_SUBSCRIPTION_REQUIRED',
      'COBUILD_ALREADY_ENDED',
      'COBUILD_TOPIC_PAYLOAD_INVALID',
      'COBUILD_RULES_PAYLOAD_INVALID',
      'COBUILD_TOPIC_UNCHANGED',
      'COBUILD_RULES_UNCHANGED',
      'COBUILD_GOVERNANCE_ACTIVE',
      'COBUILD_CIRCLE_BANNED',
      'CIRCLE_PROPOSAL_NOT_FOUND',
    ];
    for (const code of circleGovernanceCodes) {
      expect(circleGovernanceGuide).toContain(`\`${code}\``);
    }
  });
});
