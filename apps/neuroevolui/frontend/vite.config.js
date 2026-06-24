import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /neuroevolui/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/neuroevolui/',
  plugins: [vue()],
  server: { proxy: { '/neuroevolui/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/neuroevolui/api', '') } } },
});
