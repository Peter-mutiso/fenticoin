import { AdminShell } from '@/components/layout/AdminShell';
import { BonusGrantView } from '@/components/finance/BonusGrantView';
import { NotImplementedNotice } from '@/components/ui/NotImplementedNotice';

export default function BonusesPage() {
  return (
    <AdminShell>
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bonuses</h1>
          <div className="mt-5">
            <BonusGrantView />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-neutral-900">Bonus campaigns</h2>
          <div className="mt-2">
            <NotImplementedNotice
              title="Bonus campaign rules aren't available yet"
              description="Automated campaign rules (deposit-match bonuses, eligibility criteria, expiry, wagering requirements) aren't built — only the manual one-off grant above."
            />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
