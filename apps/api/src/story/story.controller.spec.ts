import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { AgentIdentityService } from '@/auth/agent-identity.service';
import { IS_PUBLIC_KEY } from '@/auth/decorators/public.decorator';
import { AGENT_API_CAPABILITY_KEY } from '@/auth/decorators/agent-api.decorator';
import { getResponseSemantics } from '@/common/semantics/response-semantics';
import type {
  JwtAgentAuthUser,
  JwtBrowserAuthUser,
} from '@/auth/interfaces/jwt-auth-user.interface';
import { ApiValidationPipe } from '@/common/pipes/api-validation.pipe';
import { STORY_AGENT_API_CAPABILITIES } from './story.constants';
import { StoryController } from './story.controller';
import { StoryCollaborationService } from './story-collaboration.service';
import { StoryService } from './story.service';

describe('StoryController REST contract', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  const storyService = {
    listStories: jest.fn(),
    createStory: jest.fn(),
    getStory: jest.fn(),
    listDocuments: jest.fn(),
    listDiscussions: jest.fn(),
    getDiscussion: jest.fn(),
    listDiscussionMessages: jest.fn(),
  };
  const collaborationService = {
    listConflicts: jest.fn(),
    listCases: jest.fn(),
    createCase: jest.fn(),
    voteCase: jest.fn(),
    appealCase: jest.fn(),
  };
  const agentIdentityService = {
    getByOwnerUserId: jest.fn(),
  };
  const agentUser: JwtAgentAuthUser = {
    userId: 'owner-1',
    username: 'agent-owner',
    dbTokenVersion: 1,
    payloadTokenVersion: 1,
    role: 'USER',
    authType: 'agent',
    agentId: 'agent-1',
  };
  const browserUser: JwtBrowserAuthUser = {
    userId: 'owner-1',
    username: 'agent-owner',
    dbTokenVersion: 1,
    payloadTokenVersion: 1,
    role: 'USER',
    authType: 'jwt',
  };
  let currentUser: JwtAgentAuthUser | JwtBrowserAuthUser = agentUser;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [StoryController],
      providers: [
        { provide: StoryService, useValue: storyService },
        { provide: StoryCollaborationService, useValue: collaborationService },
        { provide: AgentIdentityService, useValue: agentIdentityService },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((incoming: Request, _response: Response, next: NextFunction) => {
      Object.assign(incoming, { user: currentUser });
      next();
    });
    app.useGlobalPipes(
      new ApiValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = agentUser;
    agentIdentityService.getByOwnerUserId.mockResolvedValue({
      id: 'agent-1',
      ownerOperationEnabled: true,
    });
    storyService.listStories.mockResolvedValue({ items: [], nextCursor: null });
    storyService.createStory.mockResolvedValue({ id: 'story-1' });
    storyService.listDocuments.mockResolvedValue({ items: [], nextCursor: null });
    storyService.listDiscussions.mockResolvedValue({ items: [], nextCursor: null });
    storyService.listDiscussionMessages.mockResolvedValue({ items: [], nextCursor: null });
    collaborationService.listConflicts.mockResolvedValue({ items: [], nextCursor: null });
    collaborationService.listCases.mockResolvedValue({ items: [], nextCursor: null });
    collaborationService.createCase.mockResolvedValue({ id: 'case-1', status: 'OPEN' });
    collaborationService.voteCase.mockResolvedValue({ id: 'case-1', status: 'OPEN' });
    collaborationService.appealCase.mockResolvedValue({ id: 'appeal-1', status: 'OPEN' });
  });

  afterAll(async () => {
    await app.close();
    await moduleRef.close();
  });

  it('serves the public story directory through the versioned REST route', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stories?limit=10')
      .expect(200)
      .expect({ items: [], nextCursor: null });
    expect(storyService.listStories).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
  });

  it('transforms a title prefix and comma-separated link target IDs at the document route', async () => {
    const firstId = '507f1f77bcf86cd799439011';
    const secondId = '507f1f77bcf86cd799439012';
    await request(app.getHttpServer())
      .get(`/api/v1/stories/story-1/documents?documentIds=${firstId},${secondId}`)
      .expect(200)
      .expect({ items: [], nextCursor: null });

    expect(storyService.listDocuments).toHaveBeenCalledWith(
      'story-1',
      null,
      expect.objectContaining({ documentIds: [firstId, secondId], limit: undefined }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/documents?q=%20Mira%20&limit=5')
      .expect(200)
      .expect({ items: [], nextCursor: null });
    expect(storyService.listDocuments).toHaveBeenLastCalledWith(
      'story-1',
      null,
      expect.objectContaining({ q: 'Mira', limit: 5 }),
    );
  });

  it('defaults story discussion message requests to newest-first and validates explicit order', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/discussions/discussion-1/messages')
      .expect(200)
      .expect({ items: [], nextCursor: null });
    expect(storyService.listDiscussionMessages).toHaveBeenCalledWith(
      'story-1',
      'discussion-1',
      expect.objectContaining({ order: 'desc' }),
    );

    await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/discussions/discussion-1/messages?order=sideways')
      .expect(400);
    expect(storyService.listDiscussionMessages).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty document ID selector instead of turning it into an unfiltered directory read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/documents?documentIds=')
      .expect(400);
    expect(storyService.listDocuments).not.toHaveBeenCalled();
  });

  it('serves one discussion directly so notification links do not depend on list pagination', async () => {
    const discussion = {
      id: 'discussion-1',
      storyId: 'story-1',
      documentId: 'document-1',
      revisionNumber: 3,
      branchId: 'branch-1',
      title: 'Question about the alternate coast',
    };
    storyService.getDiscussion.mockResolvedValue(discussion);

    await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/discussions/discussion-1')
      .expect(200)
      .expect(discussion);

    expect(storyService.getDiscussion).toHaveBeenCalledWith('story-1', 'discussion-1');
  });

  it('passes discussion document and revision filters through the versioned REST route', async () => {
    const documentId = '507f1f77bcf86cd799439011';
    await request(app.getHttpServer())
      .get(`/api/v1/stories/story-1/discussions?documentId=${documentId}&revisionNumber=3&limit=5`)
      .expect(200)
      .expect({ items: [], nextCursor: null });

    expect(storyService.listDiscussions).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ documentId, revisionNumber: 3, limit: 5 }),
    );
  });

  it('records the authenticated Agent as author and rejects caller-supplied identity fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/stories')
      .send({
        title: 'The Glass Coast',
        premise: 'A cartographer discovers a coastline that changes overnight.',
        createdByAgentId: 'agent-forged',
      })
      .expect(400);
    expect(storyService.createStory).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/api/v1/stories')
      .send({
        title: 'The Glass Coast',
        premise: 'A cartographer discovers a coastline that changes overnight.',
      })
      .expect(201)
      .expect({ id: 'story-1' });
    expect(storyService.createStory).toHaveBeenCalledWith(
      { agentId: 'agent-1', ownerUserId: 'owner-1' },
      expect.objectContaining({ title: 'The Glass Coast' }),
    );
  });

  it('requires an enabled owner operation before a browser user writes as its Agent', async () => {
    currentUser = browserUser;
    agentIdentityService.getByOwnerUserId.mockResolvedValue({
      id: 'agent-1',
      ownerOperationEnabled: false,
    });

    await request(app.getHttpServer())
      .post('/api/v1/stories')
      .send({ title: 'A story', premise: 'A premise.' })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: 'OWNER_OPERATION_DISABLED' });
      });
    expect(storyService.createStory).not.toHaveBeenCalled();
  });

  it('serves conflict and collaboration case lists through the public story routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/conflicts?limit=10')
      .expect(200)
      .expect({ items: [], nextCursor: null });
    await request(app.getHttpServer())
      .get('/api/v1/stories/story-1/collaboration-cases?limit=10')
      .expect(200)
      .expect({ items: [], nextCursor: null });

    expect(collaborationService.listConflicts).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ limit: 10 }),
    );
    expect(collaborationService.listCases).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('creates a story review case using the authenticated Agent and rejects forged identity', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/stories/story-1/collaboration-cases')
      .send({
        caseType: 'REVISION_REVIEW',
        documentId: '507f1f77bcf86cd799439011',
        revisionNumber: 2,
        reason: 'This change clears the established character history.',
        createdByAgentId: 'agent-forged',
      })
      .expect(400);
    expect(collaborationService.createCase).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/api/v1/stories/story-1/collaboration-cases')
      .send({
        caseType: 'REVISION_REVIEW',
        documentId: '507f1f77bcf86cd799439011',
        revisionNumber: 2,
        reason: 'This change clears the established character history.',
      })
      .expect(201)
      .expect({ id: 'case-1', status: 'OPEN' });

    expect(collaborationService.createCase).toHaveBeenCalledWith(
      'story-1',
      { agentId: 'agent-1', ownerUserId: 'owner-1' },
      expect.objectContaining({ caseType: 'REVISION_REVIEW', revisionNumber: 2 }),
    );
  });

  it('creates a write restriction case from a prior notice and a later conflict on one document', async () => {
    const requestBody = {
      caseType: 'WRITE_RESTRICTION',
      targetAgentId: '507f1f77bcf86cd799439011',
      documentId: '507f1f77bcf86cd799439012',
      noticeDiscussionId: '507f1f77bcf86cd799439013',
      laterConflictId: '507f1f77bcf86cd799439014',
      reason: 'The same document was changed again after a chance to respond.',
    };
    await request(app.getHttpServer())
      .post('/api/v1/stories/story-1/collaboration-cases')
      .send({ ...requestBody, laterConflictId: undefined })
      .expect(400);
    expect(collaborationService.createCase).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/api/v1/stories/story-1/collaboration-cases')
      .send(requestBody)
      .expect(201)
      .expect({ id: 'case-1', status: 'OPEN' });
    expect(collaborationService.createCase).toHaveBeenCalledWith(
      'story-1',
      { agentId: 'agent-1', ownerUserId: 'owner-1' },
      expect.objectContaining({
        caseType: 'WRITE_RESTRICTION',
        documentId: requestBody.documentId,
        noticeDiscussionId: requestBody.noticeDiscussionId,
        laterConflictId: requestBody.laterConflictId,
      }),
    );
  });

  it('routes independent review votes and target appeals to the story collaboration service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/stories/story-1/collaboration-cases/case-1/votes')
      .send({
        decision: 'UPHOLD',
        reason: 'The cited revision repeatedly removes the shared setting.',
      })
      .expect(201)
      .expect({ id: 'case-1', status: 'OPEN' });

    await request(app.getHttpServer())
      .post('/api/v1/stories/story-1/collaboration-cases/case-1/appeals')
      .send({ reason: 'The cited edits were an agreed experiment on a branch.' })
      .expect(201)
      .expect({ id: 'appeal-1', status: 'OPEN' });

    expect(collaborationService.voteCase).toHaveBeenCalledWith(
      'story-1',
      'case-1',
      { agentId: 'agent-1', ownerUserId: 'owner-1' },
      expect.objectContaining({ decision: 'UPHOLD' }),
    );
    expect(collaborationService.appealCase).toHaveBeenCalledWith(
      'story-1',
      'case-1',
      { agentId: 'agent-1', ownerUserId: 'owner-1' },
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });

  it('marks public reads for anonymous discovery while exposing a capability to Agent Keys', () => {
    const directoryHandler = StoryController.prototype.listStories;
    const getStoryHandler = StoryController.prototype.getStory;
    const createHandler = StoryController.prototype.createStory;
    const listConflictsHandler = Reflect.get(StoryController.prototype, 'listConflicts');
    const listCasesHandler = Reflect.get(StoryController.prototype, 'listCases');
    const createCaseHandler = Reflect.get(StoryController.prototype, 'createCase');
    const voteCaseHandler = Reflect.get(StoryController.prototype, 'voteCase');
    const appealCaseHandler = Reflect.get(StoryController.prototype, 'appealCase');

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, directoryHandler)).toBe(true);
    expect(Reflect.getMetadata(AGENT_API_CAPABILITY_KEY, directoryHandler)).toBe(
      STORY_AGENT_API_CAPABILITIES.LIST_STORIES,
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, getStoryHandler)).toBe(true);
    expect(Reflect.getMetadata(AGENT_API_CAPABILITY_KEY, createHandler)).toBe(
      STORY_AGENT_API_CAPABILITIES.CREATE_STORY,
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, listConflictsHandler)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, listCasesHandler)).toBe(true);
    expect(Reflect.getMetadata(AGENT_API_CAPABILITY_KEY, listConflictsHandler)).toBe(
      'list_story_conflicts',
    );
    expect(Reflect.getMetadata(AGENT_API_CAPABILITY_KEY, listCasesHandler)).toBe(
      'list_story_collaboration_cases',
    );
    expect(Reflect.getMetadata(AGENT_API_CAPABILITY_KEY, createCaseHandler)).toBe(
      'create_story_collaboration_case',
    );
    expect(Reflect.getMetadata(AGENT_API_CAPABILITY_KEY, voteCaseHandler)).toBe(
      'vote_story_collaboration_case',
    );
    expect(Reflect.getMetadata(AGENT_API_CAPABILITY_KEY, appealCaseHandler)).toBe(
      'appeal_story_collaboration_case',
    );
  });

  it('registers fixed response semantics for every story REST handler', () => {
    const handlerNames = [
      'listStories',
      'createStory',
      'getStory',
      'reviseStory',
      'listStoryRevisions',
      'restoreStory',
      'listDocuments',
      'createDocument',
      'getDocument',
      'reviseDocument',
      'listDocumentRevisions',
      'restoreDocument',
      'compareRevisions',
      'listDiscussions',
      'createDiscussion',
      'listDiscussionMessages',
      'addDiscussionMessage',
      'listBranches',
      'createBranch',
      'getBranch',
      'listReviews',
      'createReview',
      'listConflicts',
      'listCases',
      'createCase',
      'voteCase',
      'appealCase',
    ];

    for (const handlerName of handlerNames) {
      expect({
        handlerName,
        semantics: getResponseSemantics(`StoryController.${handlerName}`),
      }).toEqual({
        handlerName,
        semantics: expect.objectContaining({}),
      });
    }
  });
});
