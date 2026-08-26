import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { AccountMenu } from './AccountMenu';

const mockGetMe = jest.fn();
const mockEnterDemo = jest.fn();
const mockResetDemoAccount = jest.fn();
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
    enterDemo: (...args: unknown[]) => mockEnterDemo(...args),
    resetDemoAccount: (...args: unknown[]) => mockResetDemoAccount(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
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

describe('AccountMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockLogout.mockResolvedValue(undefined);
  });

  it('offers to enter Demo Mode for a real account, and does so on click', async () => {
    authenticate('real');
    mockEnterDemo.mockResolvedValue({
      accessToken: 'access-demo',
      refreshToken: 'refresh-demo',
      user: { id: 'demo-user-1', email: 'demo+user-1@fenticoin.demo.internal', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'demo', demoOfUserId: 'user-1' },
    });
    renderWithProviders(<AccountMenu />);

    await userEvent.click(await screen.findByLabelText('Account'));
    await userEvent.click(screen.getByRole('button', { name: /enter demo mode/i }));

    await waitFor(() => expect(mockEnterDemo).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows a loading state and disables the other menu actions while entering Demo Mode is in flight', async () => {
    authenticate('real');
    let resolveEnter!: (value: unknown) => void;
    mockEnterDemo.mockReturnValue(new Promise((resolve) => { resolveEnter = resolve; }));
    renderWithProviders(<AccountMenu />);

    await userEvent.click(await screen.findByLabelText('Account'));
    await userEvent.click(screen.getByRole('button', { name: /^enter demo mode$/i }));

    expect(await screen.findByRole('button', { name: /entering demo mode/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /log out/i })).toBeDisabled();

    resolveEnter({
      accessToken: 'access-demo',
      refreshToken: 'refresh-demo',
      user: { id: 'demo-user-1', email: 'demo+user-1@fenticoin.demo.internal', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'demo', demoOfUserId: 'user-1' },
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('never leaves the user without feedback if entering Demo Mode fails, and lets them retry', async () => {
    authenticate('real');
    mockEnterDemo.mockRejectedValueOnce(new Error('network down'));
    renderWithProviders(<AccountMenu />);

    await userEvent.click(await screen.findByLabelText('Account'));
    await userEvent.click(screen.getByRole('button', { name: /^enter demo mode$/i }));

    expect(await screen.findByText(/could not enter demo mode/i)).toBeInTheDocument();
    // The button returns to its idle, re-clickable state rather than staying stuck loading.
    expect(await screen.findByRole('button', { name: /^enter demo mode$/i })).not.toBeDisabled();
  });

  it('offers Exit Demo Mode and Reset Demo Account for a demo account, never Enter Demo Mode', async () => {
    authenticate('demo');
    renderWithProviders(<AccountMenu />);

    await userEvent.click(await screen.findByLabelText('Account'));

    expect(screen.getByRole('button', { name: /exit demo mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset demo account/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^enter demo mode$/i })).not.toBeInTheDocument();
  });

  it('shows a confirmation dialog before resetting, and only calls the API on confirm', async () => {
    authenticate('demo');
    mockResetDemoAccount.mockResolvedValue(undefined);
    renderWithProviders(<AccountMenu />);

    await userEvent.click(await screen.findByLabelText('Account'));
    await userEvent.click(screen.getByRole('button', { name: /reset demo account/i }));

    const dialog = screen.getByRole('dialog', { name: /reset demo account/i });
    expect(mockResetDemoAccount).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: /^reset$/i }));
    await waitFor(() => expect(mockResetDemoAccount).toHaveBeenCalled());
  });
});
