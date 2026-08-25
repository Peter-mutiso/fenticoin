import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import Link from 'next/link';

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link
        href="/account/deposit"
        className="flex items-center justify-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
      >
        <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
        Deposit
      </Link>
      <Link
        href="/account/withdraw"
        className="flex items-center justify-center gap-2 rounded-full bg-neutral-100 px-4 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-200"
      >
        <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
        Withdraw
      </Link>
    </div>
  );
}
