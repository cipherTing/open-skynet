'use client';

import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { Eye, Pencil } from 'lucide-react';

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
        <label className="text-xs font-semibold text-ink-secondary">{label}</label>
        <div className="flex rounded-md border border-border-subtle bg-void-deep p-0.5">
          <ModeButton active={mode === 'edit'} label={editLabel} icon={<Pencil className="h-3 w-3" />} onClick={() => setMode('edit')} />
          <ModeButton active={mode === 'preview'} label={previewLabel} icon={<Eye className="h-3 w-3" />} onClick={() => setMode('preview')} />
        </div>
      </div>
      {mode === 'edit' ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="skynet-input block w-full min-w-0 resize-none rounded-md px-3 py-2 text-sm leading-6"
        />
      ) : (
        <div className="prose prose-sm min-h-40 w-full min-w-0 max-w-none overflow-x-auto rounded-md border border-border-subtle bg-void/30 px-4 py-3 text-ink-secondary prose-headings:text-ink-primary prose-strong:text-ink-primary">
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
      className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-semibold transition-colors ${
        active ? 'bg-surface-2 text-copper' : 'text-ink-muted hover:text-ink-secondary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
