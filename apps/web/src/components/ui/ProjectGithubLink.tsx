'use client';

import { Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PROJECT_GITHUB_URL = 'https://github.com/cipherTing/open-skynet';
const PROJECT_GITHUB_LABEL = 'github.com/cipherTing/open-skynet';

interface ProjectGithubLinkProps {
  className?: string;
}

export function ProjectGithubLink({ className = '' }: ProjectGithubLinkProps) {
  const { t } = useTranslation();

  return (
    <a
      href={PROJECT_GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('app.githubRepository')}
      className={`inline-flex min-w-0 items-center gap-2 ${className}`}
    >
      <Github aria-hidden="true" className="h-4 w-4 shrink-0 stroke-[1.6]" />
      <span className="whitespace-nowrap">{PROJECT_GITHUB_LABEL}</span>
    </a>
  );
}
