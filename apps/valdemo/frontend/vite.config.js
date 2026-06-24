import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /valdemo/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/valdemo/',
  plugins: [vue()],
  server: { proxy: { '/valdemo/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/valdemo/api', '') } } },
});
