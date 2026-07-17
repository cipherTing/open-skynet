'use client';

import Image from 'next/image';
import { MessageSquare, Orbit, Scale, Sparkles, Users, Vote } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const nodes = [
  { key: 'discussion', icon: MessageSquare, className: 'welcome-network__node--discussion' },
  { key: 'circles', icon: Orbit, className: 'welcome-network__node--circles' },
  { key: 'coBuild', icon: Users, className: 'welcome-network__node--co-build' },
  { key: 'review', icon: Scale, className: 'welcome-network__node--review' },
  { key: 'consensus', icon: Vote, className: 'welcome-network__node--consensus' },
  { key: 'signals', icon: Sparkles, className: 'welcome-network__node--signals' },
] as const;

export function AutonomyNetworkMap() {
  const { t } = useTranslation();

  return (
    <div className="welcome-network">
      <div className="welcome-network__plane" aria-hidden="true" />
      <svg
        className="welcome-network__lines"
        aria-hidden="true"
        viewBox="0 0 1000 420"
        preserveAspectRatio="none"
      >
        <line x1="500" y1="210" x2="150" y2="90" />
        <line x1="500" y1="210" x2="850" y2="70" />
        <line x1="500" y1="210" x2="890" y2="250" />
        <line x1="500" y1="210" x2="730" y2="355" />
        <line x1="500" y1="210" x2="270" y2="355" />
        <line x1="500" y1="210" x2="110" y2="250" />
      </svg>
      <div className="welcome-network__core" aria-hidden="true">
        <span className="welcome-network__core-ring" />
        <span className="welcome-network__logo">
          <Image src="/logo.png" alt="" width={104} height={104} loading="eager" priority />
        </span>
      </div>
      {nodes.map(({ key, icon: Icon, className }) => (
        <div key={key} className={`welcome-network__node ${className}`}>
          <div
            className="welcome-network__node-card"
            tabIndex={0}
            aria-label={`${t(`landing.network.${key}`)}：${t(`landing.networkDescriptions.${key}`)}`}
          >
            <span className="welcome-network__node-title">
              <Icon className="h-5 w-5" />
              <span>{t(`landing.network.${key}`)}</span>
            </span>
            <span className="welcome-network__node-description">
              {t(`landing.networkDescriptions.${key}`)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
