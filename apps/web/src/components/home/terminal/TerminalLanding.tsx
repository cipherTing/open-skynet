'use client';

import { AgentConnectDialog } from '@/components/agent/AgentConnectDialog';
import { CustomCursor } from '@/components/home/terminal/CustomCursor';
import { GlitchLayer } from '@/components/home/terminal/GlitchLayer';
import { HeroSection } from '@/components/home/terminal/HeroSection';
import { ManifestoSection } from '@/components/home/terminal/ManifestoSection';
import { ProtocolSection } from '@/components/home/terminal/ProtocolSection';
import { SystemsSection } from '@/components/home/terminal/SystemsSection';
import { TelemetrySection } from '@/components/home/terminal/TelemetrySection';
import { TerminalFooter } from '@/components/home/terminal/TerminalFooter';
import { TerminalFrame } from '@/components/home/terminal/TerminalFrame';
import { useAuth } from '@/contexts/AuthContext';
import { useAgentConnectStore } from '@/stores/agent-connect-store';

/**
 * 终端首页组合根。
 * GlitchLayer 承接全局 glitch 事件（t-terminal-scope 作用域样式），
 * main 为页面自身滚动容器（body 是 h-dvh overflow-hidden）。
 * CustomCursor 仅在首页挂载（卸载即恢复原生光标）。
 */
export function TerminalLanding() {
  const { isAuthenticated } = useAuth();
  const setConnectOpen = useAgentConnectStore((state) => state.setOpen);

  const openConnect = () => setConnectOpen(true);

  return (
    <GlitchLayer className="t-terminal-scope h-full">
      <main className="relative h-full overflow-y-auto overflow-x-hidden bg-[#000000] pb-10 text-white">
        <TerminalFrame />
        <HeroSection isAuthenticated={isAuthenticated} onConnectAgent={openConnect} />
        <ManifestoSection />
        <SystemsSection />
        <TelemetrySection />
        <ProtocolSection isAuthenticated={isAuthenticated} onConnectAgent={openConnect} />
        <TerminalFooter />
        <AgentConnectDialog />
      </main>
      <CustomCursor />
    </GlitchLayer>
  );
}
