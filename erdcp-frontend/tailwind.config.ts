import type { Config } from 'tailwindcss';
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ember:  { DEFAULT: '#E8442A', 50: '#FFF0EE', 900: '#7A1A0D' },
        signal: { DEFAULT: '#1AB8C8', 50: '#EEF9FB', 900: '#0A5A63' },
        field:  { DEFAULT: '#7CB518', 50: '#F3FAE6', 900: '#3A5708' },
        hazard: { DEFAULT: '#C97B1A', 50: '#FDF4E7', 900: '#5E3808' },
        obs: {
          950: '#0A0C0F', 900: '#111214', 800: '#1A1C1F',
          700: '#222528', 600: '#2C2F34', 500: '#383C42',
        },
        frost: { 50: '#FFFFFF', 100: '#F2F3F5', 200: '#EAECEF', 300: '#DDE0E5' },
      },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,0.4)',
        panel: '0 4px 16px rgba(0,0,0,0.5)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%,100%': { opacity: '1' }, '50%': { opacity: '0.3' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up':   'fade-up 0.28s ease-out both',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        shimmer:     'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;
