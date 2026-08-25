import { AppShell } from '@/components/layout/AppShell';
import { WithdrawalForm } from '@/components/payments/WithdrawalForm';

export default function WithdrawPage() {
  return (
    <AppShell requireAuth>
      <div className="pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Withdraw</h1>
        <div className="mt-5">
          <WithdrawalForm />
        </div>
      </div>
    </AppShell>
  );
}
