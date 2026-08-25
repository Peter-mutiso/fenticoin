'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';

import {
  isSettledBetStatus,
  isTerminalDepositStatus,
  isTerminalWithdrawalStatus,
  listBets,
  listDeposits,
  listWithdrawals,
  type Bet,
  type BetStatus,
  type Deposit,
  type DepositStatus,
  type Withdrawal,
  type WithdrawalStatus,
} from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { useToast } from '@/components/ui/Toast';
import { getStoredNotifications, storeNotifications } from './notification-storage';
import type { AppNotification } from './types';
import { useTransitionWatcher } from './useTransitionWatcher';

interface NotificationState {
  items: AppNotification[];
}

type NotificationAction =
  | { type: 'HYDRATE'; items: AppNotification[] }
  | { type: 'ADD'; notification: AppNotification }
  | { type: 'MARK_READ'; id: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'CLEAR' };

function reducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items };
    case 'ADD':
      if (state.items.some((item) => item.id === action.notification.id)) return state;
      return { items: [action.notification, ...state.items] };
    case 'MARK_READ':
      return { items: state.items.map((item) => (item.id === action.id ? { ...item, read: true } : item)) };
    case 'MARK_ALL_READ':
      return { items: state.items.map((item) => (item.read ? item : { ...item, read: true })) };
    case 'CLEAR':
      return { items: [] };
    default:
      return state;
  }
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

function betDescription(bet: Bet, toStatus: BetStatus): { title: string; description: string; tone: 'success' | 'error' | 'info' } {
  if (toStatus === 'won') {
    return { title: 'Bet settled — you won', description: `Payout ${formatCurrencyMinorUnits(bet.potentialPayoutMinorUnits, bet.currency)}`, tone: 'success' };
  }
  if (toStatus === 'lost') {
    return { title: 'Bet settled — you lost', description: `Stake ${formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)}`, tone: 'info' };
  }
  if (toStatus === 'void' || toStatus === 'refunded') {
    return { title: 'Bet voided — stake refunded', description: `${formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)} refunded`, tone: 'info' };
  }
  return { title: 'Bet cancelled', description: `${formatCurrencyMinorUnits(bet.stakeAmountMinorUnits, bet.currency)} refunded`, tone: 'info' };
}

function depositDescription(deposit: Deposit, toStatus: DepositStatus): { title: string; description: string; tone: 'success' | 'error' | 'info' } {
  const amount = formatCurrencyMinorUnits(deposit.amountMinorUnits, deposit.currency);
  if (toStatus === 'completed') return { title: 'Deposit completed', description: `${amount} added to your balance`, tone: 'success' };
  if (toStatus === 'failed') return { title: 'Deposit failed', description: deposit.failureReason ?? amount, tone: 'error' };
  if (toStatus === 'expired') return { title: 'Deposit expired', description: amount, tone: 'info' };
  return { title: 'Deposit cancelled', description: amount, tone: 'info' };
}

function withdrawalDescription(withdrawal: Withdrawal, toStatus: WithdrawalStatus): { title: string; description: string; tone: 'success' | 'error' | 'info' } {
  const amount = formatCurrencyMinorUnits(withdrawal.amountMinorUnits, withdrawal.currency);
  if (toStatus === 'completed') return { title: 'Withdrawal completed', description: amount, tone: 'success' };
  if (toStatus === 'failed') return { title: 'Withdrawal failed', description: withdrawal.failureReason ?? amount, tone: 'error' };
  if (toStatus === 'rejected') return { title: 'Withdrawal rejected', description: withdrawal.rejectionReason ?? amount, tone: 'error' };
  if (toStatus === 'reversed') return { title: 'Withdrawal reversed', description: amount, tone: 'info' };
  return { title: 'Withdrawal status updated', description: amount, tone: 'info' };
}

/**
 * Owns three background watchers (bets, deposits, withdrawals) that diff
 * polled data for real status transitions and turn each one into both a
 * persisted notification and a toast — the single source of truth for both,
 * so a settlement while the user is on any page produces exactly one of
 * each, not a duplicate from a page-local listener.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const { show } = useToast();
  const [state, dispatch] = useReducer(reducer, { items: [] });
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      dispatch({ type: 'CLEAR' });
      return;
    }
    dispatch({ type: 'HYDRATE', items: getStoredNotifications(userId) });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    storeNotifications(userId, state.items);
  }, [userId, state.items]);

  const record = useCallback(
    (notification: AppNotification) => {
      dispatch({ type: 'ADD', notification });
      show({ tone: notification.tone, title: notification.title, description: notification.description });
    },
    [show],
  );

  const enabled = authStatus === 'authenticated';

  const betsQuery = useQuery({
    queryKey: ['bets', 'recent'],
    queryFn: () => listBets({ limit: 15 }),
    enabled,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((bet) => !isSettledBetStatus(bet.status)) ? 3_000 : 15_000;
    },
  });
  const bets = useMemo(() => betsQuery.data?.items ?? [], [betsQuery.data]);
  useTransitionWatcher(
    bets,
    useCallback((bet: Bet) => bet.id, []),
    useCallback((bet: Bet) => bet.status, []),
    useCallback(
      (bet: Bet, _previous: BetStatus, toStatus: BetStatus) => {
        if (!isSettledBetStatus(toStatus)) return;
        const { title, description, tone } = betDescription(bet, toStatus);
        record({
          id: `bet_settled:${bet.id}:${toStatus}`,
          kind: 'bet_settled',
          entityId: bet.id,
          title,
          description,
          tone,
          createdAt: new Date().toISOString(),
          read: false,
          href: `/bet-history?bet=${bet.id}`,
        });
      },
      [record],
    ),
  );

  const depositsQuery = useQuery({
    queryKey: ['deposits', 'recent'],
    queryFn: () => listDeposits({ limit: 15 }),
    enabled,
    refetchInterval: 10_000,
  });
  const deposits = useMemo(() => depositsQuery.data?.items ?? [], [depositsQuery.data]);
  useTransitionWatcher(
    deposits,
    useCallback((deposit: Deposit) => deposit.id, []),
    useCallback((deposit: Deposit) => deposit.status, []),
    useCallback(
      (deposit: Deposit, _previous: DepositStatus, toStatus: DepositStatus) => {
        if (!isTerminalDepositStatus(toStatus)) return;
        const { title, description, tone } = depositDescription(deposit, toStatus);
        record({
          id: `deposit_status:${deposit.id}:${toStatus}`,
          kind: 'deposit_status',
          entityId: deposit.id,
          title,
          description,
          tone,
          createdAt: new Date().toISOString(),
          read: false,
          href: `/transactions?deposit=${deposit.id}`,
        });
      },
      [record],
    ),
  );

  const withdrawalsQuery = useQuery({
    queryKey: ['withdrawals', 'recent'],
    queryFn: () => listWithdrawals({ limit: 15 }),
    enabled,
    refetchInterval: 10_000,
  });
  const withdrawals = useMemo(() => withdrawalsQuery.data?.items ?? [], [withdrawalsQuery.data]);
  useTransitionWatcher(
    withdrawals,
    useCallback((withdrawal: Withdrawal) => withdrawal.id, []),
    useCallback((withdrawal: Withdrawal) => withdrawal.status, []),
    useCallback(
      (withdrawal: Withdrawal, _previous: WithdrawalStatus, toStatus: WithdrawalStatus) => {
        if (!isTerminalWithdrawalStatus(toStatus)) return;
        const { title, description, tone } = withdrawalDescription(withdrawal, toStatus);
        record({
          id: `withdrawal_status:${withdrawal.id}:${toStatus}`,
          kind: 'withdrawal_status',
          entityId: withdrawal.id,
          title,
          description,
          tone,
          createdAt: new Date().toISOString(),
          read: false,
          href: `/transactions?withdrawal=${withdrawal.id}`,
        });
      },
      [record],
    ),
  );

  const markRead = useCallback((id: string) => dispatch({ type: 'MARK_READ', id }), []);
  const markAllRead = useCallback(() => dispatch({ type: 'MARK_ALL_READ' }), []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications: state.items,
      unreadCount: state.items.filter((item) => !item.read).length,
      markRead,
      markAllRead,
    }),
    [state.items, markRead, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationProvider');
  return ctx;
}
