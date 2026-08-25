import { getStoredUser } from '@/lib/auth/token-storage';
import { AccountSection } from './AccountSection';

const KYC_LABELS: Record<string, string> = {
  unverified: 'Not verified',
  pending: 'Pending review',
  approved: 'Verified',
  rejected: 'Rejected',
};

/**
 * `kycStatus`/`emailVerifiedAt`/`phoneVerifiedAt` are only ever returned by
 * login/register (`AuthResult.user`) — there is no profile-read endpoint to
 * re-fetch them later, so this reads the snapshot captured at login time
 * from storage rather than from live `AuthContext.user` (which, after a
 * page refresh, is only re-validated via `/auth/me` — a different, smaller
 * shape). It may be stale if verification happened in another session.
 */
export function ProfileSection({ email }: { email: string }) {
  const stored = getStoredUser();

  return (
    <AccountSection title="Personal information">
      <dl className="space-y-3 text-sm">
        <Row label="Email" value={email} />
        {stored && (
          <>
            <Row label="Email verified" value={stored.emailVerifiedAt ? new Date(stored.emailVerifiedAt).toLocaleDateString() : 'Not verified'} />
            <Row label="Phone verified" value={stored.phoneVerifiedAt ? new Date(stored.phoneVerifiedAt).toLocaleDateString() : 'Not verified'} />
          </>
        )}
      </dl>
      {!stored && <p className="mt-3 text-xs text-neutral-400">Some details are only available right after logging in — log out and back in to refresh them.</p>}
    </AccountSection>
  );
}

export function kycStatusLabel(status: string): string {
  return KYC_LABELS[status] ?? status;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
