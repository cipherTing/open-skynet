'use client';

import { useEffect, useRef } from 'react';

interface AsciiCoreCanvasProps {
  className?: string;
}

type Rgb = [number, number, number];

const CHAR_RAMP = ['.', '1', ':', '0', '=', '+', '%', 'S', '#', '@'] as const;

const COLOR_DARK: Rgb = [0x1a, 0x2e, 0x1a]; // #1A2E1A
const COLOR_MID: Rgb = [0x3a, 0x5a, 0x3a]; // #3A5A3A
const COLOR_NEON: Rgb = [0xad, 0xff, 0x2f]; // #ADFF2F

const MAX_DPR = 1.5;
const TORUS_POINTS = 1300;
const SPHERE_POINTS = 650;
const SATELLITE_POINTS = 450;
const TORUS_MAJOR = 1;
const TORUS_MINOR = 0.42;
const SATELLITE_MIN_RADIUS = 1.28;
const SATELLITE_SPREAD = 0.45;
const DEPTH_RANGE = SATELLITE_MIN_RADIUS + SATELLITE_SPREAD; // 1.73
const PERSPECTIVE = 3;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// 鼠标凹陷交互参数
const DENT_RADIUS = 120; // px，凹陷作用半径（余弦衰减）
const DENT_DEPTH = 0.62; // 模型单位，最大压入深度
const DENT_DOWN_MULT = 1.7; // pointerdown 时深度倍率
const DENT_ATTACK = 0.3; // 压入响应系数（快速跟随）
const DENT_RELEASE = 0.1; // 弹簧恢复系数（缓慢回弹）

interface CorePoint {
  x: number;
  y: number;
  z: number;
  phase: number;
}

interface GlyphLevel {
  char: string;
  color: string;
}

function mixRgb(a: Rgb, b: Rgb, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const LEVELS: GlyphLevel[] = CHAR_RAMP.map((char, i) => {
  const t = i / (CHAR_RAMP.length - 1);
  const color =
    t < 0.6 ? mixRgb(COLOR_DARK, COLOR_MID, t / 0.6) : mixRgb(COLOR_MID, COLOR_NEON, (t - 0.6) / 0.4);
  return { char, color };
});

function makePoints(): CorePoint[] {
  const points: CorePoint[] = [];
  // 环面：黄金角分层采样，分布比纯随机更均匀
  for (let i = 0; i < TORUS_POINTS; i += 1) {
    const u = (i * GOLDEN_ANGLE) % (Math.PI * 2);
    const v = Math.random() * Math.PI * 2;
    const ring = TORUS_MAJOR + TORUS_MINOR * Math.cos(v);
    points.push({
      x: ring * Math.cos(u),
      y: TORUS_MINOR * Math.sin(v),
      z: ring * Math.sin(u),
      phase: Math.random() * Math.PI * 2,
    });
  }
  // 内核球壳：斐波那契球面均匀分布
  for (let i = 0; i < SPHERE_POINTS; i += 1) {
    const zz = 1 - (2 * (i + 0.5)) / SPHERE_POINTS;
    const theta = i * GOLDEN_ANGLE;
    const s = Math.sqrt(Math.max(0, 1 - zz * zz));
    const radius = 0.55;
    points.push({
      x: radius * s * Math.cos(theta),
      y: radius * zz,
      z: radius * s * Math.sin(theta),
      phase: Math.random() * Math.PI * 2,
    });
  }
  // 弥散卫星点云：外围薄球壳，增强体积感
  for (let i = 0; i < SATELLITE_POINTS; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const zz = Math.random() * 2 - 1;
    const s = Math.sqrt(Math.max(0, 1 - zz * zz));
    const radius = SATELLITE_MIN_RADIUS + Math.random() * SATELLITE_SPREAD;
    points.push({
      x: radius * s * Math.cos(theta),
      y: radius * zz,
      z: radius * s * Math.sin(theta),
      phase: Math.random() * Math.PI * 2,
    });
  }
  return points;
}

function buildSprites(cellPx: number, ratio: number): HTMLCanvasElement[] {
  return LEVELS.map(({ char, color }) => {
    const sprite = document.createElement('canvas');
    const size = Math.max(1, Math.round(cellPx * ratio));
    sprite.width = size;
    sprite.height = size;
    const g = sprite.getContext('2d');
    if (g) {
      g.scale(ratio, ratio);
      g.font = `${cellPx * 0.92}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(char, cellPx / 2, cellPx / 2 + cellPx * 0.05);
    }
    return sprite;
  });
}

export default function AsciiCoreCanvas({ className }: AsciiCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const points = makePoints();
    const flickerLevel = new Int16Array(points.length).fill(-1);
    const flickerTtl = new Int16Array(points.length);
    const dentDepth = new Float32Array(points.length); // 每点当前压入深度
    const drawOrder = points.map((_, i) => i);

    let width = 0;
    let height = 0;
    let cellPx = 9;
    let sprites: HTMLCanvasElement[] = [];
    let rafId = 0;
    let visible = true;

    const mouseTarget = { x: 0, y: 0 };
    const mouseCurrent = { x: 0, y: 0 };
    // 凹陷指针状态：画布内 CSS 像素坐标
    const dentPointer = { x: 0, y: 0, inside: false, down: false };

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
      cellPx = Math.max(8, Math.min(10, Math.round(Math.min(width, height) / 56)));
      sprites = buildSprites(cellPx, dpr);
      if (reducedMotion) drawFrame(0);
    };

    const drawFrame = (timeMs: number) => {
      if (width <= 0 || height <= 0 || sprites.length === 0) return;
      const t = reducedMotion ? 0 : timeMs / 1000;

      mouseCurrent.x += (mouseTarget.x - mouseCurrent.x) * 0.06;
      mouseCurrent.y += (mouseTarget.y - mouseCurrent.y) * 0.06;

      ctx.clearRect(0, 0, width, height);

      const angleY = t * 0.15 + mouseCurrent.x * 0.35;
      const tiltX = 0.42 + Math.sin(t * 0.08) * 0.08 + mouseCurrent.y * 0.25;
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(tiltX);
      const sinX = Math.sin(tiltX);

      const cx = width / 2 + mouseCurrent.x * 10;
      const cy = height / 2 + mouseCurrent.y * 8;
      const radius = Math.min(width, height) * 0.34;
      const half = cellPx / 2;
      const maxLevel = LEVELS.length - 1;

      // 随机闪烁：每帧少量点被重抽字符（点数翻倍后降低重抽比例控制每帧计算量）
      const flickerCount = Math.max(2, Math.floor(points.length * 0.006));
      for (let k = 0; k < flickerCount; k += 1) {
        const idx = Math.floor(Math.random() * points.length);
        flickerLevel[idx] =
          Math.random() < 0.7
            ? Math.floor(Math.random() * 5) // 偏暗闪烁
            : maxLevel - Math.floor(Math.random() * 3); // 偶发高亮
        flickerTtl[idx] = 6 + Math.floor(Math.random() * 18);
      }

      const dentActive = dentPointer.inside && !reducedMotion;
      const dentMax = DENT_DEPTH * (dentPointer.down ? DENT_DOWN_MULT : 1);
      const dentRadiusSq = DENT_RADIUS * DENT_RADIUS;

      const projected = new Float32Array(points.length * 3); // sx, sy, z
      for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        const x1 = p.x * cosY + p.z * sinY;
        const z1 = -p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        const scale = PERSPECTIVE / (PERSPECTIVE - z2);
        const wobble = Math.sin(t * 0.9 + p.phase) * 1.2;
        const baseSx = cx + x1 * scale * radius;
        const baseSy = cy + y2 * scale * radius + wobble;

        // 凹陷：指针附近点沿垂直屏幕向内（视空间 -z）压入，余弦衰减，弹簧恢复
        let dentTarget = 0;
        if (dentActive) {
          const dx = baseSx - dentPointer.x;
          const dy = baseSy - dentPointer.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < dentRadiusSq) {
            const falloff = 0.5 * (1 + Math.cos((Math.PI * Math.sqrt(distSq)) / DENT_RADIUS));
            dentTarget = falloff * dentMax;
          }
        }
        const prevDent = dentDepth[i];
        const dentK = dentTarget > prevDent ? DENT_ATTACK : DENT_RELEASE;
        const dent = prevDent + (dentTarget - prevDent) * dentK;
        dentDepth[i] = dent;

        const zDented = z2 - dent;
        const scaleDented = dent > 0 ? PERSPECTIVE / (PERSPECTIVE - zDented) : scale;
        projected[i * 3] = cx + x1 * scaleDented * radius;
        projected[i * 3 + 1] = cy + y2 * scaleDented * radius + wobble;
        projected[i * 3 + 2] = zDented;
      }

      drawOrder.sort(
        (a, b) => projected[a * 3 + 2] - projected[b * 3 + 2],
      );

      for (const i of drawOrder) {
        const z2 = projected[i * 3 + 2];
        const depthNorm = (z2 + DEPTH_RANGE) / (DEPTH_RANGE * 2); // 0 远 1 近
        const clamped = Math.min(1, Math.max(0, depthNorm));
        const brightness = 0.12 + 0.88 * Math.pow(clamped, 1.6);

        let level: number;
        if (flickerTtl[i] > 0) {
          flickerTtl[i] -= 1;
          level = flickerLevel[i];
          if (flickerTtl[i] <= 0) flickerLevel[i] = -1;
        } else {
          level = Math.floor(brightness * maxLevel);
        }
        if (level < 0) level = 0;
        else if (level > maxLevel) level = maxLevel;

        const sprite = sprites[level];
        ctx.drawImage(sprite, projected[i * 3] - half, projected[i * 3 + 1] - half, cellPx, cellPx);
      }
    };

    const loop = (timeMs: number) => {
      drawFrame(timeMs);
      rafId = visible ? window.requestAnimationFrame(loop) : 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouseTarget.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseTarget.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      dentPointer.x = event.clientX - rect.left;
      dentPointer.y = event.clientY - rect.top;
      dentPointer.inside = true;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dentPointer.down = true;
    };
    const onPointerUp = () => {
      dentPointer.down = false;
    };
    const onPointerLeave = () => {
      mouseTarget.x = 0;
      mouseTarget.y = 0;
      dentPointer.inside = false;
      dentPointer.down = false;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let intersectionObserver: IntersectionObserver | null = null;
    if (!reducedMotion) {
      rafId = window.requestAnimationFrame(loop);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointerleave', onPointerLeave);
      window.addEventListener('pointerup', onPointerUp);
      // 不可见时暂停 rAF 循环，回到视口内恢复
      intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        visible = entry ? entry.isIntersecting : true;
        if (visible && rafId === 0) {
          rafId = window.requestAnimationFrame(loop);
        }
      });
      intersectionObserver.observe(canvas);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      intersectionObserver?.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ display: 'block', background: 'transparent' }}
    />
  );
}
