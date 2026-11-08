// 양성이 서비스워커 — 앱 껍데기는 캐시해 오프라인에서도 열리고, /api 는 항상 실시간.
const CACHE = "yangseongi-v9";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/engine.js", "./js/laws.js", "./js/map.js", "./js/view3d.js", "./js/upload.js", "./js/parse.js", "./js/auth.js", "./js/sample.js",
  "./vendor/leaflet/leaflet.js", "./vendor/leaflet/leaflet.css", "./vendor/three/three.module.min.js", "./vendor/three/OrbitControls.js",
  "./icons/icon-32.png", "./icons/icon-96.png", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("yangseongi-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // 네트워크 우선(새 배포 즉시 반영) → 실패 시 캐시
  e.respondWith(
    fetch(req).then((r) => {
      if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
