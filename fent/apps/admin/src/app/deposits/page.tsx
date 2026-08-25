import { AdminShell } from '@/components/layout/AdminShell';
import { DepositsList } from '@/components/finance/DepositsList';

export default function DepositsPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">Deposits</h1>
        <div className="mt-5">
          <DepositsList />
        </div>
      </div>
    </AdminShell>
  );
}
