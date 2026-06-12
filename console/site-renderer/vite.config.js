import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Servido sob /sites/ (Traefik SEM strip — convencao de frontend da plataforma).
// Os assets resolvem em /sites/assets/* independente da chave do portal na URL.
export default defineConfig({
  plugins: [react()],
  base: '/sites/',
  build: {
    // separador por ponto (cache do Cloudflare — ver TROUBLESHOOTING 14)
    rollupOptions: { output: { entryFileNames: 'assets/[name].[hash].js', assetFileNames: 'assets/[name].[hash][extname]' } },
  },
});
