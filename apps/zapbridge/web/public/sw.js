// SW "kill-switch": o app novo (Vite) NÃO usa service worker. Este arquivo existe só
// para substituir o SW antigo (Expo) que ficou registrado em navegadores/PWAs instalados:
// ao ser buscado pelo update do SW antigo, ele instala, LIMPA todos os caches, se
// desregistra e recarrega os clients — que passam a carregar o app novo direto da rede.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => {
        try {
          c.navigate(c.url);
        } catch {
          /* ignore */
        }
      });
    })(),
  );
});
// Passa tudo direto para a rede (sem cache) enquanto ainda estiver ativo.
self.addEventListener('fetch', () => {});
