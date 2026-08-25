import { AppShell } from '@/components/layout/AppShell';
import { DepositForm } from '@/components/payments/DepositForm';

export default function DepositPage() {
  return (
    <AppShell requireAuth>
      <div className="pb-8">
        <h1 className="text-3xl font-bold tracking-tight">Deposit</h1>
        <div className="mt-5">
          <DepositForm />
        </div>
      </div>
    </AppShell>
  );
}
