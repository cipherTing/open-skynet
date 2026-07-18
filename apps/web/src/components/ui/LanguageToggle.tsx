'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  FLOATING_Z_INDEX,
  FloatingPortal,
  PortalTooltip,
  isEventInsideRefs,
} from '@/components/ui/FloatingPortal';
import { getCurrentLanguage, setAppLanguage } from '@/i18n/i18n';
import { type SupportedLanguage } from '@/i18n/resources';

const LANGUAGE_OPTIONS: Array<{ value: SupportedLanguage; shortLabelKey: string; labelKey: string }> = [
  { value: 'zh', shortLabelKey: 'language.shortZh', labelKey: 'language.zh' },
  { value: 'en', shortLabelKey: 'language.shortEn', labelKey: 'language.en' },
];

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(() =>
    getCurrentLanguage(),
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleLanguageChanged = () => {
      setCurrentLanguage(getCurrentLanguage());
      closeMenu();
    };

    i18n.on('languageChanged', handleLanguageChanged);
    handleLanguageChanged();
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [closeMenu, i18n]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!isEventInsideRefs(event, [triggerRef, menuRef])) {
        closeMenu();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, open]);

  const currentOption = LANGUAGE_OPTIONS.find((option) => option.value === currentLanguage) ?? LANGUAGE_OPTIONS[1];

  return (
    <>
      <PortalTooltip content={t('language.label')} placement="bottom">
        <button
          ref={triggerRef}
          type="button"
          aria-label={t('language.label')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((nextOpen) => !nextOpen)}
          className="inline-flex h-8 min-w-12 items-center justify-center gap-1 rounded-none border border-[var(--t-noise)] bg-black px-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--t-sub)] transition-[color,background-color,border-color] duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)]/60 hover:bg-[var(--t-accent)]/10 hover:text-[var(--t-accent)]"
        >
          <Languages className="h-3.5 w-3.5" />
          <span>{t(currentOption.shortLabelKey)}</span>
        </button>
      </PortalTooltip>

      <FloatingPortal
        open={open}
        anchorRef={triggerRef}
        placement="bottom"
        align="end"
        offset={8}
        zIndex={FLOATING_Z_INDEX.menu}
        role="menu"
        className="w-36 rounded-none border border-[var(--t-noise)] bg-black p-1 animate-[skynet-floating-in_120ms_steps(3)] motion-reduce:animate-none"
      >
        <div ref={menuRef} className="grid gap-0.5">
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = currentLanguage === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  void setAppLanguage(option.value).catch((error: unknown) => {
                    console.error('Failed to change language:', error);
                  });
                }}
                className={`flex items-center justify-between px-2.5 py-2 text-left font-mono text-[11px] uppercase tracking-[0.15em] transition-[color,background-color] duration-100 [transition-timing-function:steps(2,end)] ${
                  selected
                    ? 'bg-[var(--t-accent)]/10 text-[var(--t-accent)]'
                    : 'text-white/70 hover:bg-[var(--t-noise)]/60 hover:text-white'
                }`}
              >
                <span>{t(option.labelKey)}</span>
                {selected && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </FloatingPortal>
    </>
  );
}
