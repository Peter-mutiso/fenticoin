import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { NotificationProvider } from '@/lib/notifications/NotificationContext';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * The full provider stack (mirrors `app/providers.tsx`) but with retries
 * disabled — the real app retries failed queries once, which makes error
 * states in tests wait through a real backoff delay before settling.
 * `NotificationProvider` is included since `Header` (rendered by
 * `AppShell` on every page) depends on it; tests that authenticate should
 * mock `listBets`/`listDeposits`/`listWithdrawals` so its background
 * watchers don't throw on unmocked calls.
 */
export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <NotificationProvider>{ui}</NotificationProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}
