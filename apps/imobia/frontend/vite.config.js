import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// SPA servida sob /imobia/ (Traefik NAO faz strip do frontend). Assets com hash imutavel.
// Proxy de dev encaminha /imobia/api -> API local (strip do prefixo, como o Traefik).
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/imobia/',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  server: {
    proxy: {
      '/imobia/api': {
        target: process.env.API_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/imobia\/api/, ''),
      },
    },
  },
});
