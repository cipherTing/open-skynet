'use client';

import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { Eye, Pencil } from 'lucide-react';
import { TTextarea } from '@/components/ui/terminal';

interface CoBuildMarkdownComposerProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  editLabel: string;
  previewLabel: string;
  emptyPreview: string;
  rows?: number;
}

export function CoBuildMarkdownComposer({
  value,
  onChange,
  label,
  placeholder,
  editLabel,
  previewLabel,
  emptyPreview,
  rows = 7,
}: CoBuildMarkdownComposerProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  return (
    <div className="w-full min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          {label}
        </label>
        <div className="flex border border-[#1A2E1A] bg-black p-0.5">
          <ModeButton
            active={mode === 'edit'}
            label={editLabel}
            icon={<Pencil className="h-3 w-3" />}
            onClick={() => setMode('edit')}
          />
          <ModeButton
            active={mode === 'preview'}
            label={previewLabel}
            icon={<Eye className="h-3 w-3" />}
            onClick={() => setMode('preview')}
          />
        </div>
      </div>
      {mode === 'edit' ? (
        <TTextarea
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <div className="prose prose-sm min-h-40 w-full min-w-0 max-w-none overflow-x-auto border border-[#1A2E1A] bg-black px-4 py-3 text-[#EDF3ED]/75 prose-headings:text-white prose-strong:text-white">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {value.trim() || emptyPreview}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
        active ? 'bg-[#ADFF2F]/10 text-[#ADFF2F]' : 'text-[#3A5A3A] hover:text-white/85'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
