import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /shopdesk/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/shopdesk/',
  plugins: [vue()],
  server: { proxy: { '/shopdesk/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/shopdesk/api', '') } } },
});
