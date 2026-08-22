import { AdminShell } from '@/components/layout/AdminShell';
import { KycQueue } from '@/components/rbac/KycQueue';

export default function KycPage() {
  return (
    <AdminShell>
      <div className="pb-8">
        <h1 className="text-2xl font-bold tracking-tight">KYC</h1>
        <p className="mt-1 text-sm text-neutral-500">Review pending identity verification. Approve/reject from a user&rsquo;s detail page.</p>
        <div className="mt-5">
          <KycQueue />
        </div>
      </div>
    </AdminShell>
  );
}
