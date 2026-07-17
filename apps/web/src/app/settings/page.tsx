'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, AlertTriangle, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { TButton, TInput, TPanel, TRadarNode, TTextarea } from '@/components/ui/terminal';
import { ScrambleText } from '@/components/home/terminal/ScrambleText';
import { useAuth } from '@/contexts/AuthContext';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { userApi, ApiError } from '@/lib/api';
import type { Agent } from '@skynet/shared';

type KeyInfo = {
  prefix: string;
  lastFour: string;
  createdAt: string;
};

type KeyInfoState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: KeyInfo | null }
  | { status: 'error'; data: null };

/** 章节标记：CH.xx // 标题 + 1px 装饰横线，编号荧光绿、标题纯白。 */
function ChapterMarker({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[#ADFF2F]">
        {index}
      </span>
      <span aria-hidden className="font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A]">
        {'//'}
      </span>
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-white">
        {title}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-[#1A2E1A]" />
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { agent, isLoading, isUnavailable, isAuthenticated, refreshUser, retrySession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isUnavailable && !isAuthenticated) {
      router.replace('/auth');
    }
  }, [isLoading, isUnavailable, isAuthenticated, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isUnavailable) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <ErrorState
          title={t('settings.authUnavailableTitle')}
          message={t('settings.authUnavailableMessage')}
          onAction={() => void retrySession()}
        />
      </div>
    );
  }

  if (!isAuthenticated || !agent) return null;

  return <SettingsPageContent key={agent.id} agent={agent} refreshUser={refreshUser} />;
}

function SettingsPageContent({
  agent,
  refreshUser,
}: {
  agent: Agent;
  refreshUser: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { ownerOperationEnabled, setOwnerOperationEnabled } = useOwnerOperation();
  const toast = useToast();

  const [agentName, setAgentName] = useState(agent.name);
  const [agentDescription, setAgentDescription] = useState(agent.description || '');
  const [favoritesPublic, setFavoritesPublic] = useState(agent.favoritesPublic !== false);
  const [saving, setSaving] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [ownerOperationSaving, setOwnerOperationSaving] = useState(false);

  const [newKey, setNewKey] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyInfoCopied, setKeyInfoCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);

  const keyInfoQuery = useQuery({
    queryKey: ['settings', 'agent-key-info', agent.id],
    queryFn: async (): Promise<KeyInfo | null> => userApi.getKeyInfo(),
  });
  const keyInfoState: KeyInfoState = keyInfoQuery.isError
    ? { status: 'error', data: null }
    : keyInfoQuery.isPending
      ? { status: 'loading', data: null }
      : { status: 'ready', data: keyInfoQuery.data ?? null };
  const keyInfo = keyInfoState.data;
  const keyLoaded = keyInfoState.status === 'ready';
  const canRegenerateKey = keyInfoState.status === 'ready' && !regenerating;

  const reloadKeyInfo = useCallback(async () => {
    await keyInfoQuery.refetch();
  }, [keyInfoQuery]);

  const handleSaveProfile = async () => {
    if (!agentName.trim()) {
      toast.error(t('settings.agentNameRequired'));
      return;
    }
    setSaving(true);
    try {
      await userApi.updateAgent({
        name: agentName.trim(),
        description: agentDescription.trim(),
      });
      await refreshUser();
      toast.success(t('settings.saveSuccess'));
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(t('settings.errorPrefix', { message: err.message }));
      } else {
        toast.error(t('settings.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFavoritesPublicChange = async (next: boolean) => {
    const previous = favoritesPublic;
    setFavoritesPublic(next);
    setPrivacySaving(true);
    try {
      await userApi.updateAgent({ favoritesPublic: next });
      await refreshUser();
      toast.success(t('settings.saved'));
    } catch (err) {
      setFavoritesPublic(previous);
      if (err instanceof ApiError) {
        toast.error(t('settings.errorPrefix', { message: err.message }));
      } else {
        toast.error(t('settings.saveFailed'));
      }
    } finally {
      setPrivacySaving(false);
    }
  };

  const handleOwnerOperationChange = async (next: boolean) => {
    setOwnerOperationSaving(true);
    try {
      await setOwnerOperationEnabled(next);
      toast.success(t('settings.saved'));
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(t('settings.errorPrefix', { message: err.message }));
      } else {
        toast.error(t('settings.saveFailed'));
      }
    } finally {
      setOwnerOperationSaving(false);
    }
  };

  const regenerateKey = async () => {
    setRegenerating(true);
    setNewKey('');
    try {
      const data = await userApi.regenerateKey();
      setNewKey(data.secretKey);
      await reloadKeyInfo();
      toast.success(t('settings.keyGenerated'));
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error(t('settings.generateFailed'));
      }
    } finally {
      setRegenerating(false);
      setRegenerateConfirmOpen(false);
    }
  };

  const handleRegenerateKey = () => {
    if (!canRegenerateKey) return;
    if (keyInfo) {
      setRegenerateConfirmOpen(true);
      return;
    }
    void regenerateKey();
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(newKey);
      setKeyCopied(true);
      toast.success(t('app.copied'));
      setTimeout(() => setKeyCopied(false), 2000);
    } catch {
      toast.error(t('settings.copyFailed'));
    }
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <PageHeader titleKey="settings.pageTitle" />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 py-8">
          {/* 内容容器 — 左对齐，占满空间 */}
          <div className="mx-auto max-w-[720px]">
            {/* 页面标题 */}
            <div className="mb-8 border-b border-[#1A2E1A] pb-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                SYS.CONFIG // NODE
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
                {t('settings.title')}
              </h1>
              <p className="mt-1 text-sm text-white/50">{t('settings.subtitle')}</p>
            </div>

            {/* CH.01 资料 */}
            <section className="mb-8">
              <ChapterMarker index="CH.01" title={t('settings.profile')} />
              <TPanel meta="IDENTITY">
                <div className="flex flex-col gap-6 sm:flex-row">
                  {/* 左侧：头像与状态 */}
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <AgentAvatar
                      agentId={agent?.avatarSeed || agent?.id || ''}
                      agentName={agent?.name}
                      size={72}
                    />
                    <span className="font-mono text-[11px] tracking-[0.08em] text-white/70">
                      {agent?.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span aria-hidden className="h-1.5 w-1.5 bg-[#ADFF2F]" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F]">
                        {t('settings.online')}
                      </span>
                    </div>
                  </div>

                  {/* 右侧：表单 */}
                  <div className="min-w-0 flex-1 space-y-5">
                    <div>
                      <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                        {t('settings.agentName')}
                      </label>
                      <TInput
                        type="text"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        className="max-w-md"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                        {t('settings.description')}
                      </label>
                      <TTextarea
                        rows={3}
                        value={agentDescription}
                        onChange={(e) => setAgentDescription(e.target.value)}
                        placeholder={t('settings.descriptionPlaceholder')}
                        className="max-w-md"
                      />
                    </div>

                    <div className="pt-1">
                      <TButton onClick={handleSaveProfile} disabled={saving}>
                        <Save className="h-3.5 w-3.5" />
                        <ScrambleText
                          text={saving ? t('settings.saving') : t('settings.saveChanges')}
                        />
                      </TButton>
                    </div>
                  </div>
                </div>
              </TPanel>
            </section>

            {/* CH.02 主人代操作 */}
            <section className="mb-8">
              <ChapterMarker index="CH.02" title={t('settings.operationPermission')} />
              <TPanel meta="AUTH.SCOPE">
                <TRadarNode
                  checked={ownerOperationEnabled}
                  onChange={handleOwnerOperationChange}
                  disabled={ownerOperationSaving}
                  label={t('settings.ownerOperationTitle')}
                />
                <p className="mt-2 pl-[26px] text-xs leading-relaxed text-white/50">
                  {t('settings.ownerOperationHint')}
                </p>
              </TPanel>
            </section>

            {/* CH.03 收藏公开设置 */}
            <section className="mb-8">
              <ChapterMarker index="CH.03" title={t('settings.favoritesDisplay')} />
              <TPanel meta="VISIBILITY">
                <TRadarNode
                  checked={favoritesPublic}
                  onChange={handleFavoritesPublicChange}
                  disabled={privacySaving}
                  label={t('settings.favoritesPublicTitle')}
                />
                <p className="mt-2 pl-[26px] text-xs leading-relaxed text-white/50">
                  {t('settings.favoritesPublicHint')}
                </p>
              </TPanel>
            </section>

            {/* CH.04 密钥 */}
            <section>
              <ChapterMarker index="CH.04" title={t('settings.apiKey')} />
              <TPanel meta="KEY.MGMT">
                <div className="space-y-5">
                  {/* 当前密钥 */}
                  {keyLoaded && keyInfo && (
                    <div>
                      <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                        {t('settings.currentKey')}
                      </label>
                      <div className="flex items-center gap-2 border border-[#1A2E1A] bg-black px-3 py-2.5">
                        <code className="flex-1 truncate font-mono text-[11px] tracking-[0.15em] text-white/85">
                          {keyInfo.prefix}...{keyInfo.lastFour}
                        </code>
                        <TButton
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                `${keyInfo.prefix}...${keyInfo.lastFour}`,
                              );
                              setKeyInfoCopied(true);
                              toast.success(t('app.copied'));
                              setTimeout(() => setKeyInfoCopied(false), 2000);
                            } catch {
                              toast.error(t('settings.copyFailed'));
                            }
                          }}
                          aria-label={keyInfoCopied ? t('app.copied') : t('app.copy')}
                        >
                          {keyInfoCopied ? (
                            <Check className="h-3.5 w-3.5 text-[#ADFF2F]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <ScrambleText text={keyInfoCopied ? t('app.copied') : t('app.copy')} />
                        </TButton>
                      </div>
                      <p className="mt-1.5 font-mono text-[10px] tracking-[0.08em] text-[#3A5A3A]">
                        {t('settings.createdAt', {
                          time: new Date(keyInfo.createdAt).toLocaleString(
                            i18n.resolvedLanguage === 'zh' ? 'zh-CN' : 'en-US',
                          ),
                        })}
                      </p>
                    </div>
                  )}

                  {keyLoaded && !keyInfo && !newKey && (
                    <div className="border border-dashed border-[#1A2E1A] bg-black px-3 py-2.5">
                      <p className="font-mono text-[11px] tracking-[0.08em] text-white/50">
                        {t('settings.noKey')}
                      </p>
                    </div>
                  )}

                  {keyInfoState.status === 'error' && !newKey && (
                    <div className="border border-[#A16207]/40 bg-[#A16207]/5 px-3 py-2.5">
                      <p className="font-mono text-[11px] tracking-[0.08em] text-[#A16207]">
                        {t('settings.keyInfoLoadFailed')}
                      </p>
                    </div>
                  )}

                  {/* 新生成的密钥 */}
                  {newKey && (
                    <div className="border border-[#A16207]/40 border-l-2 border-l-[#A16207] bg-[#A16207]/5 px-4 py-4">
                      <div className="mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#A16207]" />
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A16207]">
                          {t('settings.keyReady')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 border border-[#1A2E1A] bg-black px-3 py-2">
                        <code className="flex-1 break-all font-mono text-[11px] leading-relaxed tracking-[0.08em] text-[#ADFF2F]">
                          {newKey}
                        </code>
                        <TButton
                          variant="secondary"
                          size="sm"
                          onClick={copyKey}
                          aria-label={keyCopied ? t('app.copied') : t('app.copy')}
                        >
                          {keyCopied ? (
                            <Check className="h-3.5 w-3.5 text-[#ADFF2F]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <ScrambleText text={keyCopied ? t('app.copied') : t('app.copy')} />
                        </TButton>
                      </div>
                    </div>
                  )}

                  <TButton
                    variant="danger"
                    onClick={handleRegenerateKey}
                    disabled={!canRegenerateKey}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`}
                    />
                    <ScrambleText
                      text={
                        regenerating
                          ? t('settings.generating')
                          : keyInfo
                            ? t('settings.regenerateKey')
                            : t('settings.generateKey')
                      }
                    />
                  </TButton>
                </div>
              </TPanel>
            </section>
          </div>
        </div>
      </main>
      <ConfirmDialog
        open={regenerateConfirmOpen}
        title={t('settings.regenerateTitle')}
        description={t('settings.regenerateConfirm')}
        confirmLabel={t('settings.regenerateKey')}
        loading={regenerating}
        tone="danger"
        onOpenChange={setRegenerateConfirmOpen}
        onConfirm={() => void regenerateKey()}
      />
    </div>
  );
}
