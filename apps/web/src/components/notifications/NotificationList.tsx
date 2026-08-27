'use client';

import { Bell, CheckCircle2, Info, XCircle } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/ui/EmptyState';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import type { NotificationTone } from '@/lib/notifications/types';

const TONE_ICON: Record<NotificationTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const TONE_COLOR: Record<NotificationTone, string> = {
  success: 'text-brand-500',
  error: 'text-loss-500',
  info: 'text-neutral-500',
};

export function NotificationList() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No notifications yet"
        description="You'll see updates here when your bets settle or your deposits/withdrawals change status."
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="text-sm font-semibold text-brand-700 transition hover:underline disabled:cursor-not-allowed disabled:text-neutral-300 disabled:no-underline"
        >
          Mark all read
        </button>
      </div>
      <ul className="space-y-2">
        {notifications.map((notification) => {
          const Icon = TONE_ICON[notification.tone];
          return (
            <li key={notification.id}>
              <Link
                href={notification.href}
                onClick={() => markRead(notification.id)}
                className={`flex items-start gap-3 rounded-2xl border border-neutral-200 p-4 transition hover:border-neutral-300 ${
                  notification.read ? 'bg-white' : 'bg-brand-50/40'
                }`}
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE_COLOR[notification.tone]}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">{notification.title}</p>
                  <p className="mt-0.5 text-sm text-neutral-500">{notification.description}</p>
                  <p className="mt-1 text-xs text-neutral-400">{new Date(notification.createdAt).toLocaleString()}</p>
                </div>
                {!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
