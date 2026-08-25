'use client';

import { useState } from 'react';

import { requestPhoneOtp, verifyPhoneOtp } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { useToast } from '@/components/ui/Toast';
import { AccountSection } from './AccountSection';

const PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;

export function PhoneVerificationSection() {
  const { show } = useToast();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'request' | 'verify' | 'done'>('request');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!PHONE_PATTERN.test(phone.trim())) {
      setError('Enter a phone number in international format, e.g. +15551234567.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await requestPhoneOtp(phone.trim());
      setStep('verify');
      show({ tone: 'info', title: 'Verification code sent' });
    } catch (thrown) {
      setError(describeApiError(thrown).title);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyPhoneOtp(phone.trim(), code.trim());
      setStep('done');
      show({ tone: 'success', title: 'Phone verified' });
    } catch (thrown) {
      setError(describeApiError(thrown).title);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountSection title="Phone verification">
      {step === 'done' ? (
        <p className="text-sm font-semibold text-brand-600">Phone verified for this session.</p>
      ) : step === 'request' ? (
        <form onSubmit={handleRequest} className="space-y-3">
          <label className="block text-sm font-semibold">
            Phone number
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+15551234567"
              className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          {error && <Notice text={error} />}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-3">
          <label className="block text-sm font-semibold">
            Enter the 6-digit code sent to {phone}
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
            {submitting ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      )}
    </AccountSection>
  );
}
