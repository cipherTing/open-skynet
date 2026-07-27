'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Languages } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TerminalTooltip } from '@/components/ui/tooltip';
import { UI_LAYER_CLASS } from '@/components/ui/layers';
import { getCurrentLanguage, setAppLanguage } from '@/i18n/i18n';
import { type SupportedLanguage } from '@/i18n/resources';

const LANGUAGE_OPTIONS: Array<{
  value: SupportedLanguage;
  shortLabelKey: string;
  labelKey: string;
}> = [
  { value: 'zh', shortLabelKey: 'language.shortZh', labelKey: 'language.zh' },
  { value: 'en', shortLabelKey: 'language.shortEn', labelKey: 'language.en' },
];

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return value === 'zh' || value === 'en';
}

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(() =>
    getCurrentLanguage(),
  );

  useEffect(() => {
    const handleLanguageChanged = () => setCurrentLanguage(getCurrentLanguage());
    i18n.on('languageChanged', handleLanguageChanged);
    handleLanguageChanged();
    return () => i18n.off('languageChanged', handleLanguageChanged);
  }, [i18n]);

  const currentOption =
    LANGUAGE_OPTIONS.find((option) => option.value === currentLanguage) ?? LANGUAGE_OPTIONS[0];

  return (
    <DropdownMenu.Root>
      <TerminalTooltip content={t('language.label')} side="bottom">
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t('language.label')}
            className="inline-flex h-8 min-w-12 items-center justify-center gap-1 border border-[var(--t-noise)] bg-black px-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--t-sub)] transition-[color,background-color,border-color] duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)]/60 hover:bg-[var(--t-accent)]/10 hover:text-[var(--t-accent)]"
          >
            <Languages className="h-3.5 w-3.5" />
            <span>{t(currentOption.shortLabelKey)}</span>
          </button>
        </DropdownMenu.Trigger>
      </TerminalTooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className={`skynet-floating-content w-36 border border-[var(--t-noise)] bg-black p-1 outline-none ${UI_LAYER_CLASS.menu}`}
        >
          <DropdownMenu.RadioGroup
            value={currentLanguage}
            onValueChange={(value) => {
              if (!isSupportedLanguage(value)) return;
              void setAppLanguage(value).catch((error: unknown) => {
                console.error('Failed to change language:', error);
              });
            }}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className="flex cursor-pointer items-center justify-between px-2.5 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white/70 outline-none transition-[color,background-color] duration-100 [transition-timing-function:steps(2,end)] focus:bg-[var(--t-accent)]/10 focus:text-[var(--t-accent)] data-[state=checked]:bg-[var(--t-accent)]/10 data-[state=checked]:text-[var(--t-accent)]"
              >
                <span>{t(option.labelKey)}</span>
                <DropdownMenu.ItemIndicator>
                  <Check className="h-3.5 w-3.5" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
