import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Servido sob o subpath /anarabottini/ na esteira (Traefik sem strip + nginx alias).
// O base path pode ser sobrescrito em build-time via VITE_BASE_PATH (default /anarabottini/).
const base = process.env.VITE_BASE_PATH || '/anarabottini/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Nome de asset com separador por ponto (evita cache antigo do Cloudflare
    // servindo octet-stream; ver TROUBLESHOOTING da plataforma).
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  }
});
