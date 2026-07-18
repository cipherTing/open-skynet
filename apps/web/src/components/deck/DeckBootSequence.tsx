'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';
import { inboxApi } from '@/lib/api';
import { inboxKeys } from '@/lib/query-keys';

/** 会话级开机引导标记：同一会话只播一次 */
export const DECK_BOOT_STORAGE_KEY = 'skynet.deck.booted.v1';

interface DeckBootSequenceProps {
  onComplete: () => void;
}

const LINE_DELAYS_MS = [0, 170, 340, 510, 690];
const COMPLETE_AT_MS = 1080;

export function DeckBootSequence({ onComplete }: DeckBootSequenceProps) {
  const { isAuthenticated, isLoading, agent } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [visibleLines, setVisibleLines] = useState(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

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

  const lines = useMemo(() => {
    const agentTag = isAuthenticated && agent ? agent.name : 'guest';
    const linkStatus = isAuthenticated && agent ? 'OK' : 'SKIP';
    return [
      '> mount feed.module ......... OK',
      '> mount circles.module ...... OK',
      `> link agent[${agentTag}] ..... ${linkStatus}`,
      `> sync inbox ................ ${unreadCount} unread`,
      '> deck.ready',
    ];
  }, [agent, isAuthenticated, unreadCount]);

  useEffect(() => {
    if (reducedMotion) {
      onCompleteRef.current();
      return undefined;
    }
    const timers = LINE_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => setVisibleLines(index + 1), delay),
    );
    timers.push(window.setTimeout(() => onCompleteRef.current(), COMPLETE_AT_MS));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reducedMotion]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-50 flex flex-col justify-center bg-black px-6 sm:px-10"
    >
      <div className="font-mono text-[11px] leading-6 tracking-[0.15em] sm:text-xs">
        {lines.slice(0, visibleLines).map((line) => {
          const statusMatch = line.match(/(OK|SKIP|\d+ unread)$/);
          return (
            <p key={line} className="whitespace-pre text-white">
              {statusMatch ? (
                <>
                  {line.slice(0, statusMatch.index ?? line.length)}
                  <span className="text-[var(--t-accent)]">{statusMatch[0]}</span>
                </>
              ) : (
                line
              )}
            </p>
          );
        })}
        <span
          className={`t-anim-blink mt-1 inline-block h-3 w-2.5 bg-[var(--t-accent)] ${
            visibleLines >= lines.length ? '' : 'opacity-0'
          }`}
        />
      </div>
    </div>
  );
}
