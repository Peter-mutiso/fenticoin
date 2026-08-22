import { AlertCircle } from 'lucide-react';

/** The standard inline error/warning block used across every page — never a raw error stack, always this. */
export function Notice({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div role="alert" className={`flex gap-2 rounded-xl bg-loss-50 p-3 text-sm text-loss-500 ${className}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {text}
    </div>
  );
}
