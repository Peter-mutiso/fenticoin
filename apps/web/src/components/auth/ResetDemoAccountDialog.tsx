'use client';

import { AlertTriangle } from 'lucide-react';

import { useDialogA11y } from '@/lib/useDialogA11y';

export function ResetDemoAccountDialog({
  resetting,
  onConfirm,
  onCancel,
}: {
  resetting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const containerRef = useDialogA11y<HTMLDivElement>(onCancel);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy-950/50 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Reset demo account">
      <div ref={containerRef} tabIndex={-1} className="w-full rounded-t-3xl bg-white p-6 shadow-xl outline-none sm:max-w-md sm:rounded-3xl">
        <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
        <h2 className="mt-3 text-2xl font-bold">Reset Demo Account?</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          This clears your demo bet history, deactivates your demo bots, and restores your demo balance to its starting amount. This cannot be undone —
          it only affects your Demo Account, never your real balance.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={resetting}
            className="flex-1 rounded-full border border-neutral-200 px-4 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={resetting}
            className="flex-1 rounded-full bg-amber-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resetting ? 'Resetting…' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}
