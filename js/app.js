// Estrutura do app: navegação, módulos e aviso rápido.
import { createApp, ref, computed } from '../lib/vue.esm-browser.prod.js';
import { ui } from './ui.js';
import { sync, iniciarSync, sincronizar } from './sync.js';
import Dashboard from './modulos/dashboard.js';
import Estoque from './modulos/estoque.js';
import Compras from './modulos/compras.js';
import Config from './modulos/config.js';
import Rotina from './modulos/rotina.js';
import Estudos from './modulos/estudos.js';
import { garantirAgua, migracoes } from './servicos/rotina-servico.js';
import { garantirEstudos } from './servicos/estudos-servico.js';

const EmBreve = (nome) => ({ template: `<p class="vazio">${nome}: módulo de uma etapa futura.</p>` });

// Para adicionar um módulo: importe-o e inclua uma linha aqui.
const MODULOS = {
  inicio:     { titulo: 'Início',           comp: Dashboard, menu: true },
  rotina:     { titulo: 'Rotina',           comp: Rotina, menu: true },
  estudos:    { titulo: 'Estudos',          comp: Estudos, menu: true },
  estoque:    { titulo: 'Estoque',          comp: Estoque, menu: true },
  compras:    { titulo: 'Lista de compras', comp: Compras },
  atividades: { titulo: 'Atividades',       comp: EmBreve('Atividades') },
  mais:       { titulo: 'Mais',             comp: Config, menu: true }
};

const ICONES = {
  inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  estudos: '<path d="M2 7l10-4 10 4-10 4z"/><path d="M6 9v5c0 1.7 2.7 3 6 3s6-1.3 6-3V9"/>',
  rotina: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  estoque: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  compras: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
  mais: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
};

const App = {
  setup() {
    const inicial = location.hash.slice(1);
    const aba = ref(MODULOS[inicial] ? inicial : 'inicio');
    const ir = (k) => { aba.value = k; location.hash = k; window.scrollTo(0, 0); };
    window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (MODULOS[k]) aba.value = k; });
    const menu = Object.entries(MODULOS).filter(([, m]) => m.menu).map(([k, m]) => ({ k, nome: m.curto || m.titulo, icone: ICONES[k] }));
    const atual = computed(() => MODULOS[aba.value]);
    const online = ref(navigator.onLine);
    addEventListener('online', () => { online.value = true; });
    addEventListener('offline', () => { online.value = false; });
    const selo = computed(() => {
      if (!online.value) return { txt: 'Offline', cls: 'off' };
      const e = sync.estado;
      if (e === 'sincronizando') return { txt: 'Sincronizando…', cls: '' };
      if (e === 'ok') return { txt: '✓ Sincronizado', cls: '' };
      if (e === 'reconectar') return { txt: 'Reconectar Google', cls: 'off', acao: true };
      if (e === 'erro') return { txt: 'Erro na sincronização', cls: 'off' };
      return { txt: 'Online', cls: '' };
    });
    const clicarSelo = () => { if (selo.value.acao) sincronizar({ interativo: true }); else ir('mais'); };
    return { aba, ir, menu, atual, ui, online, selo, clicarSelo };
  },
  template: `
  <div class="casca">
    <nav class="menu" aria-label="Menu principal">
      <span class="marca">Organizador</span>
      <button v-for="m in menu" :key="m.k" :class="{ ativo: aba===m.k }" @click="ir(m.k)" :aria-current="aba===m.k ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true" v-html="m.icone"></svg><span>{{ m.nome }}</span>
      </button>
    </nav>
    <div class="conteudo">
      <header class="topo">
        <h1>{{ atual.titulo }}</h1>
        <button class="selo" :class="selo.cls" @click="clicarSelo">{{ selo.txt }}</button>
      </header>
      <main><component :is="atual.comp" :key="aba" @ir="ir"></component></main>
    </div>
    <div v-if="ui.toast" class="toast" role="status">{{ ui.toast }}</div>
  </div>`
};

// Dados automáticos (ids fixos, não duplicam entre aparelhos)
garantirAgua().then(migracoes).then(garantirEstudos).catch((e) => console.error(e));

createApp(App).mount('#app');

// Pede ao navegador para não apagar os dados sozinho.
navigator.storage?.persist?.();

// Sincronização com o Google Drive
iniciarSync();

// Funcionamento offline
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
