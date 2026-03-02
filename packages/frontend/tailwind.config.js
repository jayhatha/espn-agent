/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
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
        // Keep existing primary colors so existing pages don't break
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        // Neutral base (spec: white/off-white/near-black)
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8f9fa',
          tertiary: '#f1f3f5',
        },
        content: {
          DEFAULT: '#111827',
          secondary: '#4b5563',
          tertiary: '#9ca3af',
          inverse: '#ffffff',
        },
        // ONE primary accent color
        accent: {
          DEFAULT: '#111827',
          hover: '#1f2937',
          light: '#f3f4f6',
        },
        // Semantic colors (functional only, not decorative)
        positive: {
          DEFAULT: '#059669',
          light: '#ecfdf5',
          border: '#a7f3d0',
        },
        negative: {
          DEFAULT: '#dc2626',
          light: '#fef2f2',
          border: '#fecaca',
        },
        warning: {
          DEFAULT: '#d97706',
          light: '#fffbeb',
          border: '#fde68a',
        },
        info: {
          DEFAULT: '#2563eb',
          light: '#eff6ff',
          border: '#bfdbfe',
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
