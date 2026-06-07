import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { ensureStartup } from './bootstrap/startup.js';
import { createApp } from './app.js';
import { config } from './lib/config.js';

export function createServer() {
  return http.createServer(createApp());
}

export async function startServer(port = config.port) {
  await ensureStartup();
  const server = createServer();

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[mtr-api] listening on port ${port}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startServer();
}
