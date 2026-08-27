import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { NotificationBell } from './NotificationBell';

const mockGetMe = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listBets: jest.fn().mockResolvedValue({ items: [] }),
    listDeposits: jest.fn().mockResolvedValue({ items: [] }),
    listWithdrawals: jest.fn().mockResolvedValue({ items: [] }),
  };
});

function authenticate() {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [], accountType: 'real', demoOfUserId: null });
}

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    authenticate();
    renderWithProviders(<NotificationBell />);

    const trigger = await screen.findByRole('button', { name: /notifications/i });
    await userEvent.click(trigger);
    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText(/no notifications yet/i)).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
