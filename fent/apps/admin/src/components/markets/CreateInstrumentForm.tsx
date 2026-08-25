'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createInstrument, listMarketCategories } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { useToast } from '@/components/ui/Toast';

const CURRENCIES = ['USD', 'EUR', 'GBP'];

export function CreateInstrumentForm({ onCreated }: { onCreated: () => void }) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ['market-categories'], queryFn: listMarketCategories });

  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState('USD');
  const [categoryKey, setCategoryKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = /^[A-Z0-9]{1,20}$/.test(symbol) && name.trim().length > 0 && categoryKey.length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createInstrument({ symbol, name: name.trim(), quoteCurrency, categoryKey });
      show({ tone: 'success', title: 'Instrument created' });
      await queryClient.invalidateQueries({ queryKey: ['admin-instruments'] });
      onCreated();
    } catch (thrown) {
      setError(describeApiError(thrown).title);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Symbol <span className="font-normal text-neutral-500">(uppercase, e.g. BTC)</span>
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <label className="text-sm font-semibold">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500" />
        </label>
        <label className="text-sm font-semibold">
          Quote currency
          <select value={quoteCurrency} onChange={(event) => setQuoteCurrency(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500">
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Category
          <select value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Select a category…</option>
            {(categoriesQuery.data?.items ?? []).map((category) => (
              <option key={category.key} value={category.key}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <Notice text={error} className="mt-3" />}

      <button type="submit" disabled={!canSubmit} className="mt-4 rounded-full bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
        Create instrument
      </button>
    </form>
  );
}
