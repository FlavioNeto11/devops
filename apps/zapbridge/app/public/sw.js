/* ZapBridge — service worker mínimo para instalabilidade (PWA) + cache do app shell.
   Estratégia: network-first com fallback para cache (offline básico). Nunca cacheia
   API nem WebSocket. O bundle do Expo é hash-imutável, então o cache não "gruda" versão. */
const CACHE = 'zapbridge-v1';
const SHELL = '/zapbridge/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Não intercepta API REST nem Socket.IO (precisam sempre da rede).
  if (url.pathname.includes('/api') || url.pathname.includes('/socket.io')) return;
  // Só dentro do escopo do app.
  if (!url.pathname.startsWith('/zapbridge/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        return cached || caches.match(SHELL);
      }),
  );
});
