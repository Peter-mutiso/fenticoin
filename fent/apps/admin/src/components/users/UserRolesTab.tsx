'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';

import { assignRole, getUserRoles, listRoleDefinitions, revokeRole } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { useConfirmedAction } from '@/lib/useConfirmedAction';

export function UserRolesTab({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { confirm, dialogProps } = useConfirmedAction();
  const [selectedRole, setSelectedRole] = useState('');

  const rolesQuery = useQuery({ queryKey: ['admin-user-roles', userId], queryFn: () => getUserRoles(userId) });
  const catalogQuery = useQuery({ queryKey: ['role-definitions'], queryFn: listRoleDefinitions });

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['admin-user-roles', userId] });
  }

  function confirmAssign(roleKey: string) {
    confirm({
      title: `Grant the "${roleKey}" role?`,
      description: 'This immediately grants every permission that role carries.',
      destructive: roleKey === 'super_admin',
      confirmLabel: 'Grant role',
      successMessage: 'Role granted',
      onConfirm: async () => {
        await assignRole(userId, roleKey);
        await invalidate();
        setSelectedRole('');
      },
    });
  }

  function confirmRevoke(roleKey: string) {
    confirm({
      title: `Revoke the "${roleKey}" role?`,
      description: 'This immediately removes every permission that role carries — takes effect on the account’s very next request.',
      destructive: true,
      confirmLabel: 'Revoke role',
      successMessage: 'Role revoked',
      onConfirm: async () => {
        await revokeRole(userId, roleKey);
        await invalidate();
      },
    });
  }

  if (rolesQuery.isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />;
  if (rolesQuery.error) return <Notice text={describeApiError(rolesQuery.error).title} />;

  const currentRoles = rolesQuery.data?.roles ?? [];
  const availableToGrant = (catalogQuery.data?.items ?? []).filter((role) => !currentRoles.includes(role.key));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold text-neutral-900">Current roles</h2>
        {currentRoles.length === 0 ? (
          <div className="mt-3">
            <EmptyState icon={KeyRound} title="No administrative roles — this is a regular user." />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {currentRoles.map((roleKey) => (
              <li key={roleKey} className="flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                <span className="text-sm font-semibold text-neutral-900">{roleKey}</span>
                <RequirePermission permission="roles.manage">
                  <button type="button" onClick={() => confirmRevoke(roleKey)} className="text-xs font-bold text-loss-500 hover:underline">
                    Revoke
                  </button>
                </RequirePermission>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RequirePermission permission="roles.manage">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-bold text-neutral-900">Grant a role</h2>
          <div className="mt-3 flex gap-2">
            <select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
              aria-label="Role to grant"
              className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a role…</option>
              {availableToGrant.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.key} — {role.description}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedRole}
              onClick={() => confirmAssign(selectedRole)}
              className="rounded-full bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Grant
            </button>
          </div>
        </div>
      </RequirePermission>

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
