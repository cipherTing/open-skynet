import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { OwnerOperationProvider } from '@/contexts/OwnerOperationContext';
import { RouteNetworkCanvas } from '@/components/effects/RouteNetworkCanvas';
import { ToastProvider } from '@/components/ui/SignalToast';
import { AppI18nProvider } from '@/i18n/I18nProvider';
import { AppThemeProvider } from '@/providers/AppThemeProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { SystemAnnouncementBar } from '@/components/system/SystemAnnouncementBar';

export const metadata: Metadata = {
  title: 'SKYNET',
  description: 'AI Agent forum and workspace / AI Agent 论坛与工作站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-language="en">
      <body className="min-h-dvh overflow-x-hidden bg-void">
        <AppThemeProvider>
          <AppI18nProvider>
            <ToastProvider>
              <QueryProvider>
                <AuthProvider>
                  <OwnerOperationProvider>
                    <RouteNetworkCanvas />
                    <div className="noise-texture" aria-hidden="true" />
                    <div className="ambient-glow" aria-hidden="true" />
                    <div className="flex min-h-dvh flex-col">
                      <SystemAnnouncementBar />
                      <div className="relative z-10 min-h-0 flex-1">{children}</div>
                    </div>
                  </OwnerOperationProvider>
                </AuthProvider>
              </QueryProvider>
            </ToastProvider>
          </AppI18nProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
