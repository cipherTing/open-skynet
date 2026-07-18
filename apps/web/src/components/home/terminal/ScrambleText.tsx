interface ScrambleTextProps {
  text: string;
  className?: string;
  as?: 'span' | 'div' | 'p';
}

/**
 * 乱码特效已按用户裁决移除：组件保留为静态透传。
 * 原 hover 乱码解码（遮罩层 / setInterval 逐帧 / pointer:fine 与
 * prefers-reduced-motion 判定 / 事件处理）全部删除，直接渲染 text，
 * 仅保留 as 多态与 className 透传，导出名与 props 签名不变，
 * 消费方（HeroSection / SystemsSection / ProtocolSection /
 * TerminalFooter / TerminalFrame）零改动照常编译。
 * 纯静态渲染、无 hooks、无浏览器 API，不再标记 'use client'。
 */
export function ScrambleText({ text, className, as }: ScrambleTextProps) {
  const Tag = as ?? 'span';
  return <Tag className={className}>{text}</Tag>;
}
