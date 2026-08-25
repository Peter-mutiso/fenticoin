import type { LucideIcon } from 'lucide-react';

export interface StatusStyle {
  label: string;
  className: string;
  icon: LucideIcon;
}

/**
 * Generic pill badge for any status enum. Each page supplies its own
 * `Record<Status, StatusStyle>` map (user status, deposit status,
 * withdrawal status, bet status, instrument status, etc.) — this
 * component only owns the shared markup.
 */
export function StatusBadge<T extends string>({ status, styles }: { status: T; styles: Record<T, StatusStyle> }) {
  const style = styles[status];
  const Icon = style.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${style.className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {style.label}
    </span>
  );
}
