import { FileText } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Logo } from '@/components/layout/Logo';

const DOCUMENTS: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  'responsible-gambling': 'Responsible Gambling',
  contact: 'Contact & Support',
};

/**
 * Honest placeholder for legal/support documents that haven't been
 * published yet — every footer link resolves to a real page (never a
 * 404 or a fabricated legal document) until the actual content exists.
 */
export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = DOCUMENTS[slug];
  if (!title) notFound();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Link href="/" className="inline-block"><Logo /></Link>
        <div className="mt-10 rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-neutral-950">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            This document has not been published yet. Check back soon, or contact support if you have a question in the meantime.
          </p>
          <Link href="/" className="mt-7 inline-block rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-navy-950 transition hover:bg-brand-600">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
