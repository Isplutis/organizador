// Módulo Rotina: carrega os dados, abas (Semana | Histórico | Falhas | Água) e o cadastro.
import { ref, computed, provide, onUnmounted } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { criarCalc, hojeStr, lerCfgAgua } from '../servicos/rotina-servico.js';
import { diasDeEstudo } from '../servicos/estudos-servico.js';
import Semana from './rotina-semana.js';
import Historico from './rotina-historico.js';
import Falhas from './rotina-falhas.js';
import Agua from './agua.js';
import Form from './rotina-form.js';
import Atividades from './rotina-atividades.js';
import Viagem from './rotina-viagem.js';

export default {
  components: { Semana, Historico, Falhas, Agua, Form, Atividades, Viagem },
  setup() {
    const atividades = vivo(() => db.atividades.toArray(), []);
    const marcacoes = vivo(() => db.marcacoes.toArray(), []);
    const agua = vivo(() => db.agua.toArray(), []);
    const cfg = vivo(() => lerCfgAgua(), null);
    const viagens = vivo(() => db.viagens.toArray(), []);
    const sessoes = vivo(() => db.sessoes.toArray(), []);
    const inicioCont = vivo(() => db.meta.get('inicioContagem'), null);
    const metasEstudo = vivo(async () => Object.fromEntries((await db.meta.filter((m) => m.chave.startsWith('estudoMeta-')).toArray()).map((m) => [m.chave, m.minutos])), {});
    const hoje = ref(hojeStr());
    const t = setInterval(() => { hoje.value = hojeStr(); }, 60000); // vira o dia com o app aberto
    onUnmounted(() => clearInterval(t));
    const calc = computed(() => cfg.value && criarCalc({ atividades: atividades.value, marcacoes: marcacoes.value, agua: agua.value, cfg: cfg.value, hoje: hoje.value, viagens: viagens.value, estudoDias: diasDeEstudo(sessoes.value, metasEstudo.value), inicio: inicioCont.value?.data || '' }));

    const aba = ref(sessionStorage.getItem('rotinaAba') || 'semana');
    const irAba = (k) => { aba.value = k; sessionStorage.setItem('rotinaAba', k); };
    const form = ref(null); // null = fechado; {} = nova; atividade = editar
    const viagem = ref(null); // null = fechado; { inicio } = nova; viagem = editar
    provide('rot', { calc, atividades, agua, cfg, hoje, editar: (a) => { form.value = a || {}; }, abrirViagem: (v) => { viagem.value = v; }, irAba });

    const abas = [['semana', 'Semana'], ['historico', 'Histórico'], ['falhas', 'Falhas'], ['agua', 'Água'], ['atividades', 'Atividades']];
    const comp = { semana: 'Semana', historico: 'Historico', falhas: 'Falhas', agua: 'Agua', atividades: 'Atividades' };
    return { calc, aba, irAba, abas, comp, form, viagem };
  },
  template: `
  <section class="pilha">
    <div class="abas-seg cinco">
      <button v-for="[k, n] in abas" :key="k" :class="{ ativo: aba===k }" @click="irAba(k)">{{ n }}</button>
    </div>
    <component v-if="calc" :is="comp[aba]"></component>
    <Form v-if="form" :atividade="form" @fechar="form=null"></Form>
    <Viagem v-if="viagem" :viagem="viagem" @fechar="viagem=null"></Viagem>
  </section>`
};
