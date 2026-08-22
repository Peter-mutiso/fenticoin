'use client';

import { AlertTriangle, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { Notice } from './Notice';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Renders the confirm button in loss-500 rather than brand-500, for genuinely destructive/high-impact actions. */
  destructive?: boolean;
  /** Renders a mandatory reason textarea, wired to whatever `reason` field the target endpoint's DTO expects. */
  reasonRequired?: boolean;
  /** Forces the admin to type this exact string before the confirm button enables — reserved for the highest-blast-radius actions (ban, reverse a completed withdrawal). */
  requireTypedConfirmation?: string;
  submitting: boolean;
  error: string | null;
  onConfirm: (reason?: string) => void;
  onClose: () => void;
}

/**
 * The single reusable confirmation dialog backing every destructive/
 * high-impact action across the admin panel — suspend, restrict, reject,
 * reverse, cancel/dispute/void a bet, suspend a market, revoke a role,
 * grant a bonus, reject KYC. Never call a mutating admin endpoint directly
 * from a button's onClick — always route it through this (via
 * `useConfirmedAction`), so there is exactly one place double-click
 * protection, reason-capture, and typed-confirmation live.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  reasonRequired = false,
  requireTypedConfirmation,
  submitting,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');

  if (!open) return null;

  const reasonOk = !reasonRequired || reason.trim().length >= 5;
  const typedOk = !requireTypedConfirmation || typedConfirmation === requireTypedConfirmation;
  const canConfirm = reasonOk && typedOk && !submitting;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(reasonRequired ? reason.trim() : undefined);
  }

  function handleClose() {
    if (submitting) return;
    setReason('');
    setTypedConfirmation('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy-950/50 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-3xl">
        {destructive ? (
          <AlertTriangle className="h-8 w-8 text-loss-500" aria-hidden="true" />
        ) : (
          <ShieldCheck className="h-8 w-8 text-brand-500" aria-hidden="true" />
        )}
        <h2 className="mt-3 text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-neutral-600">{description}</p>

        {reasonRequired && (
          <label className="mt-4 block text-sm font-semibold">
            Reason <span className="font-normal text-neutral-500">(at least 5 characters)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Explain why you're taking this action — this is recorded in the audit log."
            />
          </label>
        )}

        {requireTypedConfirmation && (
          <label className="mt-4 block text-sm font-semibold">
            Type <span className="font-mono text-loss-500">{requireTypedConfirmation}</span> to confirm
            <input
              value={typedConfirmation}
              onChange={(event) => setTypedConfirmation(event.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        )}

        {error && <Notice text={error} className="mt-4" />}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" disabled={submitting} onClick={handleClose} className="rounded-full bg-neutral-100 px-4 py-3 font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className={`flex items-center justify-center rounded-full px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              destructive ? 'bg-loss-500 hover:bg-red-600' : 'bg-brand-500 hover:bg-brand-600'
            }`}
          >
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
