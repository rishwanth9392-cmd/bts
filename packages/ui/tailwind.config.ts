import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../apps/web/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'primary-yellow': '#FFC107',
        student: {
          light: '#F3E8FF', // Soft purple
          dark: '#6B21A8',  // Deep purple
        },
        driver: {
          light: '#FFEDD5', // Soft peach
          dark: '#C2410C',  // Deep orange
        },
        admin: {
          light: '#DBEAFE', // Soft blue
          dark: '#1D4ED8',  // Deep blue
        },
        status: {
          success: '#10B981', // Emerald 500
          warning: '#F59E0B', // Amber 500
          danger: '#EF4444',  // Red 500
          info: '#3B82F6',    // Blue 500
          neutral: '#6B7280', // Gray 500
          'success-bg': '#D1FAE5',
          'warning-bg': '#FEF3C7',
          'danger-bg': '#FEE2E2',
          'info-bg': '#DBEAFE',
          'neutral-bg': '#F3F4F6',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      keyframes: {
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(1rem)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.5s ease-out forwards',
      },
    },
  },
  plugins: [],
};

export default config;
