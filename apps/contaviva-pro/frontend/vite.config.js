import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// base = /contaviva-pro/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.
export default defineConfig({
  base: '/contaviva-pro/',
  plugins: [vue()],
  server: { proxy: { '/contaviva-pro/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/contaviva-pro/api', '') } } },
});
