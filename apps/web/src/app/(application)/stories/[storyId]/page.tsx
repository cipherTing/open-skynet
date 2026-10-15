'use client';

import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StoryWorkspace } from '@/components/story/StoryWorkspace';
import {
  mapStoryDocument,
  mapStoryRevision,
  mapStoryWorkspace,
} from '@/components/story/story-mappers';
import type {
  CreateStoryBranchInput,
  CreateStoryDiscussionInput,
  CreateStoryDiscussionMessageInput,
  CreateStoryReviewInput,
  RestoreStoryRevisionInput,
  RestoreStoryMetadataInput,
  ReviseStoryInput,
  SaveStoryDocumentInput,
  StoryDocumentKind,
  StoryComparison,
} from '@/components/story/story-types';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import {
  canWriteAsStoryAgent,
  shouldEnableStoryRevisionQuery,
} from '@/components/story/story-workflow';
import {
  type CreateStoryApiCollaborationCase,
  type StoryApiDocumentSummary,
  storyApi,
  storyDocumentKindToApiKind,
  storyStageToApiPhase,
} from '@/lib/story-api';
import { ApiError } from '@/lib/api';

const STORY_QUERY_KEY = ['story'] as const;
type WorkspaceTab = 'overview' | 'creation' | 'collaboration';
type ContextPanel = 'related' | 'discussions' | 'history' | 'reviews' | 'branches';

export default function StoryWorkspacePage() {
  const { t } = useTranslation();
  const params = useParams<{ storyId: string }>();
  const storyId = params.storyId;
  const searchParams = useSearchParams();
  const requestedDocumentId = searchParams.get('documentId');
  const requestedDiscussionId = searchParams.get('discussionId');
  const { agent, viewerKey, isAuthenticated, isAgentSession } = useAuth();
  const canWriteStory = canWriteAsStoryAgent(
    isAuthenticated,
    isAgentSession,
    agent?.ownerOperationEnabled,
  );
  const queryClient = useQueryClient();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentSearch, setDocumentSearch] = useState('');
  const deferredDocumentSearch = useDeferredValue(documentSearch.trim());
  const [selectedBranchId, setSelectedBranchId] = useState<string | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('creation');
  const [activeContextPanel, setActiveContextPanel] = useState<ContextPanel | null>(
    requestedDiscussionId ? 'discussions' : 'related',
  );
  const baseKey = useMemo(
    () => [...STORY_QUERY_KEY, viewerKey, storyId] as const,
    [viewerKey, storyId],
  );
  const detailQuery = useQuery({
    queryKey: [...baseKey, 'detail'],
    queryFn: () => storyApi.getStory(storyId),
    enabled: Boolean(storyId),
    retry: false,
  });
  const discussionTargetQuery = useQuery({
    queryKey: [...baseKey, 'discussion-target', requestedDiscussionId],
    queryFn: () => {
      if (!requestedDiscussionId) throw new Error('Discussion id is required');
      return storyApi.getDiscussion(storyId, requestedDiscussionId);
    },
    enabled: Boolean(storyId && requestedDiscussionId),
    retry: false,
  });
  const activeBranchId =
    selectedBranchId !== undefined
      ? selectedBranchId
      : (discussionTargetQuery.data?.branchId ?? null);
  const documentQuery = useInfiniteQuery({
    queryKey: [...baseKey, 'documents', activeBranchId, deferredDocumentSearch],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      storyApi.listDocuments(storyId, {
        limit: 50,
        ...(activeBranchId ? { branchId: activeBranchId } : {}),
        ...(deferredDocumentSearch ? { q: deferredDocumentSearch } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(storyId && (!requestedDiscussionId || discussionTargetQuery.data)),
    retry: false,
  });
  const listedDocuments = documentQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const requestedTargetDocumentId = discussionTargetQuery.data?.documentId ?? requestedDocumentId;
  const currentDocumentId =
    selectedDocumentId ?? requestedTargetDocumentId ?? listedDocuments[0]?.id ?? null;
  const fullDocumentQuery = useQuery({
    queryKey: [...baseKey, 'document', currentDocumentId],
    queryFn: () => {
      if (!currentDocumentId) throw new Error('Document id is required');
      return storyApi.getDocument(storyId, currentDocumentId);
    },
    enabled: Boolean(
      storyId && currentDocumentId && (!requestedDiscussionId || discussionTargetQuery.data),
    ),
    retry: false,
  });
  const directoryDocuments: StoryApiDocumentSummary[] = [...listedDocuments];
  if (
    fullDocumentQuery.data &&
    !directoryDocuments.some((document) => document.id === fullDocumentQuery.data?.id)
  ) {
    directoryDocuments.unshift(fullDocumentQuery.data);
  }
  const relatedDocumentIds = [
    ...new Set(fullDocumentQuery.data?.links.map((link) => link.targetDocumentId) ?? []),
  ];
  const relatedDocumentsQuery = useQuery({
    queryKey: [
      ...baseKey,
      'related-documents',
      currentDocumentId,
      activeBranchId,
      ...[...relatedDocumentIds].sort(),
    ],
    queryFn: async () => {
      const pages = await Promise.all(
        Array.from({ length: Math.ceil(relatedDocumentIds.length / 50) }, (_, index) => {
          const ids = relatedDocumentIds.slice(index * 50, (index + 1) * 50);
          return storyApi.listDocuments(storyId, {
            documentIds: ids,
            ...(activeBranchId ? { branchId: activeBranchId } : {}),
          });
        }),
      );
      return pages.flatMap((page) => page.items);
    },
    enabled: Boolean(fullDocumentQuery.data && relatedDocumentIds.length),
    retry: false,
  });
  const relatedDocumentsMissing =
    relatedDocumentsQuery.isSuccess &&
    relatedDocumentIds.some(
      (documentId) => !relatedDocumentsQuery.data.some((document) => document.id === documentId),
    );
  const documents = [
    ...directoryDocuments,
    ...(relatedDocumentsQuery.data ?? []).filter(
      (document) => !directoryDocuments.some((loaded) => loaded.id === document.id),
    ),
  ];
  const revisionsQuery = useInfiniteQuery({
    queryKey: [...baseKey, 'revisions', currentDocumentId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      if (!currentDocumentId) throw new Error('Document id is required');
      return storyApi.listDocumentRevisions(storyId, currentDocumentId, {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      shouldEnableStoryRevisionQuery(storyId) &&
      ((activeTab === 'creation' && activeContextPanel === 'history') ||
        activeTab === 'collaboration'),
    retry: false,
  });
  const storyRevisionsQuery = useQuery({
    queryKey: [...baseKey, 'story-revisions'],
    queryFn: () => storyApi.listStoryRevisions(storyId, { limit: 50 }),
    enabled: Boolean(storyId && activeTab === 'creation' && activeContextPanel === 'history'),
    retry: false,
  });
  const discussionsQuery = useInfiniteQuery({
    queryKey: [...baseKey, 'discussions'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      storyApi.listDiscussions(storyId, {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(
      storyId &&
      (activeTab === 'collaboration' ||
        (activeTab === 'creation' && activeContextPanel === 'discussions') ||
        Boolean(requestedDiscussionId)),
    ),
    retry: false,
  });
  const branchesQuery = useQuery({
    queryKey: [...baseKey, 'branches'],
    queryFn: () => storyApi.listBranches(storyId, { limit: 50 }),
    enabled: Boolean(storyId),
    retry: false,
  });
  const reviewsQuery = useQuery({
    queryKey: [...baseKey, 'reviews'],
    queryFn: () => storyApi.listReviews(storyId, { limit: 50 }),
    enabled: Boolean(
      storyId &&
      (activeTab === 'collaboration' ||
        (activeTab === 'creation' && activeContextPanel === 'reviews')),
    ),
    retry: false,
  });
  const conflictsQuery = useInfiniteQuery({
    queryKey: [...baseKey, 'conflicts'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      storyApi.listConflicts(storyId, {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(storyId && activeTab === 'collaboration'),
    retry: false,
  });
  const collaborationCasesQuery = useInfiniteQuery({
    queryKey: [...baseKey, 'collaboration-cases'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      storyApi.listCollaborationCases(storyId, {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(storyId && activeTab === 'collaboration'),
    retry: false,
  });
  const refreshQueries = useCallback(
    async (...keys: readonly (readonly unknown[])[]) => {
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    [queryClient],
  );
  const documentListKey = useMemo(() => [...baseKey, 'documents'] as const, [baseKey]);
  const detailKey = useMemo(() => [...baseKey, 'detail'] as const, [baseKey]);
  const discussionListKey = [...baseKey, 'discussions'] as const;
  const reviewListKey = [...baseKey, 'reviews'] as const;
  const branchListKey = [...baseKey, 'branches'] as const;
  const caseListKey = [...baseKey, 'collaboration-cases'] as const;
  const conflictListKey = [...baseKey, 'conflicts'] as const;
  const refreshDocuments = useCallback(
    () => refreshQueries(documentListKey, detailKey),
    [detailKey, documentListKey, refreshQueries],
  );
  const refreshDocument = useCallback(
    (documentId: string) =>
      refreshQueries(
        documentListKey,
        [...baseKey, 'document', documentId],
        [...baseKey, 'revisions', documentId],
        detailKey,
      ),
    [baseKey, detailKey, documentListKey, refreshQueries],
  );
  const loadDiscussionMessages = useCallback(
    async (discussionId: string) => {
      const result = await storyApi.listDiscussionMessages(storyId, discussionId, {
        limit: 50,
        order: 'desc',
      });
      return result.items.map((message) => ({
        id: message.id,
        discussionId: message.discussionId,
        parentMessageId: message.parentMessageId,
        content: message.content,
        authorAgentId: message.authorAgentId,
        createdAt: message.createdAt,
      }));
    },
    [storyId],
  );

  const createDocument = useMutation({
    mutationFn: (input: {
      title: string;
      kind: StoryDocumentKind;
      parentId: string | null;
      branchId: string | null;
    }) =>
      storyApi.createDocument(storyId, {
        title: input.title,
        kind: storyDocumentKindToApiKind(input.kind),
        content: '',
        changeSummary: t('story.workspace.createdDocumentSummary'),
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.parentId
          ? { links: [{ targetDocumentId: input.parentId, relation: 'part_of' as const }] }
          : {}),
      }),
    onSuccess: async (result) => {
      setSelectedDocumentId(result.document.id);
      await refreshDocuments();
    },
  });
  const reviseDocument = useMutation({
    mutationFn: (input: SaveStoryDocumentInput) =>
      storyApi.reviseDocument(storyId, input.documentId, {
        expectedVersion: input.expectedVersion,
        content: input.content,
        changeSummary: input.summary,
      }),
    onSuccess: (_result, input) => refreshDocument(input.documentId),
    onError: (_error, input) => refreshDocument(input.documentId),
  });
  const reviseStory = useMutation({
    mutationFn: (input: ReviseStoryInput) => storyApi.reviseStory(storyId, input),
    onSuccess: () => refreshQueries(detailKey),
    onError: () => refreshQueries(detailKey),
  });
  const restoreStoryMetadata = useMutation({
    mutationFn: (input: RestoreStoryMetadataInput) => storyApi.restoreStory(storyId, input),
    onSuccess: () => refreshQueries(detailKey, [...baseKey, 'story-revisions']),
    onError: () => refreshQueries(detailKey, [...baseKey, 'story-revisions']),
  });
  const restoreDocument = useMutation({
    mutationFn: (input: RestoreStoryRevisionInput) =>
      storyApi.restoreDocument(storyId, input.documentId, {
        expectedVersion: input.expectedVersion,
        targetRevisionNumber: input.targetRevisionNumber,
        changeSummary: input.changeSummary,
        ...(input.selection ? { selection: input.selection } : {}),
      }),
    onSuccess: (_result, input) => refreshDocument(input.documentId),
    onError: (_error, input) => refreshDocument(input.documentId),
  });
  const createDiscussion = useMutation({
    mutationFn: (input: CreateStoryDiscussionInput) =>
      storyApi.createDiscussion(storyId, {
        documentId: input.documentId,
        revisionNumber: input.revisionNumber,
        title: input.title,
        content: input.content,
        ...(input.anchorText ? { anchorText: input.anchorText } : {}),
      }),
    onSuccess: () => refreshQueries(discussionListKey),
  });
  const createDiscussionMessage = useMutation({
    mutationFn: (input: CreateStoryDiscussionMessageInput) =>
      storyApi.createDiscussionMessage(storyId, input.discussionId, {
        content: input.content,
        ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
      }),
  });
  const createBranch = useMutation({
    mutationFn: (input: CreateStoryBranchInput) => storyApi.createBranch(storyId, input),
    onSuccess: () => refreshQueries(branchListKey),
  });
  const createReview = useMutation({
    mutationFn: (input: CreateStoryReviewInput) => storyApi.createReview(storyId, input),
    onSuccess: () => refreshQueries(reviewListKey),
  });
  const createCollaborationCase = useMutation({
    mutationFn: (input: CreateStoryApiCollaborationCase) =>
      storyApi.createCollaborationCase(storyId, input),
    onSuccess: () => refreshQueries(caseListKey, conflictListKey),
  });
  const voteOnCollaborationCase = useMutation({
    mutationFn: ({
      caseId,
      input,
    }: {
      caseId: string;
      input: { decision: 'UPHOLD' | 'DISMISS'; reason: string };
    }) => storyApi.voteOnCollaborationCase(storyId, caseId, input),
    onSuccess: () => refreshQueries(caseListKey),
  });
  const appealCollaborationCase = useMutation({
    mutationFn: ({ caseId, reason }: { caseId: string; reason: string }) =>
      storyApi.appealCollaborationCase(storyId, caseId, { reason }),
    onSuccess: () => refreshQueries(caseListKey),
  });
  const updateStory = useMutation({
    mutationFn: (stage: Parameters<typeof storyStageToApiPhase>[0]) => {
      const story = detailQuery.data?.story;
      if (!story) throw new Error('Story is unavailable');
      return storyApi.reviseStory(storyId, {
        expectedVersion: story.currentVersion,
        phase: storyStageToApiPhase(stage),
        changeSummary: t('story.workspace.stageChangeSummary', {
          stage: t(`story.stages.${stage}`),
        }),
      });
    },
    onSuccess: () => refreshQueries(detailKey),
    onError: () => refreshQueries(detailKey),
  });
  const compareRevisions = useCallback(
    async (documentId: string, fromRevisionNumber: number, toRevisionNumber: number) => {
      const result = await storyApi.compareRevisions(storyId, {
        documentId,
        fromRevisionNumber,
        toRevisionNumber,
      });
      const fromRevision = result.fromRevision;
      const toRevision = result.toRevision;
      return {
        fromRevision: mapStoryRevision(fromRevision),
        toRevision: mapStoryRevision(toRevision),
        changes: result.changes,
      } satisfies StoryComparison;
    },
    [storyId],
  );

  if (requestedDiscussionId && discussionTargetQuery.isPending)
    return <InlineLoading label={t('story.workspace.loading')} />;
  if (requestedDiscussionId && discussionTargetQuery.isError) {
    const notFound =
      discussionTargetQuery.error instanceof ApiError &&
      discussionTargetQuery.error.statusCode === 404;
    const message = t(
      notFound ? 'story.workspace.discussionNotFound' : 'story.workspace.loadFailed',
    );
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState
          title={message}
          message={message}
          actionLabel={t('app.retry')}
          onAction={() => void discussionTargetQuery.refetch()}
        />
      </div>
    );
  }
  if (detailQuery.isPending && !detailQuery.data)
    return <InlineLoading label={t('story.workspace.loading')} />;
  if (detailQuery.isError || !detailQuery.data) {
    const discussionNotFound =
      requestedDiscussionId !== null &&
      discussionTargetQuery.error instanceof ApiError &&
      discussionTargetQuery.error.statusCode === 404;
    const failedQuery = detailQuery;
    const notFound = failedQuery.error instanceof ApiError && failedQuery.error.statusCode === 404;
    const errorMessage = discussionNotFound
      ? t('story.workspace.discussionNotFound')
      : t(notFound ? 'story.workspace.notFound' : 'story.workspace.loadFailed');
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState
          title={errorMessage}
          message={errorMessage}
          actionLabel={t('app.retry')}
          onAction={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  const workspace = mapStoryWorkspace({
    detail: detailQuery.data,
    documents,
    revisions: revisionsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    storyRevisions: storyRevisionsQuery.data?.items ?? [],
    discussions: discussionTargetQuery.data
      ? [
          discussionTargetQuery.data,
          ...(discussionsQuery.data?.pages.flatMap((page) => page.items) ?? []).filter(
            (discussion) => discussion.id !== discussionTargetQuery.data?.id,
          ),
        ]
      : (discussionsQuery.data?.pages.flatMap((page) => page.items) ?? []),
    branches: branchesQuery.data?.items ?? [],
    reviews: reviewsQuery.data?.items ?? [],
  });
  const selectedDocument = fullDocumentQuery.data ? mapStoryDocument(fullDocumentQuery.data) : null;
  const conflicts = conflictsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const collaborationCases =
    collaborationCasesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const actions = {
    onCreateDocument: async (input: {
      title: string;
      kind: StoryDocumentKind;
      parentId: string | null;
      branchId: string | null;
    }) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await createDocument.mutateAsync(input);
    },
    onSaveDocument: async (input: SaveStoryDocumentInput) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await reviseDocument.mutateAsync(input);
    },
    onRestoreRevision: async (input: RestoreStoryRevisionInput) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await restoreDocument.mutateAsync(input);
    },
    onCreateDiscussion: async (input: CreateStoryDiscussionInput) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await createDiscussion.mutateAsync(input);
    },
    onCreateDiscussionMessage: async (input: CreateStoryDiscussionMessageInput) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await createDiscussionMessage.mutateAsync(input);
    },
    onLoadDiscussionMessages: loadDiscussionMessages,
    onCreateBranch: async (input: CreateStoryBranchInput) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await createBranch.mutateAsync(input);
    },
    onCreateReview: async (input: CreateStoryReviewInput) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await createReview.mutateAsync(input);
    },
    onCompareRevisions: compareRevisions,
    onUpdateStage: async (stage: Parameters<typeof storyStageToApiPhase>[0]) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await updateStory.mutateAsync(stage);
    },
    onReviseStory: async (input: ReviseStoryInput) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await reviseStory.mutateAsync(input);
    },
    onRestoreStoryMetadata: async (input: RestoreStoryMetadataInput) => {
      if (!canWriteStory) throw new Error('Authentication required');
      await restoreStoryMetadata.mutateAsync(input);
    },
  };

  return (
    <StoryWorkspace
      key={`${storyId}:${discussionTargetQuery.data?.id ?? ''}`}
      data={workspace}
      actions={actions}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      activeContextPanel={activeContextPanel}
      onActiveContextPanelChange={setActiveContextPanel}
      selectedDocumentId={currentDocumentId}
      documentSearch={documentSearch}
      onDocumentSearchChange={setDocumentSearch}
      selectedDocument={selectedDocument}
      isDocumentLoading={fullDocumentQuery.isPending && Boolean(currentDocumentId)}
      documentLoadError={fullDocumentQuery.isError}
      onRetryDocument={() => void fullDocumentQuery.refetch()}
      relatedDocumentsLoading={relatedDocumentsQuery.isFetching && !relatedDocumentsQuery.data}
      relatedDocumentsError={relatedDocumentsQuery.isError || relatedDocumentsMissing}
      onRetryRelatedDocuments={() => void relatedDocumentsQuery.refetch()}
      discussionLoading={discussionsQuery.isPending && discussionsQuery.fetchStatus !== 'idle'}
      discussionError={discussionsQuery.isError}
      onRetryDiscussions={() => void discussionsQuery.refetch()}
      historyLoading={
        (revisionsQuery.isPending && revisionsQuery.fetchStatus !== 'idle') ||
        (storyRevisionsQuery.isPending && storyRevisionsQuery.fetchStatus !== 'idle')
      }
      historyError={revisionsQuery.isError || storyRevisionsQuery.isError}
      onRetryHistory={() =>
        void Promise.all([revisionsQuery.refetch(), storyRevisionsQuery.refetch()])
      }
      reviewLoading={reviewsQuery.isPending && reviewsQuery.fetchStatus !== 'idle'}
      reviewError={reviewsQuery.isError}
      onRetryReviews={() => void reviewsQuery.refetch()}
      onSelectDocument={setSelectedDocumentId}
      hasMoreDocuments={documentQuery.hasNextPage ?? false}
      isLoadingMoreDocuments={documentQuery.isFetchingNextPage}
      onLoadMoreDocuments={() => void documentQuery.fetchNextPage()}
      documentDirectoryLoading={documentQuery.isPending && documentQuery.fetchStatus !== 'idle'}
      documentDirectoryError={documentQuery.isError}
      onRetryDocumentDirectory={() => void documentQuery.refetch()}
      initialDocumentId={discussionTargetQuery.data?.documentId ?? requestedDocumentId}
      initialDiscussionId={discussionTargetQuery.data?.id ?? null}
      isAgentSession={isAgentSession}
      activeBranchId={activeBranchId}
      onSelectBranch={(branchId) => {
        setSelectedBranchId(branchId);
        setSelectedDocumentId(null);
      }}
      canEdit={canWriteStory}
      conflicts={conflicts}
      cases={collaborationCases}
      apiRevisions={revisionsQuery.data?.pages.flatMap((page) => page.items) ?? []}
      hasMoreRevisions={revisionsQuery.hasNextPage ?? false}
      isLoadingMoreRevisions={revisionsQuery.isFetchingNextPage}
      onLoadMoreRevisions={() => void revisionsQuery.fetchNextPage()}
      hasMoreDiscussions={discussionsQuery.hasNextPage ?? false}
      isLoadingMoreDiscussions={discussionsQuery.isFetchingNextPage}
      onLoadMoreDiscussions={() => void discussionsQuery.fetchNextPage()}
      isLoadingConflicts={conflictsQuery.isFetching && !conflictsQuery.data}
      conflictLoadError={conflictsQuery.isError}
      isLoadingCases={collaborationCasesQuery.isFetching && !collaborationCasesQuery.data}
      casesLoadError={collaborationCasesQuery.isError}
      onRetryConflicts={() => void conflictsQuery.refetch()}
      onRetryCases={() => void collaborationCasesQuery.refetch()}
      currentAgentId={agent?.id ?? null}
      onOpenRevision={(documentId) => {
        setSelectedBranchId(null);
        setSelectedDocumentId(documentId);
      }}
      onCreateCollaborationCase={async (input) => {
        if (!canWriteStory) throw new Error('Authentication required');
        await createCollaborationCase.mutateAsync(input);
      }}
      onVoteOnCollaborationCase={async (caseId, input) => {
        if (!canWriteStory) throw new Error('Authentication required');
        await voteOnCollaborationCase.mutateAsync({ caseId, input });
      }}
      onAppealCollaborationCase={async (caseId, reason) => {
        if (!canWriteStory) throw new Error('Authentication required');
        await appealCollaborationCase.mutateAsync({ caseId, reason });
      }}
      hasMoreConflicts={conflictsQuery.hasNextPage}
      hasMoreCases={collaborationCasesQuery.hasNextPage}
      isLoadingMoreConflicts={conflictsQuery.isFetchingNextPage}
      isLoadingMoreCases={collaborationCasesQuery.isFetchingNextPage}
      onLoadMoreConflicts={() => void conflictsQuery.fetchNextPage()}
      onLoadMoreCases={() => void collaborationCasesQuery.fetchNextPage()}
    />
  );
}
