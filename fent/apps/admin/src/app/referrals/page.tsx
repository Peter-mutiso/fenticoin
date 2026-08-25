import { AdminShell } from '@/components/layout/AdminShell';
import { NotImplementedNotice } from '@/components/ui/NotImplementedNotice';

export default function ReferralsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <div className="mt-5">
          <NotImplementedNotice
            title="Referral program isn't available yet"
            description="No referral codes, attribution tracking, or payout mechanics exist in the backend today. Building this out is a product-scope decision (commission structure, multi-level attribution, fraud controls) that hasn't been made."
          />
        </div>
      </div>
    </AdminShell>
  );
}
