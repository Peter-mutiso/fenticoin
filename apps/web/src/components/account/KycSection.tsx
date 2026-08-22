import { getStoredUser } from '@/lib/auth/token-storage';
import { AccountSection, NotAvailableNotice } from './AccountSection';
import { kycStatusLabel } from './ProfileSection';

export function KycSection() {
  const stored = getStoredUser();

  return (
    <AccountSection title="Verification (KYC)">
      <p className="text-sm text-neutral-900">
        Status: <span className="font-semibold">{stored ? kycStatusLabel(stored.kycStatus) : 'Unknown — log out and back in to refresh'}</span>
      </p>
      <div className="mt-3">
        <NotAvailableNotice text="Document upload isn't available yet — this will let you submit ID verification directly once it ships." />
      </div>
    </AccountSection>
  );
}
