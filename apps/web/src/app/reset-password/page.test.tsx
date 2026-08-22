import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ResetPasswordPage from './page';

const mockResetPassword = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, resetPassword: (...args: unknown[]) => mockResetPassword(...args) };
});

let searchParams = new URLSearchParams();
const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/reset-password',
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: jest.fn(), replace: replaceMock, back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  it('shows an invalid-link state when no token is present in the URL', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('rejects a password shorter than 12 characters', async () => {
    searchParams = new URLSearchParams({ token: 'reset-token-1' });
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText(/confirm new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 12 characters/i);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords', async () => {
    searchParams = new URLSearchParams({ token: 'reset-token-1' });
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText('New password'), 'a-strong-password-1');
    await user.type(screen.getByLabelText(/confirm new password/i), 'a-different-password');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('resets the password with the token from the URL and shows a success state', async () => {
    searchParams = new URLSearchParams({ token: 'reset-token-1' });
    mockResetPassword.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText('New password'), 'a-strong-password-1');
    await user.type(screen.getByLabelText(/confirm new password/i), 'a-strong-password-1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(mockResetPassword).toHaveBeenCalledWith('reset-token-1', 'a-strong-password-1'));
    expect(await screen.findByText(/password reset/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to login/i }));
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('surfaces a server error for an expired/invalid token', async () => {
    searchParams = new URLSearchParams({ token: 'expired-token' });
    const { ApiError } = jest.requireActual('@/lib/api-client');
    mockResetPassword.mockRejectedValue(new ApiError('This reset link has expired', 400, 'BadRequestException'));
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText('New password'), 'a-strong-password-1');
    await user.type(screen.getByLabelText(/confirm new password/i), 'a-strong-password-1');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
  });
});
