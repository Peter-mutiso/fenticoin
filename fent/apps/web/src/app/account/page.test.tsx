import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import AccountPage from './page';

const mockGetMe = jest.fn();
const mockRequestPhoneOtp = jest.fn();
const mockVerifyPhoneOtp = jest.fn();
const mockSetupTwoFactor = jest.fn();
const mockConfirmTwoFactor = jest.fn();
const mockDisableTwoFactor = jest.fn();
const mockForgotPassword = jest.fn();
const mockLogout = jest.fn();
const mockLogoutAll = jest.fn();
const mockListBets = jest.fn();
const mockListDeposits = jest.fn();
const mockListWithdrawals = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    requestPhoneOtp: (...args: unknown[]) => mockRequestPhoneOtp(...args),
    verifyPhoneOtp: (...args: unknown[]) => mockVerifyPhoneOtp(...args),
    setupTwoFactor: (...args: unknown[]) => mockSetupTwoFactor(...args),
    confirmTwoFactor: (...args: unknown[]) => mockConfirmTwoFactor(...args),
    disableTwoFactor: (...args: unknown[]) => mockDisableTwoFactor(...args),
    forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    logoutAll: (...args: unknown[]) => mockLogoutAll(...args),
    listBets: (...args: unknown[]) => mockListBets(...args),
    listDeposits: (...args: unknown[]) => mockListDeposits(...args),
    listWithdrawals: (...args: unknown[]) => mockListWithdrawals(...args),
  };
});

const mockRouterReplace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/account',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  useRouter: () => ({
    push: jest.fn(),
    replace: (...args: unknown[]) => mockRouterReplace(...args),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

function authenticate() {
  storeSession({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'user-1', email: 'trader@example.com', status: 'active', kycStatus: 'pending', emailVerifiedAt: '2026-01-01T00:00:00.000Z', phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'user-1', email: 'trader@example.com', status: 'active', sessionId: 's1', roles: [], permissions: [] });
}

function renderPage() {
  return renderWithProviders(<AccountPage />);
}

describe('AccountPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListBets.mockResolvedValue({ items: [] });
    mockListDeposits.mockResolvedValue({ items: [] });
    mockListWithdrawals.mockResolvedValue({ items: [] });
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    renderPage();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining('/login')));
  });

  it('shows real profile info including KYC status, and honest unavailable notices for unsupported sections', async () => {
    authenticate();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('trader@example.com')).toBeInTheDocument();
      expect(screen.getByText('Pending review')).toBeInTheDocument();
      expect(screen.getByText(/document upload isn't available yet/i)).toBeInTheDocument();
      expect(screen.getByText(/deposit limits, loss limits/i)).toBeInTheDocument();
      expect(screen.getByText(/individual sessions isn't available yet/i)).toBeInTheDocument();
    });
  });

  it('sends a phone verification code and confirms it', async () => {
    authenticate();
    mockRequestPhoneOtp.mockResolvedValue({ message: 'sent' });
    mockVerifyPhoneOtp.mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByPlaceholderText('+15551234567')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('+15551234567'), '+15551234567');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('123456'), '654321');
    await userEvent.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() => expect(screen.getByText(/phone verified for this session/i)).toBeInTheDocument());
    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('+15551234567', '654321');
  });

  it('disables the phone-code Verify button until a 6-digit code is entered', async () => {
    authenticate();
    mockRequestPhoneOtp.mockResolvedValue({ message: 'sent' });

    renderPage();
    await waitFor(() => expect(screen.getByPlaceholderText('+15551234567')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('+15551234567'), '+15551234567');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeInTheDocument());
    const verifyButton = screen.getByRole('button', { name: /^verify$/i });
    expect(verifyButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('123456'), '123');
    expect(verifyButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('123456'), '456');
    expect(verifyButton).toBeEnabled();
    expect(mockVerifyPhoneOtp).not.toHaveBeenCalled();
  });

  it('sets up 2FA and shows backup codes exactly once', async () => {
    authenticate();
    mockSetupTwoFactor.mockResolvedValue({ provisioningUri: 'otpauth://totp/FentiCoin?secret=ABC' });
    mockConfirmTwoFactor.mockResolvedValue({ backupCodes: ['code-1', 'code-2'] });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /set up 2fa/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /set up 2fa/i }));
    await waitFor(() => expect(screen.getByText(/otpauth:\/\/totp/)).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('123456'), '111111');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByText('code-1')).toBeInTheDocument();
      expect(screen.getByText('code-2')).toBeInTheDocument();
    });
  });

  it('disables the 2FA Confirm button until a 6-digit code is entered', async () => {
    authenticate();
    mockSetupTwoFactor.mockResolvedValue({ provisioningUri: 'otpauth://totp/FentiCoin?secret=ABC' });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /set up 2fa/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /set up 2fa/i }));
    await waitFor(() => expect(screen.getByText(/otpauth:\/\/totp/)).toBeInTheDocument());

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('123456'), '11111');
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('123456'), '1');
    expect(confirmButton).toBeEnabled();
    expect(mockConfirmTwoFactor).not.toHaveBeenCalled();
  });

  it('only offers a password-reset email, never a fake change-password form', async () => {
    authenticate();
    mockForgotPassword.mockResolvedValue({ message: 'sent' });

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /send password reset email/i })).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/current password/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /send password reset email/i }));

    await waitFor(() => expect(screen.getByText(/check trader@example.com for a password reset link/i)).toBeInTheDocument());
    expect(mockForgotPassword).toHaveBeenCalledWith('trader@example.com');
  });

  it('logs out of all devices', async () => {
    authenticate();
    mockLogoutAll.mockResolvedValue(undefined);

    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /log out of all devices/i })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /log out of all devices/i }));

    await waitFor(() => expect(mockLogoutAll).toHaveBeenCalled());
  });
});
