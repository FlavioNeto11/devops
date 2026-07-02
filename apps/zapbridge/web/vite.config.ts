import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Servido sob /zapbridge (mesma regra de roteamento do Traefik: frontend sem strip).
// No dev, proxy para o backend local em :3000 (API + Socket.IO no mesmo path do prod).
export default defineConfig({
  base: '/zapbridge/',
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy do dev para o backend REAL via Traefik (nvit.localhost). Assim o preview/dev
    // usa dados e auth reais; o Traefik faz o strip de /zapbridge/api.
    proxy: {
      '/zapbridge/api': { target: 'http://nvit.localhost', changeOrigin: true },
      '/zapbridge/socket.io': { target: 'http://nvit.localhost', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
