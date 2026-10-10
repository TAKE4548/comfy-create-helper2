/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'ux-bg': 'rgb(var(--ux-bg) / <alpha-value>)',
        'ux-layer-1': 'rgb(var(--ux-layer-1) / <alpha-value>)',
        'ux-layer-2': 'rgb(var(--ux-layer-2) / <alpha-value>)',
        'ux-layer-3': 'rgb(var(--ux-layer-3) / <alpha-value>)',
        'ux-text-heading': 'rgb(var(--ux-text-heading) / <alpha-value>)',
        'ux-text-body': 'rgb(var(--ux-text-body) / <alpha-value>)',
        'ux-text-muted': 'rgb(var(--ux-text-muted) / <alpha-value>)',
        'ux-text-disabled': 'rgb(var(--ux-text-disabled) / <alpha-value>)',
        'ux-border-divider': 'rgb(var(--ux-border-divider) / calc(0.06 * <alpha-value>))',
        'ux-border-default': 'rgb(var(--ux-border-default) / calc(0.10 * <alpha-value>))',
        'ux-border-strong': 'rgb(var(--ux-border-strong) / calc(0.18 * <alpha-value>))',
        'ux-border-highlight': 'rgb(var(--ux-border-highlight) / calc(0.08 * <alpha-value>))',
        black: 'rgb(var(--ux-bg) / <alpha-value>)',
        background: 'rgb(var(--ux-bg) / <alpha-value>)',
        surface: 'rgb(var(--ux-layer-1) / <alpha-value>)',
        'surface-2': 'rgb(var(--ux-layer-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--ux-layer-3) / <alpha-value>)',
        // Map legacy zinc utilities onto the approved palette so existing
        // bg-zinc/text-zinc classes follow the global theme and support /opacity.
        zinc: {
          50: 'rgb(var(--ux-text-heading) / <alpha-value>)',
          100: 'rgb(var(--ux-text-heading) / <alpha-value>)',
          200: 'rgb(var(--ux-text-body) / <alpha-value>)',
          300: 'rgb(var(--ux-text-body) / <alpha-value>)',
          400: 'rgb(var(--ux-text-muted) / <alpha-value>)',
          500: 'rgb(var(--ux-text-muted) / <alpha-value>)',
          600: 'rgb(var(--ux-text-disabled) / <alpha-value>)',
          700: 'rgb(var(--ux-text-disabled) / <alpha-value>)',
          800: 'rgb(var(--ux-layer-2) / <alpha-value>)',
          900: 'rgb(var(--ux-layer-1) / <alpha-value>)',
          950: 'rgb(var(--ux-bg) / <alpha-value>)',
        },
        gray: {
          50: 'rgb(var(--ux-text-heading) / <alpha-value>)',
          100: 'rgb(var(--ux-text-heading) / <alpha-value>)',
          200: 'rgb(var(--ux-text-body) / <alpha-value>)',
          300: 'rgb(var(--ux-text-body) / <alpha-value>)',
          400: 'rgb(var(--ux-text-muted) / <alpha-value>)',
          500: 'rgb(var(--ux-text-muted) / <alpha-value>)',
          600: 'rgb(var(--ux-text-disabled) / <alpha-value>)',
          700: 'rgb(var(--ux-text-disabled) / <alpha-value>)',
          800: 'rgb(var(--ux-layer-2) / <alpha-value>)',
          900: 'rgb(var(--ux-layer-1) / <alpha-value>)',
          950: 'rgb(var(--ux-bg) / <alpha-value>)',
        },
        'accent-green': '#3ecf8e',
        'accent-purple': '#7C6FDD',
        border: 'rgb(var(--ux-border-default) / calc(0.10 * <alpha-value>))',
      },
      fontSize: {
        xs: ['11px', { lineHeight: '1rem' }],
      },
      textColor: {
        white: 'rgb(var(--ux-text-heading) / <alpha-value>)',
        black: 'rgb(var(--ux-bg) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-green': 'pulseGreen 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGreen: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(62,207,142,0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(62,207,142,0)' },
        },
      },
    },
  },
  plugins: [],
}
