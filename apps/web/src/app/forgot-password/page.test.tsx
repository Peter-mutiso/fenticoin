import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ForgotPasswordPage from './page';

const mockForgotPassword = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, forgotPassword: (...args: unknown[]) => mockForgotPassword(...args) };
});

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits the email and shows a generic non-enumerating success message', async () => {
    const user = userEvent.setup();
    mockForgotPassword.mockResolvedValue({ message: 'sent' });

    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: /send reset instructions/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(mockForgotPassword).toHaveBeenCalledWith('someone@example.com');
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/login');
  });

  it('shows the same generic success message even for an unknown email, never leaking whether an account exists', async () => {
    const user = userEvent.setup();
    mockForgotPassword.mockResolvedValue({ message: 'sent' });

    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: /send reset instructions/i }));

    await waitFor(() => expect(screen.getByText(/if an account exists for that address/i)).toBeInTheDocument());
  });

  it('shows a server error rather than a silent failure', async () => {
    const user = userEvent.setup();
    const { NetworkError } = jest.requireActual('@/lib/api-client');
    mockForgotPassword.mockRejectedValue(new NetworkError());

    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email address/i), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: /send reset instructions/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
