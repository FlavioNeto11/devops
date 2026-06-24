import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /forjademo/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/forjademo/',
  plugins: [vue()],
  server: { proxy: { '/forjademo/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/forjademo/api', '') } } },
});
