export function AccountSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-bold text-neutral-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The honest "not available yet" notice used for genuine backend gaps — never a fake form that pretends to submit. */
export function NotAvailableNotice({ text }: { text: string }) {
  return <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500">{text}</p>;
}
