'use client';

import { useEffect, useRef, useState } from 'react';

/** 噪声瓦片调色板：纯黑底 + 暗绿噪音 + 极少量荧光绿 */
const NOISE_PALETTE = ['#122012', '#1A2E1A', '#1A2E1A', '#3A5A3A'];
const ACCENT = '#ADFF2F';
/** 离屏画布分辨率约为主画布的 1/√32（≈1/5.66），瓦片 2px */
const OFFSCREEN_SCALE = 1 / Math.sqrt(32);
const TILE_PX = 2;
const FPS = 12;
const FRAME_MS = 1000 / FPS;
const MAX_DPR = 2;
/** 各帧噪声密度：起 → 全覆盖（此刻切换内容）→ 消退 */
const FRAME_DENSITIES = [0.5, 0.95, 0.4, 0.12];
const COVER_FRAME_INDEX = 1;

interface DeckNoiseTransitionProps {
  /** 递增触发一次转场；初始值 0 不触发 */
  run: number;
  /** 噪声全覆盖瞬间回调（在此硬切内容） */
  onCover: () => void;
  /** 转场结束回调（画布随后自行销毁） */
  onFinish?: () => void;
}

function paintNoiseFrame(main: HTMLCanvasElement, offscreen: HTMLCanvasElement, density: number): void {
  const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
  const mainCtx = main.getContext('2d', { willReadFrequently: true });
  if (!offCtx || !mainCtx) return;

  offCtx.fillStyle = '#000000';
  offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
  for (let y = 0; y < offscreen.height; y += TILE_PX) {
    for (let x = 0; x < offscreen.width; x += TILE_PX) {
      if (Math.random() > density) continue;
      offCtx.fillStyle =
        Math.random() < 0.04
          ? ACCENT
          : NOISE_PALETTE[Math.floor(Math.random() * NOISE_PALETTE.length)];
      offCtx.fillRect(x, y, TILE_PX, TILE_PX);
    }
  }

  mainCtx.imageSmoothingEnabled = false;
  mainCtx.fillStyle = '#000000';
  mainCtx.fillRect(0, 0, main.width, main.height);
  const rotation = (Math.floor(Math.random() * 4) * Math.PI) / 2;
  const side = Math.max(main.width, main.height);
  mainCtx.save();
  mainCtx.translate(main.width / 2, main.height / 2);
  mainCtx.rotate(rotation);
  mainCtx.drawImage(offscreen, -side / 2, -side / 2, side, side);
  mainCtx.restore();
}

export function DeckNoiseTransition({ run, onCover, onFinish }: DeckNoiseTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);
  const callbacksRef = useRef({ onCover, onFinish });

  useEffect(() => {
    callbacksRef.current = { onCover, onFinish };
  });

  useEffect(() => {
    if (run <= 0) return undefined;
    // 延迟一个宏任务挂载画布，避免级联渲染
    const timer = window.setTimeout(() => setActive(true), 0);
    return () => window.clearTimeout(timer);
  }, [run]);

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.round(canvas.width * OFFSCREEN_SCALE));
    offscreen.height = Math.max(1, Math.round(canvas.height * OFFSCREEN_SCALE));

    let frameIndex = 0;
    let timer = 0;
    const step = () => {
      if (frameIndex === COVER_FRAME_INDEX) {
        callbacksRef.current.onCover();
      }
      paintNoiseFrame(canvas, offscreen, FRAME_DENSITIES[frameIndex]);
      frameIndex += 1;
      if (frameIndex < FRAME_DENSITIES.length) {
        timer = window.setTimeout(step, FRAME_MS);
      } else {
        setActive(false);
        callbacksRef.current.onFinish?.();
      }
    };
    step();

    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="t-noise-canvas pointer-events-none absolute inset-0 z-40 h-full w-full"
    />
  );
}
