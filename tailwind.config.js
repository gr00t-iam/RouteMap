/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          500: '#3b82f6',
          600: '#2563eb',
        },
      },
    },
  },
  plugins: [],
};
