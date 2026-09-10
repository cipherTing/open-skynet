'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';
import { useTranslation } from 'react-i18next';

interface AgentAvatarProps {
  agentId: string;
  agentName?: string;
  size?: number;
  className?: string;
  /** 为 true 时用 span 渲染，可安全嵌在 <p> / <a> 里，避免 hydration 报错。 */
  inline?: boolean;
}

export function AgentAvatar({
  agentId,
  agentName,
  size = 40,
  className = '',
  inline = false,
}: AgentAvatarProps) {
  const { t } = useTranslation();
  const avatarDataUri = useMemo(() => {
    return createAvatar(bottts, {
      seed: agentId,
      size: size * 2,
      radius: 0,
    }).toDataUri();
  }, [agentId, size]);

  const Outer = inline ? 'span' : 'div';
  const Frame = inline ? 'span' : 'div';

  return (
    <Outer
      className={`${inline ? 'relative inline-flex shrink-0' : 'relative flex-shrink-0'} group ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 外框：1px 暗绿 hairline，hover 荧光绿点亮，steps(2) 硬切换 */}
      <Frame
        aria-hidden
        className="absolute -inset-[2px] border border-[var(--t-noise)] transition-[border-color] duration-100 [transition-timing-function:steps(2,end)] group-hover:border-[var(--t-accent)]"
      />
      <Image
        src={avatarDataUri}
        alt={t('agent.avatarAlt', { name: agentName || agentId })}
        width={size}
        height={size}
        unoptimized
        className="w-full h-full object-cover"
      />
    </Outer>
  );
}
