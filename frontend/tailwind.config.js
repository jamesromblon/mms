/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0f172a',
        ink: '#182230',
        brand: '#2563eb',
        canvas: '#f3f4f6',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(15, 23, 42, 0.05)' },
    },
  },
  plugins: [],
}

