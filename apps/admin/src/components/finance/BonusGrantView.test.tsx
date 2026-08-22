import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { BonusGrantView } from './BonusGrantView';

const mockGetMe = jest.fn();
const mockListUsers = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listUsers: (...args: unknown[]) => mockListUsers(...args),
  };
});

function authenticate(permissions: string[]) {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions });
}

describe('BonusGrantView — RBAC gating on the bonus-grant form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('hides the grant-bonus form for an admin without wallet.adjust, even after selecting a user', async () => {
    authenticate(['users.view']);
    mockListUsers.mockResolvedValue({ items: [{ id: 'user-1', email: 'trader@example.com' }] });
    renderWithProviders(<BonusGrantView />);

    await userEvent.type(screen.getByLabelText(/search by email/i), 'trader@example.com{enter}');
    await userEvent.click(await screen.findByText('trader@example.com'));

    await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /grant bonus/i })).not.toBeInTheDocument();
  });

  it('shows the grant-bonus form for an admin with wallet.adjust', async () => {
    authenticate(['wallet.adjust']);
    mockListUsers.mockResolvedValue({ items: [{ id: 'user-1', email: 'trader@example.com' }] });
    renderWithProviders(<BonusGrantView />);

    await userEvent.type(screen.getByLabelText(/search by email/i), 'trader@example.com{enter}');
    await userEvent.click(await screen.findByText('trader@example.com'));

    expect(await screen.findByRole('button', { name: /grant bonus/i })).toBeInTheDocument();
  });
});
