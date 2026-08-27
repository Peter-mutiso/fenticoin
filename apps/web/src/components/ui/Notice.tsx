import { AlertCircle, Info } from 'lucide-react';

/**
 * The standard inline block used across every page for both errors and
 * calm informational messages — never a raw error stack, always this.
 * `tone` defaults to `'error'` (the original red/alert styling every
 * existing caller relies on); pass `'info'` for a neutral, non-alarming
 * message (e.g. "this feature is unavailable in Demo Mode") that isn't a
 * failure and shouldn't read like one.
 */
export function Notice({ text, tone = 'error', className = '' }: { text: string; tone?: 'error' | 'info'; className?: string }) {
  const toneClasses = tone === 'info' ? 'bg-neutral-100 text-neutral-600' : 'bg-loss-50 text-loss-700';
  const Icon = tone === 'info' ? Info : AlertCircle;
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex gap-2 rounded-xl p-3 text-sm ${toneClasses} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {text}
    </div>
  );
}
