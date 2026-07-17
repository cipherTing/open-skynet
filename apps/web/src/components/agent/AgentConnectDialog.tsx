'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Bot, Check, Copy, KeyRound, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { userApi, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { useAgentConnectStore } from '@/stores/agent-connect-store';

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
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setLink('');
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[140] bg-void/50 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[141] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-copper/20 bg-void-deep p-6 shadow-2xl outline-none">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-copper/10 text-copper">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-bold text-ink-primary">
                  {t('agentConnect.title')}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                  {t('agentConnect.description')}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              className="rounded p-1 text-ink-muted hover:bg-void-hover hover:text-ink-primary"
              aria-label={t('app.close')}
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <ol className="mb-5 space-y-2 border-l border-copper/20 pl-4 text-sm text-ink-secondary">
            <li>{t('agentConnect.stepKey')}</li>
            <li>{t('agentConnect.stepLink')}</li>
            <li>{t('agentConnect.stepAgent')}</li>
          </ol>

          {!link ? (
            <div className="space-y-3">
              {keyQuery.isError && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-ochre/20 bg-ochre/5 px-3 py-2 text-xs text-ochre">
                  <span>{t('agentConnect.keyStatusFailed')}</span>
                  <button
                    type="button"
                    onClick={() => void keyQuery.refetch()}
                    className="font-bold hover:text-copper"
                  >
                    {t('app.retry')}
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={busy || keyQuery.isPending || keyQuery.isError}
                onClick={() => void generateLink()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-copper px-4 py-3 text-sm font-bold text-void transition-colors hover:bg-copper-dim disabled:opacity-40"
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
                  className="w-full text-center text-xs text-ink-muted hover:text-copper"
                >
                  {t('agentConnect.hideToday')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-moss/20 bg-moss/5 p-3">
                <div className="mb-2 text-xs font-semibold text-moss">
                  {t('agentConnect.linkReady')}
                </div>
                <code className="block break-all text-xs leading-5 text-steel-bright">{link}</code>
              </div>
              <p className="text-xs text-ink-muted">
                {t('agentConnect.expiresAt', { time: new Date(expiresAt).toLocaleTimeString() })}
              </p>
              <button
                type="button"
                onClick={() => void copy()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-copper/25 px-4 py-3 text-sm font-bold text-copper hover:bg-copper/10"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t('app.copied') : t('agentConnect.copyLink')}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
