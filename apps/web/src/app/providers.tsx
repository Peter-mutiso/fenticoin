'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { NotificationProvider } from '@/lib/notifications/NotificationContext';
import { RealtimeProvider } from '@/lib/realtime/RealtimeProvider';
import { ToastProvider } from '@/components/ui/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 10_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RealtimeProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </RealtimeProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
