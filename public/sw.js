// Offline reading: the app shell is precached, and every page the reader has
// opened stays readable without a connection.
// VERSION is the app version (test/version.test.js keeps it equal to
// package.json): every release changes this file, which is how browsers
// notice an update and the page can offer it (js/update.js).
const VERSION = '0.8.0';
const SHELL = `divan-shell-${VERSION}`;
// Versioned like lib/ganjoor.js SHAPE_VERSION, so a device never keeps
// showing a payload shape the app no longer expects.
const DATA = 'divan-data-v4';
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
  '/js/about.js',
  '/js/songs.js',
  '/js/sung.js',
  '/js/finder.js',
  '/js/update.js',
  '/js/theme-init.js',
  '/fonts/Vazirmatn-wght.woff2',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' so the offline copy isn't filled from a stale browser cache.
  const fresh = SHELL_FILES.map((u) => new Request(u, { cache: 'reload' }));
  // No skipWaiting here: a new version waits until the reader taps
  // «به‌روزرسانی», so nothing (a recitation, say) is cut off mid-way.
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(fresh)));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
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
    e.respondWith(fresh(req).catch(() => caches.match('/')));
  } else if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  } else {
    // Code and styles go network first, so a deploy reaches readers without
    // anyone having to remember to bump VERSION.
    e.respondWith(
      fresh(req)
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

// The whosane.dev zone gives JS and CSS a 4-hour browser cache, which
// overrides Pages' max-age=0. Revalidating (a cheap ETag check) keeps a
// returning reader from running last release's code against new HTML.
function fresh(req) {
  return fetch(req, { cache: 'no-cache' });
}

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
