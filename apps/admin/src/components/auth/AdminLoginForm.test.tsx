import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils/render';
import { AdminLoginForm } from './AdminLoginForm';

const mockLogin = jest.fn();
const mockLoginWithTwoFactor = jest.fn();
const mockLogout = jest.fn();
const mockGetMe = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    login: (...args: unknown[]) => mockLogin(...args),
    loginWithTwoFactor: (...args: unknown[]) => mockLoginWithTwoFactor(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
  };
});

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function renderForm() {
  return renderWithProviders(<AdminLoginForm />);
}

describe('AdminLoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockLogout.mockResolvedValue(undefined);
  });

  it('shows an explicit "no administrative access" message and logs the session back out for a permission-less account', async () => {
    mockLogin.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1', email: 'plain@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null } });
    mockGetMe.mockResolvedValue({ id: 'u1', email: 'plain@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });

    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'plain@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/no administrative access/i)).toBeInTheDocument();
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to the dashboard when the account holds at least one permission', async () => {
    mockLogin.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 'u2', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null } });
    mockGetMe.mockResolvedValue({ id: 'u2', email: 'admin@example.com', status: 'active', sessionId: 's2', roles: ['support'], permissions: ['users.view'] });

    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('walks through a two-factor challenge before checking administrative access', async () => {
    mockLogin.mockResolvedValue({ twoFactorRequired: true, challengeToken: 'challenge-1' });
    mockLoginWithTwoFactor.mockResolvedValue(['reports.view']);
    mockGetMe.mockResolvedValue({ id: 'u3', email: 'admin2fa@example.com', status: 'active', sessionId: 's3', roles: ['support'], permissions: ['reports.view'] });

    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin2fa@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    const codeInput = await screen.findByLabelText(/two-factor code/i);
    await userEvent.type(codeInput, '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));

    expect(mockLoginWithTwoFactor).toHaveBeenCalledWith('challenge-1', '123456');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('surfaces a server error without crashing', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    renderForm();
    await userEvent.type(screen.getByLabelText(/email/i), 'x@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
