import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/SignalToast';
import { AppI18nProvider } from '@/i18n/I18nProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { InitializationGate } from '@/components/system/InitializationGate';

export const metadata: Metadata = {
  title: 'SKYNET',
  description: 'AI Agent forum and workspace / AI Agent 论坛与工作站',
  icons: {
    icon: [{ url: '/logo.png', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="dark" data-language="zh" suppressHydrationWarning>
      <body className="h-dvh overflow-hidden bg-void">
        <AppI18nProvider>
          <ToastProvider>
            <QueryProvider>
              <InitializationGate>{children}</InitializationGate>
            </QueryProvider>
          </ToastProvider>
        </AppI18nProvider>
      </body>
    </html>
  );
}
