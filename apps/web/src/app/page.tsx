'use client';

import { ArrowRight, ArrowUpRight, BarChart3, Lock, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { PublicHeader } from '@/components/marketing/PublicHeader';
import { FeaturedInstruments } from '@/components/home/FeaturedInstruments';

const FEATURES: { icon: typeof BarChart3; title: string; description: string }[] = [
  { icon: BarChart3, title: 'Live markets', description: 'Track real-time prices across the instruments FentiCoin supports, with server-verified quotes behind every trade.' },
  { icon: ArrowUpRight, title: 'Rise / Fall, Higher / Lower, Up / Down', description: 'Choose from three market-direction formats, each with clear stakes, odds, and expiry shown before you confirm.' },
  { icon: Wallet, title: 'Portfolio & history', description: 'Every position, settlement, and transaction is recorded — review your full activity at any time.' },
  { icon: ShieldCheck, title: 'Deposits & withdrawals', description: 'Fund your account and withdraw through a provider-backed payment flow with clear status at every step.' },
];

const STEPS = [
  { step: '1', title: 'Create your account', description: 'Sign up with your email and set a password. It only takes a minute.' },
  { step: '2', title: 'Fund your account', description: 'Make a deposit through a supported payment method.' },
  { step: '3', title: 'Choose a market', description: 'Browse supported instruments and pick one to follow.' },
  { step: '4', title: 'Select a direction', description: 'Choose Rise/Fall, Higher/Lower, or Up/Down, then set your stake.' },
  { step: '5', title: 'Monitor the outcome', description: 'Track the market until settlement and see the result in your portfolio.' },
];

const SECURITY_POINTS = [
  { title: 'Server-authoritative balances', description: 'Your balance, odds, and bet outcomes are always calculated and verified server-side — never trusted from the browser.' },
  { title: 'Two-factor authentication', description: 'Add an authenticator-app-based second factor to your account from Account settings.' },
  { title: 'Session control', description: 'Review and revoke active sessions at any time, and every sign-in is tied to a auditable session record.' },
  { title: 'Ledger-backed transactions', description: 'Every balance change is recorded as an immutable, auditable ledger entry — deposits, withdrawals, bets, and settlements alike.' },
];

export default function LandingPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Reading `window.location.search` directly (rather than
    // `useSearchParams()`) avoids forcing this whole marketing page out of
    // static rendering just for a client-only redirect — it only ever
    // needs to run in the browser anyway. Preserves any query string (e.g.
    // a `?instrument=&type=` deep link from a market's "Bet now" button)
    // across the bounce to `/dashboard` instead of silently dropping it.
    if (status === 'authenticated') router.replace(`/dashboard${window.location.search}`);
  }, [status, router]);

  return (
    <main className="min-h-screen bg-white">
      <PublicHeader />

      {/* Hero */}
      <section className="bg-navy-950 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24 lg:px-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-400">
              Markets · Trading · Portfolio
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              A clearer way to follow markets and trade with confidence.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/60">
              FentiCoin gives you real-time market data, transparent odds, and a server-verified ledger for every deposit, trade, and withdrawal —
              all in one account.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
              >
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/markets"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3.5 text-sm font-bold text-white/90 transition hover:bg-white/5"
              >
                Explore markets
              </Link>
            </div>
            <p className="mt-6 text-xs text-white/35">Trading and betting involve financial risk. Only use funds you can afford to lose.</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white/80">Portfolio overview</p>
              <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-bold text-brand-400">Live</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-white/40">Open positions</p>
                <p className="mt-1 text-2xl font-bold">3</p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-white/40">Markets tracked</p>
                <p className="mt-1 text-2xl font-bold">12</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[
                { symbol: 'BTC/USD', direction: 'Rise', tone: 'up' },
                { symbol: 'ETH/USD', direction: 'Higher', tone: 'up' },
                { symbol: 'XAU/USD', direction: 'Fall', tone: 'down' },
              ].map((row) => (
                <div key={row.symbol} className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
                  <span className="text-sm font-semibold text-white/85">{row.symbol}</span>
                  <span className={`text-sm font-bold ${row.tone === 'up' ? 'text-brand-400' : 'text-red-400'}`}>{row.direction}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-white/30">Illustrative preview — sign in to see your real portfolio.</p>
          </div>
        </div>
      </section>

      {/* Markets preview */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Live markets</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-950">See what&rsquo;s trading right now</h2>
          <p className="mt-3 text-neutral-500">A snapshot of instruments currently available on FentiCoin.</p>
        </div>
        <div className="mt-10">
          <Suspense>
            <FeaturedInstruments />
          </Suspense>
        </div>
      </section>

      {/* Features */}
      <section className="bg-neutral-50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Platform</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-950">Everything you need in one account</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-bold text-neutral-950">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-500">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">How it works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-neutral-950">Five steps to your first trade</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((item) => (
            <div key={item.step} className="rounded-3xl border border-neutral-200 bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-950 text-sm font-bold text-white">{item.step}</span>
              <h3 className="mt-4 text-sm font-bold text-neutral-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-500">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section id="security" className="bg-navy-950 py-16 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-brand-400">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">Built on a server-authoritative ledger</h2>
            <p className="mt-3 text-white/55">Your account balance, bet outcomes, and market prices are always determined and verified server-side.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {SECURITY_POINTS.map((point) => (
              <div key={point.title} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-sm font-bold text-white">{point.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">{point.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight text-neutral-950">Frequently asked questions</h2>
        <div className="mt-10 space-y-4">
          {[
            { q: 'Is my balance real money?', a: 'Yes — deposits, withdrawals, and bet settlements all move real funds through your account’s ledger.' },
            { q: 'What markets can I trade?', a: 'Browse the full, current list on the Markets page — availability can change over time.' },
            { q: 'How do withdrawals work?', a: 'Request a withdrawal from your Account page; it is reviewed and processed through our payment provider.' },
          ].map((item) => (
            <div key={item.q} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="font-bold text-neutral-950">{item.q}</p>
              <p className="mt-2 text-sm leading-6 text-neutral-500">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-navy-950 p-10 text-center text-white sm:flex-row sm:text-left">
          <div>
            <h2 className="text-2xl font-bold">Ready to get started?</h2>
            <p className="mt-2 text-white/55">Create your account in under a minute.</p>
          </div>
          <Link
            href="/signup"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
