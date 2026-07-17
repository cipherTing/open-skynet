'use client';

import { useEffect, useRef } from 'react';

const MAX_DPR = 1.5;

/** 固定种子：回波光点布局跨渲染/resize 稳定，不闪烁。 */
const SEED = 0x5eed;
const TWO_PI = Math.PI * 2;

/** 扫掠束一周耗时：连续平滑旋转，rAF 时间驱动，禁止步进卡顿。 */
const SWEEP_REV_MS = 4000;
/** 扇形拖尾张角（rad）与切片数；荧光绿自 0.25 透明度向尾部二次衰减到 0。 */
const TRAIL_ANGLE = 1.15;
const TRAIL_SLICES = 56;
const TRAIL_MAX_ALPHA = 0.25;
/** 回波被扫掠点亮后衰减熄灭的耗时。 */
const BLIP_FADE_MS = 2600;
/** 最外圈刻度环反向旋转一周耗时：极缓慢，仅增加层次。 */
const RING_REV_MS = 120000;
/** 目标光点数量区间 [BLIP_MIN, BLIP_MIN + BLIP_SPAN)。 */
const BLIP_MIN = 8;
const BLIP_SPAN = 7;

const COLOR_RING = '#1A2E1A';
const COLOR_TICK_FINE = '#1A2E1A';
const COLOR_TICK_MID = '#3A5A3A';
const COLOR_ACCENT = '#ADFF2F';
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** 静态帧（prefers-reduced-motion）使用的虚拟时间戳：扫掠指向 315°。 */
const STATIC_STAMP = 3500;

interface RadarBlip {
  /** 固定方位角（rad）。 */
  angle: number;
  /** 距中心半径占比（× 内盘半径）。 */
  radiusRatio: number;
  /** 核心点半径（px）。 */
  size: number;
}

/** 确定性 PRNG：同一 seed 下回波布局稳定（与蛛网场同款）。 */
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

function createBlips(): RadarBlip[] {
  const rand = mulberry32(SEED);
  const count = BLIP_MIN + Math.floor(rand() * BLIP_SPAN);
  return Array.from({ length: count }, () => ({
    angle: rand() * TWO_PI,
    radiusRatio: 0.16 + rand() * 0.72,
    size: rand() < 0.7 ? 1.4 : 2.2,
  }));
}

export interface RadarDialCanvasProps {
  className?: string;
}

/**
 * 赛博雷达表盘（装饰性）：父容器需有确定宽高，按 min(宽, 高) 自适应。
 * 底盘为同心细圆环 + 贯穿中心的 1px 十字准线；最外圈密集刻度
 * （每 3° 细刻 / 每 15° 中刻 / 每 45° 荧光绿主刻度）整体极缓慢反向旋转。
 * 扫掠束自中心连续平滑旋转（rAF 时间驱动），带扇形渐变拖尾作余辉；
 * 固定种子播撒 8-14 个回波光点，扫过即点亮为荧光绿并随时间衰减熄灭。
 * 亮度采用闭式解（角速度恒定 → 落后角直接推出点亮时长），无逐点状态，
 * 静态帧与动态帧画面一致。中心为十字准星 + 等宽微型读数（机器文案，豁免 i18n）。
 * 性能防御：单 rAF 循环、DPR ≤ 1.5、IntersectionObserver 离屏停帧、
 * prefers-reduced-motion 降级为静态帧、卸载完整清理、零 npm 依赖。
 */
export default function RadarDialCanvas({ className }: RadarDialCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const blips = createBlips();

    let width = 0;
    let height = 0;
    let rafId = 0;

    const drawFrame = (stamp: number) => {
      if (width === 0 || height === 0) return;
      const size = Math.min(width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = size / 2 - 2;
      const tickMajor = radius * 0.075;
      const tickMid = radius * 0.05;
      const tickFine = radius * 0.028;
      const inner = radius - tickMajor - radius * 0.025;
      const sweepAngle = ((stamp / SWEEP_REV_MS) * TWO_PI) % TWO_PI;
      const ringAngle = -((stamp / RING_REV_MS) * TWO_PI) % TWO_PI;

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;

      // 底盘：外沿圆 + 3 个同心细圆环 + 贯穿中心的十字准线（静态层）
      ctx.strokeStyle = COLOR_RING;
      ctx.beginPath();
      ctx.moveTo(cx + radius, cy);
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      for (const ratio of [0.36, 0.64, 0.98]) {
        ctx.moveTo(cx + inner * ratio, cy);
        ctx.arc(cx, cy, inner * ratio, 0, TWO_PI);
      }
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // 外圈刻度环：每 3° 细刻 / 每 15° 中刻 / 每 45° 荧光绿主刻度，整体极缓慢反向旋转
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ringAngle);
      ctx.strokeStyle = COLOR_TICK_FINE;
      ctx.beginPath();
      for (let i = 0; i < 120; i += 1) {
        if (i % 5 === 0) continue;
        const a = (i * 3 * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo((radius - tickFine) * c, (radius - tickFine) * s);
        ctx.lineTo(radius * c, radius * s);
      }
      ctx.stroke();
      ctx.strokeStyle = COLOR_TICK_MID;
      ctx.beginPath();
      for (let i = 0; i < 120; i += 5) {
        if (i % 15 === 0) continue;
        const a = (i * 3 * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo((radius - tickMid) * c, (radius - tickMid) * s);
        ctx.lineTo(radius * c, radius * s);
      }
      ctx.stroke();
      ctx.strokeStyle = COLOR_ACCENT;
      ctx.beginPath();
      for (let i = 0; i < 120; i += 15) {
        const a = (i * 3 * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo((radius - tickMajor) * c, (radius - tickMajor) * s);
        ctx.lineTo(radius * c, radius * s);
      }
      ctx.stroke();
      ctx.restore();

      // 雷达扫掠：扇形渐变拖尾（向领先沿二次增益）+ 领先沿扫掠束 + 束端光点
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < TRAIL_SLICES; i += 1) {
        const a0 = sweepAngle - TRAIL_ANGLE + (i / TRAIL_SLICES) * TRAIL_ANGLE;
        const a1 = sweepAngle - TRAIL_ANGLE + ((i + 1) / TRAIL_SLICES) * TRAIL_ANGLE + 0.004;
        const gain = (i + 1) / TRAIL_SLICES;
        ctx.fillStyle = `rgba(173, 255, 47, ${(TRAIL_MAX_ALPHA * gain * gain).toFixed(4)})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, inner, a0, a1);
        ctx.closePath();
        ctx.fill();
      }
      const tipX = Math.cos(sweepAngle) * inner;
      const tipY = Math.sin(sweepAngle) * inner;
      ctx.strokeStyle = 'rgba(173, 255, 47, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(173, 255, 47, 0.18)';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 5, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = COLOR_ACCENT;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2, 0, TWO_PI);
      ctx.fill();
      ctx.restore();

      // 回波光点：扫过点亮、随时间衰减熄灭；未点亮仅留微弱暗斑
      for (const blip of blips) {
        const r = blip.radiusRatio * inner;
        const x = cx + Math.cos(blip.angle) * r;
        const y = cy + Math.sin(blip.angle) * r;
        const lag = (sweepAngle - blip.angle + TWO_PI) % TWO_PI;
        const bright = Math.max(0, 1 - (lag / TWO_PI) * (SWEEP_REV_MS / BLIP_FADE_MS));
        if (bright > 0.02) {
          ctx.globalAlpha = bright * 0.2;
          ctx.fillStyle = COLOR_ACCENT;
          ctx.beginPath();
          ctx.arc(x, y, blip.size * 3, 0, TWO_PI);
          ctx.fill();
          ctx.globalAlpha = Math.min(1, 0.3 + bright * 0.7);
          ctx.beginPath();
          ctx.arc(x, y, blip.size, 0, TWO_PI);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = 'rgba(58, 90, 58, 0.3)';
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }

      // 中心十字准星
      const arm = 7;
      const gap = 2.5;
      ctx.strokeStyle = 'rgba(173, 255, 47, 0.85)';
      ctx.beginPath();
      ctx.moveTo(cx - gap - arm, cy);
      ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy);
      ctx.lineTo(cx + gap + arm, cy);
      ctx.moveTo(cx, cy - gap - arm);
      ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap);
      ctx.lineTo(cx, cy + gap + arm);
      ctx.stroke();
      ctx.fillStyle = COLOR_ACCENT;
      ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);

      // 等宽微型读数：SCAN 角度百分比 + 每秒更新的伪坐标
      const fontSize = Math.max(8, Math.round(radius * 0.055));
      ctx.font = `${fontSize}px ${MONO_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pct = ((sweepAngle / TWO_PI) * 100).toFixed(1).padStart(5, '0');
      ctx.fillStyle = 'rgba(173, 255, 47, 0.6)';
      ctx.fillText(`SCAN ${pct}%`, cx, cy + inner * 0.34);
      const second = Math.floor(stamp / 1000);
      const coordRand = mulberry32(SEED ^ second);
      const fmt = (v: number) =>
        `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(1).padStart(4, '0')}`;
      ctx.fillStyle = 'rgba(58, 90, 58, 0.95)';
      ctx.fillText(
        `X${fmt(coordRand() * 180 - 90)} Y${fmt(coordRand() * 180 - 90)}`,
        cx,
        cy + inner * 0.34 + fontSize + 4,
      );
    };

    const loop = (stamp: number) => {
      drawFrame(stamp);
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

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(0, rect.width);
      height = Math.max(0, rect.height);
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reducedMotion) drawFrame(STATIC_STAMP);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) start();
        else stop();
      },
      { threshold: 0 },
    );
    visibilityObserver.observe(host);

    return () => {
      stop();
      visibilityObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  const hostClass = ['relative h-full w-full', className ?? ''].filter(Boolean).join(' ');

  return (
    <div ref={hostRef} aria-hidden="true" className={hostClass}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
