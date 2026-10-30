// Offline reading: the app shell is precached, and every page the reader has
// opened stays readable without a connection. Bump VERSION when shell files
// change so old caches are dropped.
const VERSION = 'v6';
const SHELL = `divan-shell-${VERSION}`;
// Versioned like lib/ganjoor.js SHAPE_VERSION, so a device never keeps
// showing a payload shape the app no longer expects.
const DATA = 'divan-data-v3';
const SHELL_FILES = [
  // Not /index.html: Pages answers it with a redirect to /, and a cached
  // redirect can't serve a navigation, which broke offline reloads.
  '/',
  '/styles.css',
  '/js/app.js',
  '/js/layout.js',
  '/js/format.js',
  '/js/dom.js',
  '/js/player.js',
  '/js/version.js',
  '/js/header.js',
  '/js/home.js',
  '/js/finder.js',
  '/js/theme-init.js',
  '/fonts/Vazirmatn-wght.woff2',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(staleWhileRevalidate(req, e));
  } else if (req.mode === 'navigate') {
    // Every route is the same SPA shell; network first so deploys show up.
    e.respondWith(fetch(req).catch(() => caches.match('/')));
  } else if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  } else {
    // Code and styles go network first, so a deploy reaches readers without
    // anyone having to remember to bump VERSION.
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)),
    );
  }
});

async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    e.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}
