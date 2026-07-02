/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0b0b',
        surface: '#1c1c1e',
        surfaceAlt: '#2c2c2e',
        header: '#0b0b0b',
        primary: '#25d366',
        primaryDark: '#1da851',
        bubbleOut: '#005c4b',
        bubbleIn: '#1f2c34',
        muted: '#8d8d93',
        line: '#2a2a2c',
        link: '#34b7f1',
        danger: '#ff453a',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
