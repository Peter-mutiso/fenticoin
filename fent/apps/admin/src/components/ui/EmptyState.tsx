import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-neutral-300" aria-hidden="true" />
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      {description && <p className="max-w-xs text-sm text-neutral-500">{description}</p>}
      {action && (
        <Link href={action.href} className="mt-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
          {action.label}
        </Link>
      )}
    </div>
  );
}
