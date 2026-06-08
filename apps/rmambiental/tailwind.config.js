/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // brand.* mapeados a CSS variables (trocam claro/escuro — ver index.css).
      // Mantém todas as classes brand-* existentes, agora adaptáveis ao tema.
      colors: {
        brand: {
          bg: 'rgb(var(--bg) / <alpha-value>)',
          surface: 'rgb(var(--surface) / <alpha-value>)',
          surface2: 'rgb(var(--surface2) / <alpha-value>)',
          text: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'rgb(var(--muted) / <alpha-value>)',
          neon: 'rgb(var(--neon) / <alpha-value>)',
          onNeon: 'rgb(var(--on-neon) / <alpha-value>)',
          petrol: 'rgb(var(--petrol) / <alpha-value>)',
          petrolLight: 'rgb(var(--petrolLight) / <alpha-value>)',
          green: 'rgb(var(--green) / <alpha-value>)',
          greenMid: 'rgb(var(--greenMid) / <alpha-value>)',
          gold: 'rgb(var(--gold) / <alpha-value>)',
          ink: 'rgb(var(--ink) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 10px 40px -16px rgb(0 0 0 / 0.22)',
        card: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 16px 44px -26px rgb(0 0 0 / 0.30)',
        glow: '0 0 0 1px rgb(var(--neon) / 0.20), 0 18px 50px -22px rgb(var(--neon) / 0.32)',
        soft: '0 12px 34px -18px rgb(0 0 0 / 0.20)',
      },
      keyframes: {
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
      },
      animation: {
        floaty: 'floaty 7s ease-in-out infinite',
        'floaty-slow': 'floaty 11s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
