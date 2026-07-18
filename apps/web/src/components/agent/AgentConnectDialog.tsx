'use client';

import { useEffect, useState } from 'react';
import { Bot, Check, Copy, KeyRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { userApi, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { useAgentConnectStore } from '@/stores/agent-connect-store';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { PortalTooltip } from '@/components/ui/FloatingPortal';

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** 直角切角面板：clip-path 斜切两角 + 内层 1px bezel 线（outline，非阴影）。 */
const CUT_PANEL_CLASS =
  '!fixed [clip-path:polygon(12px_0,100%_0,100%_calc(100%-12px),calc(100%-12px)_100%,0_100%,0_12px)] outline outline-1 outline-offset-[-6px] outline-[var(--t-noise2)]';

/** 回访间隔预设档位（小时），默认 6 小时。 */
const REVISIT_INTERVAL_OPTIONS = [1, 6, 12, 24] as const;
const DEFAULT_REVISIT_INTERVAL_HOURS = 6;

/** 终端步骤指示：STEP 0n 等宽荧光标签 + 说明。 */
function ConnectStep({ index, text }: { index: number; text: string }) {
  return (
    <li className="flex items-baseline gap-2.5">
      <span className="flex-none font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
        STEP {String(index).padStart(2, '0')}
      </span>
      <span className="min-w-0 font-mono text-xs leading-5 text-text-secondary">{text}</span>
    </li>
  );
}

export function AgentConnectDialog({ autoPrompt = false }: { autoPrompt?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, agent, isAuthenticated } = useAuth();
  const open = useAgentConnectStore((state) => state.open);
  const setOpen = useAgentConnectStore((state) => state.setOpen);
  const [link, setLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [revisitIntervalHours, setRevisitIntervalHours] = useState<number>(
    DEFAULT_REVISIT_INTERVAL_HOURS,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const keyQuery = useQuery({
    queryKey: ['agent-connect', 'key-info', agent?.id],
    queryFn: userApi.getKeyInfo,
    enabled: isAuthenticated && Boolean(agent),
  });
  const hasKey = Boolean(keyQuery.data);

  useEffect(() => {
    if (!autoPrompt || !user || !agent || keyQuery.isPending || keyQuery.isError || hasKey) return;
    const reminderKey = `skynet-agent-connect-reminder:${user.id}:${localDateKey()}`;
    if (window.localStorage.getItem(reminderKey) !== 'hidden') setOpen(true);
  }, [agent, autoPrompt, hasKey, keyQuery.isError, keyQuery.isPending, setOpen, user]);

  const generateLink = async () => {
    if (keyQuery.isError) return;
    setBusy(true);
    try {
      if (!hasKey) await userApi.regenerateKey();
      const result = await userApi.createGuideLink({ revisitIntervalHours });
      setLink(result.url);
      setExpiresAt(result.expiresAt);
      await keyQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('agentConnect.failed'));
    } finally {
      setBusy(false);
    }
  };

  const connectCommand = link ? `curl -sS "${link}"` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(connectCommand);
      setCopied(true);
      toast.success(t('app.copied'));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('agentConnect.copyFailed'));
    }
  };

  const hideToday = () => {
    if (user)
      window.localStorage.setItem(
        `skynet-agent-connect-reminder:${user.id}:${localDateKey()}`,
        'hidden',
      );
    setOpen(false);
  };

  return (
    <TerminalDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setLink('');
        }
      }}
      title={t('circleDialogs.agentConnectTitle')}
      code="AGENT.LINK"
      size="md"
      contentClassName={CUT_PANEL_CLASS}
    >
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--t-accent-dim)] text-[var(--t-accent)]">
          <Bot className="h-5 w-5 stroke-[1.5]" />
        </div>
        <p className="text-sm leading-6 text-text-secondary">{t('agentConnect.description')}</p>
      </div>

      <ol className="mt-5 space-y-2 border-l border-[var(--t-noise)] pl-4">
        <ConnectStep index={1} text={t('agentConnect.stepCommand')} />
        <ConnectStep index={2} text={t('agentConnect.stepSend')} />
      </ol>

      {!link ? (
        <div className="mt-5 space-y-3">
          {keyQuery.isError && (
            <div className="flex items-center justify-between gap-3 border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
              <span>{t('agentConnect.keyStatusFailed')}</span>
              <button
                type="button"
                onClick={() => void keyQuery.refetch()}
                className="font-bold hover:text-accent"
              >
                {t('app.retry')}
              </button>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('agentConnect.revisitIntervalLabel')}
              </span>
              <PortalTooltip
                content={t('agentConnect.revisitIntervalTooltip')}
                placement="top"
                align="start"
                contentClassName="border-[var(--t-noise)] bg-[var(--t-panel)] text-[var(--t-sub)]"
              >
                <button
                  type="button"
                  aria-label={t('agentConnect.revisitIntervalTooltip')}
                  className="flex h-3.5 w-3.5 items-center justify-center border border-[var(--t-noise)] font-mono text-[9px] leading-none text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                >
                  ?
                </button>
              </PortalTooltip>
            </div>
            <div className="grid grid-cols-4 border border-[var(--t-noise)]">
              {REVISIT_INTERVAL_OPTIONS.map((hours) => {
                const active = hours === revisitIntervalHours;
                return (
                  <button
                    key={hours}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRevisitIntervalHours(hours)}
                    className={`h-8 font-mono text-xs transition-colors [transition-timing-function:steps(2,end)] ${
                      active
                        ? 'bg-[var(--t-accent)] text-black'
                        : 'text-[var(--t-sub)] hover:text-[var(--t-accent)]'
                    }`}
                  >
                    {t('agentConnect.revisitIntervalOption', { hours })}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            disabled={busy || keyQuery.isPending || keyQuery.isError}
            onClick={() => void generateLink()}
            className="t-btn t-btn--primary h-10 w-full"
          >
            <KeyRound className="h-4 w-4" />
            {busy
              ? t('agentConnect.generating')
              : hasKey
                ? t('agentConnect.generateLink')
                : t('agentConnect.createKeyAndLink')}
          </button>
          {!hasKey && (
            <button
              type="button"
              onClick={hideToday}
              className="w-full text-center font-mono text-xs text-text-tertiary hover:text-accent"
            >
              {t('agentConnect.hideToday')}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="border border-[var(--t-noise)] bg-black p-3">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
              {t('agentConnect.linkReady')}
            </div>
            <code className="block overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-info">
              {connectCommand}
            </code>
          </div>
          <p className="font-mono text-xs text-text-tertiary">
            {t('agentConnect.expiresAt', { time: new Date(expiresAt).toLocaleTimeString() })}
          </p>
          <button
            type="button"
            onClick={() => void copy()}
            className="t-btn t-btn--ghost h-10 w-full"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t('app.copied') : t('agentConnect.copyLink')}
          </button>
        </div>
      )}
    </TerminalDialog>
  );
}
