// 캐시 이름을 바꾸면 activate 단계에서 예전 캐시가 통째로 지워진다.
// 화면을 고쳤는데 사용자에게 옛날 화면이 계속 보이면 이 숫자를 올린다.
const CACHE = "napolgil-realestate-v10";

// 오프라인일 때 최소한 열려야 하는 것들
const SHELL = [
  "/",
  "/index.html",
  "/panbokgi.html",
  "/gems.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // addAll은 하나라도 404면 전체가 실패한다. 개별로 담아서 한 개가 없어도 설치가 끝나게 한다.
      Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtml(request) {
  return (
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 외부 도메인(카카오맵 등)은 건드리지 않는다
  if (url.pathname.startsWith("/api/")) return;    // 공공데이터 호출은 항상 실시간

  // HTML은 네트워크 우선 — 새로 배포한 화면이 즉시 보여야 한다.
  // 캐시는 오프라인일 때만 쓰는 예비용.
  if (isHtml(request)) {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // 아이콘·매니페스트 같은 정적 파일은 캐시 우선 + 뒤에서 조용히 갱신
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
