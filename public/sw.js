const CACHE = "yumetan-4.5.0";
const SHELL = [
  "./",
  "index.html",
  "style.css?v=4.5.0",
  "app.js?v=4.5.0",
  "config.js?v=4.5.0",
  "firebase-config.js?v=4.5.0",
  "cloud.js?v=4.5.0",
  "core/types.js",
  "core/type-features.js",
  "core/ui-text.js",
  "core/purchases.js",
  "core/auth-providers.js",
  "core/auth-i18n.js",
  "core/account-sync.js",
  "core/cloud-client.js",
  "core/native-auth.js",
  "community.js",
  "core/plans.js",
  "core/community-i18n.js",
  "core/characters.js",
  "assets/characters/dreamwalkers-v1/catalog.js",
  "assets/characters/moonkeepers-v1/catalog.js",
  ...[
    "chase",
    "loss",
    "bound",
    "collapse",
    "future",
    "intuition",
    "symbol",
    "deja",
    "lucid",
    "aware",
    "observer",
    "challenge",
    "place",
    "person",
    "story",
    "emotion",
  ].flatMap((id) =>
    ["moonkeepers-v1", "dreamwalkers-v1"].map(
      (set) => `assets/characters/${set}/${id}.webp`,
    ),
  ),
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
    url.pathname.includes("/api/") ||
    /\/auth\.(html|js)$/.test(url.pathname)
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
