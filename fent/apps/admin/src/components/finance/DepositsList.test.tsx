import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { DepositsList } from './DepositsList';

const mockGetMe = jest.fn();
const mockListAdminDeposits = jest.fn();
const mockReconcileDeposits = jest.fn();
const mockResolveDeposit = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listAdminDeposits: (...args: unknown[]) => mockListAdminDeposits(...args),
    reconcileDeposits: (...args: unknown[]) => mockReconcileDeposits(...args),
    resolveDeposit: (...args: unknown[]) => mockResolveDeposit(...args),
  };
});

function authenticate() {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({
    id: 'admin-1',
    email: 'admin@example.com',
    status: 'active',
    sessionId: 's1',
    roles: ['finance'],
    permissions: ['deposits.approve'],
  });
}

describe('DepositsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListAdminDeposits.mockResolvedValue({ items: [] });
  });

  it('never reconciles on the first click — a bulk provider-reconciliation action requires confirmation', async () => {
    authenticate();
    renderWithProviders(<DepositsList />);

    const reconcileButton = await screen.findByRole('button', { name: /reconcile with provider/i });
    await userEvent.click(reconcileButton);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mockReconcileDeposits).not.toHaveBeenCalled();
  });

  it('reconciles only after the confirmation dialog is accepted, and reports the result', async () => {
    authenticate();
    mockReconcileDeposits.mockResolvedValue({ resolved: 2, stillPending: 1, errors: 0 });
    renderWithProviders(<DepositsList />);

    await userEvent.click(await screen.findByRole('button', { name: /reconcile with provider/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reconcile' }));

    await waitFor(() => expect(mockReconcileDeposits).toHaveBeenCalled());
  });

  it('hides the reconcile action for an admin without deposits.approve', async () => {
    storeSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
    });
    mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions: ['deposits.view'] });

    renderWithProviders(<DepositsList />);

    await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /reconcile with provider/i })).not.toBeInTheDocument();
  });
});
