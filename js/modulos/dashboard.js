// Início (Dashboard): cartões por módulo (detalhamento na etapa própria).
import { computed } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, fmtNum } from '../db.js';
import { avisar } from '../ui.js';
import { mapaSaldos } from '../servicos/estoque-servico.js';
import { criarCalc, hojeStr, lerCfgAgua, beber, garantirAgua } from '../servicos/rotina-servico.js';

export default {
  emits: ['ir'],
  setup() {
    garantirAgua();
    const itens = vivo(() => db.itens.filter((i) => !i.excluido).toArray(), []);
    const saldos = vivo(() => mapaSaldos(), {});
    const nLista = vivo(() => db.lista.where('status').equals('pendente').filter((l) => !l.excluido).count(), 0);
    const nZerados = computed(() => itens.value.filter((i) => (saldos.value[i.id] || 0) <= 0).length);
    const atividades = vivo(() => db.atividades.toArray(), []);
    const marcacoes = vivo(() => db.marcacoes.toArray(), []);
    const agua = vivo(() => db.agua.toArray(), []);
    const cfg = vivo(() => lerCfgAgua(), null);
    const viagens = vivo(() => db.viagens.toArray(), []);
    const hoje = hojeStr();
    const calc = computed(() => cfg.value && criarCalc({ atividades: atividades.value, marcacoes: marcacoes.value, agua: agua.value, cfg: cfg.value, hoje, viagens: viagens.value }));
    const rotina = computed(() => { const d = calc.value?.dia(hoje); if (d?.viagem) return { pct: '–', txt: 'dia de viagem' }; return d && d.t ? { pct: Math.round(d.f / d.t * 100), txt: `${d.f} de ${d.t} feitas` } : { pct: '–', txt: 'sem atividades' }; });
    const litros = computed(() => calc.value?.litros(hoje) || 0);
    const meta = computed(() => calc.value?.cfgEm(hoje).meta || 3);
    const garrafa = computed(() => cfg.value?.recipientes?.[0]);
    async function addGarrafa() { if (!garrafa.value) return; await beber(garrafa.value.ml); avisar(`+${garrafa.value.ml} ml (${garrafa.value.nome})`); }
    const irRotina = (aba) => { sessionStorage.setItem('rotinaAba', aba); };
    const dataTxt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return { nZerados, nLista, rotina, litros, meta, garrafa, addGarrafa, irRotina, dataTxt, fmtNum };
  },
  template: `
  <section class="pilha">
    <p class="suave">{{ dataTxt }}</p>
    <div class="cartoes">
      <button class="cartao" @click="irRotina('semana'); $emit('ir','rotina')"><span class="suave">Rotina hoje</span><b>{{ rotina.pct }}{{ rotina.pct === '–' ? '' : '%' }}</b><span class="suave">{{ rotina.txt }}</span></button>
      <div class="cartao">
        <span class="suave">Água hoje</span><b>{{ fmtNum(litros) }} L</b>
        <span class="barra"><i :style="{ width: Math.min(100, litros / meta * 100) + '%' }"></i></span>
        <button v-if="garrafa" class="btn primario" @click="addGarrafa">+ {{ garrafa.nome }}</button>
      </div>
      <button class="cartao" @click="$emit('ir','estoque')"><span class="suave">Estoque zerado</span><b class="alerta">{{ nZerados }}</b><span class="suave">itens</span></button>
      <button class="cartao" @click="$emit('ir','compras')"><span class="suave">Lista de compras</span><b>{{ nLista }}</b><span class="suave">pendentes</span></button>
      <div class="cartao futuro"><span class="suave">Estudos</span><span>Etapa futura</span></div>
    </div>
  </section>`
};
