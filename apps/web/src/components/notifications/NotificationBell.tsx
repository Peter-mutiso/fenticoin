'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth/AuthContext';
import { useNotifications } from '@/lib/notifications/NotificationContext';

const PREVIEW_COUNT = 6;

export function NotificationBell() {
  const { status } = useAuth();
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (status !== 'authenticated') return null;

  const preview = notifications.slice(0, PREVIEW_COUNT);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-50 sm:h-10 sm:w-10"
      >
        <Bell className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-loss-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg sm:top-12">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-bold text-neutral-900">Notifications</p>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {preview.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-500">No notifications yet.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {preview.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={notification.href}
                    onClick={() => {
                      markRead(notification.id);
                      setOpen(false);
                    }}
                    className={`block rounded-xl px-3 py-2 text-left transition hover:bg-neutral-50 ${notification.read ? '' : 'bg-brand-50/50'}`}
                  >
                    <p className="text-sm font-semibold text-neutral-900">{notification.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{notification.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
