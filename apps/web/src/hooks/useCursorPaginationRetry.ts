'use client';

import { useCallback } from 'react';
import {
  useQueryClient,
  type FetchNextPageOptions,
  type QueryKey,
  type RefetchOptions,
} from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

const PAGINATION_RESET_ERROR_CODES = new Set([
  'PAGINATION_CURSOR_EXPIRED',
  'PAGINATION_CURSOR_INVALID',
]);

export function isPaginationCursorError(error: unknown): error is ApiError {
  return error instanceof ApiError && PAGINATION_RESET_ERROR_CODES.has(error.code);
}

interface CursorPaginationRetryOptions {
  queryKey: QueryKey;
  error: unknown;
  isNextPageError: boolean;
  fetchNextPage: (options?: FetchNextPageOptions) => Promise<unknown>;
  refetch: (options?: RefetchOptions) => Promise<unknown>;
}

export function useCursorPaginationRetry({
  queryKey,
  error,
  isNextPageError,
  fetchNextPage,
  refetch,
}: CursorPaginationRetryOptions): () => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (isPaginationCursorError(error)) {
      await queryClient.resetQueries({ queryKey, exact: true });
      return;
    }
    if (isNextPageError) {
      await fetchNextPage({ cancelRefetch: false });
      return;
    }
    await refetch();
  }, [error, fetchNextPage, isNextPageError, queryClient, queryKey, refetch]);
}
