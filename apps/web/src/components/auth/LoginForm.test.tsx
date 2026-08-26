import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from '@/lib/auth/AuthContext';
import { LoginForm } from './LoginForm';

const mockLogin = jest.fn();
const mockLoginWithTwoFactor = jest.fn();
const mockGetMe = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    login: (...args: unknown[]) => mockLogin(...args),
    loginWithTwoFactor: (...args: unknown[]) => mockLoginWithTwoFactor(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
  };
});

const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: replaceMock, back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('logs in directly and redirects when the account has no 2FA', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
    });

    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'trader@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(mockLogin).toHaveBeenCalledWith({ email: 'trader@example.com', password: 'correct horse' });
  });

  it('shows the two-factor step when the account requires it, then verifies and redirects', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({ twoFactorRequired: true, challengeToken: 'challenge-1' });
    mockLoginWithTwoFactor.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', email: 'trader@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null, accountType: 'real', demoOfUserId: null },
    });

    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'trader@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(await screen.findByLabelText(/two-factor code/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/two-factor code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    expect(mockLoginWithTwoFactor).toHaveBeenCalledWith('challenge-1', '123456');
  });

  it('shows a clear error and lets the user retry on invalid credentials', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireActual('@/lib/api-client');
    mockLogin.mockRejectedValueOnce(new ApiError('Invalid email or password', 401, 'UnauthorizedException'));

    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'trader@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(replaceMock).not.toHaveBeenCalled();

    // The form is still usable — the user can correct and resubmit.
    expect(screen.getByRole('button', { name: /^log in$/i })).toBeEnabled();
  });
});
