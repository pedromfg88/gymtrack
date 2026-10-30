// GymTrack — service worker (a app abre sem rede).
// Rede primeiro: com rede traz sempre a versão nova (sem versões antigas presas);
// sem rede, ou com rede muito lenta, serve a cópia guardada. O build preenche os dois valores abaixo.
const BUILD = "__BUILD_ID__";
const PRECACHE = __PRECACHE__;
const CACHE = "gymtrack-" + BUILD;
const WAIT_MS = 3000;   // rede lenta: ao fim de 3 s abre a cópia guardada (a versão nova fica para a próxima)

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("gymtrack-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;   // Google (login, Drive): direto à rede
  e.respondWith(networkFirst(req));
});

function networkFirst(req) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res) => { if (!settled) { settled = true; resolve(res); } };
    const cached = () =>
      caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === "navigate" ? caches.match("./") : undefined));
    const timer = setTimeout(() => { cached().then((r) => { if (r) done(r); }); }, WAIT_MS);
    fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        done(res);
      })
      .catch(() => {
        clearTimeout(timer);
        cached().then((r) => done(r || Response.error()));
      });
  });
}
