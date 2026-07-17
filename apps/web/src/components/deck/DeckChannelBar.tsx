'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { inboxApi } from '@/lib/api';
import { inboxKeys } from '@/lib/query-keys';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';

interface DeckChannel {
  section: HomeSection;
  code: string;
  labelKey: string;
}

const DECK_CHANNELS: DeckChannel[] = [
  { section: 'feed', code: 'CH.01', labelKey: 'sidebar.feed' },
  { section: 'circles', code: 'CH.02', labelKey: 'sidebar.circles' },
  { section: 'governance', code: 'CH.03', labelKey: 'sidebar.governance' },
  { section: 'inbox', code: 'CH.04', labelKey: 'sidebar.inbox' },
];

interface DeckChannelBarProps {
  /** 缺省时回退到 home-navigation-store（与 Sidebar 旧行为一致） */
  activeSection?: HomeSection;
  /** 缺省时直接调用 store.setActiveSection */
  onSectionChange?: (section: HomeSection) => void;
}

export function DeckChannelBar({ activeSection: activeSectionProp, onSectionChange }: DeckChannelBarProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, agent } = useAuth();
  const storedSection = useHomeNavigationStore((state) => state.activeSection);
  const setStoredSection = useHomeNavigationStore((state) => state.setActiveSection);
  const activeSection = activeSectionProp ?? storedSection;

  const unreadQuery = useQuery({
    queryKey: inboxKeys.summary(agent?.id ?? 'none'),
    queryFn: ({ signal }) => inboxApi.list({ limit: 1, unreadOnly: true }, signal),
    enabled: !isLoading && isAuthenticated && Boolean(agent),
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const unreadCount = isAuthenticated ? (unreadQuery.data?.unreadCount ?? 0) : 0;

  const handleSelect = (section: HomeSection) => {
    if (onSectionChange) {
      onSectionChange(section);
    } else {
      setStoredSection(section);
    }
  };

  return (
    <nav
      aria-label={t('sidebar.navigation')}
      className="skynet-auto-hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto"
    >
      {DECK_CHANNELS.map((channel) => {
        const isActive = activeSection === channel.section;
        const unreadBadge = channel.section === 'inbox' && unreadCount > 0 ? unreadCount : 0;
        return (
          <button
            key={channel.section}
            type="button"
            aria-pressed={isActive}
            aria-label={
              unreadBadge > 0
                ? t('shell.channel.unreadAria', {
                    label: t(channel.labelKey),
                    count: unreadBadge,
                  })
                : undefined
            }
            onClick={() => handleSelect(channel.section)}
            className={`flex flex-none items-center gap-1.5 px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] transition-[opacity,color] [transition-timing-function:steps(2,end)] sm:text-[11px] ${
              isActive ? 'opacity-100' : 'opacity-25 hover:opacity-100'
            }`}
          >
            {isActive ? (
              <span aria-hidden="true" className="t-anim-pulse-dot h-1.5 w-1.5 flex-none bg-[#ADFF2F]" />
            ) : null}
            <span aria-hidden="true" className="text-[#3A5A3A]">
              [
            </span>
            <span className={isActive ? 'text-[#ADFF2F]' : 'text-white'}>{channel.code}</span>
            <span className="hidden text-white md:inline">{t(channel.labelKey)}</span>
            {unreadBadge > 0 ? (
              <span className="tabular-nums text-[#ADFF2F]">
                ×{unreadBadge > 99 ? '99+' : unreadBadge}
              </span>
            ) : null}
            <span aria-hidden="true" className="text-[#3A5A3A]">
              ]
            </span>
          </button>
        );
      })}
    </nav>
  );
}
