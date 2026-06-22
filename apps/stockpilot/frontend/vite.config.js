import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: '/stockpilot/',
  server: {
    proxy: {
      '/stockpilot/api': {
        target: 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/stockpilot\/api/, ''),
      },
    },
  },
});
