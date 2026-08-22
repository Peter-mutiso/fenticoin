'use client';

import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';

import { listAuditLogs } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 25;

export function AuditLogView() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [offset, setOffset] = useState(0);

  const query = useQuery({
    queryKey: ['audit-logs', action, targetType, actorUserId, offset],
    queryFn: () =>
      listAuditLogs({
        action: action.trim() || undefined,
        targetType: targetType.trim() || undefined,
        actorUserId: actorUserId.trim() || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const items = query.data?.items ?? [];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-neutral-600">
          Action
          <input
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setOffset(0);
            }}
            placeholder="e.g. user.status_changed"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <label className="text-xs font-semibold text-neutral-600">
          Target type
          <input
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value);
              setOffset(0);
            }}
            placeholder="e.g. user"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <label className="text-xs font-semibold text-neutral-600">
          Actor user ID
          <input
            value={actorUserId}
            onChange={(event) => {
              setActorUserId(event.target.value);
              setOffset(0);
            }}
            placeholder="UUID"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : query.error ? (
          <Notice text={describeApiError(query.error).title} />
        ) : items.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit log entries match these filters." />
        ) : (
          <ul className="space-y-2">
            {items.map((entry) => (
              <li key={entry.id} className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-bold text-neutral-900">{entry.action}</p>
                  <p className="text-xs text-neutral-500">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Actor {entry.actorUserId ?? 'system'} ({entry.actorType})
                  {entry.targetType && ` · ${entry.targetType}${entry.targetId ? `:${entry.targetId}` : ''}`}
                  {entry.ipAddress && ` · ${entry.ipAddress}`}
                </p>
                {(entry.before !== null && entry.before !== undefined) || (entry.after !== null && entry.after !== undefined) ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {entry.before !== null && entry.before !== undefined && (
                      <pre className="overflow-x-auto rounded-lg bg-neutral-50 p-2 text-[11px] text-neutral-600">{JSON.stringify(entry.before, null, 2)}</pre>
                    )}
                    {entry.after !== null && entry.after !== undefined && (
                      <pre className="overflow-x-auto rounded-lg bg-brand-50 p-2 text-[11px] text-neutral-700">{JSON.stringify(entry.after, null, 2)}</pre>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination offset={offset} limit={PAGE_SIZE} itemCount={items.length} onOffsetChange={setOffset} />
    </div>
  );
}
