'use client';

import { useState } from 'react';

import { confirmTwoFactor, disableTwoFactor, setupTwoFactor } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { useToast } from '@/components/ui/Toast';
import { AccountSection } from './AccountSection';

export function TwoFactorSection() {
  const { show } = useToast();
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSetup() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await setupTwoFactor();
      setProvisioningUri(result.provisioningUri);
    } catch (thrown) {
      setError(describeApiError(thrown).title);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await confirmTwoFactor(code.trim());
      setBackupCodes(result.backupCodes);
      show({ tone: 'success', title: '2FA enabled' });
    } catch (thrown) {
      setError(describeApiError(thrown).title);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await disableTwoFactor(disablePassword);
      setDisablePassword('');
      setShowDisable(false);
      setProvisioningUri(null);
      setBackupCodes(null);
      show({ tone: 'info', title: '2FA disabled' });
    } catch (thrown) {
      setError(describeApiError(thrown).title);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountSection title="Two-factor authentication" description="There is no way to check whether 2FA is already enabled for your account from here — set it up below, or disable it if it's already on.">
      {backupCodes ? (
        <div>
          <Notice text="Save these backup codes now — they will not be shown again." className="mb-3" />
          <ul className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-50 p-3 font-mono text-sm">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : provisioningUri ? (
        <form onSubmit={handleConfirm} className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Add this to your authenticator app:</p>
            <p className="mt-1 break-all rounded-xl bg-neutral-50 p-3 font-mono text-xs">{provisioningUri}</p>
          </div>
          <label className="block text-sm font-semibold">
            Enter the 6-digit code from your app
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          {error && <Notice text={error} />}
          <button
            type="submit"
            disabled={submitting || code.trim().length !== 6}
            className="rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Confirming…' : 'Confirm'}
          </button>
        </form>
      ) : (
        <button type="button" onClick={handleSetup} disabled={submitting} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60">
          {submitting ? 'Starting…' : 'Set up 2FA'}
        </button>
      )}

      <div className="mt-5 border-t border-neutral-100 pt-4">
        {!showDisable ? (
          <button type="button" onClick={() => setShowDisable(true)} className="text-sm font-semibold text-loss-500 hover:underline">
            Disable 2FA
          </button>
        ) : (
          <form onSubmit={handleDisable} className="space-y-3">
            <label className="block text-sm font-semibold">
              Confirm your password to disable 2FA
              <input
                type="password"
                value={disablePassword}
                onChange={(event) => setDisablePassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            {error && <Notice text={error} />}
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="rounded-full bg-loss-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-60">
                {submitting ? 'Disabling…' : 'Disable'}
              </button>
              <button type="button" onClick={() => setShowDisable(false)} className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-700">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </AccountSection>
  );
}
