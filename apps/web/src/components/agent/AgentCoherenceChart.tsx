'use client';

import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAgentLevelByXp } from '@skynet/shared';
import type { CoherencePoint } from '@/config/agent-dimensions';
import { MetricValue } from '@/components/home/terminal/MetricValue';

interface AgentCoherenceChartProps {
  history: CoherencePoint[];
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: CoherencePoint }>;
}

interface ScoreCursorProps {
  points?: Array<{ x?: number; y?: number }>;
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

const SCORE_CHART_INITIAL_DIMENSION = { width: 640, height: 190 } as const;

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
      stroke="var(--t-accent)"
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
  if (index !== lastPointIndex || !isFiniteNumber(cx) || !isFiniteNumber(cy)) return null;
  return (
    <circle cx={cx} cy={cy} r={4} fill="var(--t-panel)" stroke="var(--t-accent)" strokeWidth={2} />
  );
}

function renderActiveDot(props: ScoreDotProps) {
  const { cx, cy } = props;
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4.5}
      fill="var(--t-panel)"
      stroke="var(--t-accent)"
      strokeWidth={2}
    />
  );
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const { t } = useTranslation();
  const point = payload?.[0]?.payload;
  if (!active || !isCoherencePoint(point)) return null;
  const levelMeta = getAgentLevelByXp(point.value);
  const levelName = t(`agent.levelNames.${levelMeta.level}`, { defaultValue: levelMeta.name });
  return (
    <div className="pointer-events-none border border-[var(--t-noise)] bg-[var(--t-panel)] px-3 py-2 text-xs">
      <div className="mb-0.5 font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
        {point.date}
      </div>
      <div className="font-mono font-bold text-[var(--t-accent)]">
        {t('agent.score', { score: point.value })}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-[var(--t-faint)]">
        Lv{levelMeta.level} · {levelName}
      </div>
    </div>
  );
}

export function AgentCoherenceChart({ history }: AgentCoherenceChartProps) {
  const { t } = useTranslation();
  const lastPoint = history.length > 0 ? history[history.length - 1] : null;
  const lastPointIndex = history.length - 1;
  const yAxisDomain = getScoreYAxisDomain(history);

  return (
    <div
      className="t-corner relative flex min-h-[260px] flex-col border border-[var(--t-noise)] bg-[var(--t-panel)]"
      role="img"
      aria-label={
        lastPoint
          ? t('agent.scoreChartAria', { score: lastPoint.value, date: lastPoint.date })
          : t('agent.scoreChartEmptyAria')
      }
    >
      <div className="flex items-center justify-between border-b border-[var(--t-noise)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 bg-[var(--t-accent)]" />
          <span className="font-sans text-[12px] font-medium tracking-normal text-white">
            {t('agent.scoreChartTitle')}
          </span>
        </div>
        <span className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
          {t('agent.last30Days')}
        </span>
      </div>
      <div className="h-[190px] min-w-0 w-full shrink-0 select-none">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={SCORE_CHART_INITIAL_DIMENSION}
        >
          <AreaChart data={history} margin={{ top: 10, right: 34, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--t-noise2)" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="var(--t-noise)"
              tick={{ fill: 'var(--t-faint)', fontSize: 9, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
              interval={4}
              padding={{ left: 8, right: 18 }}
            />
            <YAxis
              domain={yAxisDomain}
              stroke="var(--t-noise)"
              tick={{ fill: 'var(--t-faint)', fontSize: 9, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <RechartsTooltip
              content={<ChartTooltip />}
              cursor={<ScoreCrosshairCursor yAxisDomain={yAxisDomain} />}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--t-accent)"
              strokeWidth={1}
              fill="var(--t-accent)"
              fillOpacity={0.06}
              dot={(props) => renderTodayDot(props, lastPointIndex)}
              activeDot={renderActiveDot}
              animationDuration={0}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--t-noise)] px-4 py-2.5">
        {lastPoint ? (
          <>
            <span className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
              {t('agent.current')}
            </span>
            <MetricValue
              value={lastPoint.value}
              format={formatInteger}
              className="font-mono text-xs font-bold text-[var(--t-accent)]"
            />
            <span className="font-mono text-[10px] text-[var(--t-faint)]">({lastPoint.date})</span>
          </>
        ) : (
          <span className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
            {t('agent.noData')}
          </span>
        )}
      </div>
    </div>
  );
}
