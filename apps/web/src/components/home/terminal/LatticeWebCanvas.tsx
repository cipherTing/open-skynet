'use client';

import { useEffect, useRef } from 'react';

const MAX_DPR = 1.5;

/** 固定种子：节点布局跨 resize 稳定，不闪烁。 */
const SEED = 0x51ce;
/** 节点池上限；实际启用数按面积在 [NODE_MIN, NODE_POOL] 间取值（面积/NODE_AREA）。 */
const NODE_POOL = 700;
const NODE_MIN = 400;
const NODE_AREA = 2800;

/** 连线距离阈值：clamp(min(宽, 高) * LINK_RATIO, LINK_MIN, LINK_MAX)。 */
const LINK_RATIO = 0.09;
const LINK_MIN = 60;
const LINK_MAX = 110;
/**
 * 邻接表重建间隔（帧）。节点漂移为正弦微幅（≤ DRIFT_AMP px）且排斥位移 ≤ REPEL_MAX px，
 * 相对距离逐帧变化极小，跨帧复用邻接表在视觉上无差；重建本身用空间网格做到近 O(n)。
 */
const LINK_REBUILD_INTERVAL = 12;

const HOVER_RADIUS = 120;
const REPEL_FORCE = 1.4;
const REPEL_MAX = 26;
const REPEL_DECAY = 0.92;
const DRIFT_AMP = 16;

const PULSE_SPEED = 320; // px/s，涟漪外扩速度
const PULSE_SIGMA = 46; // 点亮带宽（高斯 σ）
const PULSE_TRAIL = 3; // 半径超过 maxRadius + 3σ 后回收脉冲
const MAX_PULSES = 6;

/** 亮度超过该阈值即视为「点亮」，进入荧光绿绘制通道。 */
const BRIGHT_LIT = 0.12;

const COLOR_EDGE = 'rgba(26, 46, 26, 0.55)';
const COLOR_EDGE_LIT = 'rgba(173, 255, 47, 0.3)';
const COLOR_NODE = '#1A2E1A';
const COLOR_NODE_LIT = '#ADFF2F';

interface LatticeNode {
  /** 归一化基准坐标（0-1 比例），resize 时按新尺寸重投影，避免布局闪烁。 */
  bx: number;
  by: number;
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
  /** 方块半边长（0.5 或 1px，即绘制尺寸 1-2px），零圆角终端美学。 */
  half: number;
  /** 鼠标排斥位移，每帧衰减。 */
  ox: number;
  oy: number;
  bright: number;
}

interface Pulse {
  x: number;
  y: number;
  start: number;
}

/** 确定性 PRNG：同一 seed 下节点布局稳定。 */
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

function createNodes(): LatticeNode[] {
  const rand = mulberry32(SEED);
  return Array.from({ length: NODE_POOL }, () => ({
    bx: rand(),
    by: rand(),
    phaseX: rand() * Math.PI * 2,
    phaseY: rand() * Math.PI * 2,
    speedX: 0.00006 + rand() * 0.0001,
    speedY: 0.00006 + rand() * 0.0001,
    half: rand() < 0.18 ? 1 : 0.5,
    ox: 0,
    oy: 0,
    bright: 0,
  }));
}

export interface LatticeWebCanvasProps {
  className?: string;
  interactive?: boolean;
}

/**
 * 蛛网场装饰背景：固定种子高密度播撒节点（400-700 个，1-2px 小方块），
 * 按距离阈值连 1px 暗绿短线织成致密网眼，整体正弦漂移。
 * interactive 时：鼠标半径内节点提亮（荧光绿 #ADFF2F）并轻微排斥；
 * pointerdown 从点击处发射脉冲环，沿途密集节点依次点亮、向外涟漪式扩散衰减，
 * 呈神经传导观感，可叠加多个。
 * 自身 pointer-events-none：通过 window 监听指针，绝不遮挡上层内容；
 * 落在链接/按钮等控件上的点击只放行、不起脉冲。
 * 性能防御：空间网格 + 邻接表每 12 帧重建（替代逐帧 O(n²) 全配对检查）、
 * 批量 path stroke、DPR ≤ 1.5、IntersectionObserver 离屏停 rAF、
 * prefers-reduced-motion 降级为静态帧（不注册交互、不起循环）、卸载完整清理。
 */
export default function LatticeWebCanvas({ className, interactive = true }: LatticeWebCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const live = interactive && !reducedMotion;

    const nodes = createNodes();
    const pulses: Pulse[] = [];
    const xs = new Float32Array(NODE_POOL);
    const ys = new Float32Array(NODE_POOL);
    /** 邻接表：扁平 (i, j) 对，每 LINK_REBUILD_INTERVAL 帧重建一次。 */
    const links: number[] = [];
    const litPairs: number[] = [];
    /** 空间网格（链表法，零逐帧分配）：cell 边长 = 连线阈值，3x3 邻域即可覆盖全部候选。 */
    let gridHead = new Int32Array(0);
    const gridNext = new Int32Array(NODE_POOL);
    let gridCols = 0;
    let gridRows = 0;

    let width = 0;
    let height = 0;
    let linkDist = 90;
    let maxRadius = 800;
    let activeCount = NODE_POOL;
    let rafId = 0;
    let frame = 0;
    let linksDirty = true;
    const mouse = { x: 0, y: 0, inside: false };

    const rebuildLinks = () => {
      gridHead.fill(-1);
      for (let i = 0; i < activeCount; i += 1) {
        const cx = Math.min(gridCols - 1, Math.max(0, Math.floor(xs[i] / linkDist)));
        const cy = Math.min(gridRows - 1, Math.max(0, Math.floor(ys[i] / linkDist)));
        const cell = cy * gridCols + cx;
        gridNext[i] = gridHead[cell];
        gridHead[cell] = i;
      }
      links.length = 0;
      const thresholdSq = linkDist * linkDist;
      for (let i = 0; i < activeCount; i += 1) {
        const cx = Math.min(gridCols - 1, Math.max(0, Math.floor(xs[i] / linkDist)));
        const cy = Math.min(gridRows - 1, Math.max(0, Math.floor(ys[i] / linkDist)));
        const gxMin = Math.max(0, cx - 1);
        const gxMax = Math.min(gridCols - 1, cx + 1);
        const gyMin = Math.max(0, cy - 1);
        const gyMax = Math.min(gridRows - 1, cy + 1);
        for (let gy = gyMin; gy <= gyMax; gy += 1) {
          for (let gx = gxMin; gx <= gxMax; gx += 1) {
            for (let j = gridHead[gy * gridCols + gx]; j !== -1; j = gridNext[j]) {
              if (j <= i) continue;
              const dx = xs[i] - xs[j];
              if (dx > linkDist || dx < -linkDist) continue;
              const dy = ys[i] - ys[j];
              if (dy > linkDist || dy < -linkDist) continue;
              if (dx * dx + dy * dy > thresholdSq) continue;
              links.push(i, j);
            }
          }
        }
      }
      linksDirty = false;
    };

    const drawFrame = (stamp: number) => {
      // 回收已扩散出屏幕的脉冲
      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const r = ((stamp - pulses[i].start) / 1000) * PULSE_SPEED;
        if (r > maxRadius + PULSE_SIGMA * PULSE_TRAIL) pulses.splice(i, 1);
      }

      // 节点：正弦漂移 + 鼠标排斥/提亮 + 脉冲点亮
      for (let i = 0; i < activeCount; i += 1) {
        const node = nodes[i];
        node.ox *= REPEL_DECAY;
        node.oy *= REPEL_DECAY;

        const driftX = node.bx * width + Math.sin(stamp * node.speedX + node.phaseX) * DRIFT_AMP;
        const driftY = node.by * height + Math.cos(stamp * node.speedY + node.phaseY) * DRIFT_AMP;

        let bright = 0;
        if (live && mouse.inside) {
          const dx = driftX - mouse.x;
          const dy = driftY - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < HOVER_RADIUS) {
            const falloff = 1 - d / HOVER_RADIUS;
            bright += falloff;
            if (d > 0.5) {
              node.ox += (dx / d) * REPEL_FORCE * falloff;
              node.oy += (dy / d) * REPEL_FORCE * falloff;
              const mag = Math.hypot(node.ox, node.oy);
              if (mag > REPEL_MAX) {
                node.ox = (node.ox / mag) * REPEL_MAX;
                node.oy = (node.oy / mag) * REPEL_MAX;
              }
            }
          }
        }

        const x = driftX + node.ox;
        const y = driftY + node.oy;
        xs[i] = x;
        ys[i] = y;

        for (const pulse of pulses) {
          const r = ((stamp - pulse.start) / 1000) * PULSE_SPEED;
          const fade = 1 - r / maxRadius;
          if (fade <= 0) continue;
          const delta = Math.hypot(x - pulse.x, y - pulse.y) - r;
          bright += Math.exp(-(delta * delta) / (2 * PULSE_SIGMA * PULSE_SIGMA)) * fade;
        }
        node.bright = Math.min(1, bright);
      }

      // 邻接表：位置已更新，按间隔重建（漂移/排斥均为小位移，跨帧复用无视觉误差）
      frame = (frame + 1) % LINK_REBUILD_INTERVAL;
      if (linksDirty || frame === 0) rebuildLinks();

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;

      // 连线：暗绿基底合并为一条 path；含点亮节点的线收集后批量提亮
      litPairs.length = 0;
      ctx.strokeStyle = COLOR_EDGE;
      ctx.beginPath();
      for (let k = 0; k < links.length; k += 2) {
        const i = links[k];
        const j = links[k + 1];
        if (nodes[i].bright > BRIGHT_LIT || nodes[j].bright > BRIGHT_LIT) {
          litPairs.push(i, j);
        } else {
          ctx.moveTo(xs[i], ys[i]);
          ctx.lineTo(xs[j], ys[j]);
        }
      }
      ctx.stroke();

      if (litPairs.length > 0) {
        ctx.strokeStyle = COLOR_EDGE_LIT;
        ctx.beginPath();
        for (let k = 0; k < litPairs.length; k += 2) {
          const i = litPairs[k];
          const j = litPairs[k + 1];
          ctx.moveTo(xs[i], ys[i]);
          ctx.lineTo(xs[j], ys[j]);
        }
        ctx.stroke();
      }

      // 节点：暗绿基底批量，点亮节点按亮度逐个填荧光绿方块
      ctx.fillStyle = COLOR_NODE;
      ctx.beginPath();
      for (let i = 0; i < activeCount; i += 1) {
        if (nodes[i].bright > BRIGHT_LIT) continue;
        const half = nodes[i].half;
        ctx.rect(xs[i] - half, ys[i] - half, half * 2, half * 2);
      }
      ctx.fill();

      ctx.fillStyle = COLOR_NODE_LIT;
      for (let i = 0; i < activeCount; i += 1) {
        const bright = nodes[i].bright;
        if (bright <= BRIGHT_LIT) continue;
        const half = nodes[i].half;
        ctx.globalAlpha = Math.min(1, 0.25 + bright * 0.75);
        ctx.fillRect(xs[i] - half, ys[i] - half, half * 2, half * 2);
      }
      ctx.globalAlpha = 1;

      // 脉冲环本体：1px 荧光绿圆环，随半径衰减
      for (const pulse of pulses) {
        const r = ((stamp - pulse.start) / 1000) * PULSE_SPEED;
        const fade = 1 - r / maxRadius;
        if (r < 2 || fade <= 0) continue;
        ctx.strokeStyle = `rgba(173, 255, 47, ${(fade * 0.35).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
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
      linkDist = Math.min(LINK_MAX, Math.max(LINK_MIN, Math.min(width, height) * LINK_RATIO));
      maxRadius = Math.hypot(width, height);
      activeCount = Math.max(NODE_MIN, Math.min(NODE_POOL, Math.round((width * height) / NODE_AREA)));
      gridCols = Math.max(1, Math.ceil(width / linkDist));
      gridRows = Math.max(1, Math.ceil(height / linkDist));
      if (gridHead.length !== gridCols * gridRows) {
        gridHead = new Int32Array(gridCols * gridRows);
      }
      linksDirty = true;
      if (reducedMotion) drawFrame(0);
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

    let detachPointer: (() => void) | null = null;
    if (live) {
      const onPointerMove = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        mouse.x = x;
        mouse.y = y;
        mouse.inside =
          x >= -HOVER_RADIUS &&
          y >= -HOVER_RADIUS &&
          x <= width + HOVER_RADIUS &&
          y <= height + HOVER_RADIUS;
      };
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (target instanceof Element && target.closest('a, button, input, textarea, select')) {
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (x < 0 || y < 0 || x > width || y > height) return;
        if (pulses.length >= MAX_PULSES) pulses.shift();
        pulses.push({ x, y, start: performance.now() });
      };
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown);
      detachPointer = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerdown', onPointerDown);
      };
    }

    return () => {
      stop();
      detachPointer?.();
      visibilityObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [interactive]);

  const hostClass = ['pointer-events-none absolute inset-0 overflow-hidden', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={hostRef} aria-hidden="true" className={hostClass}>
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
