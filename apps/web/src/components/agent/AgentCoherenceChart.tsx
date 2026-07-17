'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltipController,
  ResponsiveContainer,
} from 'recharts';
import type { CoherencePoint } from '@/config/agent-dimensions';
import { FloatingPortal, FLOATING_Z_INDEX, type FloatingAnchorRect } from '@/components/ui/FloatingPortal';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { getAgentLevelByXp } from '@skynet/shared';

interface AgentCoherenceChartProps {
  history: CoherencePoint[];
}

interface PortalChartTooltip {
  data: CoherencePoint;
  rect: FloatingAnchorRect;
}

interface TooltipBridgeProps {
  active?: boolean;
  payload?: Array<{
    payload?: CoherencePoint;
  }>;
  coordinate?: {
    x?: number;
    y?: number;
  };
}

interface TooltipBridgeComponentProps extends TooltipBridgeProps {
  chartRef: RefObject<HTMLDivElement | null>;
  setTooltip: Dispatch<SetStateAction<PortalChartTooltip | null>>;
}

interface ScoreCursorProps {
  points?: Array<{
    x?: number;
    y?: number;
  }>;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  payload?: unknown;
  yAxisDomain: [number, number];
}

interface ScoreDotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isCoherencePoint(value: unknown): value is CoherencePoint {
  return (
    value !== null &&
    typeof value === 'object' &&
    'date' in value &&
    'value' in value &&
    typeof value.date === 'string' &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value)
  );
}

function getObjectField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

function getCursorPayloadValue(payload: unknown): number | null {
  if (!Array.isArray(payload)) return null;
  const firstPayload = payload[0];
  const nestedPayload = getObjectField(firstPayload, 'payload');
  if (isCoherencePoint(nestedPayload)) return nestedPayload.value;

  const value = getObjectField(firstPayload, 'value');
  return isFiniteNumber(value) ? value : null;
}

function isSameTooltip(
  current: PortalChartTooltip | null,
  next: PortalChartTooltip,
) {
  return (
    current?.data.date === next.data.date &&
    current.data.value === next.data.value &&
    current.rect.left === next.rect.left &&
    current.rect.top === next.rect.top
  );
}

function getNiceStep(value: number): number {
  if (value <= 0) return 10;
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;
  if (normalized <= 1) return power;
  if (normalized <= 2) return power * 2;
  if (normalized <= 5) return power * 5;
  return power * 10;
}

function getScoreYAxisDomain(history: CoherencePoint[]): [number, number] {
  const values = history
    .map((point) => point.value)
    .filter(Number.isFinite)
    .map((value) => Math.max(0, value));

  if (values.length === 0) return [0, 10];

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const rawRange = maxValue - minValue;
  const padding = rawRange === 0 ? Math.max(10, maxValue * 0.05) : rawRange * 0.15;
  const paddedMin = Math.max(0, minValue - padding);
  const paddedMax = maxValue + padding;
  const step = getNiceStep((paddedMax - paddedMin) / 4);
  const yMin = Math.max(0, Math.floor(paddedMin / step) * step);
  const yMax = Math.max(yMin + step, Math.ceil(paddedMax / step) * step);
  return [yMin, yMax];
}

function getChartY(value: number, domain: [number, number], top: number, height: number) {
  const [min, max] = domain;
  const range = max - min;
  if (range <= 0) return top + height;
  const ratio = (value - min) / range;
  return top + height - clampNumber(ratio, 0, 1) * height;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function ScoreCrosshairCursor({
  points,
  left,
  top,
  width,
  height,
  payload,
  yAxisDomain,
}: ScoreCursorProps) {
  const x = points?.[0]?.x;
  const value = getCursorPayloadValue(payload);

  if (
    !isFiniteNumber(x) ||
    value === null ||
    !isFiniteNumber(left) ||
    !isFiniteNumber(top) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height)
  ) {
    return null;
  }

  const y = getChartY(value, yAxisDomain, top, height);

  return (
    <g
      stroke="#ADFF2F"
      strokeOpacity={0.45}
      strokeWidth={1}
      strokeDasharray="4 4"
      vectorEffect="non-scaling-stroke"
    >
      <line x1={x} y1={top} x2={x} y2={top + height} />
      <line x1={left} y1={y} x2={left + width} y2={y} />
    </g>
  );
}

function renderTodayDot(props: ScoreDotProps, lastPointIndex: number) {
  const { cx, cy, index } = props;
  if (index !== lastPointIndex || !isFiniteNumber(cx) || !isFiniteNumber(cy)) {
    return null;
  }
  return <circle cx={cx} cy={cy} r={4} fill="#040704" stroke="#ADFF2F" strokeWidth={2} />;
}

function renderActiveDot(props: ScoreDotProps) {
  const { cx, cy } = props;
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill="#040704" stroke="#ADFF2F" strokeWidth={2} />;
}

function TooltipBridge({
  active,
  payload,
  coordinate,
  chartRef,
  setTooltip,
}: TooltipBridgeComponentProps) {
  const rawPoint = payload?.[0]?.payload;
  const point = isCoherencePoint(rawPoint) ? rawPoint : undefined;
  const x = coordinate?.x;
  const y = coordinate?.y;

  useEffect(() => {
    const chartBox = chartRef.current?.getBoundingClientRect();

    if (!active || !chartBox || !point || typeof x !== 'number' || typeof y !== 'number') {
      setTooltip((current) => (current === null ? current : null));
      return;
    }

    const nextTooltip: PortalChartTooltip = {
      data: point,
      rect: {
        left: chartBox.left + x,
        top: chartBox.top + y,
        width: 1,
        height: 1,
      },
    };

    setTooltip((current) => (isSameTooltip(current, nextTooltip) ? current : nextTooltip));
  }, [active, chartRef, point, setTooltip, x, y]);

  return null;
}

export function AgentCoherenceChart({ history }: AgentCoherenceChartProps) {
  const { t } = useTranslation();
  const gradientId = useId();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<PortalChartTooltip | null>(null);
  const lastPoint = history.length > 0 ? history[history.length - 1] : null;
  const lastPointIndex = history.length - 1;
  const yAxisDomain = getScoreYAxisDomain(history);

  return (
    <div
      className="t-corner relative flex min-h-[260px] flex-col border border-[#1A2E1A] bg-[#040704]"
      role="img"
      aria-label={
        lastPoint
          ? t('agent.scoreChartAria', { score: lastPoint.value, date: lastPoint.date })
          : t('agent.scoreChartEmptyAria')
      }
    >
      {/* 标题 */}
      <div className="flex items-center justify-between border-b border-[#1A2E1A] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 bg-[#ADFF2F]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white">
            {t('agent.scoreChartTitle')}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          {t('agent.last30Days')}
        </span>
      </div>

      {/* 图表 */}
      <div
        ref={chartRef}
        className="min-h-[190px] w-full flex-1 select-none"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={history}
            margin={{ top: 10, right: 34, left: 10, bottom: 0 }}
            onMouseLeave={() => setTooltip(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ADFF2F" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#ADFF2F" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#122012" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#1A2E1A"
              tick={{ fill: '#3A5A3A', fontSize: 9, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
              interval={4}
              padding={{ left: 8, right: 18 }}
            />
            <YAxis
              domain={yAxisDomain}
              stroke="#1A2E1A"
              tick={{ fill: '#3A5A3A', fontSize: 9, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <RechartsTooltipController
              content={<TooltipBridge chartRef={chartRef} setTooltip={setTooltip} />}
              cursor={<ScoreCrosshairCursor yAxisDomain={yAxisDomain} />}
              isAnimationActive={false}
              wrapperStyle={{ display: 'none' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#ADFF2F"
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={(props) => renderTodayDot(props, lastPointIndex)}
              activeDot={renderActiveDot}
              animationDuration={0}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <FloatingPortal
        open={!!tooltip}
        anchorRect={tooltip?.rect ?? null}
        placement="top"
        align="center"
        offset={10}
        zIndex={FLOATING_Z_INDEX.tooltip}
        className="pointer-events-none border border-[#1A2E1A] bg-[#040704] px-3 py-2 text-xs"
        role="tooltip"
      >
        {tooltip &&
          (() => {
            const levelMeta = getAgentLevelByXp(tooltip.data.value);
            const levelName = t(`agent.levelNames.${levelMeta.level}`, {
              defaultValue: levelMeta.name,
            });
            return (
              <>
                <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                  {tooltip.data.date}
                </div>
                <div className="font-mono font-bold text-[#ADFF2F]">
                  {t('agent.score', { score: tooltip.data.value })}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[#3A5A3A]">
                  Lv{levelMeta.level} · {levelName}
                </div>
              </>
            );
          })()}
      </FloatingPortal>

      {/* 底部当前值 */}
      <div className="flex items-center gap-2 border-t border-[#1A2E1A] px-4 py-2.5">
        {lastPoint ? (
          <>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('agent.current')}
            </span>
            <TelemetryValue
              value={lastPoint.value}
              format={formatInteger}
              className="font-mono text-xs font-bold text-[#ADFF2F]"
            />
            <span className="font-mono text-[10px] text-[#3A5A3A]">({lastPoint.date})</span>
          </>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
            {t('agent.noData')}
          </span>
        )}
      </div>
    </div>
  );
}
