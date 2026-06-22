import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /teamflow/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/teamflow/',
  plugins: [vue()],
  server: { proxy: { '/teamflow/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/teamflow/api', '') } } },
});
