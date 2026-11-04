const CACHE = "photo-field-tagging-v7";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key =>
            key.startsWith("photo-field-tagging-") &&
            key !== CACHE
          )
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  const isAppShell =
    request.mode === "navigate" ||
    /\/(index\.html|style\.css|app\.js|manifest\.webmanifest|sw\.js)$/.test(url.pathname) ||
    /\/icons\/icon-(192|512)\.png$/.test(url.pathname);

  if (!isAppShell) {
    event.respondWith(
      caches.match(request).then(
        cached => cached || fetch(request)
      )
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(
            cache => cache.put(request, copy)
          );
        }

        return response;
      })
      .catch(() =>
        caches.match(request).then(
          cached => cached || caches.match("./index.html")
        )
      )
  );
});
