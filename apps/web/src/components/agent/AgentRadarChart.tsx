'use client';

import { memo, useMemo } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { AgentDimensions } from '@/config/agent-dimensions';
import { getDimensionGrade } from '@/config/agent-dimensions';
import { PortalTooltip } from '@/components/ui/FloatingPortal';

interface AgentRadarChartProps {
  dimensions: AgentDimensions;
}

interface RadarDataItem {
  dimension: string;
  description: string;
  value: number;
  grade: string;
  key: keyof AgentDimensions;
}

/**
 * 6 个维度均匀分布在正六边形顶点。
 * outerRadius = 105px，标签半径取 116px 留出安全间距。
 * 角度从 12 点方向（-90°）开始，每 60° 一个维度。
 */
const R_LABEL = 116;
const LABEL_POSITIONS = (() => {
  const angles = [270, 330, 30, 90, 150, 210].map((d) => (d * Math.PI) / 180);
  return angles.map((a) => ({
    x: Math.round(Math.cos(a) * R_LABEL * 10) / 10,
    y: Math.round(Math.sin(a) * R_LABEL * 10) / 10,
  }));
})();

const DimensionLabel = memo(function DimensionLabel({
  item,
  index,
}: {
  item: RadarDataItem;
  index: number;
}) {
  const pos = LABEL_POSITIONS[index];

  return (
    <div
      className="absolute left-1/2 top-1/2 pointer-events-auto group"
      style={{ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
    >
      <PortalTooltip
        placement={pos.y > 0 ? 'top' : 'bottom'}
        content={
          <>
            <div className="mb-1 flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
                {item.dimension}
              </span>
              <span className="font-mono text-[10px] text-[var(--t-faint)]">{item.grade}</span>
            </div>
            <p>{item.description}</p>
          </>
        }
        contentClassName="min-w-[180px]"
      >
        <div tabIndex={0} className="cursor-help text-center leading-tight">
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-text)]">
            {item.dimension}
          </div>
          <div className="mt-0.5 font-mono text-[10px] font-bold text-[var(--t-accent)]">
            {item.grade}
          </div>
        </div>
      </PortalTooltip>
    </div>
  );
});

export function AgentRadarChart({ dimensions }: AgentRadarChartProps) {
  const { t } = useTranslation();
  const data: RadarDataItem[] = useMemo(
    () =>
      (Object.keys(dimensions) as Array<keyof AgentDimensions>).map((key) => ({
        dimension: t(`agent.dimensions.${key}.label`),
        description: t(`agent.dimensions.${key}.description`),
        value: dimensions[key],
        grade: getDimensionGrade(dimensions[key]),
        key,
      })),
    [dimensions, t],
  );

  const ariaLabel = useMemo(
    () => t('agent.radarAria', { items: data.map((d) => `${d.dimension} ${d.grade}`).join('，') }),
    [data, t],
  );

  return (
    <div
      className="t-corner relative flex min-h-[340px] flex-col border border-[var(--t-noise)] bg-[var(--t-panel)] outline-none focus:outline-none"
      role="img"
      aria-label={ariaLabel}
    >
      {/* 标题 */}
      <div className="flex items-center gap-2 border-b border-[var(--t-noise)] px-4 py-2.5">
        <div className="h-1.5 w-1.5 bg-[var(--t-accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white">
          {t('agent.radarTitle')}
        </span>
      </div>

      {/* 雷达图 */}
      <div className="relative flex min-h-[260px] flex-1 select-none items-center justify-center px-4">
        <div className="pointer-events-none relative aspect-square max-h-[280px] w-full select-none">
          {/* 维度标签 overlay — 从中心精确偏移到顶点 */}
          <div className="absolute inset-0 z-10 select-none">
            {data.map((item, i) => (
              <DimensionLabel key={item.key} item={item} index={i} />
            ))}
          </div>

          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="var(--t-noise)" strokeWidth={1} />
              <PolarAngleAxis dataKey="dimension" tick={false} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name=""
                dataKey="value"
                stroke="var(--t-accent)"
                strokeWidth={1}
                fill="var(--t-accent)"
                fillOpacity={0.08}
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
