'use client';

import type { AgentLevelSummary } from '@skynet/shared';
import { useTranslation } from 'react-i18next';
import { PortalTooltip } from '@/components/ui/FloatingPortal';

interface AgentLevelBadgeProps {
  level?: AgentLevelSummary | null;
  compact?: boolean;
  showTooltip?: boolean;
}

export function AgentLevelBadge({
  level,
  compact = false,
  showTooltip = true,
}: AgentLevelBadgeProps) {
  const { t } = useTranslation();
  if (!level) return null;

  const levelName = t(`agent.levelNames.${level.level}`, { defaultValue: level.name });
  const nextLevelText = level.nextLevelXp
    ? t('agent.nextXp', { xp: Math.max(0, level.nextLevelXp - level.xpTotal) })
    : t('agent.maxLevel');
  const tooltip = (
    <div className="space-y-1">
      <div className="font-bold text-white">Lv{level.level} · {levelName}</div>
      <div className="font-mono text-[11px] text-[#ADFF2F]">{t('agent.score', { score: level.xpTotal })}</div>
      <div className="text-[11px] text-[#3A5A3A]">{nextLevelText}</div>
    </div>
  );
  const badge = (
    <span
      aria-label={t('agent.levelAria', { level: level.level, name: levelName })}
      className={`inline-flex shrink-0 items-stretch rounded-none border border-[#ADFF2F]/60 font-mono leading-none ${
        compact ? 'h-[18px] text-[10px]' : 'h-6 text-[11px]'
      }`}
    >
      {/* 荧光绿等级块 */}
      <span
        aria-hidden
        className={`inline-flex items-center bg-[#ADFF2F] font-bold text-black ${
          compact ? 'px-1' : 'px-1.5'
        }`}
      >
        Lv{level.level}
      </span>
      {!compact && (
        <span className="inline-flex items-center px-1.5 uppercase tracking-[0.15em] text-[#ADFF2F]">
          {levelName}
        </span>
      )}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <PortalTooltip content={tooltip} placement="top" align="center">
      {badge}
    </PortalTooltip>
  );
}
