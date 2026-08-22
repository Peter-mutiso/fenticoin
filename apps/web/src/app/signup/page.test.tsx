import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthProvider } from '@/lib/auth/AuthContext';
import SignupPage from './page';

const mockRegister = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, register: (...args: unknown[]) => mockRegister(...args) };
});

const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/signup',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: replaceMock, back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

function renderPage() {
  return render(
    <AuthProvider>
      <SignupPage />
    </AuthProvider>,
  );
}

describe('SignupPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('links back to /login for an existing user', () => {
    renderPage();
    const loginLinks = screen.getAllByRole('link', { name: /log in/i });
    expect(loginLinks.length).toBeGreaterThan(0);
    for (const link of loginLinks) expect(link).toHaveAttribute('href', '/login');
  });

  it('rejects a password shorter than 12 characters before ever calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 12 characters/i);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('rejects mismatched password confirmation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password-1');
    await user.type(screen.getByLabelText(/confirm password/i), 'a-different-password');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('requires the terms acknowledgement before submitting', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password-1');
    await user.type(screen.getByLabelText(/confirm password/i), 'a-strong-password-1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/accept the terms/i);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('registers and redirects to the dashboard on success', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', email: 'new@example.com', status: 'active', kycStatus: 'unverified', emailVerifiedAt: null, phoneVerifiedAt: null },
    });

    renderPage();

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password-1');
    await user.type(screen.getByLabelText(/confirm password/i), 'a-strong-password-1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({ email: 'new@example.com', password: 'a-strong-password-1' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('surfaces a server error (e.g. email already registered) without crashing', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireActual('@/lib/api-client');
    mockRegister.mockRejectedValue(new ApiError('An account with this email already exists', 409, 'ConflictException'));

    renderPage();

    await user.type(screen.getByLabelText(/email address/i), 'existing@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password-1');
    await user.type(screen.getByLabelText(/confirm password/i), 'a-strong-password-1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});
