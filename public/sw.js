const SHELL = 'board-shell-v2';
const DATA  = 'board-data-v2';

// Enough to open the app cold with no signal.
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(PRECACHE))
      .catch(() => {})          // a cold install on a flaky connection shouldn't fail
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;      // writes must reach the network
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const isData = url.pathname === '/api/state';
  const bucket = isData ? DATA : SHELL;

  // Network first, fall back to the last copy this device saw. Lets the app
  // open and show the schedule in a dead zone.
  e.respondWith(
    fetch(e.request).then(res => {
      // Never overwrite a good cached board with a 401 or a 500.
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(bucket).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(async () => {
      const hit = await caches.match(e.request);
      if (hit) {
        // Flag it, so the app can say it's showing a stale board rather than
        // looking live and only failing when an edit is attempted.
        const h = new Headers(hit.headers);
        h.set('X-Board-Cached', '1');
        return new Response(hit.body, {status: hit.status, statusText: hit.statusText, headers: h});
      }
      if (isData) {
        return new Response(
          JSON.stringify({error: 'offline'}),
          {status: 503, headers: {'Content-Type': 'application/json'}}
        );
      }
      return caches.match('/');
    })
  );
});
