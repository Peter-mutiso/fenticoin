'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { listUsers } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';

/**
 * There is no "list only users who hold a role" endpoint — `user_roles`
 * membership is only readable per-user (`GET admin/users/:id/roles`).
 * Rather than N+1-fetch roles for every user in an unfiltered list, this
 * page is search-first: find the account by email, then manage its roles
 * from its detail page's Roles tab.
 */
export function AdminUsersSearch() {
  const [emailInput, setEmailInput] = useState('');
  const [email, setEmail] = useState('');

  const query = useQuery({
    queryKey: ['users', 'admin-search', email],
    queryFn: () => listUsers({ email, limit: 25, offset: 0 }),
    enabled: email.length > 0,
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setEmail(emailInput.trim());
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="search"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder="Search by email to manage roles…"
          aria-label="Search by email"
          className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
      </form>

      <div className="mt-4">
        {!email ? (
          <EmptyState icon={ClipboardList} title="Search for a user to view or change their administrative roles." />
        ) : query.isLoading ? (
          <div className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
        ) : query.error ? (
          <Notice text={describeApiError(query.error).title} />
        ) : (query.data?.items.length ?? 0) === 0 ? (
          <EmptyState icon={Search} title="No users match that email." />
        ) : (
          <ul className="space-y-2">
            {query.data!.items.map((user) => (
              <li key={user.id}>
                <Link href={`/users/${user.id}?tab=Roles`} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300">
                  <span className="text-sm font-semibold text-neutral-900">{user.email}</span>
                  <span className="text-xs font-semibold text-brand-600">Manage roles →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
