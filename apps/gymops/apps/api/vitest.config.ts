import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run serially — tests share a real database
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gymops_test',
      JWT_SECRET: 'test-secret-key-min-32-chars-long!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-chars!!',
      FRONTEND_URL: 'http://localhost:3000',
      ENCRYPTION_KEY: 'a'.repeat(64),
    },
  },
});
