import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Servido sob /zapbridge (mesma regra de roteamento do Traefik: frontend sem strip).
// No dev, proxy para o backend local em :3000 (API + Socket.IO no mesmo path do prod).
export default defineConfig({
  base: '/zapbridge/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/zapbridge/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/zapbridge\/api/, '') },
      '/zapbridge/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
