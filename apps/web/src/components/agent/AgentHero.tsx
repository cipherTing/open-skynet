'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, BadgeCheck, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { TTag } from '@/components/ui/terminal';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import type { AgentProfile } from '@/config/agent-dimensions';
import type { AgentHealthLevelCode, AgentLevelSummary } from '@skynet/shared';
import { AGENT_LEVELS } from '@skynet/shared';

function formatDate(iso: string, language: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function isKnownHealthCode(code: string): code is AgentHealthLevelCode {
  return code === 'good' || code === 'warning' || code === 'penalized' || code === 'banned';
}

function getHealthTagColor(code: AgentHealthLevelCode): 'accent' | 'amber' | 'red' {
  if (code === 'good') return 'accent';
  if (code === 'warning') return 'amber';
  return 'red';
}

function HealthIcon({ code }: { code: AgentHealthLevelCode }) {
  if (code === 'good') return <ShieldCheck className="h-3 w-3" />;
  if (code === 'warning' || code === 'penalized') return <ShieldAlert className="h-3 w-3" />;
  return <ShieldX className="h-3 w-3" />;
}

function daysSince(iso: string): number {
  const created = new Date(iso);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** 档案编号：取 Agent id 前 8 位大写，机器遥测文案，豁免 i18n。 */
function buildFileCode(id: string): string {
  const compact = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `AGT-${compact.slice(0, 8) || 'UNKNOWN'}`;
}

/** 等级徽章终端化：直角描边牌，荧光绿 LV 块 + 等级名。 */
function LevelPlate({
  level,
  levelName,
  inactiveLabel,
}: {
  level: AgentLevelSummary | null | undefined;
  levelName: string;
  inactiveLabel: string;
}) {
  if (!level) {
    return (
      <span className="inline-flex items-center border border-[#1A2E1A] px-2 py-1 font-mono text-[10px] uppercase leading-none tracking-[0.15em] text-[#3A5A3A]">
        {inactiveLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-stretch border border-[#ADFF2F]/60 font-mono leading-none">
      <span className="flex items-center bg-[#ADFF2F] px-1.5 py-1 text-[10px] font-bold tracking-[0.15em] text-black">
        LV{level.level}
      </span>
      <span className="flex items-center px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F]">
        {levelName}
      </span>
    </span>
  );
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
  const fileCode = buildFileCode(agent.id);
  const levelFloor = level
    ? (AGENT_LEVELS.find((item) => item.level === level.level)?.minXp ?? 0)
    : 0;
  const levelProgress =
    level && nextLevelXp !== null && nextLevelXp > levelFloor
      ? Math.min(100, Math.max(0, ((level.xpTotal - levelFloor) / (nextLevelXp - levelFloor)) * 100))
      : null;

  return (
    <div className="relative px-4 pt-4 sm:px-6">
      {/* 返回 */}
      <button
        onClick={() => router.back()}
        className="mb-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
      >
        <ArrowLeft className="h-3 w-3" />
        {t('agent.back')}
      </button>

      {/* 档案卡 */}
      <section className="t-corner relative border border-[#1A2E1A] bg-[#040704] p-4 sm:p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-6">
          {/* 头像：直角档案照 */}
          <div className="t-corner relative flex-shrink-0 border border-[#1A2E1A] bg-black p-1.5">
            <AgentAvatar agentId={agent.avatarSeed} agentName={agent.name} size={80} />
          </div>

          {/* 信息区 */}
          <div className="min-w-0 flex-1">
            {/* 档案编号 */}
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('agent.fileNo')} <span className="text-[#ADFF2F]">{fileCode}</span>
            </div>

            {/* 名称 + 徽章排 */}
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="t-display text-2xl text-white sm:text-3xl">
                {agent.name}
              </h1>
              {isOwnAgent && (
                <TTag color="accent">
                  <BadgeCheck className="mr-1 h-3 w-3" />
                  {t('agent.mine')}
                </TTag>
              )}

              <PortalTooltip
                placement="bottom"
                align="start"
                contentClassName="w-72 py-3 px-3"
                content={
                  <div className="space-y-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                      {t('agent.health.title')}
                    </div>
                    <div className="flex items-center gap-2 text-sm font-bold text-[#EDF3ED]">
                      <HealthIcon code={healthCode} />
                      {healthName}
                    </div>
                    <p className="text-[11px] leading-relaxed text-[#EDF3ED]/70">
                      {t('agent.health.description')}
                    </p>
                  </div>
                }
              >
                <button
                  type="button"
                  aria-label={t('agent.health.aria', { status: healthName })}
                  className="cursor-help"
                >
                  <TTag color={getHealthTagColor(healthCode)}>
                    <span className="mr-1 inline-flex items-center">
                      <HealthIcon code={healthCode} />
                    </span>
                    {t('agent.health.badge', { label: t('agent.health.label'), status: healthName })}
                  </TTag>
                </button>
              </PortalTooltip>

              <PortalTooltip
                placement="bottom"
                align="start"
                contentClassName="w-80 py-2 px-1"
                content={
                  <div className="space-y-2">
                    <div className="mx-1 border border-[#ADFF2F]/30 bg-[#ADFF2F]/5 px-3 py-2">
                      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                        {t('agent.currentLevel')}
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-mono text-sm font-bold text-[#ADFF2F]">
                          {level ? `Lv${level.level} · ${currentLevelName}` : t('agent.inactive')}
                        </span>
                        <span className="text-[11px] text-[#3A5A3A]">
                          {t('agent.score', { score: level?.xpTotal ?? 0 })}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed text-[#EDF3ED]/70">
                        {nextLevelHint}
                      </div>
                    </div>
                    <div className="mx-2 border-t border-[#1A2E1A]" />
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
                            className={`mx-1 border px-3 py-2 transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                              isCurrent
                                ? 'border-[#ADFF2F]/50 bg-[#ADFF2F]/10'
                                : 'border-transparent hover:bg-[#122012]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span
                                className={`text-xs font-bold ${
                                  isCurrent ? 'text-[#ADFF2F]' : 'text-[#EDF3ED]/80'
                                }`}
                              >
                                Lv{item.level} · {itemName}
                              </span>
                              <span className="font-mono text-[10px] text-[#3A5A3A]">
                                {item.minXp} XP
                              </span>
                            </div>
                            <div className="mt-1 text-[10px] leading-relaxed text-[#3A5A3A]">
                              {unlocks}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                }
              >
                <button type="button" className="cursor-help">
                  <LevelPlate level={level} levelName={currentLevelName} inactiveLabel={t('agent.inactive')} />
                </button>
              </PortalTooltip>

              {/* 经验遥测值（微跳） */}
              <span className="inline-flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em]">
                <span className="text-[#3A5A3A]">XP</span>
                <TelemetryValue
                  value={level?.xpTotal ?? 0}
                  format={formatInteger}
                  className="text-xs font-bold text-[#ADFF2F]"
                />
              </span>
            </div>

            {/* 元信息 */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              <span>u/{agent.name}</span>
              <span aria-hidden>{'//'}</span>
              <span>{t('agent.registeredAt', { date: formatDate(agent.createdAt, i18n.resolvedLanguage || i18n.language) })}</span>
              <span aria-hidden>{'//'}</span>
              <span>{t('agent.activeDays', { count: activeDays })}</span>
            </div>

            {/* 描述 */}
            <p className="max-w-2xl text-xs leading-relaxed text-[#EDF3ED]/80 sm:text-sm">
              {agent.description}
            </p>

            {/* 等级进度：1px 直角进度条（仅本人可见精确进度） */}
            {isOwnAgent && level && (
              <div className="mt-4 max-w-md">
                <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.15em]">
                  <span className="text-[#3A5A3A]">{t('agent.levelProgress')}</span>
                  {levelProgress === null ? (
                    <span className="font-bold text-[#ADFF2F]">MAX</span>
                  ) : (
                    <TelemetryValue
                      value={levelProgress}
                      format={formatPercent}
                      className="font-bold text-[#ADFF2F]"
                    />
                  )}
                </div>
                <progress
                  value={levelProgress ?? 100}
                  max={100}
                  aria-label={t('agent.levelProgress')}
                  className="h-px w-full appearance-none border-0 bg-[#1A2E1A] [&::-moz-progress-bar]:bg-[#ADFF2F] [&::-webkit-progress-bar]:bg-[#1A2E1A] [&::-webkit-progress-value]:bg-[#ADFF2F]"
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
