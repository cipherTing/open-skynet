import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types, type Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { DatabaseService } from '@/database/database.service';
import {
  Story,
  StorySchema,
  StoryDocument,
  StoryDocumentSchema,
  StoryRevision,
  StoryRevisionSchema,
} from '@/database/schemas/story.schema';
import {
  StoryCollaborationCase,
  StoryCollaborationCaseSchema,
  StoryCollaborationVote,
  StoryCollaborationVoteSchema,
  StoryEditConflict,
  StoryEditConflictSchema,
  StoryEnforcementEvent,
  StoryEnforcementEventSchema,
} from '@/database/schemas/story-collaboration.schema';
import {
  StoryDiscussion,
  StoryDiscussionSchema,
  StoryDiscussionMessage,
  StoryDiscussionMessageSchema,
} from '@/database/schemas/story.schema';
import { StoryCollaborationService } from './story-collaboration.service';
import { StoryActivityService } from './story-activity.service';
import {
  StoryActivity,
  StoryActivitySchema,
  StoryActivityCounter,
  StoryActivityCounterSchema,
} from '@/database/schemas/story-activity.schema';

describe('StoryCollaborationService', () => {
  jest.setTimeout(60_000);

  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: StoryCollaborationService;
  let storyId: string;
  let documentId: string;

  const actor = (suffix: string, ownerUserId = `owner-${suffix}`) => ({
    agentId: `agent-${suffix}`,
    ownerUserId,
  });

  const createRestrictionCase = (
    requester: ReturnType<typeof actor>,
    input: {
      caseType: 'WRITE_RESTRICTION';
      targetAgentId: string;
      documentId: string;
      addressedDiscussionId: string;
      laterConflictId: string;
      reason: string;
    },
  ) => service.createCase(storyId, requester, input);

  const seedAgent = async (suffix: string, ownerUserId = `owner-${suffix}`) =>
    connection.model(Agent.name).create({
      name: `agent-${suffix}`,
      description: '',
      userId: ownerUserId,
    });

  const seedRevision = async (
    revisionNumber: number,
    content: string,
    author: ReturnType<typeof actor>,
    createdAt = new Date(),
  ) => {
    await connection.collection('story_revisions').insertOne({
      _id: new Types.ObjectId(),
      storyId,
      documentId,
      targetType: 'document',
      revisionNumber,
      baseVersion: revisionNumber - 1,
      authorAgentId: author.agentId,
      authorOwnerUserIdSnapshot: author.ownerUserId,
      changeSummary: `Revision ${revisionNumber}`,
      diff: {
        beforeStory: null,
        afterStory: null,
        beforeDocument: null,
        afterDocument: {
          kind: 'chapter',
          title: 'Opening',
          content,
          links: [],
        },
      },
      createdAt,
    });
  };

  const seedAddressedDiscussion = async (
    targetAgentId: string,
    createdAt = new Date(),
    targetDocumentId = documentId,
  ): Promise<string> => {
    const discussionId = new Types.ObjectId().toString();
    const messageId = new Types.ObjectId().toString();
    const createdByAgentId = 'agent-origin';
    await connection.collection('story_discussions').insertOne({
      _id: new Types.ObjectId(discussionId),
      storyId,
      documentId: targetDocumentId,
      revisionNumber: 1,
      anchorText: null,
      title: 'Resolve repeated edits to this passage',
      createdByAgentId,
      createdByOwnerUserIdSnapshot: 'owner-origin',
      addressedAgentId: targetAgentId,
      createdAt,
    });
    await connection.collection('story_discussion_messages').insertOne({
      _id: new Types.ObjectId(messageId),
      storyId,
      discussionId,
      parentMessageId: null,
      authorAgentId: createdByAgentId,
      authorOwnerUserIdSnapshot: 'owner-origin',
      content: 'Please discuss this passage before reverting it again.',
      createdAt,
    });
    return discussionId;
  };

  const seedConflictSignal = async (
    targetAgentId: string,
    targetOwnerUserId: string,
    createdAt = new Date(),
    targetDocumentId = documentId,
    firstRevisionNumber = 5,
  ): Promise<string> => {
    const conflictId = new Types.ObjectId().toString();
    const peer = actor('conflict-peer');
    await connection.collection('story_edit_conflicts').insertOne({
      _id: new Types.ObjectId(conflictId),
      storyId,
      documentId: targetDocumentId,
      revisionNumbers: Array.from({ length: 4 }, (_, index) => firstRevisionNumber + index),
      actorAgentIds: [targetAgentId, peer.agentId],
      participantIdentitySnapshots: [
        { agentId: targetAgentId, ownerUserIdSnapshot: targetOwnerUserId },
        { agentId: peer.agentId, ownerUserIdSnapshot: peer.ownerUserId },
      ],
      triggeringRevisionNumber: firstRevisionNumber + 3,
      createdAt,
    });
    const authors = [targetAgentId, peer.agentId, targetAgentId, peer.agentId];
    const owners = [targetOwnerUserId, peer.ownerUserId, targetOwnerUserId, peer.ownerUserId];
    const contents = ['A', 'B', 'A', 'B'];
    for (let index = 0; index < authors.length; index += 1) {
      const revisionNumber = index + firstRevisionNumber;
      const authorAgentId = authors[index];
      const ownerUserId = owners[index];
      const content = contents[index];
      if (!authorAgentId || !ownerUserId || content === undefined) {
        throw new Error('Conflict revision fixture is incomplete');
      }
      await seedRevision(
        revisionNumber,
        content,
        { agentId: authorAgentId, ownerUserId },
        new Date(createdAt.getTime() - (authors.length - index) * 60_000),
      );
    }
    return conflictId;
  };

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: StoryActivity.name, schema: StoryActivitySchema },
          { name: StoryActivityCounter.name, schema: StoryActivityCounterSchema },
          { name: Story.name, schema: StorySchema },
          { name: StoryDocument.name, schema: StoryDocumentSchema },
          { name: StoryRevision.name, schema: StoryRevisionSchema },
          { name: StoryEditConflict.name, schema: StoryEditConflictSchema },
          { name: StoryCollaborationCase.name, schema: StoryCollaborationCaseSchema },
          { name: StoryCollaborationVote.name, schema: StoryCollaborationVoteSchema },
          { name: StoryEnforcementEvent.name, schema: StoryEnforcementEventSchema },
          { name: StoryDiscussion.name, schema: StoryDiscussionSchema },
          { name: StoryDiscussionMessage.name, schema: StoryDiscussionMessageSchema },
        ]),
      ],
      providers: [StoryCollaborationService, DatabaseService, StoryActivityService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(StoryCollaborationService);
    await Promise.all([
      connection.model(Story.name).init(),
      connection.model(StoryDocument.name).init(),
      connection.model(StoryRevision.name).init(),
      connection.model(StoryEditConflict.name).init(),
      connection.model(StoryCollaborationCase.name).init(),
      connection.model(StoryCollaborationVote.name).init(),
      connection.model(StoryEnforcementEvent.name).init(),
      connection.model(StoryDiscussion.name).init(),
      connection.model(StoryDiscussionMessage.name).init(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      connection.collection('stories').deleteMany({}),
      connection.collection('story_activities').deleteMany({}),
      connection.collection('story_activity_counters').deleteMany({}),
      connection.collection('story_documents').deleteMany({}),
      connection.collection('story_revisions').deleteMany({}),
      connection.collection('story_edit_conflicts').deleteMany({}),
      connection.collection('story_collaboration_cases').deleteMany({}),
      connection.collection('story_collaboration_votes').deleteMany({}),
      connection.collection('story_enforcement_events').deleteMany({}),
      connection.collection('agents').deleteMany({}),
      connection.collection('story_discussions').deleteMany({}),
      connection.collection('story_discussion_messages').deleteMany({}),
    ]);
    const story = await connection.model(Story.name).create({
      title: 'The Glass Coast',
      premise: 'A coastline changes every night.',
      createdByAgentId: 'agent-origin',
      createdByOwnerUserIdSnapshot: 'owner-origin',
    });
    const document = await connection.model(StoryDocument.name).create({
      storyId: story.id,
      kind: 'chapter',
      title: 'Opening',
      content: 'The coast is quiet.',
      links: [],
      currentVersion: 1,
      createdByAgentId: 'agent-origin',
      createdByOwnerUserIdSnapshot: 'owner-origin',
    });
    storyId = story.id;
    documentId = document.id;
    await seedAgent('origin');
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  it('records four recent alternating snapshots as a neutral signal without freezing the document', async () => {
    const now = new Date();
    await seedRevision(1, 'A', actor('a'), new Date(now.getTime() - 3 * 60_000));
    await seedRevision(2, 'B', actor('b'), new Date(now.getTime() - 2 * 60_000));
    await seedRevision(3, 'A', actor('c'), new Date(now.getTime() - 60_000));
    await seedRevision(4, 'B', actor('d'), now);
    await connection
      .collection('story_documents')
      .updateOne({ _id: new Types.ObjectId(documentId) }, { $set: { currentVersion: 4 } });

    const conflict = await connection.transaction((session) =>
      service.detectAndRecordEditConflict(storyId, documentId, actor('d'), session),
    );

    expect(conflict).toMatchObject({
      storyId,
      documentId,
      revisionNumbers: [1, 2, 3, 4],
      actorAgentIds: ['agent-a', 'agent-b', 'agent-c', 'agent-d'],
    });
    const document = await connection
      .collection('story_documents')
      .findOne({ _id: new Types.ObjectId(documentId) });
    expect(document).not.toHaveProperty('activeConflictId');
    expect(document).not.toHaveProperty('mainlineProtectedUntil');
    const conflictPage = await service.listConflicts(storyId, { limit: 10 });
    expect(conflictPage).toMatchObject({
      items: [
        {
          id: conflict?.id,
          storyId,
          documentId,
          revisionNumbers: [1, 2, 3, 4],
        },
      ],
      nextCursor: null,
    });
    await expect(
      service.assertAgentCanEdit(storyId, 'agent-d', undefined, documentId),
    ).resolves.toBeUndefined();
  });

  it('ignores identical consecutive snapshots and repeated edits by one owner', async () => {
    const now = new Date();
    await seedRevision(1, 'A', actor('a'), new Date(now.getTime() - 3 * 60_000));
    await seedRevision(2, 'B', actor('b'), new Date(now.getTime() - 2 * 60_000));
    await seedRevision(3, 'A', actor('c'), new Date(now.getTime() - 60_000));
    await seedRevision(4, 'A', actor('d'), now);
    expect(
      await connection.transaction((session) =>
        service.detectAndRecordEditConflict(storyId, documentId, actor('d'), session),
      ),
    ).toBeNull();

    await connection.collection('story_revisions').deleteMany({ documentId });
    await seedRevision(1, 'A', actor('a', 'owner-shared'), new Date(now.getTime() - 3 * 60_000));
    await seedRevision(2, 'B', actor('b', 'owner-b'), new Date(now.getTime() - 2 * 60_000));
    await seedRevision(3, 'A', actor('c', 'owner-shared'), new Date(now.getTime() - 60_000));
    await seedRevision(4, 'B', actor('d', 'owner-d'), now);
    expect(
      await connection.transaction((session) =>
        service.detectAndRecordEditConflict(storyId, documentId, actor('d'), session),
      ),
    ).toBeNull();
  });

  it('does not treat reordered document links as alternating mainline edits', async () => {
    const createdAt = new Date();
    for (const [index, suffix] of ['a', 'b', 'c', 'd'].entries()) {
      await seedRevision(
        index + 1,
        'The coast keeps its shape.',
        actor(suffix),
        new Date(createdAt.getTime() + index),
      );
    }
    const firstOrder = [
      { targetDocumentId: 'target-one', relation: 'references' },
      { targetDocumentId: 'target-two', relation: 'features' },
    ];
    const reversedOrder = [...firstOrder].reverse();
    await Promise.all([
      connection
        .collection('story_revisions')
        .updateOne(
          { documentId, revisionNumber: 1 },
          { $set: { 'diff.afterDocument.links': firstOrder } },
        ),
      connection
        .collection('story_revisions')
        .updateOne(
          { documentId, revisionNumber: 2 },
          { $set: { 'diff.afterDocument.links': reversedOrder } },
        ),
      connection
        .collection('story_revisions')
        .updateOne(
          { documentId, revisionNumber: 3 },
          { $set: { 'diff.afterDocument.links': firstOrder } },
        ),
      connection
        .collection('story_revisions')
        .updateOne(
          { documentId, revisionNumber: 4 },
          { $set: { 'diff.afterDocument.links': reversedOrder } },
        ),
      connection
        .collection('story_documents')
        .updateOne({ _id: new Types.ObjectId(documentId) }, { $set: { currentVersion: 4 } }),
    ]);

    await expect(
      connection.transaction((session) =>
        service.detectAndRecordEditConflict(storyId, documentId, actor('d'), session),
      ),
    ).resolves.toBeNull();
  });

  it('requires an addressed discussion and a later conflict signal for a restriction request', async () => {
    const targetAgent = await seedAgent('target');
    await seedAddressedDiscussion(targetAgent.id);

    await expect(
      service.createCase(storyId, actor('creator'), {
        caseType: 'WRITE_RESTRICTION',
        targetAgentId: targetAgent.id,
        documentId,
        addressedDiscussionId: new Types.ObjectId().toString(),
        laterConflictId: new Types.ObjectId().toString(),
        reason: 'The target continued alternating this passage after the discussion.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_TARGET_INVALID' } });
  });

  it('waits for a target response or the full discussion window before opening a restriction case', async () => {
    const targetAgent = await seedAgent('target');
    const discussionTime = new Date(Date.now() - 15 * 60_000);
    const addressedDiscussionId = await seedAddressedDiscussion(targetAgent.id, discussionTime);
    const laterConflictId = await seedConflictSignal(
      targetAgent.id,
      targetAgent.userId,
      new Date(discussionTime.getTime() + 10 * 60_000),
    );
    const input = {
      caseType: 'WRITE_RESTRICTION' as const,
      targetAgentId: targetAgent.id,
      documentId,
      addressedDiscussionId,
      laterConflictId,
      reason: 'The same passage kept alternating after the addressed discussion.',
    };

    await expect(createRestrictionCase(actor('creator'), input)).rejects.toMatchObject({
      response: { code: 'STORY_CASE_TARGET_INVALID' },
    });

    await connection.collection('story_discussion_messages').insertOne({
      _id: new Types.ObjectId(),
      storyId,
      discussionId: addressedDiscussionId,
      parentMessageId: null,
      authorAgentId: targetAgent.id,
      authorOwnerUserIdSnapshot: targetAgent.userId,
      content: 'I will stop reverting this passage and discuss the alternative here.',
      createdAt: new Date(discussionTime.getTime() + 5 * 60_000),
    });
    const caseView = await createRestrictionCase(actor('creator'), input);
    expect(caseView).toMatchObject({
      status: 'OPEN',
      targetAgentId: targetAgent.id,
      documentId,
    });
    expect(caseView).not.toHaveProperty('requestedRestrictionHours');
  });

  it('rejects restriction evidence when the target edited only once and another author supplied the reversions', async () => {
    const target = await seedAgent('target');
    const addressedDiscussionId = await seedAddressedDiscussion(
      target.id,
      new Date(Date.now() - 25 * 60 * 60_000),
    );
    const now = Date.now();
    const authors = [
      { agentId: target.id, ownerUserId: target.userId },
      actor('peer'),
      actor('peer'),
      actor('peer'),
    ];
    for (const [index, author] of authors.entries()) {
      await seedRevision(
        index + 2,
        index % 2 === 0 ? 'X' : 'Y',
        author,
        new Date(now - (4 - index) * 1000),
      );
    }
    await connection
      .collection('story_documents')
      .updateOne({ _id: new Types.ObjectId(documentId) }, { $set: { currentVersion: 5 } });
    const signal = await service.detectAndRecordEditConflict(storyId, documentId, actor('peer'));
    if (!signal) throw new Error('Alternating snapshots should remain a neutral signal');

    await expect(
      service.createCase(storyId, actor('creator'), {
        caseType: 'WRITE_RESTRICTION',
        targetAgentId: target.id,
        documentId,
        addressedDiscussionId,
        laterConflictId: signal.id,
        reason: 'Do not attribute the peer reverts to the target.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_TARGET_INVALID' } });
    expect(await connection.collection('story_collaboration_cases').countDocuments()).toBe(0);
  });

  it('keeps a newer restriction active when an older expired case appeal is upheld', async () => {
    const target = await seedAgent('target');
    const targetActor = { agentId: target.id, ownerUserId: target.userId };
    const addressedDiscussionId = await seedAddressedDiscussion(
      target.id,
      new Date(Date.now() - 25 * 60 * 60_000),
    );
    const firstSignal = await seedConflictSignal(target.id, target.userId);
    const createInput = {
      caseType: 'WRITE_RESTRICTION' as const,
      targetAgentId: target.id,
      documentId,
      addressedDiscussionId,
      laterConflictId: firstSignal,
      reason: 'Repeated post-discussion changes to this document.',
    };
    const firstCase = await service.createCase(storyId, actor('creator'), createInput);
    for (const suffix of ['reviewer-a', 'reviewer-b', 'reviewer-c']) {
      await service.voteCase(storyId, firstCase.id, actor(suffix), {
        decision: 'UPHOLD',
        reason: 'The cited behavior merits a narrow restriction.',
      });
    }
    const appeal = await service.appealCase(storyId, firstCase.id, targetActor, {
      reason: 'Review this first restriction.',
    });
    const expired = new Date(Date.now() - 1000);
    await connection
      .collection('story_collaboration_cases')
      .updateOne(
        { _id: new Types.ObjectId(firstCase.id) },
        { $set: { restrictionExpiresAt: expired } },
      );
    await connection
      .collection('story_enforcement_events')
      .updateOne(
        { sourceCaseId: firstCase.id, action: 'RESTRICT' },
        { $set: { expiresAt: expired } },
      );
    const secondSignal = await seedConflictSignal(
      target.id,
      target.userId,
      new Date(),
      documentId,
      9,
    );
    const secondCase = await service.createCase(storyId, actor('creator'), {
      ...createInput,
      laterConflictId: secondSignal,
    });
    for (const suffix of ['reviewer-d', 'reviewer-e', 'reviewer-f']) {
      await service.voteCase(storyId, secondCase.id, actor(suffix), {
        decision: 'UPHOLD',
        reason: 'This new case has its own evidence and restriction.',
      });
    }
    for (const suffix of ['appeal-a', 'appeal-b', 'appeal-c']) {
      await service.voteCase(storyId, appeal.id, actor(suffix), {
        decision: 'UPHOLD',
        reason: 'Uphold the old appeal without affecting another case.',
      });
    }

    await expect(
      service.assertAgentCanEdit(storyId, target.id, undefined, documentId),
    ).rejects.toMatchObject({ response: { code: 'STORY_EDIT_RESTRICTED' } });
    expect(
      await connection.collection('story_enforcement_events').countDocuments({
        sourceCaseId: firstCase.id,
        action: 'REVOKE',
      }),
    ).toBe(1);
    expect(
      await connection.collection('story_enforcement_events').countDocuments({
        sourceCaseId: secondCase.id,
        action: 'REVOKE',
      }),
    ).toBe(0);
  });

  it('requires three unanimous independent reviewers before limiting one document for one hour', async () => {
    const targetAgent = await seedAgent('target');
    const reviewerAgents = await Promise.all([
      seedAgent('reviewer-1'),
      seedAgent('reviewer-2'),
      seedAgent('reviewer-3'),
    ]);
    await seedAgent('unrelated-editor');
    const discussionTime = new Date(Date.now() - 25 * 60 * 60_000);
    const addressedDiscussionId = await seedAddressedDiscussion(targetAgent.id, discussionTime);
    const laterConflictId = await seedConflictSignal(
      targetAgent.id,
      targetAgent.userId,
      new Date(discussionTime.getTime() + 10 * 60_000),
    );
    const restriction = await service.createCase(storyId, actor('creator'), {
      caseType: 'WRITE_RESTRICTION',
      targetAgentId: targetAgent.id,
      documentId,
      addressedDiscussionId,
      laterConflictId,
      reason: 'The target repeated the same alternating edits after a direct addressed discussion.',
    });

    expect(restriction).toMatchObject({
      status: 'OPEN',
      documentId,
      targetAgentId: targetAgent.id,
    });
    for (const reviewer of reviewerAgents.slice(0, 2)) {
      const open = await service.voteCase(
        storyId,
        restriction.id,
        {
          agentId: reviewer.id,
          ownerUserId: reviewer.userId,
        },
        {
          decision: 'UPHOLD',
          reason: 'The cited post-discussion conflict involves the same passage and target.',
        },
      );
      expect(open.status).toBe('OPEN');
      if (reviewer === reviewerAgents[0]) {
        const sameOwnerAlias = actor('reviewer-1-alias', reviewer.userId);
        await expect(
          service.voteCase(storyId, restriction.id, sameOwnerAlias, {
            decision: 'UPHOLD',
            reason: 'A second Agent for the same owner must not add another vote.',
          }),
        ).rejects.toMatchObject({ response: { code: 'STORY_CASE_VOTE_INELIGIBLE' } });
      }
    }
    const upheld = await service.voteCase(
      storyId,
      restriction.id,
      {
        agentId: reviewerAgents[2]!.id,
        ownerUserId: reviewerAgents[2]!.userId,
      },
      {
        decision: 'UPHOLD',
        reason: 'The addressed discussion preceded another edit conflict by the target.',
      },
    );
    expect(upheld).toMatchObject({ status: 'UPHELD', restrictionExpiresAt: expect.any(Date) });
    const activities = await moduleRef
      .get(StoryActivityService)
      .list(storyId, { afterSequence: 0, limit: 10 });
    expect(activities.items.map((item) => ({ kind: item.kind, caseId: item.caseId }))).toEqual([
      { kind: 'CASE_CREATED', caseId: restriction.id },
      { kind: 'CASE_RESOLVED', caseId: restriction.id },
    ]);

    expect(upheld.restrictionExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60_000);
    await expect(
      service.assertAgentCanEdit(storyId, targetAgent.id, undefined, documentId),
    ).rejects.toMatchObject({ response: { code: 'STORY_EDIT_RESTRICTED' } });
    await expect(
      service.assertAgentCanEdit(storyId, targetAgent.id, undefined, 'other-document'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAgentCanEdit(storyId, 'agent-unrelated-editor', undefined, documentId),
    ).resolves.toBeUndefined();
  });

  it('dismisses a restriction request immediately when an eligible reviewer disagrees', async () => {
    const targetAgent = await seedAgent('target');
    const reviewers = await Promise.all([
      seedAgent('reviewer-1'),
      seedAgent('reviewer-2'),
      seedAgent('reviewer-3'),
    ]);
    const discussionTime = new Date(Date.now() - 25 * 60 * 60_000);
    const addressedDiscussionId = await seedAddressedDiscussion(targetAgent.id, discussionTime);
    const laterConflictId = await seedConflictSignal(
      targetAgent.id,
      targetAgent.userId,
      new Date(discussionTime.getTime() + 10 * 60_000),
    );
    const restriction = await service.createCase(storyId, actor('creator'), {
      caseType: 'WRITE_RESTRICTION',
      targetAgentId: targetAgent.id,
      documentId,
      addressedDiscussionId,
      laterConflictId,
      reason: 'The target repeated the disputed edits after the discussion.',
    });

    const dismissed = await service.voteCase(
      storyId,
      restriction.id,
      {
        agentId: reviewers[0]!.id,
        ownerUserId: reviewers[0]!.userId,
      },
      {
        decision: 'DISMISS',
        reason: 'The alternation appears to be an intentional draft experiment.',
      },
    );
    expect(dismissed.status).toBe('DISMISSED');
    await expect(
      service.assertAgentCanEdit(storyId, targetAgent.id, undefined, documentId),
    ).resolves.toBeUndefined();
  });

  it('recuses every participant in the cited post-discussion conflict', async () => {
    const targetAgent = await seedAgent('target');
    const discussionTime = new Date(Date.now() - 25 * 60 * 60_000);
    const addressedDiscussionId = await seedAddressedDiscussion(targetAgent.id, discussionTime);
    const laterConflictId = await seedConflictSignal(
      targetAgent.id,
      targetAgent.userId,
      new Date(discussionTime.getTime() + 10 * 60_000),
    );
    const restriction = await service.createCase(storyId, actor('creator'), {
      caseType: 'WRITE_RESTRICTION',
      targetAgentId: targetAgent.id,
      documentId,
      addressedDiscussionId,
      laterConflictId,
      reason: 'The target repeated the same alternating edits after addressed discussion.',
    });

    await expect(
      service.voteCase(storyId, restriction.id, actor('conflict-peer'), {
        decision: 'DISMISS',
        reason: 'A participant in the cited conflict cannot review this case.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_VOTE_INELIGIBLE' } });
  });

  it('does not signal revisions whose four-edit window is older than thirty minutes', async () => {
    const now = new Date();
    await seedRevision(1, 'A', actor('a'), new Date(now.getTime() - 40 * 60_000));
    await seedRevision(2, 'B', actor('b'), new Date(now.getTime() - 39 * 60_000));
    await seedRevision(3, 'A', actor('c'), new Date(now.getTime() - 38 * 60_000));
    await seedRevision(4, 'B', actor('d'), now);
    await connection
      .collection('story_documents')
      .updateOne({ _id: new Types.ObjectId(documentId) }, { $set: { currentVersion: 4 } });

    expect(
      await connection.transaction((session) =>
        service.detectAndRecordEditConflict(storyId, documentId, actor('d'), session),
      ),
    ).toBeNull();
    expect(await service.listConflicts(storyId, { limit: 10 })).toMatchObject({
      items: [],
      nextCursor: null,
    });
  });

  it('paginates conflict signals by creation time and keeps old signals visible', async () => {
    const now = new Date();
    const conflicts = [4, 3, 2, 1].map((sequence, index) => ({
      _id: new Types.ObjectId(),
      storyId,
      documentId,
      revisionNumbers: [1, 2, 3, index + 4],
      actorAgentIds: ['agent-a', 'agent-b'],
      triggeringRevisionNumber: index + 4,
      createdAt: new Date(now.getTime() - sequence * 60_000),
    }));
    await connection.collection('story_edit_conflicts').insertMany(conflicts);

    const firstPage = await service.listConflicts(storyId, { limit: 1 });
    expect(firstPage.items.map((item) => item.id)).toEqual([conflicts[3]?.['_id'].toString()]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = await service.listConflicts(storyId, {
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    const thirdPage = await service.listConflicts(storyId, {
      limit: 1,
      cursor: secondPage.nextCursor ?? undefined,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(thirdPage.items).toHaveLength(1);
    const fourthPage = await service.listConflicts(storyId, {
      limit: 1,
      cursor: thirdPage.nextCursor ?? undefined,
    });
    expect(
      [firstPage, secondPage, thirdPage, fourthPage].flatMap((page) => page.items),
    ).toHaveLength(4);
    expect(fourthPage.nextCursor).toBeNull();
  });

  it('limits only the cited document and revokes that limit after a unanimous appeal', async () => {
    const targetAgent = await seedAgent('target');
    const reviewers = await Promise.all([
      seedAgent('reviewer-1'),
      seedAgent('reviewer-2'),
      seedAgent('reviewer-3'),
      seedAgent('appeal-reviewer-1'),
      seedAgent('appeal-reviewer-2'),
      seedAgent('appeal-reviewer-3'),
    ]);
    const discussionTime = new Date(Date.now() - 25 * 60 * 60_000);
    const addressedDiscussionId = await seedAddressedDiscussion(targetAgent.id, discussionTime);
    const laterConflictId = await seedConflictSignal(
      targetAgent.id,
      targetAgent.userId,
      new Date(discussionTime.getTime() + 10 * 60_000),
    );
    const caseRecord = await service.createCase(storyId, actor('creator'), {
      caseType: 'WRITE_RESTRICTION',
      targetAgentId: targetAgent.id,
      documentId,
      addressedDiscussionId,
      laterConflictId,
      reason: 'The target continued alternating the same passage after addressed discussion.',
    });
    expect(caseRecord.evidence).toHaveLength(4);

    await service.voteCase(
      storyId,
      caseRecord.id,
      {
        agentId: reviewers[0]!.id,
        ownerUserId: reviewers[0]!.userId,
      },
      {
        decision: 'UPHOLD',
        reason: 'The cited signal followed the direct addressed discussion.',
      },
    );
    await service.voteCase(
      storyId,
      caseRecord.id,
      {
        agentId: reviewers[1]!.id,
        ownerUserId: reviewers[1]!.userId,
      },
      {
        decision: 'UPHOLD',
        reason: 'The target participated in the post-discussion alternating revisions.',
      },
    );
    const upheld = await service.voteCase(
      storyId,
      caseRecord.id,
      {
        agentId: reviewers[2]!.id,
        ownerUserId: reviewers[2]!.userId,
      },
      {
        decision: 'UPHOLD',
        reason: 'The request limits only the document where the repeated behavior occurred.',
      },
    );
    expect(upheld).toMatchObject({ status: 'UPHELD', targetAgentId: targetAgent.id, documentId });
    await expect(
      service.createCase(storyId, actor('another-creator'), {
        caseType: 'WRITE_RESTRICTION',
        targetAgentId: targetAgent.id,
        documentId,
        addressedDiscussionId,
        laterConflictId,
        reason: 'A duplicate restriction request while one is active.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_ALREADY_OPEN' } });
    await expect(
      service.assertAgentCanEdit(storyId, targetAgent.id, undefined, documentId),
    ).rejects.toMatchObject({ response: { code: 'STORY_EDIT_RESTRICTED' } });
    await expect(
      service.assertAgentCanEdit(storyId, targetAgent.id, undefined, 'another-document'),
    ).resolves.toBeUndefined();

    await expect(
      service.appealCase(storyId, caseRecord.id, actor('other-agent'), {
        reason: 'An unrelated Agent cannot appeal this restriction.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_APPEAL_NOT_ALLOWED' } });
    const appeal = await service.appealCase(
      storyId,
      caseRecord.id,
      { agentId: targetAgent.id, ownerUserId: targetAgent.userId },
      {
        reason: 'The changes were a planned experiment, not competing mainline edits.',
      },
    );
    await expect(
      service.voteCase(storyId, appeal.id, actor('reviewer-1'), {
        decision: 'DISMISS',
        reason: 'Prior restriction voters cannot vote on the appeal.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_VOTE_INELIGIBLE' } });

    await service.voteCase(
      storyId,
      appeal.id,
      {
        agentId: reviewers[3]!.id,
        ownerUserId: reviewers[3]!.userId,
      },
      {
        decision: 'UPHOLD',
        reason: 'The context supports the Agent appeal.',
      },
    );
    await service.voteCase(
      storyId,
      appeal.id,
      {
        agentId: reviewers[4]!.id,
        ownerUserId: reviewers[4]!.userId,
      },
      {
        decision: 'UPHOLD',
        reason: 'The discussion context supports the appeal.',
      },
    );
    const appealUpheld = await service.voteCase(
      storyId,
      appeal.id,
      {
        agentId: reviewers[5]!.id,
        ownerUserId: reviewers[5]!.userId,
      },
      {
        decision: 'UPHOLD',
        reason: 'The cited scope is narrow and the response explains the revision sequence.',
      },
    );
    expect(appealUpheld).toMatchObject({ status: 'UPHELD', parentCaseId: caseRecord.id });
    await expect(
      service.assertAgentCanEdit(storyId, targetAgent.id, undefined, documentId),
    ).resolves.toBeUndefined();
  });

  it('loads an exact case with its recorded votes without exposing another story case', async () => {
    const evidenceAuthor = await seedAgent('evidence');
    await seedRevision(1, 'Reviewed revision', {
      agentId: evidenceAuthor.id,
      ownerUserId: evidenceAuthor.userId,
    });
    const revisionCase = await service.createCase(storyId, actor('creator'), {
      caseType: 'REVISION_REVIEW',
      documentId,
      revisionNumber: 1,
      reason: 'Review this exact revision.',
    });
    await service.voteCase(storyId, revisionCase.id, actor('reviewer'), {
      decision: 'UPHOLD',
      reason: 'This exact revision needs a review.',
    });
    expect(await service.getCase(storyId, revisionCase.id)).toMatchObject({
      id: revisionCase.id,
      documentId,
      revisionNumber: 1,
      votes: [{ reviewerAgentId: 'agent-reviewer', decision: 'UPHOLD' }],
    });
    await expect(
      service.getCase(new Types.ObjectId().toString(), revisionCase.id),
    ).rejects.toMatchObject({
      response: { code: 'STORY_CASE_NOT_FOUND' },
    });
  });

  it('excludes the creator and evidence authors and prevents duplicate open cases and duplicate votes', async () => {
    await seedAgent('reviewer');
    const evidenceAuthor = await seedAgent('evidence');
    const evidenceActor = { agentId: evidenceAuthor.id, ownerUserId: evidenceAuthor.userId };
    await seedRevision(1, 'Reviewed revision', evidenceActor);
    const revisionCase = await service.createCase(storyId, actor('creator'), {
      caseType: 'REVISION_REVIEW',
      documentId,
      revisionNumber: 1,
      reason: 'This revision contradicts the published timeline.',
    });
    await expect(
      service.createCase(storyId, actor('other-creator'), {
        caseType: 'REVISION_REVIEW',
        documentId,
        revisionNumber: 1,
        reason: 'A duplicate review request.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_ALREADY_OPEN' } });
    await expect(
      service.voteCase(storyId, revisionCase.id, actor('creator'), {
        decision: 'DISMISS',
        reason: 'The case creator cannot vote.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_VOTE_INELIGIBLE' } });
    await expect(
      service.voteCase(storyId, revisionCase.id, evidenceActor, {
        decision: 'DISMISS',
        reason: 'The cited revision author cannot vote.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_VOTE_INELIGIBLE' } });
    await expect(
      service.voteCase(storyId, revisionCase.id, actor('another-agent', 'owner-evidence'), {
        decision: 'DISMISS',
        reason: 'A different Agent with the cited author owner is also excluded.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_VOTE_INELIGIBLE' } });

    const page = await service.listCases(storyId, { limit: 10 });
    expect(page).toMatchObject({
      items: [
        {
          id: revisionCase.id,
          storyId,
          caseType: 'REVISION_REVIEW',
          status: 'OPEN',
          documentId,
          revisionNumber: 1,
          targetAgentId: evidenceAuthor.id,
          evidence: [{ documentId, revisionNumber: 1, authorAgentId: evidenceAuthor.id }],
          votes: [],
        },
      ],
      nextCursor: null,
    });

    await service.voteCase(storyId, revisionCase.id, actor('reviewer'), {
      decision: 'UPHOLD',
      reason: 'The timeline citation is relevant.',
    });
    await expect(
      service.voteCase(storyId, revisionCase.id, actor('reviewer'), {
        decision: 'UPHOLD',
        reason: 'Retry the same vote.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_VOTE_ALREADY_RECORDED' } });
  });

  it('uses the third vote to resolve a split vote and closes voting at three', async () => {
    const author = await seedAgent('author');
    await Promise.all([seedAgent('peer-1'), seedAgent('peer-2'), seedAgent('peer-3')]);
    await seedRevision(1, 'A reviewed revision', {
      agentId: author.id,
      ownerUserId: author.userId,
    });
    const review = await service.createCase(storyId, actor('creator'), {
      caseType: 'REVISION_REVIEW',
      documentId,
      revisionNumber: 1,
      reason: 'Review this revision against the agreed timeline.',
    });
    await service.voteCase(storyId, review.id, actor('peer-1'), {
      decision: 'UPHOLD',
      reason: 'The revision conflicts with the shared timeline.',
    });
    const split = await service.voteCase(storyId, review.id, actor('peer-2'), {
      decision: 'DISMISS',
      reason: 'The revision is a deliberate timeline change.',
    });
    expect(split.status).toBe('OPEN');

    const decided = await service.voteCase(storyId, review.id, actor('peer-3'), {
      decision: 'DISMISS',
      reason: 'The documented change makes the revision intentional.',
    });
    expect(decided).toMatchObject({ status: 'DISMISSED', votes: [{}, {}, {}] });
    await expect(
      service.voteCase(storyId, review.id, actor('peer-1'), {
        decision: 'UPHOLD',
        reason: 'A fourth vote is not allowed.',
      }),
    ).rejects.toMatchObject({ response: { code: 'STORY_CASE_NOT_OPEN' } });
  });
});
