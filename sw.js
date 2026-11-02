/* URA · Suporte B2C — service worker (cache só deste app) */
const VERSION = '1.20.0';
const PREFIXO = 'ura-b2c-v';
const CACHE = PREFIXO + VERSION;
const CORE = ['./', 'index.html', 'dados.js', 'graf.js', 'historico.js', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // apaga só os caches antigos DESTE app (outros apps podem morar no mesmo endereço)
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIXO) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const escopo = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(escopo)) return;
  // os dados (.json, exceto o manifesto) nunca passam pelo cache do SW: a última cópia válida fica guardada pelo próprio app
  if (/\.json$/i.test(url.pathname)) return;
  // app: rede primeiro; sem rede, a cópia guardada
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })
    .then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
