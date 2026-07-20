const CACHE_NAME = "youjin-tiles-v1";
const tilePaths = [
  ...["B", "T", "W"].flatMap((family) => Array.from({ length: 9 }, (_, index) => `/assets/tiles/${family}${index + 1}.png`)),
  ...["E", "S", "X", "N", "Z", "F", "P"].map((id) => `/assets/tiles/${id}.png`),
  ...Array.from({ length: 8 }, (_, index) => `/assets/tiles/H${index + 1}.png`)
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(tilePaths);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("youjin-tiles-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/tiles/") || !url.pathname.endsWith(".png")) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, response.clone());
    }
    return response;
  })());
});
