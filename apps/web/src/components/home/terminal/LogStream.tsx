'use client';

import { useEffect, useRef, useState } from 'react';

interface LogStreamProps {
  className?: string;
  rows?: number;
}

interface LogLine {
  id: number;
  stamp: string;
  text: string;
}

const LINE_HEIGHT = 16;
const FONT_SIZE = 11;
const MIN_INTERVAL = 400;
const MAX_INTERVAL = 1200;

// canvas 渲染无法消费 CSS var（渲染期含 SSR），数值与 var(--t-accent) 等值，需保持同步
const COLOR_NEON: Rgb = [0xad, 0xff, 0x2f]; // var(--t-accent) 等值
const COLOR_FADE: Rgb = [0x2e, 0x42, 0x2e]; // 暗绿/灰绿衰减终点

type Rgb = [number, number, number];

function mixRgb(a: Rgb, b: Rgb, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pct(): string {
  return (95 + Math.random() * 4.99).toFixed(2);
}

function hex(): string {
  return Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
}

function sector(): string {
  return `${rand(1, 9)}${String.fromCharCode(65 + rand(0, 5))}`;
}

// 机器数据流日志，硬编码英文，不走 i18n
const LOG_POOL: Array<() => string> = [
  () => `membrane patch applied @sector ${sector()}`,
  () => `cortical sync ${pct()}% stable`,
  () => `optic weave: frame recovered [+${rand(1, 9)}ms]`,
  () => `compiling dream buffer … ${rand(78, 99)}%`,
  () => `synapse relay 0x${hex()} ack`,
  () => `neural lattice re-indexed in ${rand(12, 240)}ms`,
  () => `pulse injector primed · ch-${rand(2, 9)}`,
  () => `memory graft verified :: checksum ok`,
  () => `peripheral nerve bus latency ${rand(3, 18)}ms`,
  () => `reflex arc recalibrated @node ${sector()}`,
  () => `sensory feed merged · drift ${rand(0, 4)}.${rand(0, 9)}px`,
  () => `adrenal throttle set to ${rand(12, 48)}%`,
  () => `ghost signal filtered · snr ${rand(18, 42)}dB`,
  () => `implant handshake 0x${hex()} … accepted`,
  () => `spinal cache flushed · ${rand(128, 4096)}kb reclaimed`,
  () => `retina overlay render pass ${rand(1, 4)}/4 done`,
  () => `dream buffer defrag · pass ${rand(1, 7)}`,
  () => `motor cortex ping ${rand(2, 14)}ms nominal`,
  () => `wetware temp ${36 + Math.random().toFixed(1).slice(1)}°C nominal`,
  () => `chassis servo group ${rand(1, 6)} torque balanced`,
  () => `audio cortex lock @${rand(20, 48)}khz`,
  () => `subdermal mesh scan · 0 anomalies`,
  () => `endocrine mixer ratio ${rand(2, 9)}:${rand(1, 5)} locked`,
  () => `black ICE probe deflected @gate ${sector()}`,
];

function formatStamp(d: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return `[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}]`;
}

function makeLine(id: number): LogLine {
  const factory = LOG_POOL[Math.floor(Math.random() * LOG_POOL.length)];
  return { id, stamp: formatStamp(new Date()), text: factory() };
}

const STREAM_CSS = `
@keyframes logstream-line-in {
  0% { opacity: 0; transform: translateY(${LINE_HEIGHT}px); }
  100% { opacity: 1; transform: translateY(0); }
}
.logstream-line {
  height: ${LINE_HEIGHT}px;
  line-height: ${LINE_HEIGHT}px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: ${FONT_SIZE}px;
  letter-spacing: 0.15em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.logstream-line--new {
  animation: logstream-line-in 140ms steps(2, end) both;
}
@media (prefers-reduced-motion: reduce) {
  .logstream-line--new { animation: none; }
}
`;

export default function LogStream({ className, rows = 8 }: LogStreamProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    let timer = 0;

    const push = () => {
      setLines((prev) => {
        idRef.current += 1;
        const next = [...prev, makeLine(idRef.current)];
        return next.slice(-rows);
      });
      timer = window.setTimeout(push, MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL));
    };

    // 启动时先铺 3 行，避免空白
    push();
    push();
    push();

    return () => {
      window.clearTimeout(timer);
    };
  }, [rows]);

  const lastId = lines.length > 0 ? lines[lines.length - 1].id : -1;
  const denom = Math.max(1, rows - 1);

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{ height: rows * LINE_HEIGHT, overflow: 'hidden' }}
    >
      <style>{STREAM_CSS}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          height: '100%',
        }}
      >
        {lines.map((line, idx) => {
          const age = lines.length - 1 - idx; // 0 = 最新
          const color = mixRgb(COLOR_NEON, COLOR_FADE, Math.min(1, age / denom));
          return (
            <div
              key={line.id}
              className={
                line.id === lastId ? 'logstream-line logstream-line--new' : 'logstream-line'
              }
              style={{ color }}
            >
              <span style={{ opacity: 0.55 }}>{line.stamp}</span> {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
