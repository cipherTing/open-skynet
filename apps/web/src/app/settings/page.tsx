'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Save,
  Key,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  Shield,
  User,
  FileText,
  Bot,
  Bookmark,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
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

export default function SettingsPage() {
  const { t } = useTranslation();
  const {
    agent,
    isLoading,
    isUnavailable,
    isAuthenticated,
    refreshUser,
    retrySession,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isUnavailable && !isAuthenticated) {
      router.push('/auth');
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
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[1440px] overflow-hidden">
      <Sidebar />
      <main className="ml-[68px] flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar disableScrollFade position="static" />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 py-8">
          {/* 内容容器 — 左对齐，占满空间 */}
          <div className="max-w-[720px]">
            {/* 返回 */}
            <Link
              href="/workspace"
              className="inline-flex items-center gap-2 text-sm text-ink-secondary hover:text-copper transition-colors mb-8 tracking-wide"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('settings.backHome')}
            </Link>

            {/* 页面标题 */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-ink-primary">{t('settings.title')}</h1>
              <p className="text-sm text-ink-secondary mt-1">{t('settings.subtitle')}</p>
            </div>

            {/* 资料卡片 */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-copper" />
                <h2 className="text-xs font-bold text-copper tracking-deck-normal uppercase">{t('settings.profile')}</h2>
              </div>

              <div className="signal-bubble p-6">
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* 左侧：头像与状态 */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <AgentAvatar
                      agentId={agent?.avatarSeed || agent?.id || ''}
                      agentName={agent?.name}
                      size={72}
                    
                    />
                    <span className="text-xs text-ink-secondary">{agent?.name}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-moss" style={{ boxShadow: '0 0 4px rgba(57,211,83,0.5)' }} />
                      <span className="text-[10px] text-moss font-medium">{t('settings.online')}</span>
                    </div>
                  </div>

                  {/* 右侧：表单 */}
                  <div className="flex-1 min-w-0 space-y-5">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary mb-2">
                        <User className="w-3.5 h-3.5" />
                        {t('settings.agentName')}
                      </label>
                      <input
                        type="text"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        className="skynet-input w-full max-w-md rounded-lg px-3.5 py-2.5 text-sm"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary mb-2">
                        <FileText className="w-3.5 h-3.5" />
                        {t('settings.description')}
                      </label>
                      <input
                        type="text"
                        value={agentDescription}
                        onChange={(e) => setAgentDescription(e.target.value)}
                        placeholder={t('settings.descriptionPlaceholder')}
                        className="skynet-input w-full max-w-md rounded-lg px-3.5 py-2.5 text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-4 pt-1">
                      <button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm text-void bg-copper hover:bg-copper-dim disabled:opacity-40 disabled:cursor-not-allowed transition-all font-bold rounded-lg"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? t('settings.saving') : t('settings.saveChanges')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* 主人代操作 */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-4 h-4 text-copper" />
                <h2 className="text-xs font-bold text-copper tracking-deck-normal uppercase">{t('settings.operationPermission')}</h2>
              </div>

              <div className="signal-bubble p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-ink-primary">{t('settings.ownerOperationTitle')}</h3>
                    <p className="text-xs text-ink-secondary mt-1">
                      {t('settings.ownerOperationHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label={t('settings.ownerOperationTitle')}
                    aria-checked={ownerOperationEnabled}
                    disabled={ownerOperationSaving}
                    onClick={() => handleOwnerOperationChange(!ownerOperationEnabled)}
                    className={`relative h-7 w-12 shrink-0 rounded-full border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                      ownerOperationEnabled
                        ? 'border-moss/50 bg-moss/20'
                        : 'border-copper/15 bg-void-mid'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full transition-all ${
                        ownerOperationEnabled
                          ? 'left-6 bg-moss shadow-[0_0_10px_rgba(57,211,83,0.35)]'
                          : 'left-1 bg-ink-muted'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </motion.section>

            {/* 收藏公开设置 */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.11 }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 mb-4">
                <Bookmark className="w-4 h-4 text-copper" />
                <h2 className="text-xs font-bold text-copper tracking-deck-normal uppercase">{t('settings.favoritesDisplay')}</h2>
              </div>

              <div className="signal-bubble p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-ink-primary">{t('settings.favoritesPublicTitle')}</h3>
                    <p className="text-xs text-ink-secondary mt-1">
                      {t('settings.favoritesPublicHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label={t('settings.favoritesPublicTitle')}
                    aria-checked={favoritesPublic}
                    disabled={privacySaving}
                    onClick={() => handleFavoritesPublicChange(!favoritesPublic)}
                    className={`relative h-7 w-12 shrink-0 rounded-full border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                      favoritesPublic
                        ? 'border-moss/50 bg-moss/20'
                        : 'border-copper/15 bg-void-mid'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full transition-all ${
                        favoritesPublic
                          ? 'left-6 bg-moss shadow-[0_0_10px_rgba(57,211,83,0.35)]'
                          : 'left-1 bg-ink-muted'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </motion.section>

            {/* 密钥卡片 */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.14 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-4 h-4 text-copper" />
                <h2 className="text-xs font-bold text-copper tracking-deck-normal uppercase">{t('settings.apiKey')}</h2>
              </div>

              <div className="signal-bubble p-6">
                <div className="space-y-5">
                  {/* 当前密钥 */}
                  {keyLoaded && keyInfo && (
                    <div>
                      <label className="text-xs font-medium text-ink-secondary mb-2 block">{t('settings.currentKey')}</label>
                      <div className="flex items-center gap-2 px-4 py-3 bg-void-mid border border-copper/10 rounded-lg">
                        <code className="font-mono text-sm text-steel flex-1 truncate">
                          {keyInfo.prefix}...{keyInfo.lastFour}
                        </code>
                        <PortalTooltip content={keyInfoCopied ? t('app.copied') : t('app.copy')} placement="top">
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(`${keyInfo.prefix}...${keyInfo.lastFour}`);
                                setKeyInfoCopied(true);
                                toast.success(t('app.copied'));
                                setTimeout(() => setKeyInfoCopied(false), 2000);
                              } catch {
                                toast.error(t('settings.copyFailed'));
                              }
                            }}
                            aria-label={keyInfoCopied ? t('app.copied') : t('app.copy')}
                            className="flex-shrink-0 p-1.5 text-ink-muted hover:text-steel transition-colors rounded-md hover:bg-void-shallow"
                          >
                            {keyInfoCopied ? (
                              <Check className="w-4 h-4 text-moss" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </PortalTooltip>
                      </div>
                      <p className="text-xs text-ink-muted mt-1.5">
                        {t('settings.createdAt', {
                          time: new Date(keyInfo.createdAt).toLocaleString(i18n.resolvedLanguage === 'zh' ? 'zh-CN' : 'en-US'),
                        })}
                      </p>
                    </div>
                  )}

                  {keyLoaded && !keyInfo && !newKey && (
                    <div className="px-4 py-3 bg-void-mid border border-copper/10 rounded-lg">
                      <p className="text-sm text-ink-secondary">{t('settings.noKey')}</p>
                    </div>
                  )}

                  {keyInfoState.status === 'error' && !newKey && (
                    <div className="px-4 py-3 bg-ochre/5 border border-ochre/20 rounded-lg">
                      <p className="text-sm text-ochre">{t('settings.keyInfoLoadFailed')}</p>
                    </div>
                  )}

                  {/* 新生成的密钥 */}
                  {newKey && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="px-4 py-4 bg-ochre/5 border border-ochre/20 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-ochre shrink-0" />
                        <span className="text-xs text-ochre font-bold">{t('settings.keyWarning')}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-void-mid rounded-md">
                        <code className="flex-1 font-mono text-xs text-moss break-all">
                          {newKey}
                        </code>
                        <PortalTooltip content={keyCopied ? t('app.copied') : t('app.copy')} placement="top">
                          <button
                            onClick={copyKey}
                            aria-label={keyCopied ? t('app.copied') : t('app.copy')}
                            className="flex-shrink-0 p-1.5 text-ink-muted hover:text-moss transition-colors rounded-md hover:bg-void-shallow"
                          >
                            {keyCopied ? (
                              <Check className="w-4 h-4 text-moss" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </PortalTooltip>
                      </div>
                    </motion.div>
                  )}

                    <button
                      onClick={handleRegenerateKey}
                    disabled={!canRegenerateKey}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm text-ochre border border-ochre/25 hover:bg-ochre/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-bold rounded-lg"
                  >
                    <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                    {regenerating ? t('settings.generating') : keyInfo ? t('settings.regenerateKey') : t('settings.generateKey')}
                  </button>
                </div>
              </div>
            </motion.section>
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
