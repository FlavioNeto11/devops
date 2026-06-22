import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /helpflow/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/helpflow/',
  plugins: [vue()],
  server: { proxy: { '/helpflow/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/helpflow/api', '') } } },
});
