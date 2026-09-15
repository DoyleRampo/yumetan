const CACHE = "yumetan-4.0.0";
const SHELL = [
  "./",
  "index.html",
  "style.css?v=4.0.0",
  "app.js?v=4.0.0",
  "config.js?v=4.0.0",
  "firebase-config.js?v=4.0.0",
  "cloud.js?v=4.0.0",
  "core/types.js",
  "core/i18n.js",
  "core/sleep.js",
  "core/storage.js",
  "core/reflection.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("yumetan-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.includes("/api/")
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE),
          cached = await cache.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return cache.match("index.html");
        return Response.error();
      }),
  );
});
