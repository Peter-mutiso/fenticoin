import { render, screen } from '@testing-library/react';

import { AuthProvider } from '@/lib/auth/AuthContext';
import VerifyEmailPage from './page';

const mockVerifyEmail = jest.fn();
const mockGetMe = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
  };
});

let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  usePathname: () => '/verify-email',
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
}));

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    searchParams = new URLSearchParams();
  });

  it('shows a missing-token state when the URL has no token', async () => {
    render(<AuthProvider><VerifyEmailPage /></AuthProvider>);
    expect(await screen.findByText(/couldn.t verify your email/i)).toBeInTheDocument();
    expect(screen.getByText(/missing its verification token/i)).toBeInTheDocument();
  });

  it('verifies the token from the URL and shows a success state', async () => {
    searchParams = new URLSearchParams({ token: 'verify-token-1' });
    mockVerifyEmail.mockResolvedValue(undefined);

    render(<AuthProvider><VerifyEmailPage /></AuthProvider>);

    expect(await screen.findByText(/email verified/i)).toBeInTheDocument();
    expect(mockVerifyEmail).toHaveBeenCalledWith('verify-token-1');
    expect(screen.getByRole('link', { name: /continue to login/i })).toHaveAttribute('href', '/login');
  });

  it('shows a server error for an invalid/expired token, with a way to continue', async () => {
    searchParams = new URLSearchParams({ token: 'bad-token' });
    const { ApiError } = jest.requireActual('@/lib/api-client');
    mockVerifyEmail.mockRejectedValue(new ApiError('This verification link has expired', 400, 'BadRequestException'));

    render(<AuthProvider><VerifyEmailPage /></AuthProvider>);

    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue to login/i })).toBeInTheDocument();
  });
});
