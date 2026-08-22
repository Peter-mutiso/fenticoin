import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { UserDetailView } from './UserDetailView';

const mockGetMe = jest.fn();
const mockGetUser = jest.fn();
const mockGetUserRoles = jest.fn();
const mockSetUserStatus = jest.fn();
const mockSetEligibility = jest.fn();
const mockReviewKyc = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    getUser: (...args: unknown[]) => mockGetUser(...args),
    getUserRoles: (...args: unknown[]) => mockGetUserRoles(...args),
    setUserStatus: (...args: unknown[]) => mockSetUserStatus(...args),
    setEligibility: (...args: unknown[]) => mockSetEligibility(...args),
    reviewKyc: (...args: unknown[]) => mockReviewKyc(...args),
  };
});

const targetUser = {
  id: 'user-1',
  email: 'trader@example.com',
  emailVerifiedAt: null,
  phone: null,
  phoneVerifiedAt: null,
  status: 'active' as const,
  kycStatus: 'pending' as const,
  eligibilityStatus: 'eligible' as const,
  dateOfBirth: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function authenticateAs(permissions: string[]) {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions });
}

function renderView() {
  return renderWithProviders(<UserDetailView userId="user-1" />);
}

describe('UserDetailView — frontend RBAC gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockGetUser.mockResolvedValue(targetUser);
    mockGetUserRoles.mockResolvedValue({ roles: [], permissions: [] });
  });

  it('a read-only role (support: users.view only) sees no suspend/restrict/KYC actions at all', async () => {
    authenticateAs(['users.view']);
    renderView();

    expect(await screen.findByText('trader@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /suspend account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restrict betting/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve kyc/i })).not.toBeInTheDocument();
  });

  it('a risk-role admin (users.suspend + kyc.review) sees exactly those actions', async () => {
    authenticateAs(['users.view', 'users.suspend', 'kyc.view', 'kyc.review']);
    renderView();

    expect(await screen.findByRole('button', { name: /suspend account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restrict betting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve kyc/i })).toBeInTheDocument();
  });

  it('suspending an account requires a reason via the confirm dialog before it is submitted', async () => {
    authenticateAs(['users.view', 'users.suspend']);
    mockSetUserStatus.mockResolvedValue({ ...targetUser, status: 'suspended' });
    renderView();

    await userEvent.click(await screen.findByRole('button', { name: /suspend account/i }));

    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Confirm' });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(within(dialog).getByRole('textbox'), 'repeated chargebacks');
    expect(confirmButton).toBeEnabled();

    await userEvent.click(confirmButton);

    await waitFor(() => expect(mockSetUserStatus).toHaveBeenCalledWith('user-1', 'suspended', 'repeated chargebacks'));
  });

  it('banning an account requires typing BAN to confirm — the highest-blast-radius action', async () => {
    authenticateAs(['users.view', 'users.suspend']);
    mockSetUserStatus.mockResolvedValue({ ...targetUser, status: 'banned' });
    renderView();

    await userEvent.click(await screen.findByRole('button', { name: /ban account/i }));

    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Confirm' });
    const [reasonInput, typedConfirmInput] = within(dialog).getAllByRole('textbox');
    await userEvent.type(reasonInput!, 'confirmed fraud');
    expect(confirmButton).toBeDisabled();

    await userEvent.type(typedConfirmInput!, 'BAN');
    expect(confirmButton).toBeEnabled();

    await userEvent.click(confirmButton);
    await waitFor(() => expect(mockSetUserStatus).toHaveBeenCalledWith('user-1', 'banned', 'confirmed fraud'));
  });

  it('restricting eligibility calls setEligibility with the reason, never a raw account suspend', async () => {
    authenticateAs(['users.view', 'users.suspend']);
    mockSetEligibility.mockResolvedValue({ ...targetUser, eligibilityStatus: 'ineligible' });
    renderView();

    await userEvent.click(await screen.findByRole('button', { name: /restrict betting\/deposits\/withdrawals/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'suspicious betting pattern');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockSetEligibility).toHaveBeenCalledWith('user-1', 'ineligible', 'suspicious betting pattern'));
    expect(mockSetUserStatus).not.toHaveBeenCalled();
  });
});
