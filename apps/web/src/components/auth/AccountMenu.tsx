'use client';

import { FlaskConical, LoaderCircle, LogOut, RotateCcw, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { resetDemoAccount } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { ResetDemoAccountDialog } from './ResetDemoAccountDialog';

export function AccountMenu() {
  const { status, user, isDemo, logout, enterDemoMode, exitDemoMode } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [entering, setEntering] = useState(false);
  const [exiting, setExiting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // First-time demo provisioning can take a few seconds (a real wallet/ledger
  // row is created and funded) — the menu stays open with a visible loading
  // state instead of closing immediately, so the click never looks like it
  // silently did nothing.
  const busy = entering || exiting;

  async function handleEnterDemo() {
    if (busy) return;
    setEntering(true);
    try {
      await enterDemoMode();
      setOpen(false);
      router.push('/dashboard');
    } catch (thrown) {
      show({ tone: 'error', title: 'Could not enter Demo Mode', description: describeApiError(thrown).title });
    } finally {
      setEntering(false);
    }
  }

  async function handleExitDemo() {
    if (busy) return;
    setExiting(true);
    try {
      await exitDemoMode();
      setOpen(false);
      router.push('/dashboard');
    } catch (thrown) {
      show({ tone: 'error', title: 'Could not exit Demo Mode', description: describeApiError(thrown).title });
    } finally {
      setExiting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      // Don't let an outside click dismiss the menu mid-request — that would
      // hide the loading state without cancelling the in-flight request.
      if (busy) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, busy]);

  if (status !== 'authenticated' || !user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-9 items-center rounded-full border border-neutral-200 px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 sm:h-10"
      >
        Log in
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => {
          if (busy) return;
          setOpen((value) => !value);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-50 sm:h-10 sm:w-10"
      >
        <User className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg sm:top-12">
          <p className="truncate px-3 py-2 text-xs text-neutral-500">{user.email}</p>

          {isDemo ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setConfirmingReset(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset Demo Account
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleExitDemo()}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exiting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FlaskConical className="h-4 w-4" aria-hidden="true" />}
                {exiting ? 'Exiting Demo Mode…' : 'Exit Demo Mode'}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleEnterDemo()}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {entering ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FlaskConical className="h-4 w-4" aria-hidden="true" />}
              {entering ? 'Entering Demo Mode…' : 'Enter Demo Mode'}
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      )}

      {confirmingReset && (
        <ResetDemoAccountDialog
          resetting={resetting}
          onCancel={() => setConfirmingReset(false)}
          onConfirm={async () => {
            setResetting(true);
            try {
              await resetDemoAccount();
              await Promise.all(
                [['wallet'], ['wallet-transactions'], ['bets'], ['bot'], ['bots']].map((key) =>
                  queryClient.invalidateQueries({ queryKey: key, exact: false }),
                ),
              );
              show({ tone: 'success', title: 'Demo account reset', description: 'Your balance and history are back to the starting point.' });
              setConfirmingReset(false);
            } catch (thrown) {
              show({ tone: 'error', title: 'Could not reset demo account', description: describeApiError(thrown).title });
            } finally {
              setResetting(false);
            }
          }}
        />
      )}
    </div>
  );
}
