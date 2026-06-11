import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuracao do Vite para o portal-recorder (frontend).
 *
 * base '/portal-rec/':
 *   A SPA e servida no subpath /portal-rec/ (sem strip-prefix no Traefik, conforme
 *   a regra de ouro de frontend da plataforma). Com este base path, o Vite gera os
 *   assets referenciando /portal-rec/assets/..., de modo que o nginx
 *   (location /portal-rec/) consiga servi-los corretamente em producao.
 *
 * server.proxy (apenas em desenvolvimento, `npm run dev`):
 *   - /portal-rec/api  -> http://localhost:8080 (portal-recorder-api local), com
 *     rewrite removendo o prefixo /portal-rec/api (o backend ve as rotas na raiz,
 *     ex.: /portal-rec/api/v1/portals -> /v1/portals). Espelha o Middleware
 *     StripPrefix do Traefik em producao.
 *   - /portal-rec/stream -> WebSocket do recorder (screencast do browser remoto).
 *     `ws: true` faz o upgrade do protocolo. Em producao a rota WS e declarada a
 *     mao no IngressRoute (priority 40 > api 30 > frontend 10).
 *
 * Nomes de asset com separador "." (index.<hash>.js): mesma motivacao do console
 * (evita cache de mime errado na borda; URLs novas geram cache MISS).
 */
export default defineConfig({
  base: '/portal-rec/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      // WebSocket do screencast do browser remoto (recorder). Mais especifico que
      // /portal-rec/api, entao declarado antes. O recorder local escuta em :8091.
      '/portal-rec/stream': {
        target: 'ws://localhost:8091',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/portal-rec\/stream/, '/stream'),
      },
      // API REST: strip do prefixo /portal-rec/api -> backend ve as rotas na raiz.
      '/portal-rec/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: false,
        rewrite: (path) => path.replace(/^\/portal-rec\/api/, ''),
      },
    },
  },
});
