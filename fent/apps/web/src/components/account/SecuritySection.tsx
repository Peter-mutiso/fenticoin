'use client';

import { useState } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { Notice } from '@/components/ui/Notice';
import { AccountSection, NotAvailableNotice } from './AccountSection';

export function SecuritySection() {
  const { logout, logoutAll } = useAuth();
  const [submitting, setSubmitting] = useState<'logout' | 'logout-all' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setSubmitting('logout');
    try {
      await logout();
    } catch {
      setError('Something went wrong logging out. Please try again.');
    } finally {
      setSubmitting(null);
    }
  }

  async function handleLogoutAll() {
    setSubmitting('logout-all');
    try {
      await logoutAll();
    } catch {
      setError('Something went wrong logging out of all devices. Please try again.');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <AccountSection title="Session & security">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleLogout}
          disabled={submitting !== null}
          className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-60"
        >
          {submitting === 'logout' ? 'Logging out…' : 'Log out'}
        </button>
        <button
          type="button"
          onClick={handleLogoutAll}
          disabled={submitting !== null}
          className="rounded-full bg-loss-50 px-4 py-2 text-sm font-semibold text-loss-500 transition hover:bg-red-100 disabled:opacity-60"
        >
          {submitting === 'logout-all' ? 'Logging out…' : 'Log out of all devices'}
        </button>
      </div>
      {error && <Notice text={error} className="mt-3" />}
      <div className="mt-4">
        <NotAvailableNotice text="Viewing or revoking individual sessions isn't available yet — use “log out of all devices” if you suspect unauthorized access." />
      </div>
    </AccountSection>
  );
}
