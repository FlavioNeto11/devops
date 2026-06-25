import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /contaviva-360/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/contaviva-360/',
  plugins: [vue()],
  server: { proxy: { '/contaviva-360/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/contaviva-360/api', '') } } },
});
