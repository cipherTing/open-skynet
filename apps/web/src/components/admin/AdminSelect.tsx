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
        className={`inline-flex h-8 min-w-36 items-center justify-between gap-3 rounded-none border border-[#1A2E1A] bg-black px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white/70 outline-none transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A] data-[state=open]:border-[#ADFF2F] ${className}`}
      >
        <Select.Value />
        <Select.Icon asChild>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#3A5A3A]" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          collisionPadding={12}
          className="z-[100] max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-none border border-[#1A2E1A] bg-[#040704]"
        >
          <Select.Viewport className="p-1">
            {options.map((option) => {
              const optionValue = option.value || EMPTY_VALUE;
              return (
                <Select.Item
                  key={optionValue}
                  value={optionValue}
                  className="relative flex h-8 cursor-default select-none items-center rounded-none px-8 font-mono text-[11px] uppercase tracking-[0.12em] text-white/60 outline-none transition-colors duration-100 [transition-timing-function:steps(2,end)] data-[highlighted]:bg-[#1A2E1A] data-[highlighted]:text-[#ADFF2F] data-[state=checked]:text-[#ADFF2F]"
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
