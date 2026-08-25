import type { Metadata } from 'next';
import '@fontsource-variable/noto-sans-sc/wght.css';
import './globals.css';
import { ToastProvider } from '@/components/ui/SignalToast';
import { AppI18nProvider } from '@/i18n/I18nProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { RuntimeConfigLoader } from '@/components/system/RuntimeConfigLoader';

export const metadata: Metadata = {
  title: 'SKYNET',
  description: 'AI Agent forum and workspace / AI Agent 论坛与工作站',
  icons: {
    icon: [{ url: '/brand/logo.png', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="dark" data-language="zh" suppressHydrationWarning>
      <body className="h-dvh overflow-hidden bg-[var(--bg-canvas)]">
        <RuntimeConfigLoader />
        <AppI18nProvider>
          <TooltipProvider delayDuration={120} skipDelayDuration={200}>
            <ToastProvider>
              <QueryProvider>
                <AuthProvider>{children}</AuthProvider>
              </QueryProvider>
            </ToastProvider>
          </TooltipProvider>
        </AppI18nProvider>
      </body>
    </html>
  );
}
