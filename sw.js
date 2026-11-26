// Service Worker: rede primeiro (sempre a versão mais nova quando online),
// cache como reserva (funciona offline). Não precisa mudar versão a cada edição.
const CACHE = 'organizador';
const ARQUIVOS = [
  './', './index.html', './manifest.json', './css/estilo.css',
  './js/app.js', './js/db.js', './js/sync.js', './js/ui.js', './js/servicos/estoque-servico.js',
  './js/modulos/dashboard.js', './js/modulos/estoque.js', './js/modulos/compras.js', './js/modulos/config.js',
  './js/servicos/rotina-servico.js', './js/modulos/rotina.js', './js/modulos/rotina-semana.js', './js/modulos/rotina-historico.js',
  './js/modulos/rotina-falhas.js', './js/modulos/rotina-form.js', './js/modulos/agua.js',
  './js/modulos/rotina-atividades.js', './js/modulos/rotina-viagem.js', './js/modulos/estoque-categorias.js',
  './js/servicos/estudos-servico.js', './js/modulos/estudos.js', './js/modulos/estudos-curso.js', './js/modulos/estudos-disciplina.js',
  './js/modulos/estudos-cursos.js', './js/modulos/duolingo.js', './js/modulos/unidades.js',
  './js/servicos/fin-servico.js', './js/modulos/financas.js', './js/modulos/fin-resumo.js', './js/modulos/fin-listas.js', './js/modulos/fin-lancar.js', './js/modulos/fin-config.js',
  './js/servicos/online-servico.js', './js/servicos/precos-servico.js', './js/servicos/backup-servico.js', './js/modulos/busca.js', './js/modulos/fin-assinaturas.js', './js/servicos/pessoal-servico.js', './js/modulos/estudos-metas.js', './js/modulos/estudos-leituras.js', './js/servicos/agenda-servico.js', './js/modulos/agenda.js', './js/gcal.js', './js/modulos/online.js',
  './fontes/fraunces-latin-wght-normal.woff2', './fontes/inter-latin-400-normal.woff2', './fontes/inter-latin-500-normal.woff2', './fontes/inter-latin-600-normal.woff2',
  './fontes/inter-latin-700-normal.woff2', './fontes/ibm-plex-mono-latin-500-normal.woff2', './fontes/ibm-plex-mono-latin-600-normal.woff2',
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
      const rede = fetch(e.request, { cache: 'no-cache' }); // sempre confere com o servidor se há versão nova
      const resp = await Promise.race([rede, new Promise((_, rej) => setTimeout(() => rej('lento'), 2500))]);
      if (resp.ok) cache.put(e.request, resp.clone());
      return resp;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
    }
  })());
});
