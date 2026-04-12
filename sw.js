const CACHE = "dcsala-v2";
const ASSETS = [
  "/dcsala/",
  "/dcsala/index.html",
  "/dcsala/js/data.js",
  "/dcsala/js/h2h.js",
  "/dcsala/js/stats.js",
  "/dcsala/manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // Network first pre API volania, cache first pre assety
  if (e.request.url.includes("dartssala.workers.dev") ||
      e.request.url.includes("googleapis.com") ||
      e.request.url.includes("clvaw-cdnwnd.com")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
