import { ArrowDown, ArrowUp } from 'lucide-react';

export function PercentageChange({ value, className = '' }: { value: number; className?: string }) {
  const isPositive = value >= 0;
  const Icon = isPositive ? ArrowUp : ArrowDown;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold sm:text-sm ${
        isPositive ? 'text-brand-600' : 'text-loss-500'
      } ${className}`}
    >
      <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} aria-hidden="true" />
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}
