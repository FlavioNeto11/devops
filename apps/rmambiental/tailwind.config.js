/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0A0F0D',
          surface: '#0F1614',
          surface2: '#15211D',
          petrol: '#0D3B43',
          petrolLight: '#15616F',
          green: '#0F3D2E',
          greenMid: '#1B7A57',
          neon: '#34E39B',
          gold: '#C9A24B',
          ink: '#060D0A',
          text: '#E8EFEB',
          muted: '#9DB3AA',
          line: 'rgba(255,255,255,0.09)',
        },
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 10px 44px -14px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(52,227,155,0.18), 0 22px 60px -22px rgba(52,227,155,0.28)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 18px 50px -24px rgba(0,0,0,0.8)',
      },
      keyframes: {
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        floaty: 'floaty 7s ease-in-out infinite',
        'floaty-slow': 'floaty 11s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
