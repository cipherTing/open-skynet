'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Circle } from '@skynet/shared';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TButton } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';

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
  const [open, setOpen] = useState(false);
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
    enabled: open && debouncedSearchText.length > 0,
  });
  const items =
    debouncedSearchText.length > 0
      ? (searchQuery.data?.items ?? EMPTY_CIRCLES)
      : selectedCircle
        ? [selectedCircle]
        : EMPTY_CIRCLES;
  const emptyLabel = searchQuery.isFetching
    ? t('circles.searching')
    : debouncedSearchText
      ? t('circles.noSearchResults')
      : t('circles.selectedCircleEmpty');

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearchText('');
          setDebouncedSearchText('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <TButton
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-expanded={open}
          className="h-auto min-h-10 w-full justify-between px-3 py-2 text-left normal-case tracking-normal"
        >
          <span className="min-w-0">
            {selectedCircle ? (
              <>
                <span className="block truncate text-sm font-bold text-white/85">
                  /{selectedCircle.name}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--t-sub)]">
                  {selectedCircle.topic}
                </span>
              </>
            ) : (
              <span className="text-sm text-[var(--t-faint)]">
                {t('circles.searchPlaceholder')}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-3 h-4 w-4 shrink-0 text-[var(--t-faint)]" />
        </TButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={searchText}
            onValueChange={setSearchText}
            placeholder={t('circles.searchPlaceholder')}
          />
          <CommandList>
            {items.length === 0 ? <CommandEmpty>{emptyLabel}</CommandEmpty> : null}
            {items.length > 0 ? (
              <CommandGroup heading={t('circles.searchResults')}>
                {items.map((circle) => {
                  const active = selectedCircle?.id === circle.id;
                  return (
                    <CommandItem
                      key={circle.id}
                      value={circle.id}
                      onSelect={() => {
                        onSelect(circle);
                        setOpen(false);
                        setSearchText('');
                        setDebouncedSearchText('');
                      }}
                      className="items-start gap-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">/{circle.name}</span>
                        <span className="mt-0.5 block line-clamp-1 text-xs text-[var(--t-sub)]">
                          {circle.topic}
                        </span>
                      </span>
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          active ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
