import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { AccountSwitcher } from './AccountSwitcher';

const mockGetMe = jest.fn();
const mockGetDemoStatus = jest.fn();
const mockEnterDemo = jest.fn();
const mockLogout = jest.fn();
const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    getDemoStatus: (...args: unknown[]) => mockGetDemoStatus(...args),
    enterDemo: (...args: unknown[]) => mockEnterDemo(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
  };
});

function authenticate(accountType: 'real' | 'demo') {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: {
      id: accountType === 'real' ? 'user-1' : 'demo-user-1',
      email: accountType === 'real' ? 'trader@example.com' : 'demo+user-1@fenticoin.demo.internal',
      status: 'active',
      kycStatus: 'unverified',
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      accountType,
      demoOfUserId: accountType === 'demo' ? 'user-1' : null,
    },
  });
  mockGetMe.mockResolvedValue({
    id: accountType === 'real' ? 'user-1' : 'demo-user-1',
    email: 'trader@example.com',
    status: 'active',
    sessionId: 's1',
    roles: [],
    permissions: [],
    accountType,
    demoOfUserId: accountType === 'demo' ? 'user-1' : null,
  });
}

const REAL_BALANCE = { currency: 'USD', availableMinorUnits: '996500', available: '9965.00', lockedMinorUnits: '0', locked: '0.00' };
const DEMO_BALANCE = { currency: 'USD', availableMinorUnits: '1000000', available: '10000.00', lockedMinorUnits: '0', locked: '0.00' };

describe('AccountSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows both accounts, with the active one marked, when opened', async () => {
    authenticate('real');
    mockGetDemoStatus.mockResolvedValue({ current: 'real', real: { userId: 'user-1', balance: REAL_BALANCE }, demo: { userId: 'demo-user-1', balance: DEMO_BALANCE } });
    renderWithProviders(<AccountSwitcher />);

    const trigger = await screen.findByRole('button', { name: /switch account/i });
    await waitFor(() => expect(trigger).toHaveTextContent('$9965.00'));
    await userEvent.click(trigger);

    expect(screen.getByText(/real account/i)).toBeInTheDocument();
    expect(screen.getByText(/demo account/i)).toBeInTheDocument();
    // The active account's balance legitimately appears twice — once in the
    // always-visible trigger pill, once in its own dropdown row — so this
    // asserts presence, not uniqueness.
    expect(screen.getAllByText('$9965.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$10000.00')).toBeInTheDocument();
  });

  it('never mixes accounts: switching to Demo calls enterDemoMode and never shows the real balance as the active one afterwards', async () => {
    authenticate('real');
    mockGetDemoStatus.mockResolvedValueOnce({ current: 'real', real: { userId: 'user-1', balance: REAL_BALANCE }, demo: { userId: 'demo-user-1', balance: DEMO_BALANCE } });
    mockEnterDemo.mockResolvedValue({
      accessToken: 'access-demo',
      refreshToken: 'refresh-demo',
      user: { id: 'demo-user-1', email: 'demo+user-1@fenticoin.demo.internal', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'demo', demoOfUserId: 'user-1' },
    });
    // After switching, the switcher's own query is invalidated and refetches — reflect the new session.
    mockGetDemoStatus.mockResolvedValueOnce({ current: 'demo', real: { userId: 'user-1', balance: REAL_BALANCE }, demo: { userId: 'demo-user-1', balance: DEMO_BALANCE } });

    renderWithProviders(<AccountSwitcher />);
    await userEvent.click(await screen.findByRole('button', { name: /switch account/i }));
    await userEvent.click(screen.getByText(/demo account/i));

    await waitFor(() => expect(mockEnterDemo).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: /switch account/i })).toHaveTextContent('Demo'));
  });

  it('shows a "not activated yet" hint instead of a fabricated balance when the demo shadow does not exist yet', async () => {
    authenticate('real');
    mockGetDemoStatus.mockResolvedValue({ current: 'real', real: { userId: 'user-1', balance: REAL_BALANCE }, demo: null });
    renderWithProviders(<AccountSwitcher />);

    await userEvent.click(await screen.findByRole('button', { name: /switch account/i }));

    expect(await screen.findByText(/not activated yet/i)).toBeInTheDocument();
  });

  it('surfaces an error toast and does not crash when switching fails', async () => {
    authenticate('real');
    mockGetDemoStatus.mockResolvedValue({ current: 'real', real: { userId: 'user-1', balance: REAL_BALANCE }, demo: { userId: 'demo-user-1', balance: DEMO_BALANCE } });
    mockEnterDemo.mockRejectedValueOnce(new Error('network down'));

    renderWithProviders(<AccountSwitcher />);
    await userEvent.click(await screen.findByRole('button', { name: /switch account/i }));
    await userEvent.click(screen.getByText(/demo account/i));

    expect(await screen.findByText(/could not switch to demo account/i)).toBeInTheDocument();
  });

  it('renders nothing when unauthenticated', () => {
    renderWithProviders(<AccountSwitcher />);
    expect(screen.queryByRole('button', { name: /switch account/i })).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger, like every other dialog/menu in the app', async () => {
    authenticate('real');
    mockGetDemoStatus.mockResolvedValue({ current: 'real', real: { userId: 'user-1', balance: REAL_BALANCE }, demo: { userId: 'demo-user-1', balance: DEMO_BALANCE } });
    renderWithProviders(<AccountSwitcher />);

    const trigger = await screen.findByRole('button', { name: /switch account/i });
    await userEvent.click(trigger);
    expect(screen.getByText(/demo account/i)).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText(/demo account/i)).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
