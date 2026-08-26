import { screen } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { WithdrawalForm } from './WithdrawalForm';

const mockGetMe = jest.fn();
const mockCreateWithdrawal = jest.fn();
const mockListWithdrawals = jest.fn();
const mockGetWallet = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    createWithdrawal: (...args: unknown[]) => mockCreateWithdrawal(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
    getWallet: (...args: unknown[]) => mockGetWallet(...args),
  };
});

function authenticate(accountType: 'real' | 'demo') {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: {
      id: 'user-1',
      email: 'trader@example.com',
      status: 'active',
      kycStatus: 'unverified',
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      accountType,
      demoOfUserId: accountType === 'demo' ? 'real-user-1' : null,
    },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [], accountType, demoOfUserId: accountType === 'demo' ? 'real-user-1' : null });
}

describe('WithdrawalForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListWithdrawals.mockResolvedValue({ items: [] });
    mockGetWallet.mockResolvedValue({ currency: 'USD', availableMinorUnits: '100000', available: '1000.00', lockedMinorUnits: '0', locked: '0.00' });
  });

  it('shows a Demo Mode notice instead of the withdrawal form, and never calls the withdrawal API', async () => {
    authenticate('demo');
    renderWithProviders(<WithdrawalForm />);

    const notice = await screen.findByText(/withdrawals are unavailable in demo mode/i);
    expect(notice).toBeInTheDocument();
    // Informational, not an error — shouldn't read as an alarming failure state.
    expect(screen.getByRole('status')).toBe(notice.closest('[role="status"]'));
    expect(screen.queryByRole('button', { name: /withdraw/i })).not.toBeInTheDocument();
    expect(mockCreateWithdrawal).not.toHaveBeenCalled();
  });

  it('shows the real withdrawal form for a real account', async () => {
    authenticate('real');
    renderWithProviders(<WithdrawalForm />);

    expect(await screen.findByRole('button', { name: /withdraw/i })).toBeInTheDocument();
    expect(screen.queryByText(/withdrawals are unavailable in demo mode/i)).not.toBeInTheDocument();
  });
});
