import type { AuthResult, RequestUser, TwoFactorChallenge } from '@/types/auth';
import { getPublicEnv } from './env';
import { clearSession, getStoredAccessToken, getStoredRefreshToken, storeSession } from './auth/token-storage';

// ---- request plumbing (mirrors apps/web/src/lib/api-client.ts exactly) ---------

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

export class NetworkError extends Error {
  constructor() {
    super('Network error — please check your connection and try again.');
    this.name = 'NetworkError';
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please log in again.');
    this.name = 'SessionExpiredError';
  }
}

interface ErrorResponseBody {
  error?: { statusCode?: number; message?: string; code?: string; requestId?: string; details?: unknown };
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  const { NEXT_PUBLIC_API_URL } = getPublicEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const signal = init?.signal;
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return await fetch(`${NEXT_PUBLIC_API_URL}${path}`, { ...init, signal: controller.signal });
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

async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await rawFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) await throwApiError(response);
  return readJson<T>(response);
}

let refreshPromise: Promise<boolean> | null = null;

// Exported so the realtime socket client (lib/realtime/RealtimeProvider.tsx)
// can proactively refresh before a reconnect attempt when a socket drops
// specifically because its token expired — reuses this exact single-flight
// dance instead of duplicating it.
export async function ensureFreshSession(): Promise<boolean> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;

  refreshPromise ??= doRefresh(refreshToken).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefresh(refreshToken: string): Promise<boolean> {
  try {
    const response = await rawFetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

async function authedFetch<T>(path: string, init?: RequestInit, allowRefresh = true): Promise<T> {
  const accessToken = getStoredAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await rawFetch(path, { ...init, headers });

  if (response.status === 401) {
    if (allowRefresh && (await ensureFreshSession())) {
      return authedFetch<T>(path, init, false);
    }
    clearSession();
    throw new SessionExpiredError();
  }

  if (!response.ok) await throwApiError(response);
  return readJson<T>(response);
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : '';
}

// ---- auth ------------------------------------------------------------------

export interface LoginInput {
  email: string;
  password: string;
}

export function login(input: LoginInput): Promise<AuthResult | TwoFactorChallenge> {
  return publicFetch('/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function loginWithTwoFactor(challengeToken: string, code: string): Promise<AuthResult> {
  return publicFetch('/auth/login/2fa', { method: 'POST', body: JSON.stringify({ challengeToken, code }) });
}

export async function logout(): Promise<void> {
  try {
    await authedFetch<void>('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
  }
}

export function getMe(): Promise<RequestUser> {
  return authedFetch<RequestUser>('/auth/me');
}

// ---- users / KYC / eligibility / roles -------------------------------------

export type AccountStatus = 'active' | 'suspended' | 'banned' | 'pending_deletion';
export type KycStatus = 'unverified' | 'pending' | 'approved' | 'rejected';
export type EligibilityStatus = 'unknown' | 'eligible' | 'ineligible';

/** The raw `users` row — `GET admin/users*` returns this directly, not through a serializer. */
export interface AdminUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  status: AccountStatus;
  kycStatus: KycStatus;
  eligibilityStatus: EligibilityStatus;
  dateOfBirth: string | null;
  /** `'demo'` for a server-provisioned demo shadow account — see `DemoBadge`. Never counted in revenue/user-count reporting. */
  accountType: 'real' | 'demo';
  demoOfUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listUsers(params: { email?: string; status?: AccountStatus; kycStatus?: KycStatus; limit?: number; offset?: number } = {}): Promise<{ items: AdminUser[] }> {
  return authedFetch(`/admin/users${query(params)}`);
}

export function getUser(id: string): Promise<AdminUser> {
  return authedFetch(`/admin/users/${id}`);
}

export interface UserRoles {
  roles: string[];
  permissions: string[];
}

export function getUserRoles(id: string): Promise<UserRoles> {
  return authedFetch(`/admin/users/${id}/roles`);
}

export function setUserStatus(id: string, status: 'active' | 'suspended' | 'banned', reason?: string): Promise<AdminUser> {
  return authedFetch(`/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
}

export function reviewKyc(id: string, decision: 'approve' | 'reject', reason: string): Promise<AdminUser> {
  return authedFetch(`/admin/users/${id}/kyc-review`, { method: 'POST', body: JSON.stringify({ decision, reason }) });
}

export function setEligibility(id: string, status: EligibilityStatus, reason: string): Promise<AdminUser> {
  return authedFetch(`/admin/users/${id}/eligibility`, { method: 'POST', body: JSON.stringify({ status, reason }) });
}

export function assignRole(id: string, roleKey: string): Promise<void> {
  return authedFetch(`/admin/users/${id}/roles`, { method: 'POST', body: JSON.stringify({ roleKey }) });
}

export function revokeRole(id: string, roleKey: string): Promise<void> {
  return authedFetch(`/admin/users/${id}/roles/${roleKey}`, { method: 'DELETE' });
}

export interface RoleDefinition {
  key: string;
  description: string;
  permissions: string[];
}

export interface PermissionDefinition {
  key: string;
  category: string;
  description: string;
}

export function listRoleDefinitions(): Promise<{ items: RoleDefinition[] }> {
  return authedFetch('/admin/roles');
}

export function listPermissionDefinitions(): Promise<{ items: PermissionDefinition[] }> {
  return authedFetch('/admin/permissions');
}

// ---- wallet / manual adjustments / bonuses ---------------------------------

export interface WalletBalance {
  currency: string;
  availableMinorUnits: string;
  available: string;
  lockedMinorUnits: string;
  locked: string;
}

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
export type TransactionStatus = 'pending' | 'posted' | 'failed' | 'reversed';

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

export function getWalletBalance(userId: string, currency = 'USD'): Promise<WalletBalance> {
  return authedFetch(`/admin/wallet/${userId}${query({ currency })}`);
}

export function listWalletTransactions(userId: string, params: { limit?: number; offset?: number } = {}): Promise<{ items: Transaction[] }> {
  return authedFetch(`/admin/wallet/${userId}/transactions${query(params)}`);
}

export function adjustBalance(
  userId: string,
  input: { currency: string; amountMinorUnits: string; direction: 'credit' | 'debit'; reason: string },
  idempotencyKey: string,
): Promise<Transaction> {
  return authedFetch(`/admin/wallet/${userId}/adjust`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function grantBonus(
  userId: string,
  input: { currency: string; amountMinorUnits: string; reason: string },
  idempotencyKey: string,
): Promise<Transaction> {
  return authedFetch(`/admin/wallet/${userId}/grant-bonus`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

// ---- markets / instruments --------------------------------------------------

export interface MarketSessionWindow {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export type InstrumentStatus = 'active' | 'suspended' | 'delisted';

export interface Instrument {
  id: string;
  symbol: string;
  quoteCurrency: string;
  displaySymbol: string;
  name: string;
  categoryKey: string;
  pricePrecision: number;
  status: InstrumentStatus;
  maxPriceAgeSeconds: number;
  tradingSchedule: MarketSessionWindow[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketCategory {
  key: string;
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
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

export function listAdminInstruments(params: { category?: string; includeDelisted?: boolean } = {}): Promise<{ items: Instrument[] }> {
  return authedFetch(`/admin/markets/instruments${query(params)}`);
}

/** The public categories list (`GET /markets/categories`) — reused here to populate the category picker when creating an instrument. */
export function listMarketCategories(): Promise<{ items: MarketCategory[] }> {
  return authedFetch('/markets/categories');
}

export function createInstrument(input: {
  symbol: string;
  quoteCurrency: string;
  name: string;
  categoryKey: string;
  providerSymbol?: string;
  pricePrecision?: number;
  maxPriceAgeSeconds?: number;
  tradingSchedule?: MarketSessionWindow[];
}): Promise<Instrument> {
  return authedFetch('/admin/markets/instruments', { method: 'POST', body: JSON.stringify(input) });
}

export function updateInstrument(
  id: string,
  input: { name?: string; providerSymbol?: string; categoryKey?: string; maxPriceAgeSeconds?: number },
): Promise<Instrument> {
  return authedFetch(`/admin/markets/instruments/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function setInstrumentStatus(id: string, status: 'active' | 'suspended' | 'delisted', reason: string): Promise<Instrument> {
  return authedFetch(`/admin/markets/instruments/${id}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) });
}

export function refreshInstrumentPrice(id: string): Promise<PriceQuote | { refreshed: false }> {
  return authedFetch(`/admin/markets/instruments/${id}/refresh`, { method: 'POST' });
}

export function createMarketCategory(input: { key: string; name: string; description?: string; displayOrder?: number }): Promise<MarketCategory> {
  return authedFetch('/admin/markets/categories', { method: 'POST', body: JSON.stringify(input) });
}

// ---- betting configs / odds -------------------------------------------------

export type BetType = 'rise_fall' | 'higher_lower' | 'up_down';

export interface BettingConfig {
  id: string;
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

export function listBettingConfigs(instrumentId?: string): Promise<{ items: BettingConfig[] }> {
  return authedFetch(`/admin/betting/configs${query({ instrumentId })}`);
}

export function upsertBettingConfig(input: {
  instrumentId: string;
  betType: BetType;
  minStake: string;
  maxStake: string;
  payoutRateBasisPoints: string;
  maxExposure?: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  isEnabled?: boolean;
}): Promise<BettingConfig> {
  return authedFetch('/admin/betting/configs', { method: 'PUT', body: JSON.stringify(input) });
}

// ---- bets --------------------------------------------------------------------

export type BetStatus = 'pending' | 'open' | 'won' | 'lost' | 'void' | 'cancelled' | 'refunded' | 'disputed' | 'requires_review';
export type BetResult = 'win' | 'loss' | 'push';

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

export interface BetSettlementAudit {
  id: string;
  betId: string;
  attemptedAt: string;
  calculationVersion: number;
  openingPriceMinorUnits: string;
  openingPriceSource: string;
  openingPriceObservedAt: string;
  closingPriceMinorUnits: string | null;
  closingPriceSource: string | null;
  closingPriceObservedAt: string | null;
  stakeAmountMinorUnits: string;
  payoutRateBasisPoints: string;
  computedPayoutMinorUnits: string | null;
  outcome: 'win' | 'loss' | 'push' | 'failed';
  finalStatus: BetStatus | null;
  settlementTransactionId: string | null;
  isManualResolution: boolean;
  actorUserId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export function listAdminBets(params: { status?: BetStatus; userId?: string; instrumentId?: string; limit?: number; offset?: number } = {}): Promise<{ items: Bet[] }> {
  return authedFetch(`/admin/betting/bets${query(params)}`);
}

export function getAdminBet(id: string): Promise<Bet> {
  return authedFetch(`/admin/betting/bets/${id}`);
}

export function listBetsRequiringReview(): Promise<{ items: Bet[] }> {
  return authedFetch('/admin/betting/bets/requiring-review');
}

export function getBetSettlementAudit(id: string): Promise<{ items: BetSettlementAudit[] }> {
  return authedFetch(`/admin/betting/bets/${id}/settlement-audit`);
}

export function cancelBet(id: string, reason: string): Promise<Bet> {
  return authedFetch(`/admin/betting/bets/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function disputeBet(id: string, reason: string): Promise<Bet> {
  return authedFetch(`/admin/betting/bets/${id}/dispute`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function resolveDispute(id: string, resolution: 'uphold' | 'reverse', reason: string): Promise<Bet> {
  return authedFetch(`/admin/betting/bets/${id}/resolve-dispute`, { method: 'POST', body: JSON.stringify({ resolution, reason }) });
}

export function settleBet(id: string): Promise<Bet> {
  return authedFetch(`/admin/betting/bets/${id}/settle`, { method: 'POST' });
}

export function resolveManualReview(id: string, resolution: 'win' | 'loss' | 'void', reason: string): Promise<Bet> {
  return authedFetch(`/admin/betting/bets/${id}/resolve-review`, { method: 'POST', body: JSON.stringify({ resolution, reason }) });
}

// ---- payments: deposits / withdrawals ---------------------------------------

export type DepositStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired';
export type WithdrawalStatus = 'pending_review' | 'approved' | 'rejected' | 'submitted' | 'completed' | 'failed' | 'reversed';

export interface Deposit {
  id: string;
  userId: string;
  currency: string;
  amountMinorUnits: string;
  status: DepositStatus;
  providerName: string | null;
  providerReference: string | null;
  transactionId: string | null;
  failureReason: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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

export interface WebhookReceipt {
  id: string;
  providerName: string;
  providerReference: string | null;
  kind: string | null;
  signatureValid: boolean;
  outcome: string;
  relatedDepositId: string | null;
  relatedWithdrawalId: string | null;
  errorMessage: string | null;
  receivedAt: string;
}

export function listAdminDeposits(params: { status?: DepositStatus; userId?: string; limit?: number; offset?: number } = {}): Promise<{ items: Deposit[] }> {
  return authedFetch(`/admin/payments/deposits${query(params)}`);
}

export function getAdminDeposit(id: string): Promise<Deposit> {
  return authedFetch(`/admin/payments/deposits/${id}`);
}

export function getDepositWebhookReceipts(id: string): Promise<{ items: WebhookReceipt[] }> {
  return authedFetch(`/admin/payments/deposits/${id}/webhook-receipts`);
}

export function resolveDeposit(id: string, outcome: 'completed' | 'failed', reason: string): Promise<Deposit> {
  return authedFetch(`/admin/payments/deposits/${id}/resolve`, { method: 'POST', body: JSON.stringify({ outcome, reason }) });
}

export function reconcileDeposits(): Promise<{ checked: number; resolved: number; stillPending: number; errors: number }> {
  return authedFetch('/admin/payments/reconcile/deposits', { method: 'POST' });
}

export function listAdminWithdrawals(params: { status?: WithdrawalStatus; userId?: string; limit?: number; offset?: number } = {}): Promise<{ items: Withdrawal[] }> {
  return authedFetch(`/admin/payments/withdrawals${query(params)}`);
}

export function getAdminWithdrawal(id: string): Promise<Withdrawal> {
  return authedFetch(`/admin/payments/withdrawals/${id}`);
}

export function getWithdrawalWebhookReceipts(id: string): Promise<{ items: WebhookReceipt[] }> {
  return authedFetch(`/admin/payments/withdrawals/${id}/webhook-receipts`);
}

export function approveWithdrawal(id: string): Promise<Withdrawal> {
  return authedFetch(`/admin/payments/withdrawals/${id}/approve`, { method: 'POST' });
}

export function rejectWithdrawal(id: string, reason: string): Promise<Withdrawal> {
  return authedFetch(`/admin/payments/withdrawals/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function reverseWithdrawal(id: string, reason: string): Promise<Withdrawal> {
  return authedFetch(`/admin/payments/withdrawals/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function reconcileWithdrawals(): Promise<{ checked: number; resolved: number; stillPending: number; errors: number }> {
  return authedFetch('/admin/payments/reconcile/withdrawals', { method: 'POST' });
}

// ---- audit logs ---------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorType: 'user' | 'system';
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
}

export function listAuditLogs(params: {
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: AuditLogEntry[] }> {
  return authedFetch(`/admin/audit-logs${query(params)}`);
}

// ---- reports / dashboard ------------------------------------------------------

export interface ReportsOverview {
  usersByStatus: { status: string; count: number }[];
  pendingDepositsCount: number;
  pendingWithdrawalsCount: number;
  betsRequiringReviewCount: number;
}

export interface RevenueByCurrency {
  currency: string;
  grossStakeVolume: string;
  grossGamingRevenue: string;
  settledBetCount: number;
}

export interface RevenueReport {
  from: string;
  to: string;
  byCurrency: RevenueByCurrency[];
}

export function getReportsOverview(): Promise<ReportsOverview> {
  return authedFetch('/admin/reports/overview');
}

export function getRevenueReport(from: string, to: string): Promise<RevenueReport> {
  return authedFetch(`/admin/reports/revenue${query({ from, to })}`);
}
