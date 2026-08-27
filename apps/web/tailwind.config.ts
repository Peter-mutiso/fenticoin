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
        brand: {
          50: '#ECFDF5',
          500: '#0FBE85',
          600: '#0DA372',
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
        loss: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
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
