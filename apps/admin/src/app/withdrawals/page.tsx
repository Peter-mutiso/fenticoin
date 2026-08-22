import { AdminShell } from '@/components/layout/AdminShell';
import { WithdrawalsList } from '@/components/finance/WithdrawalsList';

export default function WithdrawalsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Withdrawals</h1>
        <div className="mt-5">
          <WithdrawalsList />
        </div>
      </div>
    </AdminShell>
  );
}
