'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

const CURSOR_ACTIVE_CLASS = 'skynet-t-cursor-active';
const BOX_HOT_CLASS = 'skynet-t-cursor-box--hot';
const BOX_SIZE = 26;
const BOX_SIZE_HOT = 44;
const INTERACTIVE_SELECTOR = 'a, button, [data-cursor-target]';
/**
 * 模态层特征选择器（命中任一即回退原生光标）：
 * - `dialog[open]`：原生 <dialog>（showModal/show）
 * - `[role="dialog"]` / `[role="alertdialog"]`：Radix Dialog.Portal 等挂载到 body 的对话框
 *   （AgentConnectDialog 经 @radix-ui/react-dialog 渲染，Content 带 role="dialog"）
 * - `[aria-modal="true"]`：显式声明模态的自定义浮层
 * 下拉菜单（role="menu"/"listbox"）、tooltip（role="tooltip"）等小型浮层不会命中。
 */
const MODAL_SELECTOR =
  'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/** 组件自带样式：十字准星 1px 细线、直角方框、等宽微型坐标读数、原生光标隐藏。 */
const CURSOR_CSS = `
.${CURSOR_ACTIVE_CLASS},
.${CURSOR_ACTIVE_CLASS} * {
  cursor: none !important;
}
.skynet-t-cursor-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0;
}
.skynet-t-cursor-line {
  position: fixed;
  top: 0;
  left: 0;
  background: rgba(173, 255, 47, 0.25);
  will-change: transform;
}
.skynet-t-cursor-line--h {
  width: 100vw;
  height: 1px;
}
.skynet-t-cursor-line--v {
  width: 1px;
  height: 100vh;
}
.skynet-t-cursor-box {
  position: fixed;
  top: 0;
  left: 0;
  width: ${BOX_SIZE}px;
  height: ${BOX_SIZE}px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: transparent;
  will-change: transform;
  transition:
    width 120ms steps(3, end),
    height 120ms steps(3, end),
    border-color 120ms steps(2, end);
}
.${BOX_HOT_CLASS} {
  width: ${BOX_SIZE_HOT}px;
  height: ${BOX_SIZE_HOT}px;
  border-color: #ADFF2F;
}
.skynet-t-cursor-readout {
  position: fixed;
  top: 0;
  left: 0;
  font-size: 10px;
  line-height: 1.6;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #ADFF2F;
  white-space: pre;
  will-change: transform;
}
`;

function formatAxis(value: number): string {
  return String(Math.max(0, Math.round(value))).padStart(4, '0');
}

function formatGeo(value: number, intDigits: number): string {
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(value).toFixed(2);
  const [intPart = '0', fracPart = '00'] = abs.split('.');
  return `${sign}${intPart.padStart(intDigits, '0')}.${fracPart}`;
}

/** 等宽微型坐标读数：X/Y 像素 + 伪经纬度（x → -180..180，y → 90..-90）。 */
function formatReadout(x: number, y: number): string {
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  const lon = (x / width) * 360 - 180;
  const lat = 90 - (y / height) * 180;
  return `X ${formatAxis(x)}  Y ${formatAxis(y)}\nLAT ${formatGeo(lat, 2)}  LON ${formatGeo(lon, 3)}`;
}

/**
 * 自定义终端光标：
 * - 1px 细线十字准星（全视口横竖线，与指针位置严格同步）
 * - 直角边框方框（pointermove 直接写 transform，与指针 100% 同步，无惯性/插值）
 * - 等宽微型坐标读数（X/Y 像素 + 伪经纬度，随指针同步刷新）
 * - hover 到 a / button / [data-cursor-target] 时方框放大并变荧光绿
 *
 * 模态层回退：MutationObserver 监听 document.body 子树（rAF 节流），命中
 * MODAL_SELECTOR（dialog[open] / role="dialog" / role="alertdialog" / aria-modal）
 * 时隐藏自定义光标并移除 cursor:none class 恢复原生光标；弹窗关闭后自动恢复。
 *
 * 仅在 pointer:fine 设备渲染（触屏不渲染、回退原生光标）；
 * prefers-reduced-motion 时同样不渲染。卸载时完整清理。
 *
 * 原生光标隐藏：组件挂载时给 document.documentElement 加 `skynet-t-cursor-active`
 * class，并随组件自带 <style> 输出 `cursor: none !important` 规则；卸载或模态打开时移除。
 */
export function CustomCursor() {
  const [pointerFine, setPointerFine] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const rootRef = useRef<HTMLDivElement>(null);
  const lineHRef = useRef<HTMLDivElement>(null);
  const lineVRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(pointer: fine)');
    const update = () => setPointerFine(media.matches);
    media.addEventListener('change', update);
    // 异步同步初始值：保证首次客户端渲染与 SSR 一致（均为 false）
    const timer = window.setTimeout(update, 0);
    return () => {
      media.removeEventListener('change', update);
      window.clearTimeout(timer);
    };
  }, []);

  const active = pointerFine && !reducedMotion;

  useEffect(() => {
    if (!active) return undefined;
    const root = rootRef.current;
    const lineH = lineHRef.current;
    const lineV = lineVRef.current;
    const box = boxRef.current;
    const readout = readoutRef.current;
    if (!root || !lineH || !lineV || !box || !readout) return undefined;

    document.documentElement.classList.add(CURSOR_ACTIVE_CLASS);

    const pointer = { x: -1000, y: -1000, seen: false };
    let hoverApplied = false;
    let lastText = '';
    let visible = false;
    let modalOpen = false;
    let modalCheckRaf = 0;

    /** 十字准星 / 方框 / 坐标读数一次性写入，全部与指针瞬时位置严格一致。 */
    const applyPosition = () => {
      const size = hoverApplied ? BOX_SIZE_HOT : BOX_SIZE;
      lineV.style.transform = `translate3d(${pointer.x}px, 0, 0)`;
      lineH.style.transform = `translate3d(0, ${pointer.y}px, 0)`;
      box.style.transform = `translate3d(${pointer.x - size / 2}px, ${
        pointer.y - size / 2
      }px, 0)`;
      readout.style.transform = `translate3d(${pointer.x + size / 2 + 10}px, ${
        pointer.y + size / 2 + 10
      }px, 0)`;
      const text = formatReadout(pointer.x, pointer.y);
      if (text !== lastText) {
        lastText = text;
        readout.textContent = text;
      }
    };

    const setVisible = (next: boolean) => {
      if (next === visible) return;
      visible = next;
      root.style.opacity = next ? '1' : '0';
    };

    /** 模态开关联动：弹窗时移除 cursor:none、隐藏自定义光标；关闭后恢复。 */
    const setModalOpen = (next: boolean) => {
      if (next === modalOpen) return;
      modalOpen = next;
      document.documentElement.classList.toggle(CURSOR_ACTIVE_CLASS, !next);
      setVisible(pointer.seen && !next);
    };

    /** 同一帧内多次 DOM 变动只检测一次（rAF 节流）。 */
    const scheduleModalCheck = () => {
      if (modalCheckRaf !== 0) return;
      modalCheckRaf = window.requestAnimationFrame(() => {
        modalCheckRaf = 0;
        setModalOpen(document.querySelector(MODAL_SELECTOR) !== null);
      });
    };

    const modalObserver = new MutationObserver(scheduleModalCheck);
    modalObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'aria-modal'],
    });
    scheduleModalCheck();

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.seen = true;
      const target = event.target;
      const hover =
        target instanceof Element ? target.closest(INTERACTIVE_SELECTOR) !== null : false;
      if (hover !== hoverApplied) {
        hoverApplied = hover;
        box.classList.toggle(BOX_HOT_CLASS, hover);
      }
      applyPosition();
      if (!modalOpen) setVisible(true);
    };
    const onPointerLeave = () => {
      pointer.seen = false;
      setVisible(false);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onPointerLeave);

    return () => {
      if (modalCheckRaf !== 0) window.cancelAnimationFrame(modalCheckRaf);
      modalObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('mouseleave', onPointerLeave);
      document.documentElement.classList.remove(CURSOR_ACTIVE_CLASS);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div ref={rootRef} aria-hidden className="skynet-t-cursor-root">
      <style>{CURSOR_CSS}</style>
      <div ref={lineHRef} className="skynet-t-cursor-line skynet-t-cursor-line--h" />
      <div ref={lineVRef} className="skynet-t-cursor-line skynet-t-cursor-line--v" />
      <div ref={boxRef} className="skynet-t-cursor-box" />
      <div ref={readoutRef} className="skynet-t-cursor-readout font-mono" />
    </div>
  );
}
