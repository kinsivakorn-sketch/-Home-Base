/* Home Base service worker: opens offline, and picks up new versions whenever you are online. */
const V = 'hb-v3', FONTS = 'hb-fonts-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.indexOf('hb-') === 0 && k !== V && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Tapping a reminder opens the app (or brings it to the front) on the Today sheet. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const view = (e.notification.data && e.notification.data.view) || 'today';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) { c.postMessage({ type: 'hb-go', view }); return c.focus(); }
    }
    return self.clients.openWindow('./#' + view);
  }));
});

const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);

  if (u.origin === location.origin) {
    if (u.pathname.endsWith('/news.json')) return; /* the app keeps its own offline copy of the news */
    /* same-origin files: network first (so updates show up), cached copy when offline or slow */
    e.respondWith(
      timeout(fetch(r, { cache: 'no-cache' }), 4000) /* GitHub Pages lets browsers reuse a file for 10 minutes; no-cache makes every open ask whether it changed */
        .then(res => {
          if (res && res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); }
          return res;
        })
        .catch(() => caches.match(r).then(m => m || caches.match('index.html')))
    );
    return;
  }

  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(r).then(m => m || fetch(r).then(res => { c.put(r, res.clone()); return res; }))));
  }
});
