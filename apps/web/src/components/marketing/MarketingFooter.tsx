import Link from 'next/link';

import { Logo } from '@/components/layout/Logo';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Markets', href: '/markets' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Security', href: '#security' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Log in', href: '/login' },
      { label: 'Create account', href: '/signup' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of service', href: '/legal/terms' },
      { label: 'Privacy policy', href: '/legal/privacy' },
      { label: 'Responsible gambling', href: '/legal/responsible-gambling' },
    ],
  },
  {
    title: 'Support',
    links: [{ label: 'Contact us', href: '/legal/contact' }],
  },
];

/** Marketing-site-only footer — never rendered inside the authenticated app shell. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-950 text-white/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-white/65 transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <Logo inverse />
          <p className="max-w-xl text-xs leading-5 text-white/40">
            FentiCoin involves financial risk. Only trade or bet with funds you can afford to lose. Nothing on this site is financial advice, and
            past market movement does not predict future results.
          </p>
        </div>
        <p className="mt-6 text-xs text-white/30">&copy; {new Date().getFullYear()} FentiCoin. All rights reserved.</p>
      </div>
    </footer>
  );
}
