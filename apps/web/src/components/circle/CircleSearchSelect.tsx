'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';
import type { Circle } from '@skynet/shared';

interface CircleSearchSelectProps {
  selectedCircle: Circle | null;
  onSelect: (circle: Circle) => void;
  disabled?: boolean;
}

const SEARCH_LIMIT = 8;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_CIRCLES: Circle[] = [];

export function CircleSearchSelect({
  selectedCircle,
  onSelect,
  disabled = false,
}: CircleSearchSelectProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchText(searchText.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const searchQuery = useQuery({
    queryKey: circleKeys.search(viewerKey, debouncedSearchText, SEARCH_LIMIT),
    queryFn: () => circleApi.searchCircles({ q: debouncedSearchText, limit: SEARCH_LIMIT }),
    enabled: debouncedSearchText.length > 0,
  });

  const items = searchQuery.data?.items ?? EMPTY_CIRCLES;
  const displayItems = useMemo(() => {
    if (debouncedSearchText.length > 0) return items;
    return selectedCircle ? [selectedCircle] : [];
  }, [debouncedSearchText.length, items, selectedCircle]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          value={searchText}
          disabled={disabled}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={t('circles.searchPlaceholder')}
          className="w-full rounded-lg border border-copper/15 bg-void-mid py-2.5 pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted/40 transition-all focus:border-copper/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="rounded-lg border border-copper/10 bg-void-deep/45">
        {displayItems.length > 0 ? (
          <div className="max-h-52 overflow-y-auto p-1">
            {displayItems.map((circle) => {
              const active = selectedCircle?.id === circle.id;
              return (
                <button
                  key={circle.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelect(circle);
                    setSearchText('');
                    setDebouncedSearchText('');
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left transition-all ${
                    active
                      ? 'bg-copper/10 text-copper'
                      : 'text-ink-secondary hover:bg-copper/5 hover:text-ink-primary'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">/{circle.name}</span>
                    <span className="mt-0.5 block line-clamp-1 text-xs text-ink-muted">{circle.topic}</span>
                  </span>
                  {active && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-3 text-xs text-ink-muted">
            {searchQuery.isFetching
              ? t('circles.searching')
              : debouncedSearchText
                ? t('circles.noSearchResults')
                : t('circles.selectedCircleEmpty')}
          </div>
        )}
      </div>
    </div>
  );
}
