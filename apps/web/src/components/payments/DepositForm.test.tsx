import { screen } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { DepositForm } from './DepositForm';

const mockGetMe = jest.fn();
const mockCreateDeposit = jest.fn();
const mockListDeposits = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    createDeposit: (...args: unknown[]) => mockCreateDeposit(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
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

describe('DepositForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListDeposits.mockResolvedValue({ items: [] });
  });

  it('shows a Demo Mode notice instead of the deposit form, and never calls the deposit API', async () => {
    authenticate('demo');
    renderWithProviders(<DepositForm />);

    const notice = await screen.findByText(/demo accounts use virtual funds/i);
    expect(notice).toBeInTheDocument();
    // Informational, not an error — shouldn't read as an alarming failure state.
    expect(screen.getByRole('status')).toBe(notice.closest('[role="status"]'));
    expect(screen.queryByRole('button', { name: /deposit/i })).not.toBeInTheDocument();
    expect(mockCreateDeposit).not.toHaveBeenCalled();
  });

  it('shows the real deposit form for a real account', async () => {
    authenticate('real');
    renderWithProviders(<DepositForm />);

    expect(await screen.findByRole('button', { name: /deposit/i })).toBeInTheDocument();
    expect(screen.queryByText(/demo accounts use virtual funds/i)).not.toBeInTheDocument();
  });
});
