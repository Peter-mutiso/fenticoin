import { Construction } from 'lucide-react';

/** The honest "not built yet" notice for admin areas with no backend behind them — never a fake form that pretends to work. */
export function NotImplementedNotice({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
      <Construction className="h-8 w-8 text-neutral-300" aria-hidden="true" />
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      <p className="max-w-md text-sm text-neutral-500">{description}</p>
    </div>
  );
}
