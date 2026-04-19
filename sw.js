const CACHE = "dcsala-v3";
const ASSETS = [
  "/dcsala/",
  "/dcsala/index.html",
  "/dcsala/data.js",
  "/dcsala/h2h.js",
  "/dcsala/stats.js",
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
  // API volania nechaj prehliadač riešiť priamo – AbortController funguje správne
  if (e.request.url.includes("dartssala.workers.dev") ||
      e.request.url.includes("n01darts.com") ||
      e.request.url.includes("sakura.ne.jp") ||
      e.request.url.includes("googleapis.com") ||
      e.request.url.includes("clvaw-cdnwnd.com")) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
