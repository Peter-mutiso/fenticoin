import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { AccountMenu } from './AccountMenu';

const mockGetMe = jest.fn();
const mockResetDemoAccount = jest.fn();
const mockLogout = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
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

  it('offers Reset Demo Account only for a demo account, never for a real one — switching accounts lives in the header switcher, not here', async () => {
    authenticate('real');
    renderWithProviders(<AccountMenu />);

    await userEvent.click(await screen.findByLabelText('Account'));

    expect(screen.queryByRole('button', { name: /reset demo account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enter demo mode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /exit demo mode/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('offers Reset Demo Account for a demo account', async () => {
    authenticate('demo');
    renderWithProviders(<AccountMenu />);

    await userEvent.click(await screen.findByLabelText('Account'));

    expect(screen.getByRole('button', { name: /reset demo account/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enter demo mode/i })).not.toBeInTheDocument();
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

  it('logs out on click', async () => {
    authenticate('real');
    renderWithProviders(<AccountMenu />);

    await userEvent.click(await screen.findByLabelText('Account'));
    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });
});
