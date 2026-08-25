import { screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { RequirePermission } from './RequirePermission';

const mockGetMe = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, getMe: (...args: unknown[]) => mockGetMe(...args) };
});

function authenticate(permissions: string[]) {
  storeSession({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1', email: 'x@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null } });
  mockGetMe.mockResolvedValue({ id: 'u1', email: 'x@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions });
}

describe('RequirePermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('hides its children when the current admin lacks the permission — this is how a lower-privileged role sees fewer actions than a higher-privileged one', async () => {
    authenticate(['users.view']);
    renderWithProviders(
      <div>
        <p>marker</p>
        <RequirePermission permission="wallet.adjust">
          <button>Adjust balance</button>
        </RequirePermission>
      </div>,
    );

    // Wait for hydration (the permission check) to actually complete before
    // asserting absence — otherwise the button would also be missing during
    // the initial loading state, proving nothing about post-hydration behavior.
    await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
    await screen.findByText('marker');
    expect(screen.queryByRole('button', { name: /adjust balance/i })).not.toBeInTheDocument();
  });

  it('renders its children once the permission is confirmed present', async () => {
    authenticate(['wallet.adjust']);
    renderWithProviders(
      <RequirePermission permission="wallet.adjust">
        <button>Adjust balance</button>
      </RequirePermission>,
    );

    expect(await screen.findByRole('button', { name: /adjust balance/i })).toBeInTheDocument();
  });
});
