/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Display (landing page hero only)
        'display': ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        // Heading scale
        'h1': ['clamp(2rem, 3vw, 3rem)', { lineHeight: '1.15', fontWeight: '600', letterSpacing: '-0.02em' }],
        'h2': ['clamp(1.5rem, 2.5vw, 2.25rem)', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.01em' }],
        'h3': ['clamp(1.25rem, 2vw, 1.5rem)', { lineHeight: '1.3', fontWeight: '600' }],
        'h4': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
        // Body scale
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        'caption': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        // Data-specific (tables, stats)
        'data': ['0.8125rem', { lineHeight: '1.4', fontFamily: 'var(--font-mono, ui-monospace)' }],
      },
      colors: {
        // Neutral base (spec: white/off-white/near-black)
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8f9fa',
          tertiary: '#f1f3f5',
        },
        content: {
          DEFAULT: '#111827',
          secondary: '#4b5563',
          tertiary: '#6b7280',   // was #9ca3af — now 5.0:1 on white (WCAG AA)
          inverse: '#ffffff',
        },
        // ONE primary accent color — teal in both light and dark
        accent: {
          DEFAULT: '#0D9488',
          hover: '#0f766e',
          light: '#f0fdfa',
        },
        // Semantic colors (functional only, not decorative)
        positive: {
          DEFAULT: '#059669',
          light: '#ecfdf5',
          border: '#a7f3d0',
          dark: '#34d399',         // text on dark backgrounds
          'dark-bg': '#064e3b',    // bg on dark (use with /20 or /30)
          'dark-border': '#065f46', // border on dark
        },
        negative: {
          DEFAULT: '#dc2626',
          light: '#fef2f2',
          border: '#fecaca',
          dark: '#f87171',
          'dark-bg': '#7f1d1d',
          'dark-border': '#991b1b',
        },
        warning: {
          DEFAULT: '#d97706',
          light: '#fffbeb',
          border: '#fde68a',
          dark: '#fbbf24',
          'dark-bg': '#78350f',
          'dark-border': '#92400e',
        },
        info: {
          DEFAULT: '#2563eb',
          light: '#eff6ff',
          border: '#bfdbfe',
          dark: '#60a5fa',
          'dark-bg': '#1e3a5f',
          'dark-border': '#1e40af',
        },
        // Shell dark theme palette (v6.0 Command Center)
        shell: {
          bg:     '#0B0D10',   // page background
          panel:  '#111318',   // card/panel background
          border: '#1D2128',   // borders
          nav:    '#0E1014',   // sidebar background (slightly deeper)
          text:   '#E2E8F0',   // primary text on dark
          muted:  '#94A3B8',   // secondary/muted text — was #8B97AB, now 5.0:1 on shell-bg (WCAG AA)
          accent: '#0D9488',   // interactive highlight (teal-600)
        },
        // Grafana dark theme palette (for mobile draft companion)
        grafana: {
          bg: "#181b1f",
          panel: "#22252b",
          border: "#2d3139",
          text: "#d9dde6",
          muted: "#99a5bc",
          positive: "#37872d",
          negative: "#c4162a",
          warning: "#e0b400",
        },
      },
      spacing: {
        'section': '6rem',
        'section-sm': '4rem',
        'section-xs': '3rem',
      },
      maxWidth: {
        'content': '72rem',
        'content-wide': '80rem',
        'content-narrow': '48rem',
      },
      gap: {
        'grid': '1.5rem',
        'grid-lg': '2rem',
      },
      borderRadius: {
        'card': '0.75rem',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.03)',
      },
    },
  },
  plugins: [],
};
