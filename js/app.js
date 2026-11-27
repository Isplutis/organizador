// Estrutura do app: navegação, módulos e aviso rápido.
import { createApp, ref, computed } from '../lib/vue.esm-browser.prod.js';
import { ui } from './ui.js';
import { sync, iniciarSync, sincronizar } from './sync.js';
import { iniciarCalendar } from './gcal.js';
import Dashboard from './modulos/dashboard.js';
import Busca from './modulos/busca.js';
import Estoque from './modulos/estoque.js';
import Financas from './modulos/financas.js';
import Config from './modulos/config.js';
import Rotina from './modulos/rotina.js';
import Estudos from './modulos/estudos.js';
import { garantirAgua, migracoes } from './servicos/rotina-servico.js';
import { garantirEstudos } from './servicos/estudos-servico.js';
import { garantirFinancas } from './servicos/fin-servico.js';

const EmBreve = (nome) => ({ template: `<p class="vazio">${nome}: módulo de uma etapa futura.</p>` });

// Para adicionar um módulo: importe-o e inclua uma linha aqui.
const MODULOS = {
  inicio:     { titulo: 'Início',   comp: Dashboard, menu: true },
  rotina:     { titulo: 'Rotina',   comp: Rotina, menu: true },
  estudos:    { titulo: 'Desenvolvimento', curto: 'Desenvolv.', comp: Estudos, menu: true }, // Pós, Duolingo, Cursos, Metas, Hobbies
  financas:   { titulo: 'Finanças', comp: Financas, menu: true },
  compras:    { titulo: 'Compras',  comp: Estoque, menu: true }, // abas: Estoque | Lista | Categorias
  estoque:    { titulo: 'Compras',  comp: Estoque },            // endereço antigo
  mais:       { titulo: 'Configurações', comp: Config }
};

const ICONES = {
  inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  estudos: '<path d="M2 7l10-4 10 4-10 4z"/><path d="M6 9v5c0 1.7 2.7 3 6 3s6-1.3 6-3V9"/>',
  rotina: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  financas: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  compras: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
};

const App = {
  components: { Busca },
  setup() {
    const inicial = location.hash.slice(1);
    const aba = ref(MODULOS[inicial] ? inicial : 'inicio');
    const ir = (k) => { aba.value = k; location.hash = k; window.scrollTo(0, 0); };
    window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (MODULOS[k]) aba.value = k; });
    const menu = Object.entries(MODULOS).filter(([, m]) => m.menu).map(([k, m]) => ({ k, nome: m.curto || m.titulo, longo: m.titulo, icone: ICONES[k] }));
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
    const buscaAberta = ref(false), recarga = ref(0);
    const irBusca = (k) => { recarga.value++; ir(k); }; // recria a tela para aplicar a aba escolhida
    return { aba, ir, menu, atual, ui, online, selo, clicarSelo, buscaAberta, irBusca, recarga };
  },
  template: `
  <div class="casca">
    <nav class="menu" aria-label="Menu principal">
      <span class="marca"><svg class="marca-amp" viewBox="0 0 86 120" aria-hidden="true"><path d="M16 10h54c0 22-18 32-24 50 6 18 24 28 24 50H16c0-22 18-32 24-50-6-18-24-28-24-50z" fill="none" stroke="#D4AF37" stroke-width="7"/><path d="M22 108c2-14 13-20 21-26 8 6 19 12 21 26z" fill="#E8CF7A"/></svg> Organizador</span>
      <button v-for="m in menu" :key="m.k" :class="{ ativo: aba===m.k }" @click="ir(m.k)" :aria-current="aba===m.k ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true" v-html="m.icone"></svg><span class="m-curto">{{ m.nome }}</span><span class="m-longo">{{ m.longo }}</span>
      </button>
    </nav>
    <div class="conteudo">
      <header class="topo">
        <h1><svg class="marca-amp" viewBox="0 0 86 120" aria-hidden="true"><path d="M16 10h54c0 22-18 32-24 50 6 18 24 28 24 50H16c0-22 18-32 24-50-6-18-24-28-24-50z" fill="none" stroke="#D4AF37" stroke-width="7"/><path d="M22 108c2-14 13-20 21-26 8 6 19 12 21 26z" fill="#E8CF7A"/></svg>{{ atual.titulo }}</h1>
        <div class="topo-acoes">
          <button class="selo" :class="selo.cls" @click="clicarSelo">{{ selo.txt }}</button>
          <button class="btn-engr" @click="buscaAberta=true" aria-label="Buscar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button>
          <button class="btn-engr" @click="ir('mais')" aria-label="Configurações"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>
        </div>
      </header>
      <main><component :is="atual.comp" :key="aba + recarga" @ir="ir"></component></main>
    </div>
    <Busca v-if="buscaAberta" @fechar="buscaAberta=false" @ir="irBusca"></Busca>
    <div v-if="ui.toast" class="toast" role="status">{{ ui.toast }}</div>
  </div>`
};

// Dados automáticos (ids fixos, não duplicam entre aparelhos)
garantirAgua().then(migracoes).then(garantirEstudos).then(garantirFinancas).catch((e) => console.error(e))
  .then(() => import('./servicos/online-servico.js')).then((m) => m.atualizarOnline()).catch(() => { /* compras online é opcional */ });

createApp(App).mount('#app');

// Pede ao navegador para não apagar os dados sozinho.
navigator.storage?.persist?.();

// Sincronização com o Google Drive
iniciarSync();
iniciarCalendar();

// Funcionamento offline
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
