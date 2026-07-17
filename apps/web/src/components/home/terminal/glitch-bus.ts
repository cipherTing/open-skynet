/**
 * Glitch 事件总线。
 *
 * 通过 window CustomEvent 触发终端首页的全局 glitch 效果
 * （约 100ms 屏幕微震 + clip-path 纵向切割闪烁，由 <GlitchLayer /> 承接）。
 * 纯浏览器事件、无 React 依赖；SSR 环境下为安全 no-op。
 */

export const SKYNET_GLITCH_EVENT = 'skynet:glitch';

/** 触发一次全局 glitch。可重复调用，<GlitchLayer /> 会重新起播动画。 */
export function emitGlitch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SKYNET_GLITCH_EVENT));
}
