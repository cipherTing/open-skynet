'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

interface ScrambleTextProps {
  text: string;
  className?: string;
  as?: 'span' | 'div' | 'p';
}

interface ScrambleFrame {
  source: string;
  chars: string[];
  hot: boolean[];
}

const SCRAMBLE_GLYPHS = '!<>-_\\/[]{}=+*^?#01';
const SCRAMBLE_PHASE_MS = 200;
const LOCK_HIGHLIGHT_MS = 180;

const SCRAMBLE_CSS = `
.skynet-t-scramble-hot {
  color: #ADFF2F;
}
`;

function randomGlyph(): string {
  const index = Math.floor(Math.random() * SCRAMBLE_GLYPHS.length);
  return SCRAMBLE_GLYPHS.charAt(index) || '#';
}

/**
 * Text Scramble：hover（mouseenter）触发。
 * 前 200ms 每个字符高速随机替换为 ASCII 符号 / 二进制，
 * 随后从左到右逐个固定为正确字符；刚固定的字符短暂荧光绿高亮后恢复。
 * 重复 hover 可重触发。prefers-reduced-motion 时保持静止文本。
 */
export function ScrambleText({ text, className, as }: ScrambleTextProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [frame, setFrame] = useState<ScrambleFrame | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const raf = rafRef;
    return () => window.cancelAnimationFrame(raf.current);
  }, []);

  const startScramble = useCallback(() => {
    if (reducedMotion) return;
    window.cancelAnimationFrame(rafRef.current);
    const source = text;
    const letters = source.split('');
    const length = letters.length;
    if (length === 0) return;
    const lockDuration = Math.min(Math.max(length * 30, 200), 800);
    const lockTimes = new Array<number>(length).fill(Number.POSITIVE_INFINITY);
    const startAt = performance.now();

    const step = (now: number) => {
      const elapsed = now - startAt;
      const chars = new Array<string>(length);
      const hot = new Array<boolean>(length).fill(false);
      let pending = false;

      for (let index = 0; index < length; index += 1) {
        const original = letters[index] ?? '';
        if (original.trim() === '') {
          chars[index] = original;
          continue;
        }
        const lockAt = SCRAMBLE_PHASE_MS + (index / Math.max(length - 1, 1)) * lockDuration;
        if (elapsed >= lockAt) {
          if (lockTimes[index] === Number.POSITIVE_INFINITY) lockTimes[index] = now;
          chars[index] = original;
          const heat = now - (lockTimes[index] ?? now);
          if (heat < LOCK_HIGHLIGHT_MS) {
            hot[index] = true;
            pending = true;
          }
        } else {
          chars[index] = randomGlyph();
          pending = true;
        }
      }

      if (pending) {
        setFrame({ source, chars, hot });
        rafRef.current = window.requestAnimationFrame(step);
      } else {
        // 全部固定且高亮冷却完毕：回到纯文本渲染
        setFrame(null);
      }
    };

    rafRef.current = window.requestAnimationFrame(step);
  }, [text, reducedMotion]);

  // text 变化后旧动画帧直接失效，无需额外重置 effect
  const current = frame !== null && frame.source === text ? frame : null;
  const chars = current ? current.chars : text.split('');
  const hot = current ? current.hot : null;
  const Tag = as ?? 'span';

  return (
    <Tag className={className} onMouseEnter={startScramble} aria-label={text}>
      <style>{SCRAMBLE_CSS}</style>
      <span aria-hidden>
        {chars.map((char, index) => (
          <span key={index} className={hot?.[index] ? 'skynet-t-scramble-hot' : undefined}>
            {char}
          </span>
        ))}
      </span>
    </Tag>
  );
}
