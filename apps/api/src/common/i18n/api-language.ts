import { I18nContext } from 'nestjs-i18n';
import type { ArgumentsHost } from '@nestjs/common';
import type { ApiMessageArgs } from '@/common/i18n/api-message';

export type ApiLanguage = 'en' | 'zh';

export function normalizeApiLanguage(value: string | undefined): ApiLanguage {
  return value?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getApiLanguage(host?: ArgumentsHost): ApiLanguage {
  return normalizeApiLanguage(I18nContext.current(host)?.lang);
}

export function getContentLanguage(language: ApiLanguage): 'en' | 'zh-CN' {
  return language === 'zh' ? 'zh-CN' : 'en';
}

export function translateApiMessage(message: unknown, host?: ArgumentsHost): string | null {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) return null;
  const candidate = message as Record<string, unknown>;
  if (candidate.kind !== 'skynet_api_message' || typeof candidate.key !== 'string') return null;
  const context = I18nContext.current(host);
  if (!context) return null;
  const language = normalizeApiLanguage(context.lang);
  const args =
    candidate.args !== null && typeof candidate.args === 'object' && !Array.isArray(candidate.args)
      ? (candidate.args as Record<string, string | number | boolean | null>)
      : undefined;
  return context.t(candidate.key, { lang: language, ...(args ? { args } : {}) });
}

export function localizeApiValue(value: unknown, host?: ArgumentsHost): unknown {
  const translated = translateApiMessage(value, host);
  if (translated !== null) return translated;
  if (Array.isArray(value)) return value.map((item) => localizeApiValue(item, host));
  if (value === null || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, localizeApiValue(item, host)]),
  );
}

export function translateApiText(
  key: string,
  englishFallback: string,
  args?: ApiMessageArgs,
): string {
  const context = I18nContext.current();
  if (!context) return englishFallback;
  const translated = context.t(key, {
    lang: normalizeApiLanguage(context.lang),
    ...(args ? { args } : {}),
  });
  return typeof translated === 'string' ? translated : englishFallback;
}
