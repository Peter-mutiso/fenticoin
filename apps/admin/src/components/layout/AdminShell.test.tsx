import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { storeSession } from '@/lib/auth/token-storage';
import { AdminShell } from './AdminShell';

const mockGetMe = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, getMe: (...args: unknown[]) => mockGetMe(...args) };
});

function renderShell() {
  return render(
    <AuthProvider>
      <AdminShell>
        <p>Protected content</p>
      </AdminShell>
    </AuthProvider>,
  );
}

function authenticate(permissions: string[]) {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions });
}

describe('AdminShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('prompts an unauthenticated visitor to log in', async () => {
    renderShell();
    await waitFor(() => expect(screen.getByText(/need to log in/i)).toBeInTheDocument());
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the protected chrome for an admin with at least one permission', async () => {
    authenticate(['users.view']);
    renderShell();
    await waitFor(() => expect(screen.getByText('Protected content')).toBeInTheDocument());
  });

  it('shows a "no administrative access" state — never the blank chrome — for an authenticated account with zero permissions', async () => {
    authenticate([]);
    renderShell();

    await waitFor(() => expect(screen.getByText(/no administrative access/i)).toBeInTheDocument());
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('logging out from the no-access state clears the session', async () => {
    authenticate([]);
    renderShell();
    await waitFor(() => expect(screen.getByText(/no administrative access/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => expect(screen.getByText(/need to log in/i)).toBeInTheDocument());
  });

  it('shows a distinct "can\'t reach the API" retry state — never a misleading "please log in" — when hydration fails due to a network error', async () => {
    storeSession({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
    });
    const { NetworkError } = jest.requireActual('@/lib/api-client');
    mockGetMe.mockRejectedValue(new NetworkError());

    renderShell();

    await waitFor(() => expect(screen.getByText(/can.t reach the fenticoin api/i)).toBeInTheDocument());
    expect(screen.queryByText(/need to log in/i)).not.toBeInTheDocument();

    mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions: ['users.view'] });
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText('Protected content')).toBeInTheDocument());
  });
});
