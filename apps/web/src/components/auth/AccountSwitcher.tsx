'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FlaskConical, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { getDemoStatus } from '@/lib/api-client';
import { invalidateAccountScopedQueries } from '@/lib/accountQueries';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrencyMinorUnits } from '@/lib/money';
import { useToast } from '@/components/ui/Toast';

/**
 * The persistent, highly-visible REAL/DEMO account switcher — replaces
 * the old hidden-in-a-menu "Enter/Exit Demo Mode" buttons. Lives in
 * `Header`, so it renders on every authenticated route via `AppShell`
 * (Trade, Bots, Wallet, Dashboard) without needing a separate badge
 * duplicated on each page.
 *
 * Shows both accounts' *real, server-read* balances (via `GET
 * /demo/status`) side by side before the user commits to switching —
 * never a value inferred from `localStorage` alone. Switching itself
 * still goes through the exact same `enterDemoMode`/`exitDemoMode`
 * session-swap `AuthContext` already provides; this component only adds
 * visibility and immediate cache invalidation on top of it.
 */
export function AccountSwitcher() {
  const { status: authStatus, isDemo, enterDemoMode, exitDemoMode } = useAuth();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<'real' | 'demo' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const statusQuery = useQuery({
    queryKey: ['demo-status'],
    queryFn: () => getDemoStatus(),
    enabled: authStatus === 'authenticated',
    refetchInterval: authStatus === 'authenticated' ? 10_000 : false,
  });

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (switching) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || switching) return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, switching]);

  if (authStatus !== 'authenticated') return null;

  async function switchTo(target: 'real' | 'demo') {
    if (switching || target === (isDemo ? 'demo' : 'real')) return;
    setSwitching(target);
    try {
      if (target === 'demo') await enterDemoMode();
      else await exitDemoMode();
      // The session swap alone doesn't clear cached wallet/bets/bots data
      // keyed by the same query keys under the previous account — without
      // this, the old account's numbers could flash on screen until each
      // query's own refetch interval comes around.
      await Promise.all([invalidateAccountScopedQueries(queryClient), queryClient.invalidateQueries({ queryKey: ['demo-status'] })]);
      setOpen(false);
    } catch (thrown) {
      show({ tone: 'error', title: `Could not switch to ${target === 'demo' ? 'Demo' : 'Real'} account`, description: describeApiError(thrown).title });
    } finally {
      setSwitching(null);
    }
  }

  const currency = statusQuery.data?.real.balance.currency ?? 'USD';
  const activeBalanceMinorUnits = isDemo ? statusQuery.data?.demo?.balance.availableMinorUnits : statusQuery.data?.real.balance.availableMinorUnits;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Switch account"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 rounded-full py-2 pl-3 pr-2.5 transition sm:pl-3.5 ${
          // `brand-600` is only accessible with dark text (white-on-brand-600 is ~3.2:1,
          // below WCAG AA) — `navy-950` is dark enough itself that white text is fine.
          isDemo ? 'bg-brand-600 text-navy-950' : 'bg-navy-950 text-white'
        }`}
      >
        {isDemo ? <FlaskConical className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4 text-brand-500" aria-hidden="true" />}
        <span className="text-xs font-bold uppercase tracking-wide">{isDemo ? 'Demo' : 'Real'}</span>
        <span className="hidden text-sm font-semibold sm:inline">
          {activeBalanceMinorUnits ? formatCurrencyMinorUnits(activeBalanceMinorUnits, currency) : statusQuery.isLoading ? '…' : '—'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg sm:top-12">
          <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Switch account</p>

          <AccountRow
            label="Real account"
            icon={ShieldCheck}
            active={!isDemo}
            balance={statusQuery.data ? formatCurrencyMinorUnits(statusQuery.data.real.balance.availableMinorUnits, statusQuery.data.real.balance.currency) : undefined}
            loading={statusQuery.isLoading}
            busy={switching === 'real'}
            disabled={Boolean(switching)}
            onSelect={() => void switchTo('real')}
          />

          <AccountRow
            label="Demo account"
            icon={FlaskConical}
            active={isDemo}
            balance={
              statusQuery.data?.demo
                ? formatCurrencyMinorUnits(statusQuery.data.demo.balance.availableMinorUnits, statusQuery.data.demo.balance.currency)
                : undefined
            }
            helperText={!statusQuery.isLoading && statusQuery.data && !statusQuery.data.demo ? 'Not activated yet — tap to start with virtual funds' : undefined}
            loading={statusQuery.isLoading}
            busy={switching === 'demo'}
            disabled={Boolean(switching)}
            onSelect={() => void switchTo('demo')}
          />

          <p className="mt-1 px-3 pb-1 pt-2 text-[11px] leading-4 text-neutral-400">
            Demo funds are virtual and never mix with your real balance. Switching refreshes your wallet, positions, bots, and history.
          </p>
        </div>
      )}
    </div>
  );
}

function AccountRow({
  label,
  icon: Icon,
  active,
  balance,
  helperText,
  loading,
  busy,
  disabled,
  onSelect,
}: {
  label: string;
  icon: typeof ShieldCheck;
  active: boolean;
  balance?: string;
  helperText?: string;
  loading: boolean;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-current={active}
      className={`mt-1 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active ? 'bg-brand-50' : 'hover:bg-neutral-50'
      }`}
    >
      <span className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${active ? 'text-brand-700' : 'text-neutral-400'}`} aria-hidden="true" />
        <span>
          <span className={`block text-sm font-bold ${active ? 'text-brand-700' : 'text-neutral-900'}`}>
            {label}
            {active && <span className="ml-1.5 font-normal text-brand-700">· Active</span>}
          </span>
          {helperText && <span className="mt-0.5 block text-xs text-neutral-500">{helperText}</span>}
        </span>
      </span>
      {busy ? (
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-neutral-400" aria-hidden="true" />
      ) : (
        <span className="shrink-0 text-sm font-bold text-neutral-900">{loading ? '…' : (balance ?? '—')}</span>
      )}
    </button>
  );
}
