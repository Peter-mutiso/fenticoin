import { AppShell } from '@/components/layout/AppShell';
import { TransactionsTable } from '@/components/wallet/TransactionsTable';

export default function TransactionsPage() {
  return (
    <AppShell requireAuth>
      <div className="pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
        <div className="mt-5">
          <TransactionsTable />
        </div>
      </div>
    </AppShell>
  );
}
