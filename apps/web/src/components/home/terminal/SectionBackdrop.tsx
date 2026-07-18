'use client';

import { useEffect, useId, useRef } from 'react';

const MAX_DPR = 1.5;

/** 装饰色板：暗部噪音层级，荧光绿仅极少量点缀。canvas 无法消费 CSS var，数值与 token 等值。 */
const COLOR_DEEP = 'rgb(18, 32, 18)'; // var(--t-noise2) 等值
const COLOR_DARK = 'rgb(26, 46, 26)'; // var(--t-noise) 等值
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * 绑定 canvas 到宿主元素：尺寸同步（DPR ≤ 1.5）、ResizeObserver 驱动重配。
 * 返回清理函数；取不到 2d 上下文时返回 null。
 */
function setupCanvas(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onResize: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
): (() => void) | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const resize = () => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(0, rect.width);
    const height = Math.max(0, rect.height);
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize(ctx, width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  return () => observer.disconnect();
}

/**
 * 动态 canvas 的可见性闸门：IntersectionObserver 离屏即停 rAF；
 * prefers-reduced-motion 时只画一帧静态画面，不起循环。
 */
function watchVisibility(host: HTMLElement, onChange: (inView: boolean) => void): () => void {
  const observer = new IntersectionObserver(
    (entries) => onChange(entries.some((entry) => entry.isIntersecting)),
    { threshold: 0 },
  );
  observer.observe(host);
  return () => observer.disconnect();
}

/* ----------------------------------------------------------------------- */
/* matrix：Matrix 式字符雨（动态，Manifesto）                                 */
/* ----------------------------------------------------------------------- */

const RAIN_GLYPHS = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾌｺｴ0123456789+=:.';
const RAIN_CELL = 16;
const RAIN_STEP_MS = 110;
const NEON_RATIO = 0.07;

interface RainColumn {
  x: number;
  head: number;
  speed: number;
  neon: boolean;
}

function randomRainColumn(width: number, height: number): RainColumn {
  return {
    x: Math.random() * width,
    head: Math.random() * (height / RAIN_CELL),
    speed: 3 + Math.random() * 5,
    neon: Math.random() < NEON_RATIO,
  };
}

function MatrixRainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let columns: RainColumn[] = [];
    let rafId = 0;
    let lastStep = 0;

    const step = (ctx: CanvasRenderingContext2D) => {
      // destination-out 淡出旧帧形成拖尾，同时保持画布透明（不遮挡下层背景）
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      ctx.font = `12px ${MONO_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const column of columns) {
        column.head += column.speed * (RAIN_STEP_MS / 1000);
        const y = column.head * RAIN_CELL;
        ctx.fillStyle = column.neon ? 'rgba(173, 255, 47, 0.45)' : 'rgba(26, 46, 26, 0.85)';
        ctx.fillText(
          RAIN_GLYPHS.charAt(Math.floor(Math.random() * RAIN_GLYPHS.length)),
          column.x,
          y,
        );
        if (y > height + RAIN_CELL) {
          column.head = -Math.random() * 14;
          column.x = Math.random() * width;
          column.speed = 3 + Math.random() * 5;
          column.neon = Math.random() < NEON_RATIO;
        }
      }
    };

    let ctxRef: CanvasRenderingContext2D | null = null;
    const loop = (stamp: number) => {
      if (ctxRef && stamp - lastStep >= RAIN_STEP_MS) {
        lastStep = stamp;
        step(ctxRef);
      }
      rafId = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (rafId === 0 && !reducedMotion) rafId = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const teardownResize = setupCanvas(canvas, host, (ctx, nextWidth, nextHeight) => {
      ctxRef = ctx;
      width = nextWidth;
      height = nextHeight;
      ctx.clearRect(0, 0, width, height);
      const count = Math.max(1, Math.floor(width / (RAIN_CELL * 2.2)));
      columns = Array.from({ length: count }, () => randomRainColumn(width, height));
      if (reducedMotion) {
        // 降级为静态帧：连续跑若干步生成残影后停笔
        for (let i = 0; i < 60; i += 1) step(ctx);
      }
    });
    if (!teardownResize) return undefined;

    const teardownVisibility = watchVisibility(host, (inView) => {
      if (inView) start();
      else stop();
    });

    return () => {
      stop();
      teardownVisibility();
      teardownResize();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

/* ----------------------------------------------------------------------- */
/* field：静态稀疏 ASCII 字符场（一次性绘制，Systems）                         */
/* ----------------------------------------------------------------------- */

const FIELD_GLYPHS = '@#+=:.';

/** 确定性 PRNG：同一 seed 下渲染结果稳定，避免 resize 闪烁。 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function StaticFieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return undefined;

    const teardown = setupCanvas(canvas, host, (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      const rand = mulberry32(0x5eed);
      const count = Math.floor((width * height) / 26000);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < count; i += 1) {
        const neon = rand() < 0.04;
        const size = 9 + Math.floor(rand() * 6);
        ctx.font = `${size}px ${MONO_FONT}`;
        ctx.fillStyle = neon
          ? 'rgba(173, 255, 47, 0.2)'
          : `rgba(26, 46, 26, ${(0.35 + rand() * 0.4).toFixed(2)})`;
        ctx.fillText(
          FIELD_GLYPHS.charAt(Math.floor(rand() * FIELD_GLYPHS.length)),
          rand() * width,
          rand() * height,
        );
      }
    });

    return teardown ?? undefined;
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

/* ----------------------------------------------------------------------- */
/* wave：正弦 + EKG 脉冲横线（动态，Telemetry）                                */
/* ----------------------------------------------------------------------- */

const WAVE_STEP_MS = 100;
const EKG_SPEED = 14; // 每步水平推进像素

function drawSine(
  ctx: CanvasRenderingContext2D,
  width: number,
  centerY: number,
  amplitude: number,
  frequency: number,
  phase: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 6) {
    const y = centerY + Math.sin(x * frequency + phase) * amplitude;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** 块状 EKG 波形：p ∈ [-1, 1]，方波阶梯贴合终端 steps 美学。 */
function ekgShape(p: number): number {
  const a = Math.abs(p);
  if (a < 0.06) return 1;
  if (a >= 0.12 && a < 0.18) return -0.4;
  if (a >= 0.28 && a < 0.4) return 0.3;
  return 0;
}

function WavePulseCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let rafId = 0;
    let lastStep = 0;
    let stepCount = 0;

    const step = (ctx: CanvasRenderingContext2D) => {
      stepCount += 1;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;

      drawSine(ctx, width, height * 0.3, 9, 0.02, stepCount * 0.35, 'rgba(26, 46, 26, 0.55)');
      drawSine(ctx, width, height * 0.62, 13, 0.012, 40 - stepCount * 0.22, 'rgba(18, 32, 18, 0.85)');

      const cycle = width + 240;
      const pulseX = ((stepCount * EKG_SPEED) % cycle) - 120;
      const baseY = height * 0.85;
      ctx.strokeStyle = 'rgba(173, 255, 47, 0.14)';
      ctx.beginPath();
      for (let x = 0; x <= width; x += 4) {
        const d = Math.abs(x - pulseX);
        const y = d < 60 ? baseY - ekgShape((x - pulseX) / 60) * 26 : baseY;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    let ctxRef: CanvasRenderingContext2D | null = null;
    const loop = (stamp: number) => {
      if (ctxRef && stamp - lastStep >= WAVE_STEP_MS) {
        lastStep = stamp;
        step(ctxRef);
      }
      rafId = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (rafId === 0 && !reducedMotion) rafId = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const teardownResize = setupCanvas(canvas, host, (ctx, nextWidth, nextHeight) => {
      ctxRef = ctx;
      width = nextWidth;
      height = nextHeight;
      if (reducedMotion) step(ctx); // 降级：单帧静态画面
    });
    if (!teardownResize) return undefined;

    const teardownVisibility = watchVisibility(host, (inView) => {
      if (inView) start();
      else stop();
    });

    return () => {
      stop();
      teardownVisibility();
      teardownResize();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

/* ----------------------------------------------------------------------- */
/* grid：96px 坐标网格 + 交点小十字（静态 SVG，Protocol）                      */
/* ----------------------------------------------------------------------- */

function CoordGridSvg() {
  const patternId = useId();
  return (
    <svg className="absolute inset-0 h-full w-full">
      <defs>
        <pattern id={patternId} width="96" height="96" patternUnits="userSpaceOnUse">
          <path d="M96 0H0V96" fill="none" stroke={COLOR_DEEP} strokeWidth="1" />
          {/* 交点 1px 小十字：贴边分段绘制，平铺后在网格交点无缝拼成十字 */}
          <path
            d="M0 0H8 M88 0H96 M0 0V8 M0 88V96"
            fill="none"
            stroke={COLOR_DARK}
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/* barcode：边缘条形码带 + 底部标尺刻度（静态纯 CSS，Footer）                   */
/* ----------------------------------------------------------------------- */

function BarcodeBands() {
  return (
    <>
      <div className="absolute inset-y-0 left-0 w-10 bg-[repeating-linear-gradient(90deg,var(--t-noise2)_0_2px,transparent_2px_6px)] opacity-70" />
      <div className="absolute inset-y-0 right-0 w-16 bg-[repeating-linear-gradient(90deg,var(--t-noise2)_0_3px,transparent_3px_10px)] opacity-50" />
      {/* 底部标尺刻度：次刻度每 8px，主刻度每 40px */}
      <div className="absolute inset-x-0 bottom-0 h-2.5 bg-[repeating-linear-gradient(90deg,var(--t-noise)_0_1px,transparent_1px_8px)] opacity-60" />
      <div className="absolute inset-x-0 bottom-0 h-5 bg-[repeating-linear-gradient(90deg,var(--t-noise)_0_1px,transparent_1px_40px)] opacity-60" />
    </>
  );
}

/* ----------------------------------------------------------------------- */

type SectionBackdropVariant = 'matrix' | 'field' | 'wave' | 'grid' | 'barcode';

interface SectionBackdropProps {
  variant: SectionBackdropVariant;
}

/**
 * 区块装饰性背景层：绝对定位铺满父级 section（section 需 relative），
 * 置于内容层之下（DOM 先序 + 无 z-index，内容容器为 positioned 元素自然盖过），
 * pointer-events 关闭、aria-hidden。各变体互不重复：
 * - matrix：Matrix 式字符雨（Canvas 动态）
 * - field：静态稀疏 ASCII 字符场（Canvas 一次性绘制）
 * - wave：正弦 + EKG 脉冲横线（Canvas 动态）
 * - grid：96px 坐标网格 + 交点小十字（静态 SVG pattern）
 * - barcode：边缘条形码带 + 底部标尺刻度（静态纯 CSS）
 */
export function SectionBackdrop({ variant }: SectionBackdropProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {variant === 'matrix' ? <MatrixRainCanvas /> : null}
      {variant === 'field' ? <StaticFieldCanvas /> : null}
      {variant === 'wave' ? <WavePulseCanvas /> : null}
      {variant === 'grid' ? <CoordGridSvg /> : null}
      {variant === 'barcode' ? <BarcodeBands /> : null}
    </div>
  );
}
