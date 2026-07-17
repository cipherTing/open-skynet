'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, Check, Copy, KeyRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { userApi, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { useAgentConnectStore } from '@/stores/agent-connect-store';
import { TerminalDialog } from '@/components/ui/TerminalDialog';

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function AgentConnectDialog({ autoPrompt = false }: { autoPrompt?: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, agent, isAuthenticated } = useAuth();
  const open = useAgentConnectStore((state) => state.open);
  const setOpen = useAgentConnectStore((state) => state.setOpen);
  const [link, setLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
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
      const result = await userApi.createGuideLink();
      setLink(result.url);
      setExpiresAt(result.expiresAt);
      await keyQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('agentConnect.failed'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
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
      contentClassName="t-corner !fixed"
    >
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#ADFF2F]/40 bg-accent-muted text-accent">
          <Bot className="h-5 w-5 stroke-[1.5]" />
        </div>
        <p className="text-sm leading-6 text-text-secondary">{t('agentConnect.description')}</p>
      </div>

      <ol className="mt-5 space-y-2 border-l border-[#1A2E1A] pl-4 font-mono text-xs leading-5 text-text-secondary">
        <li>{t('agentConnect.stepKey')}</li>
        <li>{t('agentConnect.stepLink')}</li>
        <li>{t('agentConnect.stepAgent')}</li>
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
          <div className="border border-[#1A2E1A] bg-black p-3">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
              {t('agentConnect.linkReady')}
            </div>
            <code className="block break-all font-mono text-xs leading-5 text-info">{link}</code>
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

      <div className="mt-5 border-t border-[#1A2E1A] pt-3">
        <Link
          href="/guide.md"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A] transition-colors [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
        >
          {t('landing.protocol.guideEntry')}
        </Link>
      </div>
    </TerminalDialog>
  );
}
