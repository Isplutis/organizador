// Módulo Saúde: Água e Sono (Academia no futuro).
import { ref, computed, provide, onUnmounted } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { criarCalc, hojeStr, lerCfgAgua } from '../servicos/rotina-servico.js';
import { diasDeEstudo } from '../servicos/estudos-servico.js';
import Agua from './agua.js';
import Sono from './sono.js';

export default {
  components: { Agua, Sono },
  setup() {
    const atividades = vivo(() => db.atividades.toArray(), []), marcacoes = vivo(() => db.marcacoes.toArray(), []), agua = vivo(() => db.agua.toArray(), []);
    const cfg = vivo(() => lerCfgAgua(), null), viagens = vivo(() => db.viagens.toArray(), []), sessoes = vivo(() => db.sessoes.toArray(), []);
    const inicioCont = vivo(() => db.meta.get('inicioContagem'), null);
    const metasEstudo = vivo(async () => Object.fromEntries((await db.meta.filter((m) => m.chave.startsWith('estudoMeta-')).toArray()).map((m) => [m.chave, m.minutos])), {});
    const hoje = ref(hojeStr()); const t = setInterval(() => { hoje.value = hojeStr(); }, 60000); onUnmounted(() => clearInterval(t));
    const calc = computed(() => cfg.value && criarCalc({ atividades: atividades.value, marcacoes: marcacoes.value, agua: agua.value, cfg: cfg.value, hoje: hoje.value, viagens: viagens.value, estudoDias: diasDeEstudo(sessoes.value, metasEstudo.value), inicio: inicioCont.value?.data || '' }));
    // a tela de Água usa o mesmo contexto da Rotina
    provide('rot', { calc, atividades, agua, cfg, hoje, contasHoje: ref([]), editar: () => {}, abrirViagem: () => {}, irAba: () => {} });
    const aba = ref(sessionStorage.getItem('saudeAba') || 'agua');
    const irAba = (k) => { aba.value = k; sessionStorage.setItem('saudeAba', k); };
    return { calc, aba, irAba };
  },
  template: `
  <section class="pilha">
    <div class="abas-seg"><button :class="{ ativo: aba==='agua' }" @click="irAba('agua')">Água</button><button :class="{ ativo: aba==='sono' }" @click="irAba('sono')">Sono</button></div>
    <Agua v-if="aba==='agua' && calc"></Agua>
    <Sono v-else-if="aba==='sono'"></Sono>
  </section>`
};
