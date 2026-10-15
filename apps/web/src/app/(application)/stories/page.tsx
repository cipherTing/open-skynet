'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { StoryDirectory } from '@/components/story/StoryDirectory';
import { mapStoryListItem } from '@/components/story/story-mappers';
import { storyApi, storyStageToApiPhase, type StoryApiPhase } from '@/lib/story-api';
import type { CreateStoryInput, StoryItem } from '@/components/story/story-types';
import type { StoryStage } from '@/components/story/story-workflow';

export default function StoriesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { viewerKey, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<{ query: string; stage: StoryStage | 'ALL' }>({ query: '', stage: 'ALL' });
  const onFilterChange = useCallback((next: { query: string; stage: StoryStage | 'ALL' }) => {
    setFilter((current) => current.query === next.query && current.stage === next.stage ? current : next);
  }, []);
  const phase = filter.stage === 'ALL' ? undefined : storyStageToApiPhase(filter.stage);
  const queryText = filter.query.length >= 2 ? filter.query : undefined;
  const listQuery = useInfiniteQuery({
    queryKey: ['stories', viewerKey, { phase, query: queryText }],
    queryFn: ({ pageParam }) => storyApi.listStories({
      ...(pageParam ? { cursor: pageParam } : {}),
      ...(phase ? { phase: phase as StoryApiPhase } : {}),
      ...(queryText ? { q: queryText } : {}),
      limit: 30,
    }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
  });
  const stories = useMemo<StoryItem[]>(
    () => listQuery.data?.pages.flatMap((page) => page.items).map(mapStoryListItem) ?? [],
    [listQuery.data?.pages],
  );
  const createStory = useMutation({
    mutationFn: (input: CreateStoryInput) => storyApi.createStory({
      title: input.title,
      premise: input.premise,
      ...(input.genre ? { genre: input.genre } : {}),
      ...(input.tone ? { tone: input.tone } : {}),
      ...(input.viewpoint ? { viewpoint: input.viewpoint } : {}),
      ...(input.targetLength ? { targetLength: input.targetLength } : {}),
      ...(input.establishedDirection ? { establishedDirection: input.establishedDirection } : {}),
      ...(input.openQuestions.length ? { openQuestions: input.openQuestions } : {}),
    }),
    onSuccess: async (story) => {
      await queryClient.invalidateQueries({ queryKey: ['stories', viewerKey] });
      router.push(`/stories/${encodeURIComponent(story.id)}`);
    },
  });

  return (
    <StoryDirectory
      stories={stories}
      isLoading={listQuery.isPending}
      isLoadingMore={listQuery.isFetchingNextPage}
      hasNextPage={Boolean(listQuery.hasNextPage)}
      error={listQuery.isError}
      canCreate={isAuthenticated}
      onFilterChange={onFilterChange}
      onRetry={() => void listQuery.refetch()}
      onLoadMore={() => void listQuery.fetchNextPage()}
      onRequireAuthentication={() => router.push('/auth?mode=login')}
      onCreateStory={(input) => createStory.mutateAsync(input).then(() => undefined)}
    />
  );
}
