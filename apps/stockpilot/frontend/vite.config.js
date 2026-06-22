import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /stockpilot/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/stockpilot/',
  plugins: [vue()],
  server: { proxy: { '/stockpilot/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/stockpilot/api', '') } } },
});
