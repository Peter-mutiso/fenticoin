'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  DEFAULT_EXECUTION_INTERVAL_SECONDS,
  EXECUTION_INTERVAL_OPTIONS,
  listInstruments,
  type StrategyCatalogEntry,
  type StrategyConfigField,
} from '@/lib/api-client';
import { minorUnitsToDecimalString, parseStakeToMinorUnits } from '@/lib/money';
import { Notice } from '@/components/ui/Notice';

export interface BotConfigFormValue {
  name: string;
  config: Record<string, unknown>;
  executionIntervalSeconds: number;
}

/**
 * Generates the whole configuration form from a strategy catalog entry's
 * `configFields` — the same catalog `BotService` validates a submission
 * against server-side, so this form can never drift from what the server
 * actually accepts. Currency is never a separate, independently-editable
 * field: it is always derived from the selected market, since a mismatch
 * is rejected server-side anyway — asking for it twice would only invite
 * an avoidable validation error.
 */
export function BotConfigForm({
  entry,
  initialName = '',
  initialConfig = {},
  initialExecutionIntervalSeconds = DEFAULT_EXECUTION_INTERVAL_SECONDS,
  submitLabel,
  submitting,
  error,
  onSubmit,
}: {
  entry: StrategyCatalogEntry;
  initialName?: string;
  initialConfig?: Record<string, unknown>;
  initialExecutionIntervalSeconds?: number;
  submitLabel: string;
  submitting: boolean;
  error?: string | null;
  onSubmit: (value: BotConfigFormValue) => void;
}) {
  const [name, setName] = useState(initialName);
  const [executionIntervalSeconds, setExecutionIntervalSeconds] = useState(initialExecutionIntervalSeconds);
  const initialCurrency = typeof initialConfig.currency === 'string' ? initialConfig.currency : 'USD';
  const [values, setValues] = useState<Record<string, string>>(() => toRawValues(entry, initialConfig, initialCurrency));

  const instrumentsQuery = useQuery({ queryKey: ['instruments'], queryFn: () => listInstruments() });
  const instruments = instrumentsQuery.data?.items.filter((instrument) => instrument.status === 'active') ?? [];
  const instrumentField = entry.configFields.find((field) => field.type === 'instrument');
  const currencyField = entry.configFields.find((field) => field.type === 'currency');
  const selectedInstrument = instrumentField ? instruments.find((instrument) => instrument.id === values[instrumentField.key]) : undefined;
  const currency = selectedInstrument?.quoteCurrency ?? (typeof initialConfig.currency === 'string' ? initialConfig.currency : 'USD');

  const validation = useMemo(
    () => validateRawValues(entry, values, currency, Boolean(instrumentField && !selectedInstrument)),
    [entry, values, currency, instrumentField, selectedInstrument],
  );
  const canSubmit = name.trim().length > 0 && validation.valid && !submitting;

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const config = toConfig(entry, values, currency);
    onSubmit({ name: name.trim(), config, executionIntervalSeconds });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <label className="block text-sm font-semibold">
        Bot name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`My ${entry.name}`}
          className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </label>

      <label className="block text-sm font-semibold">
        Execution interval
        <select
          aria-label="Execution interval"
          value={executionIntervalSeconds}
          onChange={(event) => setExecutionIntervalSeconds(Number(event.target.value))}
          className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        >
          <optgroup label="Seconds">
            {EXECUTION_INTERVAL_OPTIONS.filter((option) => option.group === 'Seconds').map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Minutes">
            {EXECUTION_INTERVAL_OPTIONS.filter((option) => option.group === 'Minutes').map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.label}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="mt-1 block text-xs text-neutral-500">How often the server checks and, if the strategy signals, trades. Runs server-side even if this tab is closed.</span>
      </label>

      {entry.configFields.map((field) => {
        if (field.type === 'currency') return null; // derived from the selected market, never its own control
        return (
          <FieldControl
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            onChange={(value) => setValue(field.key, value)}
            instruments={instruments}
            currency={currency}
          />
        );
      })}

      {currencyField && (
        <p className="text-xs text-neutral-500">Currency: <span className="font-semibold text-neutral-700">{currency}</span> (set by the selected market)</p>
      )}

      {error && <Notice text={error} />}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-full bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  instruments,
  currency,
}: {
  field: StrategyConfigField;
  value: string;
  onChange: (value: string) => void;
  instruments: { id: string; displaySymbol: string }[];
  currency: string;
}) {
  const label = (
    <span className="block text-sm font-semibold">
      {field.label}
      {!field.required && <span className="font-normal text-neutral-400"> (optional)</span>}
    </span>
  );

  if (field.type === 'instrument') {
    return (
      <label className="block">
        {label}
        <select
          aria-label={field.label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Select a market…</option>
          {instruments.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>
              {instrument.displaySymbol}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="block">
        {label}
        <select
          aria-label={field.label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Select…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'stake') {
    return (
      <label className="block">
        {label}
        <div className="mt-2 flex items-center gap-2">
          <input
            aria-label={field.label}
            inputMode="decimal"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="shrink-0 text-sm text-neutral-500">{currency}</span>
        </div>
      </label>
    );
  }

  // 'duration' | 'number'
  return (
    <label className="block">
      {label}
      <input
        aria-label={field.label}
        type="number"
        inputMode="numeric"
        min={field.min}
        max={field.max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.defaultValue !== undefined ? String(field.defaultValue) : undefined}
        className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
      />
      {field.helpText && <span className="mt-1 block text-xs text-neutral-500">{field.helpText}</span>}
    </label>
  );
}

function toRawValues(entry: StrategyCatalogEntry, config: Record<string, unknown>, currency: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of entry.configFields) {
    const existing = config[field.key];
    if (existing !== undefined && existing !== null) {
      // Stake config is persisted as minor units (e.g. "1000" = $10.00) — the
      // input edits a decimal string, so it must be converted back for display;
      // every other field type is already stored in its own editable form.
      values[field.key] = field.type === 'stake' ? minorUnitsToDecimalString(String(existing), currency) : String(existing);
    } else if (field.defaultValue !== undefined) {
      values[field.key] = String(field.defaultValue);
    }
  }
  return values;
}

function validateRawValues(
  entry: StrategyCatalogEntry,
  values: Record<string, string>,
  currency: string,
  instrumentMissing: boolean,
): { valid: boolean } {
  if (instrumentMissing) return { valid: false };
  for (const field of entry.configFields) {
    if (field.type === 'currency') continue;
    const raw = values[field.key];
    if (!raw || raw.trim() === '') {
      if (field.required) return { valid: false };
      continue;
    }
    if (field.type === 'stake') {
      try {
        if (parseStakeToMinorUnits(raw, currency) <= 0n) return { valid: false };
      } catch {
        return { valid: false };
      }
    }
    if (field.type === 'duration' || field.type === 'number') {
      const num = Number(raw);
      if (!Number.isFinite(num)) return { valid: false };
      if (field.min !== undefined && num < field.min) return { valid: false };
      if (field.max !== undefined && num > field.max) return { valid: false };
    }
  }
  return { valid: true };
}

function toConfig(entry: StrategyCatalogEntry, values: Record<string, string>, currency: string): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of entry.configFields) {
    if (field.type === 'currency') {
      config[field.key] = currency;
      continue;
    }
    const raw = values[field.key];
    if (!raw || raw.trim() === '') continue;
    if (field.type === 'stake') {
      config[field.key] = parseStakeToMinorUnits(raw, currency).toString();
    } else if (field.type === 'duration' || field.type === 'number') {
      config[field.key] = Number(raw);
    } else {
      config[field.key] = raw;
    }
  }
  return config;
}
