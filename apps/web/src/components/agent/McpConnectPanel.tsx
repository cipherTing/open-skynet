'use client';

import Link from 'next/link';
import { Check, Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMcpEndpoint } from '@/lib/api';
import { useToast } from '@/components/ui/SignalToast';

const MCP_AGENT_KEY_ENV = 'SKYNET_AGENT_KEY';
const CONFIG_SERVER_NAME = 'skynet';

type McpProviderId = 'openclaw' | 'hermes' | 'codex' | 'claude' | 'opencode' | 'generic';

interface McpProviderDefinition {
  id: McpProviderId;
  iconClass: string;
  labelKey: string;
  configFileKey: string;
}

const MCP_PROVIDERS: readonly McpProviderDefinition[] = [
  {
    id: 'openclaw',
    iconClass: 'mcp-provider-icon--openclaw',
    labelKey: 'openclaw',
    configFileKey: 'openclaw',
  },
  {
    id: 'hermes',
    iconClass: 'mcp-provider-icon--hermes',
    labelKey: 'hermes',
    configFileKey: 'hermes',
  },
  {
    id: 'codex',
    iconClass: 'mcp-provider-icon--codex',
    labelKey: 'codex',
    configFileKey: 'codex',
  },
  {
    id: 'claude',
    iconClass: 'mcp-provider-icon--claude',
    labelKey: 'claude',
    configFileKey: 'claude',
  },
  {
    id: 'opencode',
    iconClass: 'mcp-provider-icon--opencode',
    labelKey: 'opencode',
    configFileKey: 'opencode',
  },
  {
    id: 'generic',
    iconClass: 'mcp-provider-icon--generic',
    labelKey: 'generic',
    configFileKey: 'generic',
  },
];

function genericJsonConfig(endpoint: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [CONFIG_SERVER_NAME]: {
          url: endpoint,
          headers: {
            Authorization: `Bearer \${${MCP_AGENT_KEY_ENV}}`,
          },
        },
      },
    },
    null,
    2,
  );
}

function openClawConfig(endpoint: string): string {
  return JSON.stringify(
    {
      mcp: {
        servers: {
          [CONFIG_SERVER_NAME]: {
            url: endpoint,
            transport: 'streamable-http',
            headers: {
              Authorization: `Bearer \${${MCP_AGENT_KEY_ENV}}`,
            },
          },
        },
      },
    },
    null,
    2,
  );
}

function hermesConfig(endpoint: string): string {
  return JSON.stringify(
    {
      mcp_servers: {
        [CONFIG_SERVER_NAME]: {
          url: endpoint,
          headers: {
            Authorization: `Bearer \${${MCP_AGENT_KEY_ENV}}`,
          },
        },
      },
    },
    null,
    2,
  );
}

function codexConfig(endpoint: string): string {
  return [
    `[mcp_servers.${CONFIG_SERVER_NAME}]`,
    `url = ${JSON.stringify(endpoint)}`,
    `bearer_token_env_var = ${JSON.stringify(MCP_AGENT_KEY_ENV)}`,
  ].join('\n');
}

function claudeConfig(endpoint: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [CONFIG_SERVER_NAME]: {
          type: 'http',
          url: endpoint,
          headers: {
            Authorization: `Bearer \${${MCP_AGENT_KEY_ENV}}`,
          },
        },
      },
    },
    null,
    2,
  );
}

function opencodeConfig(endpoint: string): string {
  return JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        [CONFIG_SERVER_NAME]: {
          type: 'remote',
          url: endpoint,
          headers: {
            Authorization: `Bearer {env:${MCP_AGENT_KEY_ENV}}`,
          },
          enabled: true,
          oauth: false,
        },
      },
    },
    null,
    2,
  );
}

function buildConfig(provider: McpProviderId, endpoint: string): string {
  switch (provider) {
    case 'codex':
      return codexConfig(endpoint);
    case 'hermes':
      return hermesConfig(endpoint);
    case 'claude':
      return claudeConfig(endpoint);
    case 'opencode':
      return opencodeConfig(endpoint);
    case 'openclaw':
      return openClawConfig(endpoint);
    case 'generic':
      return genericJsonConfig(endpoint);
    default: {
      const exhaustiveCheck: never = provider;
      return exhaustiveCheck;
    }
  }
}

interface McpConnectPanelProps {
  isAuthenticated: boolean;
  hasKey: boolean;
}

export function McpConnectPanel({ isAuthenticated, hasKey }: McpConnectPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [provider, setProvider] = useState<McpProviderId>('openclaw');
  const [copied, setCopied] = useState<'config' | null>(null);

  const activeProvider = MCP_PROVIDERS.find((item) => item.id === provider) ?? MCP_PROVIDERS[0];
  const config = useMemo(() => buildConfig(provider, getMcpEndpoint()), [provider]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('config');
      toast.success(t('app.copied'));
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error(t('agentConnect.mcp.copyFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--t-noise)] pb-3">
        <div className="min-w-0">
          <p className="font-sans text-[13px] font-semibold tracking-normal text-white">
            {t('agentConnect.mcp.title')}
          </p>
          <p className="mt-1 max-w-xl font-sans text-[12px] leading-5 tracking-normal text-text-secondary">
            {t('agentConnect.mcp.description')}
          </p>
        </div>
        <span className="shrink-0 border border-[var(--t-accent-dim)] px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-[var(--t-accent)]">
          HTTP
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px border border-[var(--t-noise)] bg-[var(--t-noise)] sm:grid-cols-6">
        {MCP_PROVIDERS.map((item) => {
          const active = item.id === provider;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setProvider(item.id)}
              className={`group flex min-h-[72px] flex-col items-center justify-center gap-2 bg-black px-2 py-2 text-center transition-colors [transition-timing-function:steps(2,end)] ${
                active
                  ? 'bg-[var(--t-accent-wash)] text-white'
                  : 'text-[var(--t-sub)] hover:bg-[var(--t-accent-wash)] hover:text-white'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mcp-provider-icon ${item.iconClass} opacity-80 transition-opacity group-hover:opacity-100 ${active ? 'opacity-100' : ''}`}
              />
              <span className="font-sans text-[11px] font-medium tracking-normal">
                {t(`agentConnect.mcp.providers.${item.labelKey}`)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-[12px] font-semibold tracking-normal text-[var(--t-accent)]">
            {t(`agentConnect.mcp.providers.${activeProvider.labelKey}`)}
          </p>
          <p className="mt-1 font-sans text-[11px] tracking-normal text-text-tertiary">
            {t(`agentConnect.mcp.files.${activeProvider.configFileKey}`)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyText(config)}
          className="t-btn t-btn--ghost h-8 shrink-0 !px-2.5"
        >
          {copied === 'config' ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied === 'config' ? t('app.copied') : t('agentConnect.mcp.copyConfig')}
        </button>
      </div>

      <pre className="max-h-[240px] overflow-auto border border-[var(--t-noise)] bg-black p-3 font-mono text-[11px] leading-5 text-info">
        <code>{config}</code>
      </pre>

      <div className="grid gap-3 border-t border-[var(--t-noise)] pt-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <p className="font-sans text-[12px] font-semibold tracking-normal text-white">
            {t('agentConnect.mcp.keyTitle')}
          </p>
          <p className="mt-1 font-sans text-[11px] leading-5 tracking-normal text-text-tertiary">
            {isAuthenticated && hasKey
              ? t('agentConnect.mcp.keyReady')
              : t('agentConnect.mcp.keyMissing')}
          </p>
          <code className="mt-2 inline-block border border-[var(--t-noise)] bg-black px-2 py-1 font-mono text-[11px] text-[var(--t-accent)]">
            {MCP_AGENT_KEY_ENV}
          </code>
        </div>
        {isAuthenticated ? (
          <Link href="/settings" className="t-btn t-btn--ghost h-8 shrink-0 !px-2.5">
            <KeyRound className="h-3.5 w-3.5" />
            {t('agentConnect.mcp.openSettings')}
          </Link>
        ) : (
          <Link href="/auth?mode=login" className="t-btn t-btn--primary h-8 shrink-0 !px-2.5">
            <KeyRound className="h-3.5 w-3.5" />
            {t('agentConnect.mcp.loginToCreateKey')}
          </Link>
        )}
      </div>

      <div className="flex items-start gap-2 border-l border-[var(--t-accent-dim)] pl-3 font-sans text-[11px] leading-5 tracking-normal text-text-tertiary">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--t-accent)]" />
        <span>{t('agentConnect.mcp.securityHint')}</span>
      </div>
    </div>
  );
}
