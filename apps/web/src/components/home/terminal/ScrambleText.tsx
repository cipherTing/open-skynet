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

/** 动画期间被命令式锁定的几何样式原值，结束时逐一恢复。 */
interface GeometryLock {
  display: string;
  width: string;
  whiteSpace: string;
  overflow: string;
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
 *
 * 几何锁定（修复「乱码不收敛」与「文字跳动」）：
 * mouseenter 时测量元素当前宽度，命令式写入 display / width /
 * white-space: pre / overflow: hidden，使整个动画期间元素几何保持不变——
 * 否则乱码字符宽度变化会改变元素位置，在静止鼠标下方来回移动并反复
 * 重触发 mouseenter，动画永远无法收敛。动画自然结束或 mouseleave 时
 * 恢复原值；white-space: pre 同时保留空格宽度、消除内层布局抖动。
 */
export function ScrambleText({ text, className, as }: ScrambleTextProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [frame, setFrame] = useState<ScrambleFrame | null>(null);
  const rafRef = useRef(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const lockRef = useRef<GeometryLock | null>(null);

  const lockGeometry = useCallback(() => {
    const node = rootRef.current;
    if (!node || lockRef.current) return;
    lockRef.current = {
      display: node.style.display,
      width: node.style.width,
      whiteSpace: node.style.whiteSpace,
      overflow: node.style.overflow,
    };
    const { width } = node.getBoundingClientRect();
    if (window.getComputedStyle(node).display === 'inline') {
      // inline 元素不响应 width，先转为 inline-block 保持原有布局位置
      node.style.display = 'inline-block';
    }
    node.style.width = `${width}px`;
    node.style.whiteSpace = 'pre';
    node.style.overflow = 'hidden';
  }, []);

  const restoreGeometry = useCallback(() => {
    const node = rootRef.current;
    const lock = lockRef.current;
    if (!node || !lock) return;
    node.style.display = lock.display;
    node.style.width = lock.width;
    node.style.whiteSpace = lock.whiteSpace;
    node.style.overflow = lock.overflow;
    lockRef.current = null;
  }, []);

  /** mouseleave 双保险：取消动画、立即恢复原文渲染与几何样式。 */
  const stopScramble = useCallback(() => {
    window.cancelAnimationFrame(rafRef.current);
    setFrame(null);
    restoreGeometry();
  }, [restoreGeometry]);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(rafRef.current);
      // 卸载时若动画仍在进行，恢复被锁定的几何样式
      const node = rootRef.current;
      const lock = lockRef.current;
      if (node && lock) {
        node.style.display = lock.display;
        node.style.width = lock.width;
        node.style.whiteSpace = lock.whiteSpace;
        node.style.overflow = lock.overflow;
        lockRef.current = null;
      }
    },
    [],
  );

  const startScramble = useCallback(() => {
    if (reducedMotion) return;
    window.cancelAnimationFrame(rafRef.current);
    const source = text;
    const letters = source.split('');
    const length = letters.length;
    if (length === 0) return;
    lockGeometry();
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
        // 全部固定且高亮冷却完毕：回到纯文本渲染并解除几何锁定
        setFrame(null);
        restoreGeometry();
      }
    };

    rafRef.current = window.requestAnimationFrame(step);
  }, [text, reducedMotion, lockGeometry, restoreGeometry]);

  // text 变化后旧动画帧直接失效，无需额外重置 effect
  const current = frame !== null && frame.source === text ? frame : null;
  const chars = current ? current.chars : text.split('');
  const hot = current ? current.hot : null;
  const Tag = as ?? 'span';

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        rootRef.current = node;
      }}
      className={className}
      onMouseEnter={startScramble}
      onMouseLeave={stopScramble}
      aria-label={text}
    >
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
