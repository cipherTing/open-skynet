'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, BadgeCheck, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { AgentLevelBadge } from '@/components/ui/AgentLevelBadge';
import type { AgentProfile } from '@/config/agent-dimensions';
import type { AgentHealthLevelCode } from '@skynet/shared';
import { AGENT_LEVELS } from '@skynet/shared';

function formatDate(iso: string, language: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}


function isKnownHealthCode(code: string): code is AgentHealthLevelCode {
  return code === 'good' || code === 'warning' || code === 'penalized' || code === 'banned';
}

function getHealthBadgeClasses(code: AgentHealthLevelCode): string {
  if (code === 'good') return 'border-moss/30 bg-moss/10 text-moss hover:bg-moss/15';
  if (code === 'warning') return 'border-ochre/35 bg-ochre/10 text-ochre hover:bg-ochre/15';
  if (code === 'penalized') return 'border-copper/35 bg-copper/10 text-copper hover:bg-copper/15';
  return 'border-red-500/35 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:border-red-400/35 dark:text-red-300';
}

function HealthIcon({ code }: { code: AgentHealthLevelCode }) {
  if (code === 'good') return <ShieldCheck className="h-3.5 w-3.5" />;
  if (code === 'warning' || code === 'penalized') return <ShieldAlert className="h-3.5 w-3.5" />;
  return <ShieldX className="h-3.5 w-3.5" />;
}

function daysSince(iso: string): number {
  const created = new Date(iso);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

interface AgentHeroProps {
  agent: AgentProfile;
  isOwnAgent: boolean;
}

export function AgentHero({ agent, isOwnAgent }: AgentHeroProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const level = agent.level;
  const currentLevelName = level
    ? t(`agent.levelNames.${level.level}`, { defaultValue: level.name })
    : '';
  const nextLevelXp = level?.nextLevelXp ?? null;
  const xpToNext =
    level && nextLevelXp !== null
      ? Math.max(0, nextLevelXp - level.xpTotal)
      : null;
  let nextLevelHint = t('agent.nextPrivate');
  if (isOwnAgent) {
    nextLevelHint =
      xpToNext === null ? t('agent.maxLevel') : t('agent.nextXp', { xp: xpToNext });
  }
  const activeDays = daysSince(agent.createdAt);
  const healthLevel = agent.healthLevel;
  const rawHealthCode = healthLevel?.code ?? '';
  const healthCode: AgentHealthLevelCode = isKnownHealthCode(rawHealthCode) ? rawHealthCode : 'good';
  const healthName = t(`agent.health.status.${healthCode}`);

  return (
    <div className="relative">
      {/* 背景光晕 */}
      <div className="agent-hero-glow absolute inset-0 opacity-[0.03] pointer-events-none" />

      {/* 返回按钮 */}
      <button
        onClick={() => router.back()}
        className="absolute top-4 left-4 sm:left-6 z-10 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-copper transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('agent.back')}
      </button>

      <div className="relative flex flex-col sm:flex-row items-start gap-4 sm:gap-6 px-4 sm:px-6 pt-10 pb-6 sm:pt-12 sm:pb-8">
        {/* 大头像 */}
        <div className="flex-shrink-0">
          <AgentAvatar agentId={agent.avatarSeed} agentName={agent.name} size={80} />
        </div>

        {/* 信息区 */}
        <div className="flex-1 min-w-0 pt-0 sm:pt-1">
          {/* 名称 + 凝聚等级 */}
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-xl sm:text-2xl font-display font-bold text-ink-primary tracking-deck-tight">
              {agent.name}
            </h1>
            {isOwnAgent && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-copper/25 bg-copper/10 px-2.5 py-1 text-[11px] font-bold text-copper">
                <BadgeCheck className="h-3.5 w-3.5" />
                {t('agent.mine')}
              </span>
            )}

            <PortalTooltip
              placement="bottom"
              align="start"
              contentClassName="w-72 rounded-xl py-3 px-3 shadow-xl shadow-copper/5 backdrop-blur-sm"
              content={
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
                    {t('agent.health.title')}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-ink-primary">
                    <HealthIcon code={healthCode} />
                    {healthName}
                  </div>
                  <p className="text-[11px] leading-relaxed text-ink-secondary">
                    {t('agent.health.description')}
                  </p>
                </div>
              }
            >
              <div
                tabIndex={0}
                aria-label={t('agent.health.aria', { status: healthName })}
                className={`inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${getHealthBadgeClasses(healthCode)}`}
              >
                <HealthIcon code={healthCode} />
                <span>{t('agent.health.badge', { label: t('agent.health.label'), status: healthName })}</span>
              </div>
            </PortalTooltip>
            <PortalTooltip
              placement="bottom"
              align="start"
              contentClassName="w-80 rounded-xl py-2 px-1 shadow-xl shadow-copper/5 backdrop-blur-sm"
              content={
                <div className="space-y-2">
                  <div className="mx-1 rounded-lg border border-moss/25 bg-moss/10 px-3 py-2">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
                      {t('agent.currentLevel')}
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-sm font-mono font-bold text-moss">
                        {level ? `Lv${level.level} · ${currentLevelName}` : t('agent.inactive')}
                      </span>
                      <span className="text-[11px] text-ink-muted">
                        {t('agent.score', { score: level?.xpTotal ?? 0 })}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
                      {nextLevelHint}
                    </div>
                  </div>
                  <div className="deck-divider mx-2" />
                  <div className="max-h-64 overflow-y-auto px-1">
                    {AGENT_LEVELS.map((item) => {
                      const isCurrent = level?.level === item.level;
                      const itemName = t(`agent.levelNames.${item.level}`, {
                        defaultValue: item.name,
                      });
                      const unlocks = t(`agent.levelUnlocks.${item.level}`, {
                        defaultValue: item.unlocks.join(' / '),
                      });
                      return (
                        <div
                          key={item.level}
                          className={`mx-1 rounded-lg border px-3 py-2 transition-colors ${
                            isCurrent
                              ? 'border-moss/40 bg-moss/15'
                              : 'border-transparent hover:bg-void-hover'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className={`text-xs font-bold ${
                                isCurrent ? 'text-moss' : 'text-ink-secondary'
                              }`}
                            >
                              Lv{item.level} · {itemName}
                            </span>
                            <span className="font-mono text-[10px] text-ink-muted">
                              {item.minXp} XP
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] leading-relaxed text-ink-muted">
                            {unlocks}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              }
            >
              <div
                tabIndex={0}
                className="flex cursor-help items-center gap-2 rounded-full border border-moss bg-moss/10 px-3 py-1.5 transition-all duration-200 hover:bg-moss/20 hover:shadow-[0_0_20px_rgba(100,160,120,0.35)]"
              >
                <AgentLevelBadge level={level} showTooltip={false} />
                <span className="text-xs font-mono font-bold tracking-wider text-moss">
                  {t('agent.score', { score: level?.xpTotal ?? 0 })}
                </span>
              </div>
            </PortalTooltip>
          </div>

          {/* 元信息 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-ink-muted mb-3">
            <span>u/{agent.name}</span>
            <span className="hidden sm:inline w-1 h-1 rounded-full bg-ink-muted/50" />
            <span>{t('agent.registeredAt', { date: formatDate(agent.createdAt, i18n.resolvedLanguage || i18n.language) })}</span>
            <span className="hidden sm:inline w-1 h-1 rounded-full bg-ink-muted/50" />
            <span>{t('agent.activeDays', { count: activeDays })}</span>
          </div>

          {/* 描述 */}
          <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed max-w-2xl">
            {agent.description}
          </p>
        </div>
      </div>

      {/* 底部分隔线 */}
      <div className="deck-divider mx-4 sm:mx-6" />
    </div>
  );
}
