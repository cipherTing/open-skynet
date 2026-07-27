'use client';

import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  TButton,
  TInput,
  TTextarea,
  type TButtonProps,
  type TInputProps,
  type TTextareaProps,
} from '@/components/ui/terminal';
import { cn } from '@/lib/utils';

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

function getValidationMessage(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

function FieldShell({
  id,
  label,
  code,
  description,
  errors,
  children,
  className,
  labelAsLabel = true,
  labelId,
}: {
  id: string;
  label: ReactNode;
  code?: string;
  description?: ReactNode;
  errors: unknown[];
  children: ReactNode;
  className?: string;
  labelAsLabel?: boolean;
  labelId?: string;
}) {
  const messages = errors
    .map(getValidationMessage)
    .filter((message): message is string => Boolean(message));
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const labelContent = (
    <>
      <span
        id={labelId}
        className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]"
      >
        {label}
      </span>
      {code ? (
        <span aria-hidden className="font-mono text-[9px] tracking-[0.2em] text-[var(--t-faint)]">
          [{code}]
        </span>
      ) : null}
    </>
  );
  return (
    <div className={className}>
      {labelAsLabel ? (
        <label htmlFor={id} className="flex items-baseline justify-between gap-3">
          {labelContent}
        </label>
      ) : (
        <div className="flex items-baseline justify-between gap-3">{labelContent}</div>
      )}
      <div className="mt-1.5">{children}</div>
      {description ? (
        <p id={descriptionId} className="mt-1 text-[11px] leading-5 text-[var(--t-sub)]">
          {description}
        </p>
      ) : null}
      {messages.length > 0 ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 font-mono text-[10px] leading-5 text-[var(--t-hazard)]"
        >
          {messages[0]}
        </p>
      ) : null}
    </div>
  );
}

interface FormInputFieldProps extends Omit<TInputProps, 'value' | 'onChange' | 'onBlur'> {
  label: ReactNode;
  code?: string;
  description?: ReactNode;
  onValueChange?: (value: string) => void;
}

function FormInputField({
  label,
  code,
  description,
  onValueChange,
  className,
  ...props
}: FormInputFieldProps) {
  const field = useFieldContext<string>();
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const messages = field.state.meta.errors.map(getValidationMessage).filter(Boolean);
  return (
    <FieldShell
      id={id}
      label={label}
      code={code}
      description={description}
      errors={field.state.meta.errors}
    >
      <TInput
        {...props}
        id={id}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => {
          const value = event.target.value;
          field.handleChange(value);
          onValueChange?.(value);
        }}
        aria-invalid={messages.length > 0}
        aria-describedby={
          messages.length > 0 ? `${id}-error` : description ? `${id}-description` : undefined
        }
        className={className}
      />
    </FieldShell>
  );
}

interface FormTextareaFieldProps extends Omit<TTextareaProps, 'value' | 'onChange' | 'onBlur'> {
  label: ReactNode;
  code?: string;
  description?: ReactNode;
}

function FormTextareaField({
  label,
  code,
  description,
  className,
  ...props
}: FormTextareaFieldProps) {
  const field = useFieldContext<string>();
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const messages = field.state.meta.errors.map(getValidationMessage).filter(Boolean);
  return (
    <FieldShell
      id={id}
      label={label}
      code={code}
      description={description}
      errors={field.state.meta.errors}
    >
      <TTextarea
        {...props}
        id={id}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={messages.length > 0}
        aria-describedby={
          messages.length > 0 ? `${id}-error` : description ? `${id}-description` : undefined
        }
        className={className}
      />
    </FieldShell>
  );
}

function FormCheckboxField({
  label,
  description,
  disabled = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const field = useFieldContext<boolean>();
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="inline-flex items-start gap-2.5 text-xs leading-5 text-white/70"
      >
        <Checkbox
          id={id}
          checked={field.state.value}
          disabled={disabled}
          onBlur={field.handleBlur}
          onCheckedChange={(checked) => field.handleChange(checked === true)}
        />
        <span>{label}</span>
      </label>
      {description ? (
        <p className="mt-1 pl-[26px] text-[11px] leading-5 text-[var(--t-sub)]">{description}</p>
      ) : null}
    </div>
  );
}

function FormSwitchField({
  label,
  description,
  disabled = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const field = useFieldContext<boolean>();
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <label
          htmlFor={id}
          className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/85"
        >
          {label}
        </label>
        <Switch
          id={id}
          checked={field.state.value}
          disabled={disabled}
          onBlur={field.handleBlur}
          onCheckedChange={field.handleChange}
        />
      </div>
      {description ? (
        <p className="mt-1 text-[11px] leading-5 text-[var(--t-sub)]">{description}</p>
      ) : null}
    </div>
  );
}

function FormOtpField({
  label,
  code,
  length = 6,
}: {
  label: ReactNode;
  code?: string;
  length?: number;
}) {
  const field = useFieldContext<string>();
  const id = useId();
  return (
    <FieldShell id={id} label={label} code={code} errors={field.state.meta.errors}>
      <InputOTP
        id={id}
        name={field.name}
        maxLength={length}
        pattern={REGEXP_ONLY_DIGITS}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={field.handleChange}
        inputMode="numeric"
      >
        <InputOTPGroup>
          {Array.from({ length }, (_, index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </FieldShell>
  );
}

interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

function FormSelectField({
  label,
  code,
  placeholder,
  options,
  disabled = false,
}: {
  label: ReactNode;
  code?: string;
  placeholder?: ReactNode;
  options: SelectOption[];
  disabled?: boolean;
}) {
  const field = useFieldContext<string>();
  const id = useId();
  return (
    <FieldShell id={id} label={label} code={code} errors={field.state.meta.errors}>
      <select
        id={id}
        name={field.name}
        value={field.state.value}
        disabled={disabled}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        className="skynet-input w-full px-3 py-2.5 text-sm"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface RadioOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

function FormRadioGroupField({
  label,
  code,
  options,
  disabled = false,
}: {
  label: ReactNode;
  code?: string;
  options: RadioOption[];
  disabled?: boolean;
}) {
  const field = useFieldContext<string>();
  const id = useId();
  const labelId = `${id}-label`;
  return (
    <FieldShell
      id={id}
      label={label}
      code={code}
      errors={field.state.meta.errors}
      labelAsLabel={false}
      labelId={labelId}
    >
      <RadioGroup
        id={id}
        aria-labelledby={labelId}
        value={field.state.value}
        disabled={disabled}
        onValueChange={field.handleChange}
        className="flex flex-wrap gap-5"
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.15em] text-white/85"
          >
            <RadioGroupItem value={option.value} disabled={option.disabled} />
            {option.label}
          </label>
        ))}
      </RadioGroup>
    </FieldShell>
  );
}

function FormSubmitButton({
  children,
  submittingContent,
  className,
  disabled,
  ...props
}: TButtonProps & { submittingContent?: ReactNode }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <TButton
          type="submit"
          disabled={disabled || !canSubmit || isSubmitting}
          className={cn(className)}
          {...props}
        >
          {isSubmitting && submittingContent ? submittingContent : children}
        </TButton>
      )}
    </form.Subscribe>
  );
}

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: {
    InputField: FormInputField,
    TextareaField: FormTextareaField,
    CheckboxField: FormCheckboxField,
    SwitchField: FormSwitchField,
    OtpField: FormOtpField,
    SelectField: FormSelectField,
    RadioGroupField: FormRadioGroupField,
  },
  formComponents: {
    SubmitButton: FormSubmitButton,
  },
  fieldContext,
  formContext,
});
