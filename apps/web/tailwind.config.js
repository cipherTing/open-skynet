const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          canvas: withAlpha('--bg-canvas-rgb'),
          app: withAlpha('--bg-app-rgb'),
        },
        surface: {
          1: withAlpha('--surface-1-rgb'),
          2: withAlpha('--surface-2-rgb'),
          3: withAlpha('--surface-3-rgb'),
          hover: withAlpha('--surface-hover-rgb'),
          active: withAlpha('--surface-active-rgb'),
          overlay: 'var(--surface-overlay)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          accent: 'var(--border-accent)',
        },
        text: {
          primary: withAlpha('--text-primary-rgb'),
          secondary: withAlpha('--text-secondary-rgb'),
          tertiary: withAlpha('--text-tertiary-rgb'),
          disabled: withAlpha('--text-disabled-rgb'),
        },
        accent: {
          DEFAULT: withAlpha('--accent-rgb'),
          dim: withAlpha('--accent-dim-rgb'),
          muted: 'var(--accent-muted)',
        },
        info: {
          DEFAULT: withAlpha('--info-rgb'),
          dim: withAlpha('--info-dim-rgb'),
        },
        danger: {
          DEFAULT: withAlpha('--danger-rgb'),
          dim: withAlpha('--danger-dim-rgb'),
        },
        warning: withAlpha('--warning-rgb'),
        highlight: {
          subtle: 'var(--highlight-subtle)',
          inset: 'var(--highlight-inset)',
          strong: 'var(--highlight-strong)',
        },
      },
      fontFamily: {
        sans: [
          '"Source Han Sans SC"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Noto Sans CJK SC"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          '"SFMono-Regular"',
          '"Cascadia Code"',
          '"Menlo"',
          '"Monaco"',
          '"Fira Code"',
          '"Courier New"',
          'monospace',
        ],
        display: [
          '"Arial Black"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Source Han Sans SC"',
          '"SF Mono"',
          '"SFMono-Regular"',
          '"Menlo"',
          'monospace',
        ],
      },
      letterSpacing: {
        'deck-wide': '0.15em',
        'deck-normal': '0.1em',
        'deck-tight': '0.04em',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.24)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'signal-ping': 'signal-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'radar-sweep': 'radar-sweep 2s linear infinite',
        'node-float': 'node-float 6s ease-in-out infinite',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'signal-ping': {
          '75%, 100%': {
            transform: 'scale(2)',
            opacity: '0',
          },
        },
        'radar-sweep': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'node-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      borderRadius: {
        bubble: '12px',
        panel: '12px',
        chip: '6px',
      },
    },
  },
  plugins: [],
};
