// Módulo Rotina: carrega os dados, abas (Semana | Histórico | Falhas | Água) e o cadastro.
import { ref, computed, provide, onUnmounted } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { criarCalc, hojeStr, lerCfgAgua, garantirAgua } from '../servicos/rotina-servico.js';
import Semana from './rotina-semana.js';
import Historico from './rotina-historico.js';
import Falhas from './rotina-falhas.js';
import Agua from './agua.js';
import Form from './rotina-form.js';

export default {
  components: { Semana, Historico, Falhas, Agua, Form },
  setup() {
    garantirAgua();
    const atividades = vivo(() => db.atividades.toArray(), []);
    const marcacoes = vivo(() => db.marcacoes.toArray(), []);
    const agua = vivo(() => db.agua.toArray(), []);
    const cfg = vivo(() => lerCfgAgua(), null);
    const hoje = ref(hojeStr());
    const t = setInterval(() => { hoje.value = hojeStr(); }, 60000); // vira o dia com o app aberto
    onUnmounted(() => clearInterval(t));
    const calc = computed(() => cfg.value && criarCalc({ atividades: atividades.value, marcacoes: marcacoes.value, agua: agua.value, cfg: cfg.value, hoje: hoje.value }));

    const aba = ref(sessionStorage.getItem('rotinaAba') || 'semana');
    const irAba = (k) => { aba.value = k; sessionStorage.setItem('rotinaAba', k); };
    const form = ref(null); // null = fechado; {} = nova; atividade = editar
    provide('rot', { calc, atividades, agua, cfg, hoje, editar: (a) => { form.value = a || {}; }, irAba });

    const abas = [['semana', 'Semana'], ['historico', 'Histórico'], ['falhas', 'Falhas'], ['agua', 'Água']];
    const comp = { semana: 'Semana', historico: 'Historico', falhas: 'Falhas', agua: 'Agua' };
    return { calc, aba, irAba, abas, comp, form };
  },
  template: `
  <section class="pilha">
    <div class="abas-seg">
      <button v-for="[k, n] in abas" :key="k" :class="{ ativo: aba===k }" @click="irAba(k)">{{ n }}</button>
    </div>
    <component v-if="calc" :is="comp[aba]"></component>
    <Form v-if="form" :atividade="form" @fechar="form=null"></Form>
  </section>`
};
