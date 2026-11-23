/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Plus Jakarta Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'Space Grotesk',
          'Plus Jakarta Sans',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          DEFAULT: '#131B2E',
          muted: '#4B5568',
          subtle: '#64748B',
        },
        canvas: {
          DEFAULT: '#F8F8F5',
          surface: '#FFFFFF',
          rail: '#EEF1F7',
        },
        navy: {
          DEFAULT: '#131B2E',
          hover: '#1D2944',
          soft: '#E9EEF6',
        },
        cobalt: {
          DEFAULT: '#1B4FD8',
          hover: '#1640B0',
          soft: '#EEF3FF',
        },
        gridline: '#DCE1EB',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(19, 27, 46, 0.04)',
        elevated: '0 10px 28px -6px rgba(19, 27, 46, 0.12), 0 2px 6px -1px rgba(19, 27, 46, 0.05)',
      },
    },
  },
  plugins: [],
};
