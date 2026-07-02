import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SPA servida sob /besc/ (Traefik NAO faz strip do frontend). Assets com separador
// por ponto para evitar cache antigo. Proxy de dev encaminha /besc/api -> API local.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/besc/',
  plugins: [react()],
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
      '/besc/api': {
        target: process.env.API_TARGET || 'http://localhost:8099',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/besc\/api/, ''),
      },
    },
  },
});
