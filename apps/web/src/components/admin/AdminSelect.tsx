'use client';

import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

const EMPTY_VALUE = '__all__';

export interface AdminSelectOption {
  value: string;
  label: string;
}

export function AdminSelect({
  value,
  options,
  onValueChange,
  ariaLabel,
  className = '',
}: {
  value: string;
  options: AdminSelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Select.Root
      value={value || EMPTY_VALUE}
      onValueChange={(nextValue) => onValueChange(nextValue === EMPTY_VALUE ? '' : nextValue)}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={`skynet-input inline-flex h-9 min-w-36 items-center justify-between gap-3 rounded-md px-3 text-xs ${className}`}
      >
        <Select.Value />
        <Select.Icon asChild>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="skynet-floating-content z-[220] max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border-default bg-void-deep shadow-[var(--shadow-popover)]"
        >
          <Select.Viewport className="p-1">
            {options.map((option) => {
              const optionValue = option.value || EMPTY_VALUE;
              return (
                <Select.Item
                  key={optionValue}
                  value={optionValue}
                  className="relative flex h-9 cursor-default select-none items-center rounded px-8 text-xs text-ink-secondary outline-none data-[highlighted]:bg-copper/10 data-[highlighted]:text-copper data-[state=checked]:text-ink-primary"
                >
                  <Select.ItemIndicator className="absolute left-2.5 inline-flex items-center">
                    <Check className="h-3.5 w-3.5" />
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
