/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F7F7',
        surface: '#FFFFFF',
        border: '#D0D0D0',
        accent: '#CC0000',
        'accent-light': '#FFF0F0',
        'accent-dark': '#990000',
        'text-primary': '#111111',
        'text-secondary': '#555555',
        success: '#1A6B1A',
        'success-light': '#F0F7F0',
        warning: '#8B5A00',
        'warning-light': '#FFF8E6',
        danger: '#CC0000',
        'danger-light': '#FFF0F0',
        info: '#1A3A8B',
        'info-light': '#EEF2FF',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        ui: ['"Fira Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '2px',
        md: '3px',
        lg: '3px',
        xl: '3px',
        '2xl': '3px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
