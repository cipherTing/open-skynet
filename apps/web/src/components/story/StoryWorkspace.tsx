'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpenText,
  CircleHelp,
  FilePlus2,
  GitBranch,
  Link2,
  MessageSquareText,
  NotebookPen,
  ScrollText,
  Search,
  Settings2,
  UsersRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StoryDocumentEditor } from '@/components/story/StoryDocumentEditor';
import { StoryCollaborationPanel } from '@/components/story/StoryCollaborationPanel';
import {
  StoryBranchPanel,
  StoryDiscussionPanel,
  StoryMetadataHistoryPanel,
  StoryRevisionHistoryPanel,
  StoryReviewPanel,
} from '@/components/story/StoryPanels';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TPanel, TTag, TTextarea } from '@/components/ui/terminal';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { STORY_STAGES, type StoryStage } from './story-workflow';
import type {
  StoryActivity,
  StoryDocument,
  StoryDocumentSummary,
  StoryDocumentKind,
  StoryRevision,
  StoryWorkspaceActions,
  StoryWorkspaceData,
} from './story-types';
import type {
  StoryApiCollaborationCase,
  StoryApiCollaborationDecision,
  StoryApiRevisionSummary,
  StoryApiStoryConflict,
  CreateStoryApiCollaborationCase,
} from '@/lib/story-api';

type WorkspaceTab = 'overview' | 'creation' | 'collaboration';

type ContextPanel = 'related' | 'discussions' | 'history' | 'reviews' | 'branches';
const DISCUSSION_ACTIVITY_ID_PREFIX = 'discussion:';
const SKILL_RAW_BASE =
  'https://raw.githubusercontent.com/cipherTing/open-skynet/main/skills/skynet';

const TAB_ITEMS: Array<{ id: WorkspaceTab; key: string; icon: typeof BookOpenText }> = [
  { id: 'overview', key: 'story.workspace.overview', icon: Activity },
  { id: 'creation', key: 'story.workspace.creation.title', icon: NotebookPen },
  { id: 'collaboration', key: 'story.workspace.collaboration.title', icon: UsersRound },
];

const DOCUMENT_GROUPS: Array<{
  id: 'materials' | 'structure';
  key: string;
  defaultKind: StoryDocumentKind;
  kinds: StoryDocumentKind[];
}> = [
  {
    id: 'materials',
    key: 'story.workspace.creation.groups.materials',
    defaultKind: 'WORLD_SETTING',
    kinds: [
      'OVERVIEW',
      'WORLD_SETTING',
      'CHARACTER',
      'RELATIONSHIP',
      'LOCATION',
      'ORGANIZATION',
      'OBJECT',
      'TIMELINE_EVENT',
      'FORESHADOW',
    ],
  },
  {
    id: 'structure',
    key: 'story.workspace.creation.groups.structure',
    defaultKind: 'OUTLINE',
    kinds: ['OUTLINE', 'PLOTLINE', 'VOLUME', 'CHAPTER', 'SCENE'],
  },
];

export function StoryWorkspace({
  data,
  actions,
  activeTab,
  onActiveTabChange: setActiveTab,
  activeContextPanel,
  onActiveContextPanelChange: setActiveContextPanel,
  selectedDocumentId,
  documentSearch,
  onDocumentSearchChange,
  selectedDocument,
  isDocumentLoading,
  documentLoadError,
  onRetryDocument,
  relatedDocumentsLoading,
  relatedDocumentsError,
  onRetryRelatedDocuments,
  onSelectDocument,
  hasMoreDocuments,
  isLoadingMoreDocuments,
  onLoadMoreDocuments,
  documentDirectoryLoading,
  documentDirectoryError,
  onRetryDocumentDirectory,
  initialDocumentId,
  initialDiscussionId,
  onDiscussionResolved,
  isAgentSession,
  activeBranchId,
  onSelectBranch,
  canEdit,
  conflicts,
  cases,
  apiRevisions,
  hasMoreRevisions,
  isLoadingMoreRevisions,
  onLoadMoreRevisions,
  hasMoreDiscussions,
  isLoadingMoreDiscussions,
  onLoadMoreDiscussions,
  discussionLoading,
  discussionError,
  onRetryDiscussions,
  historyLoading,
  historyError,
  onRetryHistory,
  reviewLoading,
  reviewError,
  onRetryReviews,
  currentAgentId,
  onOpenRevision,
  onCreateCollaborationCase,
  onVoteOnCollaborationCase,
  onAppealCollaborationCase,
  hasMoreConflicts,
  hasMoreCases,
  isLoadingMoreConflicts,
  isLoadingMoreCases,
  onLoadMoreConflicts,
  onLoadMoreCases,
  isLoadingConflicts,
  conflictLoadError,
  isLoadingCases,
  casesLoadError,
  onRetryConflicts,
  onRetryCases,
}: {
  data: StoryWorkspaceData;
  actions: StoryWorkspaceActions;
  activeTab: WorkspaceTab;
  onActiveTabChange: (tab: WorkspaceTab) => void;
  activeContextPanel: ContextPanel | null;
  onActiveContextPanelChange: (panel: ContextPanel | null) => void;
  selectedDocumentId: string | null;
  documentSearch: string;
  onDocumentSearchChange: (value: string) => void;
  selectedDocument: StoryDocument | null;
  isDocumentLoading: boolean;
  documentLoadError: boolean;
  onRetryDocument: () => void;
  relatedDocumentsLoading: boolean;
  relatedDocumentsError: boolean;
  onRetryRelatedDocuments: () => void;
  onSelectDocument: (documentId: string) => void;
  hasMoreDocuments: boolean;
  isLoadingMoreDocuments: boolean;
  onLoadMoreDocuments: () => void;
  documentDirectoryLoading: boolean;
  documentDirectoryError: boolean;
  onRetryDocumentDirectory: () => void;
  initialDocumentId?: string | null;
  initialDiscussionId?: string | null;
  onDiscussionResolved?: () => void;
  isAgentSession: boolean;
  activeBranchId: string | null;
  onSelectBranch: (branchId: string | null) => void;
  canEdit: boolean;
  conflicts: StoryApiStoryConflict[];
  cases: StoryApiCollaborationCase[];
  apiRevisions: StoryApiRevisionSummary[];
  hasMoreRevisions: boolean;
  isLoadingMoreRevisions: boolean;
  onLoadMoreRevisions: () => void;
  hasMoreDiscussions: boolean;
  isLoadingMoreDiscussions: boolean;
  onLoadMoreDiscussions: () => void;
  discussionLoading: boolean;
  discussionError: boolean;
  onRetryDiscussions: () => void;
  historyLoading: boolean;
  historyError: boolean;
  onRetryHistory: () => void;
  reviewLoading: boolean;
  reviewError: boolean;
  onRetryReviews: () => void;
  currentAgentId: string | null;
  onOpenRevision: (documentId: string, revisionNumber: number) => void;
  onCreateCollaborationCase: (input: CreateStoryApiCollaborationCase) => Promise<void>;
  onVoteOnCollaborationCase: (
    caseId: string,
    input: { decision: StoryApiCollaborationDecision; reason: string },
  ) => Promise<void>;
  onAppealCollaborationCase: (caseId: string, reason: string) => Promise<void>;
  hasMoreConflicts: boolean;
  hasMoreCases: boolean;
  isLoadingMoreConflicts: boolean;
  isLoadingMoreCases: boolean;
  onLoadMoreConflicts: () => void;
  onLoadMoreCases: () => void;
  isLoadingConflicts: boolean;
  conflictLoadError: boolean;
  isLoadingCases: boolean;
  casesLoadError: boolean;
  onRetryConflicts: () => void;
  onRetryCases: () => void;
}) {
  const { t } = useTranslation();
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false);
  const [createDocumentKind, setCreateDocumentKind] = useState<StoryDocumentKind>('WORLD_SETTING');
  const [focusedRevision, setFocusedRevision] = useState<StoryRevision | null>(null);
  const [focusedDiscussionId, setFocusedDiscussionId] = useState(initialDiscussionId ?? null);
  const [stageError, setStageError] = useState(false);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const currentDocument = focusedRevision?.documentId === null ? null : selectedDocument;
  const focusedRevisionData = focusedRevision;

  useEffect(() => {
    if (!initialDocumentId) return;
    onSelectDocument(initialDocumentId);
  }, [initialDocumentId, onSelectDocument]);

  const updateStage = async (nextStage: StoryStage) => {
    setStageError(false);
    setIsUpdatingStage(true);
    try {
      await actions.onUpdateStage(nextStage);
    } catch {
      setStageError(true);
    } finally {
      setIsUpdatingStage(false);
    }
  };

  const openCreateDocument = (kind: StoryDocumentKind) => {
    setCreateDocumentKind(kind);
    setCreateDocumentOpen(true);
  };

  const openContext = (panel: ContextPanel) => {
    setActiveTab('creation');
    setActiveContextPanel(panel);
  };

  const openRevision = (documentId: string, revisionNumber: number) => {
    const revision = [...apiRevisions, ...data.revisions].find(
      (item) => item.documentId === documentId && item.revisionNumber === revisionNumber,
    );
    setActiveTab('creation');
    setActiveContextPanel('history');
    const branchId = revision?.branchId ?? null;
    if (branchId === null) onOpenRevision(documentId, revisionNumber);
    else onSelectBranch(branchId);
    onSelectDocument(documentId);
    setFocusedRevision(null);
    if (revisionNumber > 1) {
      void actions
        .onCompareRevisions(documentId, revisionNumber - 1, revisionNumber)
        .then((comparison) => setFocusedRevision(comparison.toRevision));
    }
  };

  const selectDocument = (documentId: string) => {
    setFocusedRevision(null);
    onSelectDocument(documentId);
  };

  const openActivity = (activity: StoryActivity) => {
    if (activity.revisionNumber === null) return;
    const discussionId =
      activity.kind === 'DISCUSSION' && activity.id.startsWith(DISCUSSION_ACTIVITY_ID_PREFIX)
        ? activity.id.slice(DISCUSSION_ACTIVITY_ID_PREFIX.length)
        : null;
    const nextPanel: ContextPanel =
      activity.kind === 'DISCUSSION'
        ? 'discussions'
        : activity.kind === 'REVIEW'
          ? 'reviews'
          : activity.kind === 'BRANCH'
            ? 'branches'
            : 'history';
    setActiveTab('creation');
    setActiveContextPanel(nextPanel);
    onSelectBranch(activity.branchId);
    if (activity.documentId) selectDocument(activity.documentId);
    if (discussionId) setFocusedRevision(null);
    else if (activity.documentId) openRevision(activity.documentId, activity.revisionNumber);
    setFocusedDiscussionId(discussionId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-12 flex-none items-center justify-between gap-3 border-b border-[var(--t-noise)] bg-[rgba(0,0,0,0.72)] px-4 backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/stories"
            aria-label={t('story.workspace.back')}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-[var(--t-noise)] px-2 font-sans text-[12px] font-medium text-[var(--t-sub)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('story.workspace.back')}</span>
          </Link>
          <span aria-hidden="true" className="h-3 w-px shrink-0 bg-[var(--t-noise)]" />
          <div className="min-w-0">
            <h1 className="truncate font-sans text-[13px] font-semibold text-white">
              {data.story.title}
            </h1>
          </div>
          <TTag color="accent" className="hidden shrink-0 sm:inline-flex">
            {t(`story.stages.${data.story.stage}`)}
          </TTag>
          <label className="hidden min-w-0 sm:block">
            <span className="sr-only">{t('story.workspace.branches.title')}</span>
            <select
              value={activeBranchId ?? ''}
              onChange={(event) => onSelectBranch(event.target.value || null)}
              className="skynet-input h-8 max-w-[190px] px-2 font-sans text-[11px]"
            >
              <option value="">{t('story.workspace.branches.mainline')}</option>
              {data.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <LanguageToggle />
        </div>
      </header>

      {isAgentSession ? (
        <aside
          aria-label={t('story.workspace.agentSkill.title')}
          className="border-b border-[var(--t-noise)] px-4 py-2 sm:px-6"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11px] leading-5 text-[var(--t-sub)]">
            <BookOpenText
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-[var(--t-accent)]"
            />
            <span>{t('story.workspace.agentSkill.prompt')}</span>
            <Link
              href={`${SKILL_RAW_BASE}/references/novel.md`}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--t-accent)] underline underline-offset-2"
            >
              {t('story.workspace.agentSkill.novelReference')}
            </Link>
            <Link
              href={`${SKILL_RAW_BASE}/SKILL.md`}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--t-accent)] underline underline-offset-2"
            >
              {t('story.workspace.agentSkill.unifiedSkill')}
            </Link>
          </div>
        </aside>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          role="tablist"
          aria-label={t('story.workspace.storyTabs')}
          className="flex flex-none items-stretch overflow-x-auto border-b border-[var(--t-noise)] px-2 sm:px-4"
        >
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={`story-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === item.id}
                aria-controls="story-workspace-panel"
                onClick={() => setActiveTab(item.id)}
                className={`relative inline-flex min-h-10 shrink-0 items-center gap-1.5 px-3 font-sans text-[12px] transition-colors ${activeTab === item.id ? 'text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[var(--t-accent)]' : 'text-[var(--t-sub)] hover:text-white/85'}`}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {t(item.key)}
              </button>
            );
          })}
        </div>
        <main className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-10">
          <div
            id="story-workspace-panel"
            role="tabpanel"
            aria-labelledby={`story-tab-${activeTab}`}
            className="mx-auto max-w-7xl"
          >
            {activeTab === 'overview' ? (
              <OverviewPanel
                data={data}
                onUpdateStage={updateStage}
                isUpdatingStage={isUpdatingStage}
                stageError={stageError}
                onOpenTab={setActiveTab}
                onOpenContext={openContext}
                onOpenActivity={openActivity}
                canEdit={canEdit}
                onEditMetadata={actions.onReviseStory}
              />
            ) : null}
            {activeTab === 'creation' ? (
              <div
                className={
                  activeContextPanel ? 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]' : ''
                }
              >
                <DocumentSection
                  documents={data.documents}
                  selectedDocument={currentDocument}
                  selectedDocumentId={selectedDocumentId}
                  documentSearch={documentSearch}
                  onDocumentSearchChange={onDocumentSearchChange}
                  isDocumentLoading={isDocumentLoading}
                  documentLoadError={documentLoadError}
                  onRetryDocument={onRetryDocument}
                  onSelectDocument={selectDocument}
                  hasMoreDocuments={hasMoreDocuments}
                  isLoadingMoreDocuments={isLoadingMoreDocuments}
                  onLoadMoreDocuments={onLoadMoreDocuments}
                  documentDirectoryLoading={documentDirectoryLoading}
                  documentDirectoryError={documentDirectoryError}
                  onRetryDocumentDirectory={onRetryDocumentDirectory}
                  onCreate={openCreateDocument}
                  canEdit={canEdit}
                  onOpenContext={setActiveContextPanel}
                  activeContextPanel={activeContextPanel}
                  onSave={actions.onSaveDocument}
                />
                {activeContextPanel ? (
                  <StoryContextPanel
                    key={`${selectedDocument?.id ?? 'story'}:${activeContextPanel}:${focusedDiscussionId ?? ''}`}
                    panel={activeContextPanel}
                    onSelectPanel={setActiveContextPanel}
                    onClose={() => setActiveContextPanel(null)}
                    story={data.story}
                    document={currentDocument}
                    documents={data.documents}
                    relatedDocumentsLoading={relatedDocumentsLoading}
                    relatedDocumentsError={relatedDocumentsError}
                    onRetryRelatedDocuments={onRetryRelatedDocuments}
                    revisions={data.revisions}
                    storyRevisions={data.storyRevisions}
                    reviews={data.reviews}
                    discussions={data.discussions}
                    initialDiscussionId={focusedDiscussionId ?? initialDiscussionId}
                    onDiscussionResolved={onDiscussionResolved}
                    branches={data.branches}
                    activeBranchId={activeBranchId}
                    canEdit={canEdit}
                    onCreateDiscussion={actions.onCreateDiscussion}
                    onCreateDiscussionMessage={actions.onCreateDiscussionMessage}
                    onLoadDiscussionMessages={actions.onLoadDiscussionMessages}
                    onCreateReview={actions.onCreateReview}
                    onCompareRevisions={actions.onCompareRevisions}
                    onRestoreRevision={actions.onRestoreRevision}
                    onRestoreStoryMetadata={actions.onRestoreStoryMetadata}
                    onSelectBranch={onSelectBranch}
                    onSelectDocument={selectDocument}
                    onCreateBranch={actions.onCreateBranch}
                    focusedRevision={focusedRevisionData}
                    onOpenRevision={openRevision}
                    hasMoreRevisions={hasMoreRevisions}
                    isLoadingMoreRevisions={isLoadingMoreRevisions}
                    onLoadMoreRevisions={onLoadMoreRevisions}
                    hasMoreDiscussions={hasMoreDiscussions}
                    isLoadingMoreDiscussions={isLoadingMoreDiscussions}
                    onLoadMoreDiscussions={onLoadMoreDiscussions}
                    discussionLoading={discussionLoading}
                    discussionError={discussionError}
                    onRetryDiscussions={onRetryDiscussions}
                    historyLoading={historyLoading}
                    historyError={historyError}
                    onRetryHistory={onRetryHistory}
                    reviewLoading={reviewLoading}
                    reviewError={reviewError}
                    onRetryReviews={onRetryReviews}
                  />
                ) : null}
              </div>
            ) : null}
            {activeTab === 'collaboration' ? (
              <div className="space-y-6">
                <ActivityFeed data={data} onOpenActivity={openActivity} />
                <StoryCollaborationPanel
                  conflicts={conflicts}
                  cases={cases}
                  discussions={data.discussions}
                  documents={data.documents}
                  selectedDocument={currentDocument}
                  revisions={apiRevisions}
                  currentAgentId={currentAgentId}
                  canEdit={canEdit}
                  onOpenRevision={openRevision}
                  onCreateCase={onCreateCollaborationCase}
                  onVote={onVoteOnCollaborationCase}
                  onAppeal={onAppealCollaborationCase}
                  hasMoreConflicts={hasMoreConflicts}
                  hasMoreCases={hasMoreCases}
                  isLoadingMoreConflicts={isLoadingMoreConflicts}
                  isLoadingMoreCases={isLoadingMoreCases}
                  isLoadingConflicts={isLoadingConflicts}
                  conflictLoadError={conflictLoadError}
                  isLoadingCases={isLoadingCases}
                  casesLoadError={casesLoadError}
                  onRetryConflicts={onRetryConflicts}
                  onRetryCases={onRetryCases}
                  onLoadMoreConflicts={onLoadMoreConflicts}
                  onLoadMoreCases={onLoadMoreCases}
                />
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {activeTab === 'creation' ? (
        <CreateDocumentDialog
          open={createDocumentOpen}
          onOpenChange={setCreateDocumentOpen}
          defaultKind={createDocumentKind}
          parentId={null}
          branchId={activeBranchId}
          documents={data.documents}
          onCreate={actions.onCreateDocument}
        />
      ) : null}
    </div>
  );
}

function OverviewPanel({
  data,
  onUpdateStage,
  isUpdatingStage,
  stageError,
  onOpenTab,
  onOpenContext,
  onOpenActivity,
  canEdit,
  onEditMetadata,
}: {
  data: StoryWorkspaceData;
  onUpdateStage: (stage: StoryStage) => void;
  isUpdatingStage: boolean;
  stageError: boolean;
  onOpenTab: (tab: WorkspaceTab) => void;
  onOpenContext: (panel: ContextPanel) => void;
  onOpenActivity: (activity: StoryActivity) => void;
  canEdit: boolean;
  onEditMetadata: StoryWorkspaceActions['onReviseStory'];
}) {
  const { t } = useTranslation();
  const story = data.story;
  const stageIndex = STORY_STAGES.indexOf(story.stage);
  const chapterCount = data.documents.filter((document) => document.kind === 'CHAPTER').length;

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-7">
        <section className="border-b border-[var(--t-noise)] pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--t-faint)]">STORY // {story.id}</span>
            <TTag color="accent">{t(`story.stages.${story.stage}`)}</TTag>
          </div>
          <h2 className="mt-3 max-w-4xl break-words text-2xl font-semibold text-white">
            {story.title}
          </h2>
          <p className="mt-2 max-w-4xl break-words font-sans text-[14px] leading-7 text-[var(--t-text)]">
            {story.premise}
          </p>
          {story.establishedDirection ? (
            <p className="mt-3 max-w-4xl whitespace-pre-wrap font-sans text-[12px] leading-6 text-[var(--t-sub)]">
              {story.establishedDirection}
            </p>
          ) : null}
          {story.genre || story.tone || story.viewpoint ? (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-sans text-[11px] text-[var(--t-faint)]">
              {story.genre ? (
                <span>
                  {t('story.create.genre')}: {story.genre}
                </span>
              ) : null}
              {story.tone ? (
                <span>
                  {t('story.workspace.tone')}: {story.tone}
                </span>
              ) : null}
              {story.viewpoint ? (
                <span>
                  {t('story.create.pointOfView')}: {story.viewpoint}
                </span>
              ) : null}
              {story.targetLength ? (
                <span>
                  {t('story.create.targetLength')}: {story.targetLength}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <TButton variant="primary" onClick={() => onOpenTab('creation')}>
              <ScrollText className="h-3.5 w-3.5" />
              {t('story.workspace.continueWriting')}
            </TButton>
            <TButton variant="secondary" onClick={() => onOpenTab('creation')}>
              <BookOpenText className="h-3.5 w-3.5" />
              {t('story.workspace.addSetting')}
            </TButton>
            <TButton variant="secondary" onClick={() => onOpenContext('history')}>
              {t('story.workspace.history.title')}
            </TButton>
            {canEdit ? <StoryMetadataEditButton story={story} onSave={onEditMetadata} /> : null}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-sans text-[12px] font-semibold text-white">
              {t('story.workspace.storyProgress')}
            </h3>
            <label className="flex items-center gap-2 font-sans text-[11px] text-[var(--t-sub)]">
              <span>{t('story.workspace.changeStage')}</span>
              <select
                value={story.stage}
                disabled={isUpdatingStage || !canEdit}
                onChange={(event) => onUpdateStage(event.target.value as StoryStage)}
                className="skynet-input h-8 min-w-[120px] px-2 font-sans text-[11px]"
              >
                {STORY_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {t(`story.stages.${stage}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-6">
            {STORY_STAGES.map((stage, index) => (
              <li key={stage} className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 ${index <= stageIndex ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-noise2)]'}`}
                />
                <span
                  className={`truncate font-sans text-[10px] ${index === stageIndex ? 'text-white' : 'text-[var(--t-faint)]'}`}
                >
                  {t(`story.stages.${stage}`)}
                </span>
              </li>
            ))}
          </ol>
          {stageError ? (
            <p role="alert" className="mt-2 font-sans text-[11px] text-[var(--t-hazard)]">
              {t('story.workspace.actionFailed')}
            </p>
          ) : null}
        </section>

        <TPanel title={t('story.workspace.latestActivity')}>
          {data.activities.length ? (
            <div className="divide-y divide-[var(--t-noise)]">
              {data.activities.slice(0, 8).map((activity) => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  onOpen={() => onOpenActivity(activity)}
                />
              ))}
            </div>
          ) : (
            <p className="py-3 font-sans text-[12px] text-[var(--t-faint)]">
              {t('story.workspace.noActivity')}
            </p>
          )}
        </TPanel>
      </div>

      <aside className="space-y-5 border-t border-[var(--t-noise)] pt-5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Metric
            icon={ScrollText}
            label={t('story.workspace.chapterProgress')}
            value={String(chapterCount)}
          />
          <Metric
            icon={CircleHelp}
            label={t('story.workspace.openQuestions')}
            value={String(story.openQuestions.length)}
          />
          <Metric
            icon={BookOpenText}
            label={t('story.workspace.fileCount')}
            value={String(data.documents.length)}
          />
        </div>

        {story.openQuestions.length ? (
          <TPanel title={t('story.workspace.openQuestions')}>
            <ul className="space-y-2">
              {story.openQuestions.map((question, index) => (
                <li
                  key={`${question}-${index}`}
                  className="flex gap-2 font-sans text-[12px] leading-5 text-[var(--t-text)]"
                >
                  <span className="font-mono text-[10px] text-[var(--t-faint)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          </TPanel>
        ) : null}

        <div className="border-t border-[var(--t-noise)] pt-4">
          <p className="mb-3 font-sans text-[10px] font-semibold text-[var(--t-faint)]">
            CONTRIBUTE
          </p>
          <div className="space-y-1">
            <QuickAction
              onClick={() => onOpenTab('creation')}
              icon={MessageSquareText}
              label={t('story.workspace.discussions.title')}
            />
            <QuickAction
              onClick={() => onOpenContext('reviews')}
              icon={Settings2}
              label={t('story.workspace.reviews.title')}
            />
            <QuickAction
              onClick={() => onOpenContext('branches')}
              icon={GitBranch}
              label={t('story.workspace.branches.title')}
            />
            <QuickAction
              onClick={() => onOpenContext('history')}
              icon={Activity}
              label={t('story.workspace.history.title')}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function DocumentSection({
  documents,
  selectedDocument,
  selectedDocumentId,
  documentSearch,
  onDocumentSearchChange,
  isDocumentLoading,
  documentLoadError,
  onRetryDocument,
  onSelectDocument,
  hasMoreDocuments,
  isLoadingMoreDocuments,
  onLoadMoreDocuments,
  documentDirectoryLoading,
  documentDirectoryError,
  onRetryDocumentDirectory,
  onCreate,
  onSave,
  onOpenContext,
  activeContextPanel,
  canEdit,
}: {
  documents: StoryDocumentSummary[];
  selectedDocument: StoryDocument | null;
  selectedDocumentId: string | null;
  documentSearch: string;
  onDocumentSearchChange: (value: string) => void;
  isDocumentLoading: boolean;
  documentLoadError: boolean;
  onRetryDocument: () => void;
  onSelectDocument: (id: string) => void;
  hasMoreDocuments: boolean;
  isLoadingMoreDocuments: boolean;
  onLoadMoreDocuments: () => void;
  documentDirectoryLoading: boolean;
  documentDirectoryError: boolean;
  onRetryDocumentDirectory: () => void;
  onCreate: (kind: StoryDocumentKind) => void;
  onSave: StoryWorkspaceActions['onSaveDocument'];
  onOpenContext: (panel: ContextPanel) => void;
  activeContextPanel: ContextPanel | null;
  canEdit: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-[var(--t-noise)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 border border-[var(--t-noise)] px-2">
            <Search aria-hidden="true" className="h-3 w-3 shrink-0 text-[var(--t-faint)]" />
            <input
              type="search"
              aria-label={t('story.workspace.searchDocuments')}
              value={documentSearch}
              onChange={(event) => onDocumentSearchChange(event.target.value)}
              placeholder={t('story.workspace.searchDocumentsPlaceholder')}
              className="h-8 min-w-0 w-full bg-transparent font-sans text-[11px] text-white outline-none placeholder:text-[var(--t-faint)]"
            />
          </label>
          <h2 className="sr-only font-sans text-[12px] font-semibold text-white">
            {t('story.workspace.documentTitle')}
          </h2>
        </div>
        {documentDirectoryError ? (
          <ErrorState
            message={t('story.workspace.documentDirectoryLoadFailed')}
            actionLabel={t('app.retry')}
            onAction={onRetryDocumentDirectory}
          />
        ) : null}
        {documentDirectoryLoading && documents.length === 0 ? (
          <InlineLoading label={t('story.workspace.loadingDocuments')} />
        ) : null}
        {documents.length ? (
          <div className="max-h-[calc(100vh-180px)] space-y-2 overflow-y-auto pr-1">
            {DOCUMENT_GROUPS.map((group) => {
              const groupDocuments = documents.filter((document) =>
                group.kinds.includes(document.kind),
              );
              const tree = buildDocumentTree(groupDocuments);
              return (
                <details
                  key={group.id}
                  open
                  className="border-t border-[var(--t-noise)] pt-2 first:border-t-0 first:pt-0"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 font-sans text-[11px] font-medium text-[var(--t-sub)]">
                    <span className="min-w-0 truncate">{t(group.key)}</span>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] text-[var(--t-faint)]">
                      {groupDocuments.length}
                      {canEdit ? (
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center border border-[var(--t-noise)] text-[var(--t-sub)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                          aria-label={`${t('story.workspace.createDocument')}: ${t(group.key)}`}
                          title={`${t('story.workspace.createDocument')}: ${t(group.key)}`}
                          onClick={(event) => {
                            event.preventDefault();
                            onCreate(group.defaultKind);
                          }}
                        >
                          <FilePlus2 aria-hidden="true" className="h-3 w-3" />
                        </button>
                      ) : null}
                    </span>
                  </summary>
                  {tree.length ? (
                    <DocumentTree
                      nodes={tree}
                      selectedDocumentId={selectedDocumentId}
                      onSelectDocument={onSelectDocument}
                    />
                  ) : (
                    <p className="px-2 py-2 font-sans text-[10px] text-[var(--t-faint)]">
                      {t('story.workspace.creation.emptyGroup')}
                    </p>
                  )}
                </details>
              );
            })}
          </div>
        ) : documentDirectoryLoading || documentDirectoryError ? null : documentSearch.trim() ? (
          <p className="py-5 font-sans text-[11px] text-[var(--t-faint)]">
            {t('story.workspace.noDocumentSearchResults')}
          </p>
        ) : (
          <div className="py-5">
            <p className="mb-3 font-sans text-[12px] leading-5 text-[var(--t-faint)]">
              {t('story.workspace.emptyDocuments')}
            </p>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <TButton size="sm" variant="secondary" onClick={() => onCreate('WORLD_SETTING')}>
                  <FilePlus2 className="h-3.5 w-3.5" />
                  {t('story.workspace.creation.groups.materials')}
                </TButton>
                <TButton size="sm" variant="secondary" onClick={() => onCreate('OUTLINE')}>
                  <FilePlus2 className="h-3.5 w-3.5" />
                  {t('story.workspace.kind.OUTLINE')}
                </TButton>
                <TButton size="sm" variant="secondary" onClick={() => onCreate('CHAPTER')}>
                  <FilePlus2 className="h-3.5 w-3.5" />
                  {t('story.workspace.kind.CHAPTER')}
                </TButton>
              </div>
            ) : null}
          </div>
        )}
        {hasMoreDocuments ? (
          <div className="mt-2">
            <TButton
              size="sm"
              variant="secondary"
              disabled={isLoadingMoreDocuments}
              onClick={onLoadMoreDocuments}
            >
              {t(
                isLoadingMoreDocuments
                  ? 'story.workspace.loadingMoreDocuments'
                  : 'story.workspace.loadMoreDocuments',
              )}
            </TButton>
          </div>
        ) : null}
      </aside>
      <section className="min-w-0">
        {selectedDocument ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--t-noise)] pb-2">
              <p className="min-w-0 truncate font-sans text-[10px] text-[var(--t-faint)]">
                {t(`story.workspace.kind.${selectedDocument.kind}`)}
                <span className="px-1.5 text-[var(--t-noise2)]">/</span>
                {t('story.workspace.editor.version', { version: selectedDocument.currentVersion })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <ContextAction
                  active={activeContextPanel === 'discussions'}
                  icon={MessageSquareText}
                  label={t('story.workspace.discussions.title')}
                  onClick={() => onOpenContext('discussions')}
                />
                <ContextAction
                  active={activeContextPanel === 'history'}
                  icon={Activity}
                  label={t('story.workspace.history.title')}
                  onClick={() => onOpenContext('history')}
                />
                <ContextAction
                  active={activeContextPanel === 'reviews'}
                  icon={Settings2}
                  label={t('story.workspace.reviews.title')}
                  onClick={() => onOpenContext('reviews')}
                />
              </div>
            </div>
            <StoryDocumentEditor
              document={selectedDocument}
              onSave={onSave}
              onOpenHistory={() => onOpenContext('history')}
            />
          </div>
        ) : isDocumentLoading ? (
          <InlineLoading label={t('story.workspace.loadingDocument')} />
        ) : documentLoadError ? (
          <ErrorState
            title={t('story.workspace.documentLoadFailed')}
            message={t('story.workspace.documentLoadFailed')}
            actionLabel={t('app.retry')}
            onAction={onRetryDocument}
          />
        ) : (
          <div className="flex min-h-56 items-center justify-center border border-dashed border-[var(--t-noise)] px-4 text-center">
            <p className="font-sans text-[12px] text-[var(--t-faint)]">
              {t('story.workspace.emptyDocuments')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

interface StoryDocumentTreeNode {
  document: StoryDocumentSummary;
  children: StoryDocumentTreeNode[];
}

function buildDocumentTree(documents: StoryDocumentSummary[]): StoryDocumentTreeNode[] {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const childrenByParent = new Map<string | null, StoryDocumentSummary[]>();
  for (const document of documents) {
    const parentId =
      document.links.find(
        (link) => link.relation === 'part_of' && documentsById.has(link.targetDocumentId),
      )?.targetDocumentId ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(document);
    childrenByParent.set(parentId, siblings);
  }

  const builtIds = new Set<string>();
  const buildNode = (
    document: StoryDocumentSummary,
    ancestors: Set<string>,
  ): StoryDocumentTreeNode => {
    builtIds.add(document.id);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(document.id);
    const children = (childrenByParent.get(document.id) ?? []).flatMap((child) =>
      nextAncestors.has(child.id) || builtIds.has(child.id)
        ? []
        : [buildNode(child, nextAncestors)],
    );
    return { document, children };
  };

  const roots = (childrenByParent.get(null) ?? []).map((document) =>
    buildNode(document, new Set()),
  );
  for (const document of documents) {
    if (!builtIds.has(document.id)) roots.push(buildNode(document, new Set()));
  }
  return roots;
}

function DocumentTree({
  nodes,
  selectedDocumentId,
  onSelectDocument,
}: {
  nodes: StoryDocumentTreeNode[];
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5">
      {nodes.map(({ document, children }) => (
        <li key={document.id}>
          <button
            type="button"
            onClick={() => onSelectDocument(document.id)}
            aria-current={document.id === selectedDocumentId ? 'page' : undefined}
            className={`flex w-full min-w-0 items-start gap-2 border-l-2 px-2 py-1.5 text-left transition-colors ${document.id === selectedDocumentId ? 'border-[var(--t-accent)] bg-[var(--t-accent-wash)] text-white' : 'border-transparent text-[var(--t-sub)] hover:bg-white/[0.025] hover:text-white'}`}
          >
            <span aria-hidden="true" className="mt-0.5 font-mono text-[9px] text-[var(--t-faint)]">
              {String(document.currentVersion).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words font-sans text-[11px] leading-4">
                {document.title}
              </span>
              <span className="block font-sans text-[9px] text-[var(--t-faint)]">
                {t(`story.workspace.kind.${document.kind}`)}
              </span>
            </span>
          </button>
          {children.length ? (
            <ul className="ml-3 border-l border-[var(--t-noise)] pl-2">
              {children.map((child) => (
                <DocumentTreeBranch
                  key={child.document.id}
                  node={child}
                  selectedDocumentId={selectedDocumentId}
                  onSelectDocument={onSelectDocument}
                />
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DocumentTreeBranch({
  node,
  selectedDocumentId,
  onSelectDocument,
}: {
  node: StoryDocumentTreeNode;
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { document, children } = node;
  const isSelected = document.id === selectedDocumentId;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectDocument(document.id)}
        aria-current={isSelected ? 'page' : undefined}
        className={`flex w-full min-w-0 items-start gap-2 border-l-2 px-2 py-1.5 text-left transition-colors ${isSelected ? 'border-[var(--t-accent)] bg-[var(--t-accent-wash)] text-white' : 'border-transparent text-[var(--t-sub)] hover:bg-white/[0.025] hover:text-white'}`}
      >
        <span aria-hidden="true" className="mt-0.5 font-mono text-[9px] text-[var(--t-faint)]">
          {String(document.currentVersion).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-sans text-[11px] leading-4">
            {document.title}
          </span>
          <span className="block font-sans text-[9px] text-[var(--t-faint)]">
            {t(`story.workspace.kind.${document.kind}`)}
          </span>
        </span>
      </button>
      {children.length ? (
        <ul className="ml-3 border-l border-[var(--t-noise)] pl-2">
          {children.map((child) => (
            <DocumentTreeBranch
              key={child.document.id}
              node={child}
              selectedDocumentId={selectedDocumentId}
              onSelectDocument={onSelectDocument}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ContextAction({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof MessageSquareText;
  label: string;
  onClick: () => void;
}) {
  return (
    <TButton
      size="sm"
      variant={active ? 'primary' : 'secondary'}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {label}
    </TButton>
  );
}

function ActivityFeed({
  data,
  onOpenActivity,
}: {
  data: StoryWorkspaceData;
  onOpenActivity: (activity: StoryActivity) => void;
}) {
  const { t } = useTranslation();
  const activities: StoryActivity[] = [
    ...data.activities,
    ...data.discussions.map(
      (discussion): StoryActivity => ({
        id: `discussion:${discussion.id}`,
        kind: 'DISCUSSION',
        revisionNumber: discussion.revisionNumber,
        branchId: discussion.branchId,
        title: discussion.title,
        summary:
          discussion.anchorText ??
          t('story.workspace.discussions.linkedRevision', {
            version: discussion.revisionNumber,
          }),
        authorName: discussion.createdByAgentId,
        createdAt: discussion.createdAt,
        documentId: discussion.documentId,
      }),
    ),
    ...data.reviews.map(
      (review): StoryActivity => ({
        id: `review:${review.id}`,
        kind: 'REVIEW',
        revisionNumber: review.revisionNumber,
        branchId:
          data.documents.find((document) => document.id === review.documentId)?.branchId ?? null,
        title: t('story.workspace.reviews.title'),
        summary: review.content,
        authorName: review.authorAgentId,
        createdAt: review.createdAt,
        documentId: review.documentId,
      }),
    ),
    ...data.branches.map(
      (branch): StoryActivity => ({
        id: `branch:${branch.id}`,
        kind: 'BRANCH',
        revisionNumber: branch.sourceRevisionNumber,
        branchId: branch.id,
        title: branch.title,
        summary: branch.premise,
        authorName: branch.createdByAgentId,
        createdAt: branch.createdAt,
        documentId: branch.sourceDocumentId,
      }),
    ),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <TPanel title={t('story.workspace.latestActivity')}>
      {activities.length ? (
        <div className="divide-y divide-[var(--t-noise)]">
          {activities.slice(0, 50).map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              onOpen={() => onOpenActivity(activity)}
            />
          ))}
        </div>
      ) : (
        <p className="py-3 font-sans text-[12px] text-[var(--t-faint)]">
          {t('story.workspace.noActivity')}
        </p>
      )}
    </TPanel>
  );
}

function StoryContextPanel({
  panel,
  onSelectPanel,
  onClose,
  story,
  document,
  documents,
  revisions,
  storyRevisions,
  reviews,
  discussions,
  branches,
  activeBranchId,
  canEdit,
  onCreateDiscussion,
  onCreateDiscussionMessage,
  onLoadDiscussionMessages,
  initialDiscussionId,
  onDiscussionResolved,
  onCreateReview,
  onCompareRevisions,
  onRestoreRevision,
  onRestoreStoryMetadata,
  onSelectBranch,
  onSelectDocument,
  onCreateBranch,
  focusedRevision,
  onOpenRevision,
  relatedDocumentsLoading,
  relatedDocumentsError,
  onRetryRelatedDocuments,
  hasMoreRevisions,
  isLoadingMoreRevisions,
  onLoadMoreRevisions,
  hasMoreDiscussions,
  isLoadingMoreDiscussions,
  onLoadMoreDiscussions,
  discussionLoading,
  discussionError,
  onRetryDiscussions,
  historyLoading,
  historyError,
  onRetryHistory,
  reviewLoading,
  reviewError,
  onRetryReviews,
}: {
  panel: ContextPanel;
  onSelectPanel: (panel: ContextPanel) => void;
  onClose: () => void;
  story: StoryWorkspaceData['story'];
  document: StoryDocument | null;
  documents: StoryDocumentSummary[];
  revisions: StoryWorkspaceData['revisions'];
  storyRevisions: StoryWorkspaceData['storyRevisions'];
  reviews: StoryWorkspaceData['reviews'];
  discussions: StoryWorkspaceData['discussions'];
  branches: StoryWorkspaceData['branches'];
  activeBranchId: string | null;
  canEdit: boolean;
  onCreateDiscussion: StoryWorkspaceActions['onCreateDiscussion'];
  onCreateDiscussionMessage: StoryWorkspaceActions['onCreateDiscussionMessage'];
  onLoadDiscussionMessages: StoryWorkspaceActions['onLoadDiscussionMessages'];
  initialDiscussionId?: string | null;
  onDiscussionResolved?: () => void;
  onCreateReview: StoryWorkspaceActions['onCreateReview'];
  onCompareRevisions: StoryWorkspaceActions['onCompareRevisions'];
  onRestoreRevision: StoryWorkspaceActions['onRestoreRevision'];
  onRestoreStoryMetadata: StoryWorkspaceActions['onRestoreStoryMetadata'];
  onSelectBranch: (branchId: string | null) => void;
  onSelectDocument: (documentId: string) => void;
  onCreateBranch: StoryWorkspaceActions['onCreateBranch'];
  focusedRevision: StoryRevision | null;
  onOpenRevision: (documentId: string, revisionNumber: number) => void;
  relatedDocumentsLoading: boolean;
  relatedDocumentsError: boolean;
  onRetryRelatedDocuments: () => void;
  hasMoreRevisions: boolean;
  isLoadingMoreRevisions: boolean;
  onLoadMoreRevisions: () => void;
  hasMoreDiscussions: boolean;
  isLoadingMoreDiscussions: boolean;
  onLoadMoreDiscussions: () => void;
  discussionLoading: boolean;
  discussionError: boolean;
  onRetryDiscussions: () => void;
  historyLoading: boolean;
  historyError: boolean;
  onRetryHistory: () => void;
  reviewLoading: boolean;
  reviewError: boolean;
  onRetryReviews: () => void;
}) {
  const { t, i18n } = useTranslation();
  const panelItems: Array<{ id: ContextPanel; key: string; icon: typeof MessageSquareText }> = [
    { id: 'related', key: 'story.workspace.context.related', icon: Link2 },
    { id: 'discussions', key: 'story.workspace.discussions.title', icon: MessageSquareText },
    { id: 'history', key: 'story.workspace.history.title', icon: Activity },
    { id: 'reviews', key: 'story.workspace.reviews.title', icon: Settings2 },
    { id: 'branches', key: 'story.workspace.branches.title', icon: GitBranch },
  ];
  const focusedAfter = focusedRevision?.diff.afterDocument;
  const focusedStoryAfter = focusedRevision?.diff.afterStory;
  const contextDocument =
    document && focusedRevision?.documentId === document.id && focusedAfter
      ? {
          ...document,
          currentVersion: focusedRevision.revisionNumber,
          title: focusedAfter.title,
          kind: focusedAfter.kind,
          content: focusedAfter.content,
          branchId: focusedAfter.branchId,
          links: focusedAfter.links,
        }
      : document;
  const contextReviews = contextDocument
    ? reviews.filter(
        (review) =>
          review.documentId === contextDocument.id &&
          review.revisionNumber === contextDocument.currentVersion,
      )
    : [];

  return (
    <aside className="min-w-0 self-start border border-[var(--t-noise)] bg-black/40 xl:max-h-[calc(100vh-150px)] xl:overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-[var(--t-noise)] bg-black/95 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate font-sans text-[12px] font-semibold text-white">
            {document?.title ?? t('story.workspace.context.title')}
          </h2>
          <TButton
            size="sm"
            variant="secondary"
            onClick={onClose}
            aria-label={t('app.close')}
            title={t('app.close')}
          >
            <span aria-hidden="true">×</span>
          </TButton>
        </div>
        <nav
          aria-label={t('story.workspace.context.title')}
          className="mt-2 grid grid-cols-2 gap-1"
        >
          {panelItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={panel === item.id ? 'page' : undefined}
                onClick={() => onSelectPanel(item.id)}
                className={`inline-flex min-h-8 min-w-0 items-center gap-1.5 border px-2 font-sans text-[10px] transition-colors ${panel === item.id ? 'border-[var(--t-accent)] bg-[var(--t-accent-wash)] text-white' : 'border-[var(--t-noise)] text-[var(--t-sub)] hover:text-white'}`}
              >
                <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span className="truncate">{t(item.key)}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <div className="space-y-4 p-3">
        {panel === 'related' ? (
          <RelatedDocumentsPanel
            document={document}
            documents={documents}
            isLoading={relatedDocumentsLoading}
            loadError={relatedDocumentsError}
            onRetry={onRetryRelatedDocuments}
            onSelectDocument={onSelectDocument}
          />
        ) : null}
        {panel === 'discussions' && discussionError ? (
          <ErrorState
            message={t('story.workspace.discussions.loadFailed')}
            actionLabel={t('app.retry')}
            onAction={onRetryDiscussions}
          />
        ) : null}
        {panel === 'discussions' && discussionLoading ? (
          <InlineLoading label={t('story.workspace.discussions.loading')} />
        ) : null}
        {panel === 'discussions' && !discussionError && !discussionLoading ? (
          <StoryDiscussionPanel
            discussions={discussions}
            document={contextDocument}
            onCreate={onCreateDiscussion}
            onCreateMessage={onCreateDiscussionMessage}
            onLoadMessages={onLoadDiscussionMessages}
            initialDiscussionId={initialDiscussionId}
            onDiscussionResolved={onDiscussionResolved}
            hasMoreDiscussions={hasMoreDiscussions}
            isLoadingMoreDiscussions={isLoadingMoreDiscussions}
            onLoadMoreDiscussions={onLoadMoreDiscussions}
          />
        ) : null}
        {panel === 'reviews' && reviewError ? (
          <ErrorState
            message={t('story.workspace.reviews.loadFailed')}
            actionLabel={t('app.retry')}
            onAction={onRetryReviews}
          />
        ) : null}
        {panel === 'reviews' && reviewLoading ? (
          <InlineLoading label={t('story.workspace.reviews.loading')} />
        ) : null}
        {panel === 'reviews' && !reviewError && !reviewLoading ? (
          <StoryReviewPanel
            reviews={contextReviews}
            document={contextDocument}
            onCreate={onCreateReview}
          />
        ) : null}
        {panel === 'branches' ? (
          <StoryBranchPanel
            branches={branches}
            document={contextDocument}
            canEdit={canEdit}
            activeBranchId={activeBranchId}
            onSelectBranch={onSelectBranch}
            onCreate={onCreateBranch}
          />
        ) : null}
        {panel === 'history' && historyError ? (
          <ErrorState
            message={t('story.workspace.history.loadFailed')}
            actionLabel={t('app.retry')}
            onAction={onRetryHistory}
          />
        ) : null}
        {panel === 'history' && historyLoading ? (
          <InlineLoading label={t('story.workspace.history.loading')} />
        ) : null}
        {panel === 'history' && !historyError && !historyLoading ? (
          <div className="space-y-4">
            {focusedRevision && (focusedAfter || focusedStoryAfter) ? (
              <TPanel title={t('story.workspace.context.focusedRevision')}>
                <div className="mb-2 flex flex-wrap items-center gap-2 font-sans text-[10px] text-[var(--t-faint)]">
                  <TTag color="accent">
                    {t('story.workspace.editor.version', {
                      version: focusedRevision.revisionNumber,
                    })}
                  </TTag>
                  <span>{focusedRevision.authorAgentId}</span>
                  <span>{formatDate(focusedRevision.createdAt, i18n.language)}</span>
                </div>
                <p className="mb-3 break-words font-sans text-[12px] text-white">
                  {focusedRevision.changeSummary}
                </p>
                {focusedAfter ? (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-[var(--t-noise)] pt-3 font-mono text-[10px] leading-5 text-[var(--t-text)]">
                    {focusedAfter.content || ' '}
                  </pre>
                ) : focusedStoryAfter ? (
                  <div className="space-y-2 border-t border-[var(--t-noise)] pt-3 font-sans text-[11px] leading-5 text-[var(--t-text)]">
                    <p className="font-semibold text-white">{focusedStoryAfter.title}</p>
                    <p>{focusedStoryAfter.premise}</p>
                    <p className="text-[var(--t-faint)]">
                      {t(`story.stages.${focusedStoryAfter.stage}`)}
                    </p>
                  </div>
                ) : null}
              </TPanel>
            ) : null}
            {document ? (
              <StoryRevisionHistoryPanel
                key={document.id}
                document={document}
                revisions={revisions}
                onCompare={onCompareRevisions}
                onRestore={onRestoreRevision}
                hasMore={hasMoreRevisions}
                isLoadingMore={isLoadingMoreRevisions}
                onLoadMore={onLoadMoreRevisions}
              />
            ) : null}
            <details
              open={focusedRevision?.documentId === null}
              className="border border-[var(--t-noise)] px-2.5 py-2"
            >
              <summary className="cursor-pointer font-sans text-[11px] text-[var(--t-sub)]">
                {t('story.workspace.context.storyHistory')}
              </summary>
              <div className="mt-3">
                <StoryMetadataHistoryPanel
                  story={story}
                  revisions={storyRevisions}
                  canEdit={canEdit}
                  onRestore={onRestoreStoryMetadata}
                />
              </div>
            </details>
            {!focusedRevision && document ? (
              <button
                type="button"
                className="w-full border border-[var(--t-noise)] px-2 py-2 text-left font-sans text-[10px] text-[var(--t-sub)] hover:border-[var(--t-accent)] hover:text-white"
                onClick={() => onOpenRevision(document.id, document.currentVersion)}
              >
                {t('story.workspace.context.openCurrentRevision', {
                  version: document.currentVersion,
                })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function RelatedDocumentsPanel({
  document,
  documents,
  isLoading,
  loadError,
  onRetry,
  onSelectDocument,
}: {
  document: StoryDocument | null;
  documents: StoryDocumentSummary[];
  isLoading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onSelectDocument: (documentId: string) => void;
}) {
  const { t } = useTranslation();
  if (!document) {
    return (
      <p className="font-sans text-[11px] text-[var(--t-faint)]">
        {t('story.workspace.noSelection')}
      </p>
    );
  }

  const documentById = new Map(documents.map((item) => [item.id, item]));
  const missingRelatedDocuments =
    !isLoading && document.links.some((link) => !documentById.has(link.targetDocumentId));
  const relationships = [
    ...document.links.map((link) => ({
      document: documentById.get(link.targetDocumentId) ?? null,
      documentId: link.targetDocumentId,
      relation: link.relation,
      direction: 'outgoing' as const,
    })),
    ...documents.flatMap((source) =>
      source.links
        .filter((link) => link.targetDocumentId === document.id)
        .map((link) => ({
          document: source,
          documentId: source.id,
          relation: link.relation,
          direction: 'incoming' as const,
        })),
    ),
  ];

  return (
    <TPanel title={t('story.workspace.context.related')}>
      {loadError || missingRelatedDocuments ? (
        <ErrorState
          message={t('story.workspace.context.relatedLoadFailed')}
          actionLabel={t('app.retry')}
          onAction={onRetry}
        />
      ) : null}
      {isLoading ? (
        <InlineLoading label={t('story.workspace.context.loadingRelated')} />
      ) : relationships.length ? (
        <ul className="divide-y divide-[var(--t-noise)]">
          {relationships.map((relationship) => (
            <li
              key={`${relationship.direction}:${relationship.documentId}:${relationship.relation}`}
            >
              <button
                type="button"
                onClick={() => onSelectDocument(relationship.documentId)}
                className="flex w-full items-start justify-between gap-3 py-2 text-left hover:text-[var(--t-accent)]"
              >
                <span className="min-w-0">
                  <span className="block break-words font-sans text-[11px] font-medium">
                    {relationship.document?.title ?? relationship.documentId}
                  </span>
                  <span className="mt-0.5 block font-sans text-[9px] text-[var(--t-faint)]">
                    {relationship.document
                      ? t(`story.workspace.kind.${relationship.document.kind}`)
                      : t('story.workspace.relatedMaterial')}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[9px] text-[var(--t-faint)]">
                  {relationship.direction === 'outgoing' ? '→' : '←'} {relationship.relation}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : loadError || missingRelatedDocuments ? null : (
        <p className="py-2 font-sans text-[11px] text-[var(--t-faint)]">
          {t('story.workspace.context.noRelated')}
        </p>
      )}
    </TPanel>
  );
}

function CreateDocumentDialog({
  open,
  onOpenChange,
  defaultKind,
  parentId,
  branchId,
  documents,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind: StoryDocumentKind;
  parentId: string | null;
  branchId: string | null;
  documents: StoryDocumentSummary[];
  onCreate: StoryWorkspaceActions['onCreateDocument'];
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<StoryDocumentKind>(defaultKind);
  const [selectedParentId, setSelectedParentId] = useState(parentId ?? '');
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTitle('');
      setKind(defaultKind);
      setSelectedParentId(parentId ?? '');
      setError(false);
    }
    onOpenChange(nextOpen);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setError(false);
    setIsSubmitting(true);
    try {
      await onCreate({ title: title.trim(), kind, parentId: selectedParentId || null, branchId });
      reset(false);
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TerminalDialog
      open={open}
      onOpenChange={reset}
      title={t('story.workspace.createDocument')}
      description={t('story.workspace.createDocumentDescription')}
      code="STORY.FILE"
      size="md"
      busy={isSubmitting}
      footer={
        <>
          <TButton variant="secondary" disabled={isSubmitting} onClick={() => reset(false)}>
            {t('app.cancel')}
          </TButton>
          <TButton
            type="submit"
            form="create-story-document"
            disabled={isSubmitting || !title.trim()}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            {t('story.workspace.createDocument')}
          </TButton>
        </>
      }
    >
      <form
        id="create-story-document"
        className="space-y-3"
        onSubmit={(event) => void submit(event)}
      >
        <label className="block space-y-1.5">
          <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
            {t('story.workspace.documentTitle')}
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
            maxLength={160}
            autoFocus
          />
        </label>
        <label className="block space-y-1.5">
          <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
            {t('story.workspace.documentKind')}
          </span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as StoryDocumentKind)}
            className="skynet-input h-10 w-full px-3 font-sans text-[12px]"
          >
            {DOCUMENT_GROUPS.flatMap((group) => group.kinds)
              .filter((item, index, list) => list.indexOf(item) === index)
              .map((item) => (
                <option key={item} value={item}>
                  {t(`story.workspace.kind.${item}`)}
                </option>
              ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">
            {t('story.workspace.parentDocument')}
          </span>
          <select
            value={selectedParentId}
            onChange={(event) => setSelectedParentId(event.target.value)}
            className="skynet-input h-10 w-full px-3 font-sans text-[12px]"
          >
            <option value="">—</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.title}
              </option>
            ))}
          </select>
        </label>
        {error ? (
          <p role="alert" className="font-sans text-[12px] text-[var(--t-hazard)]">
            {t('story.workspace.actionFailed')}
          </p>
        ) : null}
      </form>
    </TerminalDialog>
  );
}

function ActivityRow({ activity, onOpen }: { activity: StoryActivity; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const canOpen = activity.revisionNumber !== null;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!canOpen}
      className="flex w-full min-w-0 items-start justify-between gap-3 py-3 text-left transition-colors first:pt-0 last:pb-0 enabled:hover:text-[var(--t-accent)] disabled:cursor-default"
    >
      <span className="min-w-0">
        <span className="block break-words font-sans text-[12px] font-medium text-white">
          {activity.title}
        </span>
        <span className="mt-1 block break-words font-sans text-[11px] leading-5 text-[var(--t-sub)]">
          {activity.summary}
        </span>
        <span className="mt-1 block font-sans text-[10px] text-[var(--t-faint)]">
          {activity.authorName}
        </span>
      </span>
      <span className="shrink-0 font-sans text-[10px] text-[var(--t-faint)]">
        {formatDate(activity.createdAt, i18n.language)}
      </span>
    </button>
  );
}

function StoryMetadataEditButton({
  story,
  onSave,
}: {
  story: StoryWorkspaceData['story'];
  onSave: StoryWorkspaceActions['onReviseStory'];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(story.title);
  const [premise, setPremise] = useState(story.premise);
  const [genre, setGenre] = useState(story.genre ?? '');
  const [tone, setTone] = useState(story.tone ?? '');
  const [viewpoint, setViewpoint] = useState(story.viewpoint ?? '');
  const [targetLength, setTargetLength] = useState(story.targetLength ?? '');
  const [establishedDirection, setEstablishedDirection] = useState(
    story.establishedDirection ?? '',
  );
  const [openQuestions, setOpenQuestions] = useState(story.openQuestions.join('\n'));
  const [changeSummary, setChangeSummary] = useState('');
  const [error, setError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !premise.trim() || !changeSummary.trim()) return;
    setIsSaving(true);
    setError(false);
    try {
      await onSave({
        expectedVersion: story.currentVersion,
        changeSummary: changeSummary.trim(),
        title: title.trim(),
        premise: premise.trim(),
        genre: genre.trim() || null,
        tone: tone.trim() || null,
        viewpoint: viewpoint.trim() || null,
        targetLength: targetLength.trim() || null,
        establishedDirection: establishedDirection.trim() || null,
        openQuestions: openQuestions
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setOpen(false);
      setChangeSummary('');
    } catch {
      setError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <TButton variant="secondary" onClick={() => setOpen(true)}>
        <Settings2 className="h-3.5 w-3.5" />
        {t('story.workspace.editOpening')}
      </TButton>
      <TerminalDialog
        open={open}
        onOpenChange={setOpen}
        title={t('story.workspace.editOpening')}
        description={t('story.workspace.editOpeningDescription')}
        code="STORY.METADATA"
        size="lg"
        busy={isSaving}
        footer={
          <>
            <TButton variant="secondary" onClick={() => setOpen(false)} disabled={isSaving}>
              {t('app.cancel')}
            </TButton>
            <TButton
              type="submit"
              form="story-metadata-form"
              disabled={isSaving || !title.trim() || !premise.trim() || !changeSummary.trim()}
            >
              {t('story.workspace.saveMetadata')}
            </TButton>
          </>
        }
      >
        <form
          id="story-metadata-form"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => void submit(event)}
        >
          <MetadataField label={t('story.create.storyTitle')}>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
            />
          </MetadataField>
          <MetadataField label={t('story.create.genre')}>
            <input
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
              maxLength={100}
              className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
            />
          </MetadataField>
          <MetadataField className="sm:col-span-2" label={t('story.create.premise')}>
            <TTextarea
              value={premise}
              onChange={(event) => setPremise(event.target.value)}
              rows={2}
              maxLength={4000}
            />
          </MetadataField>
          <MetadataField label={t('story.create.tone')}>
            <input
              value={tone}
              onChange={(event) => setTone(event.target.value)}
              maxLength={1000}
              className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
            />
          </MetadataField>
          <MetadataField label={t('story.create.pointOfView')}>
            <input
              value={viewpoint}
              onChange={(event) => setViewpoint(event.target.value)}
              maxLength={500}
              className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
            />
          </MetadataField>
          <MetadataField label={t('story.create.targetLength')}>
            <input
              value={targetLength}
              onChange={(event) => setTargetLength(event.target.value)}
              maxLength={200}
              className="skynet-input h-10 w-full px-3 font-sans text-[13px]"
            />
          </MetadataField>
          <MetadataField className="sm:col-span-2" label={t('story.create.descriptionLabel')}>
            <TTextarea
              value={establishedDirection}
              onChange={(event) => setEstablishedDirection(event.target.value)}
              rows={3}
              maxLength={4000}
            />
          </MetadataField>
          <MetadataField className="sm:col-span-2" label={t('story.create.openQuestions')}>
            <TTextarea
              value={openQuestions}
              onChange={(event) => setOpenQuestions(event.target.value)}
              rows={3}
            />
          </MetadataField>
          <MetadataField className="sm:col-span-2" label={t('story.workspace.editor.summary')}>
            <TTextarea
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              rows={2}
              maxLength={280}
            />
          </MetadataField>
          {error ? (
            <p role="alert" className="sm:col-span-2 font-sans text-[12px] text-[var(--t-hazard)]">
              {t('story.workspace.actionFailed')}
            </p>
          ) : null}
        </form>
      </TerminalDialog>
    </>
  );
}

function MetadataField({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="font-sans text-[11px] font-medium text-[var(--t-sub)]">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 border-b border-[var(--t-noise)] pb-3">
      <div className="mb-2 flex items-center gap-1.5 font-sans text-[10px] text-[var(--t-faint)]">
        <Icon aria-hidden="true" className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </div>
      <p className="font-mono text-[18px] leading-none text-white">{value}</p>
      {detail ? (
        <p className="mt-1.5 font-sans text-[10px] text-[var(--t-faint)]">{detail}</p>
      ) : null}
    </div>
  );
}

function QuickAction({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: typeof UsersRound;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-[var(--t-noise)] py-2 text-left font-sans text-[11px] text-[var(--t-sub)] transition-colors last:border-b-0 hover:text-[var(--t-accent)]"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function formatDate(value: string, language: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language.startsWith('zh') ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
