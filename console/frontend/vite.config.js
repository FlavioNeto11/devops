import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuracao do Vite para o DevOps Console (frontend).
 *
 * base '/devops/':
 *   A SPA e servida no subpath /devops/ (sem strip-prefix no Traefik). Com este
 *   base path, o Vite gera os assets referenciando /devops/assets/..., de modo que
 *   o nginx (location /devops/) consiga servi-los corretamente em producao.
 *
 * server.proxy (apenas em desenvolvimento, `npm run dev`):
 *   Encaminha /devops/api -> http://localhost:3001 (console-backend local) e
 *   reescreve a URL removendo o prefixo /devops/api antes de chegar ao backend.
 *   Isso espelha o comportamento do Middleware StripPrefix do Traefik em producao,
 *   onde o backend ve as rotas na raiz (ex.: /devops/api/overview -> /overview).
 *
 *   Observacao: o EventSource de SSE usa a mesma base (/devops/api/stream), entao o
 *   stream tambem passa pelo proxy em dev. `changeOrigin` evita problemas de Host.
 */
export default defineConfig({
  base: '/devops/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/devops/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Mantem a conexao aberta para o stream SSE em desenvolvimento.
        ws: false,
        rewrite: (path) => path.replace(/^\/devops\/api/, ''),
      },
    },
  },
});
