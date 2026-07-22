/*
 * GymOps — service worker mínimo para Web Push (UX-GYMOPS-005).
 *
 * Escopo: servido a partir de `public/`, portanto respeita o basePath do app
 * (ex.: `/gymops/sw.js` → escopo `/gymops/`). É registrado sob demanda quando
 * o usuário ativa as notificações push (ver apps/web/src/app/(app)/settings/page.tsx).
 *
 * Deliberadamente SEM cache/offline: apenas recebe o push e trata o clique na
 * notificação. Ícones usam caminho relativo ao escopo do SW para funcionarem
 * sob qualquer basePath.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_err) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'GymOps';
  const options = {
    body: payload.body || '',
    icon: payload.icon || './icons/icon-192.svg',
    badge: payload.badge || './icons/badge-72.svg',
    tag: payload.tag,
    data: { url: payload.url || './' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        return undefined;
      }),
  );
});
