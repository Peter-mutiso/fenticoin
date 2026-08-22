'use client';

import { useQuery } from '@tanstack/react-query';
import { Gift, Search } from 'lucide-react';
import { useState } from 'react';

import { listUsers } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { SUPPORTED_CURRENCY_CODES } from '@/lib/money';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { AdjustBalanceForm } from './AdjustBalanceForm';

export function BonusGrantView() {
  const [emailInput, setEmailInput] = useState('');
  const [email, setEmail] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [currency, setCurrency] = useState(SUPPORTED_CURRENCY_CODES[0] ?? 'USD');

  const query = useQuery({
    queryKey: ['users', 'bonus-search', email],
    queryFn: () => listUsers({ email, limit: 25, offset: 0 }),
    enabled: email.length > 0,
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setEmail(emailInput.trim());
    setSelectedUserId(null);
  }

  if (selectedUserId && selectedEmail) {
    return (
      <RequirePermission permission="wallet.adjust">
        <div>
          <button type="button" onClick={() => setSelectedUserId(null)} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900">
            ← Choose a different user
          </button>
          <p className="mt-2 text-sm text-neutral-600">
            Granting a bonus to <span className="font-semibold text-neutral-900">{selectedEmail}</span>
          </p>

          {SUPPORTED_CURRENCY_CODES.length > 1 && (
            <div className="mt-3 flex gap-2">
              {SUPPORTED_CURRENCY_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCurrency(code)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    currency === code ? 'bg-navy-950 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3">
            <AdjustBalanceForm key={currency} userId={selectedUserId} mode="bonus" currency={currency} />
          </div>
        </div>
      </RequirePermission>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder="Search by email to grant a bonus…"
          aria-label="Search by email"
          className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </form>

      <div className="mt-4">
        {!email ? (
          <EmptyState icon={Gift} title="Search for a user by email to grant a one-off bonus." description="Bonus campaign rules aren't available yet — only manual, individually-audited grants." />
        ) : query.isLoading ? (
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
        ) : query.error ? (
          <Notice text={describeApiError(query.error).title} />
        ) : (query.data?.items.length ?? 0) === 0 ? (
          <EmptyState icon={Search} title="No users match that email." />
        ) : (
          <ul className="space-y-2">
            {query.data!.items.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUserId(user.id);
                    setSelectedEmail(user.email);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-300"
                >
                  <span className="text-sm font-semibold text-neutral-900">{user.email}</span>
                  <span className="text-xs font-semibold text-brand-600">Select →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
