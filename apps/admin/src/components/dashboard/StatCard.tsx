import type { LucideIcon } from 'lucide-react';

export function StatCard({ icon: Icon, label, value, tone = 'neutral' }: { icon: LucideIcon; label: string; value: string; tone?: 'neutral' | 'brand' | 'loss' }) {
  const toneClass = tone === 'brand' ? 'text-brand-600' : tone === 'loss' ? 'text-loss-500' : 'text-neutral-900';
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2 text-neutral-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
