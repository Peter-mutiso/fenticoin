import { screen, waitFor } from '@testing-library/react';

import { storeSession } from '@/lib/auth/token-storage';
import { renderWithProviders } from '@/test-utils/render';
import { InstrumentsList } from './InstrumentsList';

const mockGetMe = jest.fn();
const mockListAdminInstruments = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    getMe: (...args: unknown[]) => mockGetMe(...args),
    listAdminInstruments: (...args: unknown[]) => mockListAdminInstruments(...args),
  };
});

function authenticate(permissions: string[]) {
  storeSession({
    accessToken: 'a',
    refreshToken: 'r',
    user: { id: 'admin-1', email: 'admin@example.com', status: 'active', kycStatus: 'approved', emailVerifiedAt: null, phoneVerifiedAt: null },
  });
  mockGetMe.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', status: 'active', sessionId: 's1', roles: ['support'], permissions });
}

describe('InstrumentsList — RBAC gating on instrument creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockListAdminInstruments.mockResolvedValue({ items: [] });
  });

  it('hides the "New instrument" button for an admin who can only view markets', async () => {
    authenticate(['markets.view']);
    renderWithProviders(<InstrumentsList />);

    await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new instrument/i })).not.toBeInTheDocument();
  });

  it('shows the "New instrument" button for an admin who can manage markets', async () => {
    authenticate(['markets.view', 'markets.manage']);
    renderWithProviders(<InstrumentsList />);

    expect(await screen.findByRole('button', { name: /new instrument/i })).toBeInTheDocument();
  });
});
