'use client';

import { useQuery } from '@tanstack/react-query';

import { listRoleDefinitions } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';

export function RoleTable() {
  const query = useQuery({ queryKey: ['role-definitions'], queryFn: listRoleDefinitions });

  if (query.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />;
  if (query.error) return <Notice text={describeApiError(query.error).title} />;

  return (
    <div className="space-y-3">
      {query.data!.items.map((role) => (
        <div key={role.key} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="font-mono text-sm font-bold text-neutral-900">{role.key}</p>
          <p className="mt-0.5 text-sm text-neutral-500">{role.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {role.permissions.length === 0 ? (
              <span className="text-xs text-neutral-400">No permissions</span>
            ) : (
              role.permissions.map((permission) => (
                <span key={permission} className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-neutral-600">
                  {permission}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
