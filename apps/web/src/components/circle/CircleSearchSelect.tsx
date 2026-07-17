'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';
import { TInput } from '@/components/ui/terminal';
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
      <div className="group relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] group-focus-within:text-[#ADFF2F]" />
        <TInput
          type="text"
          value={searchText}
          disabled={disabled}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={t('circles.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      <div className="border border-[#1A2E1A] bg-black">
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
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                    active
                      ? 'bg-[#ADFF2F]/10 text-[#ADFF2F]'
                      : 'text-[#EDF3ED]/70 hover:bg-[#ADFF2F]/5 hover:text-white'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">/{circle.name}</span>
                    <span className="mt-0.5 block line-clamp-1 text-xs text-[#3A5A3A]">{circle.topic}</span>
                  </span>
                  {active && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
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
