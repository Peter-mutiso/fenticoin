import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#ECFDF5',
          500: '#0FBE85',
          600: '#0DA372',
        },
        navy: {
          900: '#101A2E',
          950: '#0B1220',
        },
        loss: {
          50: '#FEF2F2',
          500: '#EF4444',
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
