'use client';

import { useQuery } from '@tanstack/react-query';

import { listPermissionDefinitions, type PermissionDefinition } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';

export function PermissionTable() {
  const query = useQuery({ queryKey: ['permission-definitions'], queryFn: listPermissionDefinitions });

  if (query.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />;
  if (query.error) return <Notice text={describeApiError(query.error).title} />;

  const byCategory = new Map<string, PermissionDefinition[]>();
  for (const permission of query.data!.items) {
    const list = byCategory.get(permission.category) ?? [];
    list.push(permission);
    byCategory.set(permission.category, list);
  }

  return (
    <div className="space-y-5">
      {Array.from(byCategory.entries()).map(([category, permissions]) => (
        <div key={category}>
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{category}</p>
          <div className="mt-2 space-y-2">
            {permissions.map((permission) => (
              <div key={permission.key} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                <span className="font-mono text-sm font-semibold text-neutral-900">{permission.key}</span>
                <span className="text-sm text-neutral-500">{permission.description}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
