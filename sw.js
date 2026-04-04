const CACHE = "ml-miner-v1";
const ASSETS = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("fetch", e => {
  if (e.request.url.includes("vercel.app") || e.request.url.includes("fonts.googleapis")) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
