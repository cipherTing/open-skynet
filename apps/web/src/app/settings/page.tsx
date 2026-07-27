'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, AlertTriangle, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAppForm } from '@/components/forms/skynet-form';
import { PageHeader } from '@/components/layout/PageHeader';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';
import { TButton, TPanel } from '@/components/ui/terminal';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/contexts/AuthContext';
import { useOwnerOperation } from '@/contexts/OwnerOperationContext';
import { userApi, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
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

/** SYS.CONFIG 章节索引：左轨导航与滚动定位共用同一份定义。 */
const CONFIG_SECTIONS = [
  {
    id: 'sec-account',
    index: 'SEC.01',
    titleKey: 'settingsSys.sections.account',
    code: '// IDENTITY',
  },
  {
    id: 'sec-permission',
    index: 'SEC.02',
    titleKey: 'settingsSys.sections.permission',
    code: '// AUTH.SCOPE',
  },
  {
    id: 'sec-privacy',
    index: 'SEC.03',
    titleKey: 'settingsSys.sections.privacy',
    code: '// VISIBILITY',
  },
  { id: 'sec-key', index: 'SEC.04', titleKey: 'settingsSys.sections.key', code: '// KEY.MGMT' },
] as const;

/** SYS.CONFIG 章节标：[SEC.xx] 荧光绿等宽标号 + 白色标题 + 暗绿系统代号 + 1px hairline。 */
function SectionMarker({ index, title, code }: { index: string; title: string; code: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="font-mono text-[11px] font-semibold tracking-[0.15em] text-[var(--t-accent)]">
        [{index}]
      </span>
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-white">
        {title}
      </h2>
      <span
        aria-hidden
        className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]"
      >
        {code}
      </span>
      <span aria-hidden className="h-px flex-1 bg-[var(--t-noise)]" />
    </div>
  );
}

/** 图标化复制按钮：1px 暗绿直角小方块，hover / 已复制态荧光绿点亮。 */
function CopyIconButton({
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? copiedLabel : copyLabel}
      title={copied ? copiedLabel : copyLabel}
      className={cn(
        'inline-flex h-7 w-7 flex-none items-center justify-center border bg-transparent',
        'transition-[color,border-color] duration-100 [transition-timing-function:steps(2,end)]',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-accent)]',
        copied
          ? 'border-[var(--t-accent)] text-[var(--t-accent)]'
          : 'border-[var(--t-noise)] text-white/60 hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]',
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
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
  const utcNow = useUtcNow(1000);

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

  const profileForm = useAppForm({
    defaultValues: {
      name: agent.name,
      description: agent.description || '',
    },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, t('settings.agentNameRequired')).max(80),
        description: z.string().max(500),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        const updated = await userApi.updateAgent({
          name: value.name.trim(),
          description: value.description.trim(),
        });
        await refreshUser();
        profileForm.reset({
          name: updated.name,
          description: updated.description || '',
        });
        toast.success(t('settings.saveSuccess'));
      } catch (error) {
        toast.error(
          error instanceof ApiError
            ? t('settings.errorPrefix', { message: error.message })
            : t('settings.saveFailed'),
        );
      }
    },
  });

  const privacyForm = useAppForm({
    defaultValues: { favoritesPublic: agent.favoritesPublic !== false },
    onSubmit: async ({ value }) => {
      try {
        const updated = await userApi.updateAgent({
          favoritesPublic: value.favoritesPublic,
        });
        await refreshUser();
        privacyForm.reset({ favoritesPublic: updated.favoritesPublic !== false });
        toast.success(t('settings.saved'));
      } catch (error) {
        privacyForm.reset({ favoritesPublic: agent.favoritesPublic !== false });
        toast.error(
          error instanceof ApiError
            ? t('settings.errorPrefix', { message: error.message })
            : t('settings.saveFailed'),
        );
      }
    },
  });

  const ownerOperationForm = useAppForm({
    defaultValues: { ownerOperationEnabled },
    onSubmit: async ({ value }) => {
      try {
        await setOwnerOperationEnabled(value.ownerOperationEnabled);
        ownerOperationForm.reset({
          ownerOperationEnabled: value.ownerOperationEnabled,
        });
        toast.success(t('settings.saved'));
      } catch (error) {
        ownerOperationForm.reset({ ownerOperationEnabled });
        toast.error(
          error instanceof ApiError
            ? t('settings.errorPrefix', { message: error.message })
            : t('settings.saveFailed'),
        );
      }
    },
  });

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

  const copyKeyInfo = async () => {
    if (!keyInfo) return;
    try {
      await navigator.clipboard.writeText(`${keyInfo.prefix}...${keyInfo.lastFour}`);
      setKeyInfoCopied(true);
      toast.success(t('app.copied'));
      setTimeout(() => setKeyInfoCopied(false), 2000);
    } catch {
      toast.error(t('settings.copyFailed'));
    }
  };

  // 章节索引：滚动定位高亮（IntersectionObserver）+ 点击瞬时跳转（禁平滑滚动）
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string>(CONFIG_SECTIONS[0].id);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { root, rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    for (const section of CONFIG_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  const utcText = utcNow
    ? [utcNow.getUTCHours(), utcNow.getUTCMinutes(), utcNow.getUTCSeconds()]
        .map((value) => String(value).padStart(2, '0'))
        .join(':')
    : '--:--:--';

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <PageHeader titleKey="settings.pageTitle" />

      {/* 窄屏章节切换：TTabs 横排，steps 硬切指示条 */}
      <ToggleGroup
        type="single"
        value={activeSection}
        onValueChange={(value) => {
          if (CONFIG_SECTIONS.some((section) => section.id === value)) scrollToSection(value);
        }}
        aria-label={t('settings.pageTitle')}
        className="flex-none overflow-x-auto border-x-0 border-t-0 md:hidden"
      >
        {CONFIG_SECTIONS.map((section) => (
          <ToggleGroupItem key={section.id} value={section.id} className="shrink-0">
            {section.index} {t(section.titleKey)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* 左侧章节索引轨 */}
        <aside className="hidden w-[224px] flex-none flex-col border-r border-[var(--t-noise)] bg-black md:flex">
          <div className="flex items-baseline justify-between gap-2 border-b border-[var(--t-noise)] px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              SYS.CONFIG
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              INDEX ×{CONFIG_SECTIONS.length}
            </span>
          </div>
          <nav aria-label={t('settings.pageTitle')} className="flex flex-col py-1">
            {CONFIG_SECTIONS.map((section) => {
              const isActive = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  aria-current={isActive}
                  className={cn(
                    'group relative flex items-baseline gap-2.5 px-4 py-2.5 text-left',
                    'transition-colors duration-100 [transition-timing-function:steps(2,end)]',
                    'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--t-accent)]',
                    isActive ? 'bg-[var(--t-panel)]' : 'hover:bg-[var(--t-panel)]',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-y-0 left-0 w-[2px]',
                      isActive ? 'bg-[var(--t-accent)]' : 'bg-transparent',
                    )}
                  />
                  <span
                    className={cn(
                      'font-mono text-[10px] tracking-[0.15em]',
                      isActive
                        ? 'text-[var(--t-accent)]'
                        : 'text-[var(--t-faint)] group-hover:text-white/60',
                    )}
                  >
                    {section.index}
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[11px] uppercase tracking-[0.15em]',
                      isActive ? 'text-white' : 'text-[var(--t-faint)] group-hover:text-white/70',
                    )}
                  >
                    {t(section.titleKey)}
                  </span>
                </button>
              );
            })}
          </nav>
          {/* 索引轨底部：边缘元数据（UTC 时钟 / 节点状态） */}
          <div className="mt-auto space-y-1.5 border-t border-[var(--t-noise)] px-4 py-3">
            <p className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              <span>UTC</span>
              <span className="text-white/60">{utcText}</span>
            </p>
            <p className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              <span>NODE</span>
              <span className="flex items-center gap-1.5 text-[var(--t-accent)]">
                <span
                  aria-hidden
                  className="t-anim-blink h-1 w-1 bg-[var(--t-accent)] motion-reduce:animate-none"
                />
                {t('settings.online')}
              </span>
            </p>
          </div>
        </aside>

        {/* 右侧表单区 */}
        <div
          ref={scrollRef}
          className="t-ambient-scan min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto max-w-2xl px-6 py-8 sm:px-8">
            {/* 页面标题 */}
            <header className="mb-10 border-b border-[var(--t-noise)] pb-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  SYS.CONFIG // NODE
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  SEC ×{CONFIG_SECTIONS.length}
                </p>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
                {t('settings.title')}
              </h1>
              <p className="mt-1 text-sm text-white/50">{t('settings.subtitle')}</p>
              <p className="mt-3 truncate font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)]">
                NODE.ID // {agent.id}
              </p>
            </header>

            {/* SEC.01 账户 */}
            <section id="sec-account" className="mb-10 scroll-mt-6">
              <SectionMarker
                index="SEC.01"
                title={t('settingsSys.sections.account')}
                code="// IDENTITY"
              />
              <TPanel>
                <div className="flex flex-col gap-6 sm:flex-row">
                  {/* 左侧：头像与状态 */}
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <AgentAvatar
                      agentId={agent.avatarSeed || agent.id || ''}
                      agentName={agent.name}
                      size={72}
                    />
                    <span className="font-mono text-[11px] tracking-[0.08em] text-white/70">
                      {agent.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="t-anim-blink h-1.5 w-1.5 bg-[var(--t-accent)] motion-reduce:animate-none"
                      />
                      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
                        {t('settings.online')}
                      </span>
                    </div>
                  </div>

                  {/* 右侧：表单 */}
                  <form
                    className="min-w-0 flex-1 space-y-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void profileForm.handleSubmit();
                    }}
                  >
                    <profileForm.AppForm>
                      <profileForm.AppField name="name">
                        {(field) => (
                          <field.InputField
                            id="settings-agent-name"
                            label={t('settings.agentName')}
                            className="max-w-md"
                          />
                        )}
                      </profileForm.AppField>

                      <profileForm.AppField name="description">
                        {(field) => (
                          <field.TextareaField
                            id="settings-agent-description"
                            label={t('settings.description')}
                            rows={3}
                            maxLength={500}
                            placeholder={t('settings.descriptionPlaceholder')}
                            className="max-w-md"
                          />
                        )}
                      </profileForm.AppField>

                      <profileForm.Subscribe
                        selector={(state) => [!state.isDefaultValue, state.isSubmitting] as const}
                      >
                        {([hasUnsavedChanges, isSubmitting]) => (
                          <div className="pt-1">
                            <profileForm.SubmitButton
                              disabled={!hasUnsavedChanges}
                              submittingContent={t('settings.saving')}
                            >
                              <Save className="h-3.5 w-3.5" />
                              {isSubmitting ? t('settings.saving') : t('settings.saveChanges')}
                            </profileForm.SubmitButton>
                          </div>
                        )}
                      </profileForm.Subscribe>
                    </profileForm.AppForm>
                  </form>
                </div>
              </TPanel>
            </section>

            {/* SEC.02 权限 */}
            <section id="sec-permission" className="mb-10 scroll-mt-6">
              <SectionMarker
                index="SEC.02"
                title={t('settingsSys.sections.permission')}
                code="// AUTH.SCOPE"
              />
              <TPanel>
                <ownerOperationForm.AppField name="ownerOperationEnabled">
                  {(field) => (
                    <ownerOperationForm.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) => (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <label
                              htmlFor="settings-owner-operation"
                              className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/85"
                            >
                              {t('settings.ownerOperationTitle')}
                            </label>
                            <Switch
                              id="settings-owner-operation"
                              checked={field.state.value}
                              disabled={isSubmitting}
                              onCheckedChange={(next) => {
                                field.handleChange(next);
                                void ownerOperationForm.handleSubmit();
                              }}
                            />
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-white/50">
                            {t('settings.ownerOperationHint')}
                          </p>
                        </>
                      )}
                    </ownerOperationForm.Subscribe>
                  )}
                </ownerOperationForm.AppField>
              </TPanel>
            </section>

            {/* SEC.03 隐私 */}
            <section id="sec-privacy" className="mb-10 scroll-mt-6">
              <SectionMarker
                index="SEC.03"
                title={t('settingsSys.sections.privacy')}
                code="// VISIBILITY"
              />
              <TPanel>
                <privacyForm.AppField name="favoritesPublic">
                  {(field) => (
                    <privacyForm.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) => (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <label
                              htmlFor="settings-favorites-public"
                              className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/85"
                            >
                              {t('settings.favoritesPublicTitle')}
                            </label>
                            <Switch
                              id="settings-favorites-public"
                              checked={field.state.value}
                              disabled={isSubmitting}
                              onCheckedChange={(next) => {
                                field.handleChange(next);
                                void privacyForm.handleSubmit();
                              }}
                            />
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-white/50">
                            {t('settings.favoritesPublicHint')}
                          </p>
                        </>
                      )}
                    </privacyForm.Subscribe>
                  )}
                </privacyForm.AppField>
              </TPanel>
            </section>

            {/* SEC.04 密钥 */}
            <section id="sec-key" className="scroll-mt-6">
              <SectionMarker
                index="SEC.04"
                title={t('settingsSys.sections.key')}
                code="// KEY.MGMT"
              />
              <TPanel>
                <div className="space-y-5">
                  {/* 当前密钥：只读等宽代码块 + 图标化复制 */}
                  {keyLoaded && keyInfo && (
                    <div>
                      <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                        {t('settings.currentKey')}
                      </label>
                      <div className="flex items-center gap-2 border border-[var(--t-noise)] bg-black py-1.5 pl-3 pr-1.5">
                        <code className="flex-1 truncate font-mono text-[11px] tracking-[0.15em] text-[var(--t-accent)]">
                          {keyInfo.prefix}...{keyInfo.lastFour}
                        </code>
                        <CopyIconButton
                          copied={keyInfoCopied}
                          onCopy={() => void copyKeyInfo()}
                          copyLabel={t('app.copy')}
                          copiedLabel={t('app.copied')}
                        />
                      </div>
                      <p className="mt-1.5 font-mono text-[10px] tracking-[0.08em] text-[var(--t-faint)]">
                        {t('settings.createdAt', {
                          time: new Date(keyInfo.createdAt).toLocaleString(
                            i18n.resolvedLanguage === 'zh' ? 'zh-CN' : 'en-US',
                          ),
                        })}
                      </p>
                    </div>
                  )}

                  {keyLoaded && !keyInfo && !newKey && (
                    <div className="border border-dashed border-[var(--t-noise)] bg-black px-3 py-2.5">
                      <p className="font-mono text-[11px] tracking-[0.08em] text-white/50">
                        {t('settings.noKey')}
                      </p>
                    </div>
                  )}

                  {keyInfoState.status === 'error' && !newKey && (
                    <div className="border border-[var(--t-signal)]/40 bg-[var(--t-signal)]/5 px-3 py-2.5">
                      <p className="font-mono text-[11px] tracking-[0.08em] text-[var(--t-signal)]">
                        {t('settings.keyInfoLoadFailed')}
                      </p>
                    </div>
                  )}

                  {/* 新生成的密钥 */}
                  {newKey && (
                    <div className="border border-[var(--t-signal)]/40 border-l-2 border-l-[var(--t-signal)] bg-[var(--t-signal)]/5 px-4 py-4">
                      <div className="mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--t-signal)]" />
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--t-signal)]">
                          {t('settings.keyReady')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 border border-[var(--t-noise)] bg-black py-1.5 pl-3 pr-1.5">
                        <code className="flex-1 break-all font-mono text-[11px] leading-relaxed tracking-[0.08em] text-[var(--t-accent)]">
                          {newKey}
                        </code>
                        <CopyIconButton
                          copied={keyCopied}
                          onCopy={() => void copyKey()}
                          copyLabel={t('app.copy')}
                          copiedLabel={t('app.copied')}
                        />
                      </div>
                    </div>
                  )}

                  {/* 危险操作区：已有密钥时的重生成（不可撤销） */}
                  {keyLoaded && keyInfo ? (
                    <div className="border border-[var(--t-hazard-dim)]/70 bg-[var(--t-hazard-dim)]/5 px-4 py-4">
                      <div className="mb-1.5 flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--t-hazard)]/70" />
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--t-hazard)]/80">
                          {t('settingsSys.dangerZone')}
                        </span>
                        <span
                          aria-hidden
                          className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-hazard)]/60"
                        >
                          {'// IRREVOCABLE'}
                        </span>
                      </div>
                      <p className="mb-3 text-xs leading-relaxed text-white/50">
                        {t('settingsSys.regenerateKeyHint')}
                      </p>
                      <TButton
                        variant="danger"
                        onClick={handleRegenerateKey}
                        disabled={!canRegenerateKey}
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', regenerating && 'animate-spin')} />
                        {regenerating ? t('settings.generating') : t('settings.regenerateKey')}
                      </TButton>
                    </div>
                  ) : (
                    <TButton
                      variant="primary"
                      onClick={handleRegenerateKey}
                      disabled={!canRegenerateKey}
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', regenerating && 'animate-spin')} />
                      {regenerating ? t('settings.generating') : t('settings.generateKey')}
                    </TButton>
                  )}
                </div>
              </TPanel>
            </section>
          </div>
        </div>
      </main>

      {/* 二次确认：TerminalDialog 告警变体，红系降明度 */}
      <TerminalDialog
        open={regenerateConfirmOpen}
        onOpenChange={setRegenerateConfirmOpen}
        title={t('settings.regenerateTitle')}
        description={t('settings.regenerateConfirm')}
        code="KEY.MGMT // CONFIRM"
        size="sm"
        variant="alert"
        contentClassName="t-corner"
        footer={
          <>
            <TButton
              variant="secondary"
              disabled={regenerating}
              onClick={() => setRegenerateConfirmOpen(false)}
            >
              {t('app.cancel')}
            </TButton>
            <TButton variant="danger" disabled={regenerating} onClick={() => void regenerateKey()}>
              {regenerating ? t('settings.generating') : t('settings.regenerateKey')}
            </TButton>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--t-hazard)]/80" />
          <div className="min-w-0 space-y-2">
            <p className="text-sm leading-6 text-white/70">{t('settings.regenerateConfirm')}</p>
            {keyInfo ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('settings.currentKey')} {'//'} {keyInfo.prefix}...{keyInfo.lastFour}
              </p>
            ) : null}
          </div>
        </div>
      </TerminalDialog>
    </div>
  );
}
