import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand accent — positive movement, primary actions (Deposit, active nav).
        // `500`/`600` are the visible brand surface (button/pill backgrounds,
        // hover states) — never used as small/normal foreground text, since
        // white-on-500 (~2.4:1) and 600-on-50/white (~3.1-3.2:1) both fail
        // WCAG AA. `700` exists solely as the accessible foreground-text
        // shade (links, badges, active-nav labels) on light backgrounds —
        // it does not appear as a background/surface color anywhere.
        brand: {
          50: '#ECFDF5',
          500: '#0FBE85',
          600: '#0DA372',
          700: '#0B7A57',
        },
        // Portfolio card / active-nav-on-dark surface / dark marketing sections.
        // `950` is the one canonical "dark surface" color for the whole app —
        // do not reintroduce a bespoke hex value for a dark card/section/button.
        navy: {
          800: '#132038',
          900: '#101A2E',
          950: '#0B1220',
        },
        // Negative movement / destructive actions.
        // `500` is the visible surface (icons, badge/notice backgrounds,
        // borders) — as small/normal foreground text it fails WCAG AA against
        // both white (~3.76:1) and `loss-50` (~3.44:1). `700` is the
        // accessible foreground-text shade for those cases; it is not used
        // as a background/surface color.
        loss: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
