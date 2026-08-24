import type { LivenessResponse } from '@fenticoin/types';

import type { AuthResult, TwoFactorChallenge } from '@/types/auth';
import { getPublicEnv } from './env';
import { clearSession, getStoredAccessToken, getStoredRefreshToken, storeSession } from './auth/token-storage';

/** A request reached the server and the server rejected it — see `AllExceptionsFilter` for the response shape this parses. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never reached the server at all — offline, DNS failure, CORS, etc. Always retryable. */
export class NetworkError extends Error {
  constructor() {
    super('Network error — please check your connection and try again.');
    this.name = 'NetworkError';
  }
}

/** The session could not be kept alive (missing/expired/invalid refresh token). The caller should route to `/login`. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please log in again.');
    this.name = 'SessionExpiredError';
  }
}

interface ErrorResponseBody {
  error?: {
    statusCode?: number;
    message?: string;
    code?: string;
    requestId?: string;
    details?: unknown;
  };
}

/**
 * Build a request URL safely.
 *
 * This deliberately normalizes both sides:
 *
 *   https://fenticoin.onrender.com + /markets/instruments
 *   -> https://fenticoin.onrender.com/markets/instruments
 *
 * It also prevents:
 *
 *   https://fenticoin.onrender.com//markets/instruments
 *
 * from being generated when the configured base URL already ends with `/`
 * or a request path begins with `//`.
 */
function buildApiUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = `/${path.replace(/^\/+/, '')}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  const { NEXT_PUBLIC_API_URL } = getPublicEnv();

  const url = buildApiUrl(NEXT_PUBLIC_API_URL, path);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const signal = init?.signal;

    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', () => controller.abort(), {
          once: true,
        });
      }
    }

    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
}

async function throwApiError(response: Response): Promise<never> {
  let body: ErrorResponseBody | undefined;

  try {
    body = (await response.json()) as ErrorResponseBody;
  } catch {
    body = undefined;
  }

  throw new ApiError(
    body?.error?.message ?? `Request failed with status ${response.status}`,
    response.status,
    body?.error?.code ?? 'UnknownError',
    body?.error?.details,
    body?.error?.requestId,
  );
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/** Unauthenticated request — no bearer token attached, no 401 retry. */
async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await rawFetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    await throwApiError(response);
  }

  return readJson<T>(response);
}

// A refresh in flight is shared by every concurrent 401 so a burst of
// requests that all lose their session at once triggers exactly one
// `/auth/refresh` call, not one per request.
let refreshPromise: Promise<boolean> | null = null;

// Exported so the realtime socket client (lib/realtime/RealtimeProvider.tsx)
// can proactively refresh before a reconnect attempt when a socket drops
// specifically because its token expired — reuses this exact single-flight
// dance instead of duplicating it, so a socket reconnect and an HTTP 401
// retry can never trigger two concurrent `/auth/refresh` calls.
export async function ensureFreshSession(): Promise<boolean> {
  const refreshToken = getStoredRefreshToken();

  if (!refreshToken) {
    return false;
  }

  refreshPromise ??= doRefresh(refreshToken).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function doRefresh(refreshToken: string): Promise<boolean> {
  try {
    const response = await rawFetch('/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearSession();
      return false;
    }

    const result = await readJson<AuthResult>(response);

    storeSession(result);

    return true;
  } catch {
    clearSession();
    return false;
  }
}

/**
 * Authenticated request — attaches the bearer token; on a 401, refreshes
 * the session once and retries before giving up.
 */
async function authedFetch<T>(
  path: string,
  init?: RequestInit,
  allowRefresh = true,
): Promise<T> {
  const accessToken = getStoredAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await rawFetch(path, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    if (allowRefresh && (await ensureFreshSession())) {
      return authedFetch<T>(path, init, false);
    }

    clearSession();

    throw new SessionExpiredError();
  }

  if (!response.ok) {
    await throwApiError(response);
  }

  return readJson<T>(response);
}

export function getLiveness(): Promise<LivenessResponse> {
  return publicFetch<LivenessResponse>('/health');
}

// ---- auth ------------------------------------------------------------

export interface LoginInput {
  email: string;
  password: string;
}

export function login(
  input: LoginInput,
): Promise<AuthResult | TwoFactorChallenge> {
  return publicFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function loginWithTwoFactor(
  challengeToken: string,
  code: string,
): Promise<AuthResult> {
  return publicFetch('/auth/login/2fa', {
    method: 'POST',
    body: JSON.stringify({
      challengeToken,
      code,
    }),
  });
}

export async function logout(): Promise<void> {
  try {
    await authedFetch<void>('/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearSession();
  }
}

export async function logoutAll(): Promise<void> {
  try {
    await authedFetch<void>('/auth/logout-all', {
      method: 'POST',
    });
  } finally {
    clearSession();
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  dateOfBirth?: string;
}

export function register(input: RegisterInput): Promise<AuthResult> {
  return publicFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function forgotPassword(
  email: string,
): Promise<{ message: string }> {
  return publicFetch('/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  return publicFetch('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({
      token,
      newPassword,
    }),
  });
}

export function verifyEmail(token: string): Promise<void> {
  return publicFetch('/auth/email/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function requestPhoneOtp(
  phone: string,
): Promise<{ message: string }> {
  return authedFetch('/auth/phone/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function verifyPhoneOtp(
  phone: string,
  code: string,
): Promise<void> {
  return authedFetch('/auth/phone/otp/verify', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      code,
    }),
  });
}

export function setupTwoFactor(): Promise<{ provisioningUri: string }> {
  return authedFetch('/auth/2fa/setup', {
    method: 'POST',
  });
}

export function confirmTwoFactor(
  code: string,
): Promise<{ backupCodes: string[] }> {
  return authedFetch('/auth/2fa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function disableTwoFactor(password: string): Promise<void> {
  return authedFetch('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

/**
 * Mirrors `RequestUser` in
 * apps/api/src/authorization/types/request-user.ts exactly.
 *
 * This is what GET /auth/me actually returns (not `PublicUser` —
 * it has no kycStatus/emailVerifiedAt/phoneVerifiedAt).
 */
export interface RequestUser {
  id: string;
  email: string;
  status: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

export function getMe(): Promise<RequestUser> {
  return authedFetch<RequestUser>('/auth/me');
}

// ---- wallet ------------------------------------------------------------

export interface WalletBalance {
  currency: string;
  availableMinorUnits: string;
  available: string;
  lockedMinorUnits: string;
  locked: string;
}

export function getWallet(currency = 'USD'): Promise<WalletBalance> {
  return authedFetch(
    `/wallet?currency=${encodeURIComponent(currency)}`,
  );
}

/** Mirrors `serializeTransaction` in apps/api/src/wallet/mappers.ts exactly. */
export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'bet_placement'
  | 'bet_refund'
  | 'bet_win'
  | 'bet_loss'
  | 'bonus'
  | 'adjustment'
  | 'fee'
  | 'reversal'
  | 'withdrawal_hold'
  | 'withdrawal_release'
  | 'withdrawal_settlement';

export type TransactionStatus =
  | 'pending'
  | 'posted'
  | 'failed'
  | 'reversed';

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  currency: string;
  totalAmountMinorUnits: string;
  actorType: string;
  actorUserId: string | null;
  subjectUserId: string;
  reason: string | null;
  relatedType: string | null;
  relatedId: string | null;
  reversalOfTransactionId: string | null;
  createdAt: string;
  postedAt: string | null;
}

/**
 * No server-side type/status filter exists on this endpoint
 * (only limit/offset) — any type filtering must happen client-side
 * over the fetched page.
 */
export function listWalletTransactions(
  params: {
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ items: Transaction[] }> {
  const query = new URLSearchParams();

  if (params.limit) {
    query.set('limit', String(params.limit));
  }

  if (params.offset) {
    query.set('offset', String(params.offset));
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : '';

  return authedFetch(`/wallet/transactions${suffix}`);
}

// ---- markets -------------------------------------------------------------

export interface MarketCategory {
  key: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}

export function listMarketCategories(): Promise<{
  items: MarketCategory[];
}> {
  return publicFetch('/markets/categories');
}

export interface Instrument {
  id: string;
  symbol: string;
  quoteCurrency: string;
  displaySymbol: string;
  name: string;
  categoryKey: string;
  pricePrecision: number;
  status: 'active' | 'suspended' | 'delisted';
  maxPriceAgeSeconds: number;
}

export interface PriceQuote {
  instrumentId: string;
  price: string;
  priceMinorUnits: string;
  currency: string;
  source: string;
  observedAt: string;
  receivedAt: string;
  isStale: boolean;
}

export function listInstruments(
  params: { category?: string } = {},
): Promise<{ items: Instrument[] }> {
  const suffix = params.category
    ? `?category=${encodeURIComponent(params.category)}`
    : '';

  return publicFetch(`/markets/instruments${suffix}`);
}

export function getInstrument(
  instrumentId: string,
): Promise<Instrument> {
  return publicFetch(`/markets/instruments/${instrumentId}`);
}

export function getPrice(
  instrumentId: string,
): Promise<PriceQuote> {
  return publicFetch(`/markets/instruments/${instrumentId}/price`);
}

// ---- betting -------------------------------------------------------------

export type BetType =
  | 'rise_fall'
  | 'higher_lower'
  | 'up_down';

/** Mirrors `betStatusEnum` in apps/api/src/database/schema/enums.ts exactly — there is no "settled" status. */
export type BetStatus =
  | 'pending'
  | 'open'
  | 'won'
  | 'lost'
  | 'void'
  | 'cancelled'
  | 'refunded'
  | 'disputed'
  | 'requires_review';

export type BetResult =
  | 'win'
  | 'loss'
  | 'push';

/** The terminal, no-longer-changing statuses — a bet in any other status may still update. */
const TERMINAL_BET_STATUSES: readonly BetStatus[] = [
  'won',
  'lost',
  'void',
  'cancelled',
  'refunded',
];

export function isSettledBetStatus(
  status: BetStatus,
): boolean {
  return TERMINAL_BET_STATUSES.includes(status);
}

export interface BettingConfig {
  instrumentId: string;
  betType: BetType;
  minStakeMinorUnits: string;
  maxStakeMinorUnits: string;
  payoutRateBasisPoints: string;
  maxExposureMinorUnits: string | null;
  minDurationSeconds: string;
  maxDurationSeconds: string;
  isEnabled: boolean;
}

export interface Bet {
  id: string;
  userId: string;
  instrumentId: string;
  type: BetType;
  selection: string;
  stakeAmountMinorUnits: string;
  currency: string;
  entryPriceMinorUnits: string;
  entryPriceObservedAt: string;
  targetPriceMinorUnits: string | null;
  payoutRateBasisPoints: string;
  potentialPayoutMinorUnits: string;
  status: BetStatus;
  result: BetResult | null;
  placedAt: string;
  expiresAt: string;
  settlementPriceMinorUnits: string | null;
  settlementPriceObservedAt: string | null;
  settledAt: string | null;
  placementTransactionId: string | null;
  settlementTransactionId: string | null;
  cancelReason: string | null;
}

export function getBettingConfig(
  instrumentId: string,
  type: BetType,
): Promise<BettingConfig> {
  return authedFetch(
    `/betting/configs?instrumentId=${encodeURIComponent(instrumentId)}&type=${type}`,
  );
}

export interface PlaceBetInput {
  instrumentId: string;
  type: BetType;
  selection: string;
  targetPrice?: string;
  stakeAmount: string;
  currency: string;
  durationSeconds: number;
}

export function placeBet(
  input: PlaceBetInput,
  idempotencyKey: string,
): Promise<Bet> {
  return authedFetch('/betting/bets', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export function listBets(
  params: {
    status?: BetStatus;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ items: Bet[] }> {
  const query = new URLSearchParams();

  if (params.status) {
    query.set('status', params.status);
  }

  if (params.limit) {
    query.set('limit', String(params.limit));
  }

  if (params.offset) {
    query.set('offset', String(params.offset));
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : '';

  return authedFetch(`/betting/bets${suffix}`);
}

export function getBet(id: string): Promise<Bet> {
  return authedFetch(`/betting/bets/${id}`);
}

// ---- payments: deposits ---------------------------------------------------

export type DepositStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

/** Mirrors `serializeDeposit` in apps/api/src/payments/mappers.ts exactly. */
export interface Deposit {
  id: string;
  userId: string;
  currency: string;
  amountMinorUnits: string;
  status: DepositStatus;
  providerName: string | null;
  providerReference: string | null;
  redirectUrl: string | null;
  transactionId: string | null;
  failureReason: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyAmountInput {
  currency: string;
  amountMinorUnits: string;
}

export function createDeposit(
  input: MoneyAmountInput,
  idempotencyKey: string,
): Promise<Deposit> {
  return authedFetch('/payments/deposits', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export function listDeposits(
  params: {
    status?: DepositStatus;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ items: Deposit[] }> {
  const query = new URLSearchParams();

  if (params.status) {
    query.set('status', params.status);
  }

  if (params.limit) {
    query.set('limit', String(params.limit));
  }

  if (params.offset) {
    query.set('offset', String(params.offset));
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : '';

  return authedFetch(`/payments/deposits${suffix}`);
}

export function getDeposit(id: string): Promise<Deposit> {
  return authedFetch(`/payments/deposits/${id}`);
}

export function cancelDeposit(id: string): Promise<Deposit> {
  return authedFetch(
    `/payments/deposits/${id}/cancel`,
    {
      method: 'POST',
    },
  );
}

// ---- payments: withdrawals -------------------------------------------------

export type WithdrawalStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'submitted'
  | 'completed'
  | 'failed'
  | 'reversed';

/** Mirrors `serializeWithdrawal` in apps/api/src/payments/mappers.ts exactly. */
export interface Withdrawal {
  id: string;
  userId: string;
  currency: string;
  amountMinorUnits: string;
  status: WithdrawalStatus;
  providerName: string | null;
  providerReference: string | null;
  holdTransactionId: string | null;
  releaseTransactionId: string | null;
  settlementTransactionId: string | null;
  reversalTransactionId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createWithdrawal(
  input: MoneyAmountInput,
  idempotencyKey: string,
): Promise<Withdrawal> {
  return authedFetch('/payments/withdrawals', {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export function listWithdrawals(
  params: {
    status?: WithdrawalStatus;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ items: Withdrawal[] }> {
  const query = new URLSearchParams();

  if (params.status) {
    query.set('status', params.status);
  }

  if (params.limit) {
    query.set('limit', String(params.limit));
  }

  if (params.offset) {
    query.set('offset', String(params.offset));
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : '';

  return authedFetch(`/payments/withdrawals${suffix}`);
}

export function getWithdrawal(
  id: string,
): Promise<Withdrawal> {
  return authedFetch(`/payments/withdrawals/${id}`);
}

/** Terminal statuses for a withdrawal — used by the notification watcher to detect a genuine status change worth surfacing. */
const TERMINAL_WITHDRAWAL_STATUSES: readonly WithdrawalStatus[] = [
  'completed',
  'failed',
  'rejected',
  'reversed',
];

export function isTerminalWithdrawalStatus(
  status: WithdrawalStatus,
): boolean {
  return TERMINAL_WITHDRAWAL_STATUSES.includes(status);
}

/** Terminal statuses for a deposit — used by the notification watcher. */
const TERMINAL_DEPOSIT_STATUSES: readonly DepositStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'expired',
];

export function isTerminalDepositStatus(
  status: DepositStatus,
): boolean {
  return TERMINAL_DEPOSIT_STATUSES.includes(status);
}