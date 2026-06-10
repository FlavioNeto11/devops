/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // brand.* mapeados a CSS variables (ver index.css). Paleta QUENTE & humanista:
      // creme/off-white, acento ouro, apoio terracota/sálvia, com ouro-neuro p/ o motivo ∞.
      colors: {
        brand: {
          bg: 'rgb(var(--bg) / <alpha-value>)',
          surface: 'rgb(var(--surface) / <alpha-value>)',
          surface2: 'rgb(var(--surface2) / <alpha-value>)',
          text: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'rgb(var(--muted) / <alpha-value>)',
          // acento primário (ouro). Mantém o nome "neon" usado pelos utilitários herdados.
          neon: 'rgb(var(--neon) / <alpha-value>)',
          onNeon: 'rgb(var(--on-neon) / <alpha-value>)',
          gold: 'rgb(var(--neon) / <alpha-value>)',
          terra: 'rgb(var(--terra) / <alpha-value>)',
          terraLight: 'rgb(var(--terra-light) / <alpha-value>)',
          sage: 'rgb(var(--sage) / <alpha-value>)',
          sageMid: 'rgb(var(--sage-mid) / <alpha-value>)',
          goldNeuro: 'rgb(var(--gold-neuro) / <alpha-value>)',
          ink: 'rgb(var(--ink) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 10px 40px -16px rgb(0 0 0 / 0.14)',
        card: '0 1px 0 0 rgb(255 255 255 / 0.6) inset, 0 18px 44px -28px rgb(60 40 20 / 0.22)',
        glow: '0 0 0 1px rgb(var(--neon) / 0.18), 0 18px 50px -22px rgb(var(--neon) / 0.30)',
        soft: '0 12px 34px -18px rgb(60 40 20 / 0.18)',
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
