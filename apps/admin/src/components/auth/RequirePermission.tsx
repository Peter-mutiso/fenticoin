'use client';

import { useAuth } from '@/lib/auth/AuthContext';

/**
 * UI convenience only — hides an action the current admin's `permissions`
 * don't cover, so the page doesn't show buttons that would just 403. This
 * is NOT the real gate: every mutating request is independently checked
 * server-side by `PermissionsGuard` regardless of what this component
 * decided to render, and must stay that way.
 */
export function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) return null;
  return <>{children}</>;
}
