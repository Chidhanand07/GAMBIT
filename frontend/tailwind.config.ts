import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        hover: 'var(--bg-hover)',
        board: {
          light: 'var(--board-light)',
          dark: 'var(--board-dark)',
        },
        frame: {
          outer: 'var(--frame-outer)',
          inner: 'var(--frame-inner)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        indicator: {
          green: 'var(--green-indicator)',
        },
        highlight: {
          check: 'var(--check-highlight)',
          lastMove: 'var(--last-move)',
          selected: 'var(--selected)',
          validDot: 'var(--valid-dot)',
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
      boxShadow: {
        board: '0 8px 32px rgba(0,0,0,0.5)',
      },
      borderWidth: {
        DEFAULT: '0.5px',
        2: '2px',
        3: '3px',
      }
    },
  },
  plugins: [],
}
export default config
