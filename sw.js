import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
precacheAndRoute(self.__WB_MANIFEST || []);

// Imágenes del Vercel Blob: se guardan en el dispositivo y no se vuelven a pedir (cada petición cuenta como operación)
registerRoute(
  ({ url, request }) => request.destination === 'image' && (url.pathname.startsWith('/blob/') || url.hostname.endsWith('.public.blob.vercel-storage.com')),
  new CacheFirst({
    cacheName: 'blob-imagenes',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 }),
    ],
  })
);

console.log('[SW personalizado] cargado');

// =================================================================
// CORRECCIÓN AGREGADA: BLINDAJE PARA LA API
// =================================================================
self.addEventListener('fetch', (event) => {
  if (
    event.request.url.includes('/api/') || 
    event.request.method === 'POST'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }
});
// =================================================================

self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('push', event => {
  const payload = event.data?.json?.() ?? { title: 'Notificación', body: event.data?.text() ?? 'Mensaje' };
  const title = payload.title || 'Notificación';
  
  // Modificado: Tomamos los iconos directamente del payload que viene de notificar.js
  const options = {
    body: payload.body || '',
    icon: payload.icon, 
    badge: payload.badge,
    data: {
      url: payload.url || '/', 
      ...payload.data          
    },
    requireInteraction: payload.requireInteraction || false,
    tag: payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let urlToOpen = event.notification.data?.url;
  if (!urlToOpen) urlToOpen = '/superuser/dashboard';

  const targetUrl = new URL(urlToOpen, self.location.origin).href;

  const promiseChain = clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((windowClients) => {
    
    const matchingClient = windowClients.find((client) => {
      return client.url.startsWith(self.location.origin) && 'focus' in client;
    });

    if (matchingClient) {
      return matchingClient.navigate(targetUrl).then((client) => client.focus());
    }

    if (clients.openWindow) {
      const safeTarget = encodeURIComponent(targetUrl);
      const bootUrl = `/?redirect_to=${safeTarget}`;
      return clients.openWindow(bootUrl);
    }
  });

  event.waitUntil(promiseChain);
});