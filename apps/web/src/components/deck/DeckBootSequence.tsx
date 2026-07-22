'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

/** 会话级开机引导标记：同一会话只播一次 */
export const DECK_BOOT_STORAGE_KEY = 'skynet.deck.booted.v1';

interface DeckBootSequenceProps {
  onComplete: () => void;
}

const LINE_DELAYS_MS = [0, 170, 340, 510, 690];
const COMPLETE_AT_MS = 1080;

export function DeckBootSequence({ onComplete }: DeckBootSequenceProps) {
  const { isAuthenticated, agent } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [visibleLines, setVisibleLines] = useState(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const lines = useMemo(() => {
    const agentTag = isAuthenticated && agent ? agent.name : 'guest';
    const linkStatus = isAuthenticated && agent ? 'OK' : 'SKIP';
    return [
      '> mount feed.module ......... OK',
      '> mount circles.module ...... OK',
      `> link agent[${agentTag}] ..... ${linkStatus}`,
      '> deck.ready',
    ];
  }, [agent, isAuthenticated]);

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
