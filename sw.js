// Service Worker: rede primeiro (sempre a versão mais nova quando online),
// cache como reserva (funciona offline). Não precisa mudar versão a cada edição.
const CACHE = 'organizador';
const ARQUIVOS = [
  './', './index.html', './manifest.json', './css/estilo.css',
  './js/app.js', './js/db.js', './js/ui.js', './js/servicos/estoque-servico.js',
  './js/modulos/dashboard.js', './js/modulos/estoque.js', './js/modulos/compras.js', './js/modulos/config.js',
  './lib/vue.esm-browser.prod.js', './lib/dexie.mjs',
  './icones/icone-192.png', './icones/icone-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // espera a rede no máximo 2,5 s; depois usa o cache
      const rede = fetch(e.request);
      const resp = await Promise.race([rede, new Promise((_, rej) => setTimeout(() => rej('lento'), 2500))]);
      if (resp.ok) cache.put(e.request, resp.clone());
      return resp;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
    }
  })());
});
