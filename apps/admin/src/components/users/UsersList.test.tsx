import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils/render';
import { UsersList } from './UsersList';

const mockListUsers = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, listUsers: (...args: unknown[]) => mockListUsers(...args) };
});

const user = {
  id: 'user-1',
  email: 'trader@example.com',
  emailVerifiedAt: null,
  phone: null,
  phoneVerifiedAt: null,
  status: 'active' as const,
  kycStatus: 'approved' as const,
  eligibilityStatus: 'eligible' as const,
  dateOfBirth: null,
  accountType: 'real' as const,
  demoOfUserId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('UsersList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists real users returned by the server', async () => {
    mockListUsers.mockResolvedValue({ items: [user] });
    renderWithProviders(<UsersList />);

    expect(await screen.findByText('trader@example.com')).toBeInTheDocument();
  });

  it('badges a demo shadow account so admins never mistake it for real activity', async () => {
    mockListUsers.mockResolvedValue({ items: [{ ...user, id: 'demo-user-1', email: 'demo+user-1@fenticoin.demo.internal', accountType: 'demo' as const, demoOfUserId: 'user-1' }] });
    renderWithProviders(<UsersList />);

    await screen.findByText('demo+user-1@fenticoin.demo.internal');
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('shows an honest empty state rather than fabricated rows', async () => {
    mockListUsers.mockResolvedValue({ items: [] });
    renderWithProviders(<UsersList />);

    expect(await screen.findByText(/no users yet/i)).toBeInTheDocument();
  });

  it('searches by email and resends the request with the typed value', async () => {
    mockListUsers.mockResolvedValue({ items: [] });
    renderWithProviders(<UsersList />);

    await waitFor(() => expect(mockListUsers).toHaveBeenCalledWith(expect.objectContaining({ email: undefined })));

    await userEvent.type(screen.getByLabelText(/search by email/i), 'trader@example.com{enter}');

    await waitFor(() => expect(mockListUsers).toHaveBeenCalledWith(expect.objectContaining({ email: 'trader@example.com' })));
  });

  it('filters by account status', async () => {
    mockListUsers.mockResolvedValue({ items: [] });
    renderWithProviders(<UsersList />);
    await waitFor(() => expect(mockListUsers).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Suspended' }));

    await waitFor(() => expect(mockListUsers).toHaveBeenCalledWith(expect.objectContaining({ status: 'suspended' })));
  });
});
