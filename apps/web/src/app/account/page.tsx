'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { KycSection } from '@/components/account/KycSection';
import { PasswordSection } from '@/components/account/PasswordSection';
import { PhoneVerificationSection } from '@/components/account/PhoneVerificationSection';
import { ProfileSection } from '@/components/account/ProfileSection';
import { ResponsibleGamblingSection } from '@/components/account/ResponsibleGamblingSection';
import { SecuritySection } from '@/components/account/SecuritySection';
import { TwoFactorSection } from '@/components/account/TwoFactorSection';
import { AppShell } from '@/components/layout/AppShell';

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <AppShell requireAuth>
      <div className="space-y-4 pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Account</h1>

        {user && (
          <>
            <ProfileSection email={user.email} />
            <PhoneVerificationSection />
            <TwoFactorSection />
            <PasswordSection email={user.email} />
            <KycSection />
            <ResponsibleGamblingSection />
            <SecuritySection />
          </>
        )}
      </div>
    </AppShell>
  );
}
