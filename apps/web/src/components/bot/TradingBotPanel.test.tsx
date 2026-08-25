'use client';

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test-utils/render';
import { TradingBotPanel } from './TradingBotPanel';

const mockGetBot = jest.fn();
const mockActivateBot = jest.fn();
const mockDeactivateBot = jest.fn();

jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  getBot: (...args: unknown[]) => mockGetBot(...args),
  activateBot: (...args: unknown[]) => mockActivateBot(...args),
  deactivateBot: (...args: unknown[]) => mockDeactivateBot(...args),
}));

const baseBot = {
  id: 'bot-1',
  userId: 'user-1',
  strategyKey: 'future-strategy',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('TradingBotPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActivateBot.mockResolvedValue({ ...baseBot, status: 'active' });
    mockDeactivateBot.mockResolvedValue({ ...baseBot, status: 'inactive' });
  });

  it('shows loading state while server bot state is loading', () => {
    mockGetBot.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<TradingBotPanel />);
    expect(screen.getByText(/loading bot state/i)).toBeInTheDocument();
  });

  it('shows inactive state and activates through the server endpoint', async () => {
    mockGetBot.mockResolvedValue({ ...baseBot, status: 'inactive' });
    renderWithProviders(<TradingBotPanel />);

    expect(await screen.findByText('Inactive')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /activate bot/i }));
    await waitFor(() => expect(mockActivateBot).toHaveBeenCalledTimes(1));
  });

  it('shows active state and deactivates through the server endpoint', async () => {
    mockGetBot.mockResolvedValue({ ...baseBot, status: 'active' });
    renderWithProviders(<TradingBotPanel />);

    expect(await screen.findByText('Active')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /deactivate bot/i }));
    await waitFor(() => expect(mockDeactivateBot).toHaveBeenCalledTimes(1));
  });

  it('does not offer activation when the strategy is missing', async () => {
    mockGetBot.mockResolvedValue({ ...baseBot, status: 'strategy_unconfigured', strategyKey: null });
    renderWithProviders(<TradingBotPanel />);

    expect(await screen.findByText(/no trading strategy has been configured yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activate bot/i })).toBeDisabled();
    expect(mockActivateBot).not.toHaveBeenCalled();
  });

  it('shows an activation failure without starting client-side execution', async () => {
    mockGetBot.mockResolvedValue({ ...baseBot, status: 'inactive' });
    mockActivateBot.mockRejectedValue(new Error('activation failed'));
    renderWithProviders(<TradingBotPanel />);

    await userEvent.click(await screen.findByRole('button', { name: /activate bot/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/bot activation failed/i);
    expect(mockGetBot).toHaveBeenCalledTimes(1);
  });
});
