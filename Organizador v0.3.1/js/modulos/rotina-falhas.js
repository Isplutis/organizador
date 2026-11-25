// Rotina > Falhas: ranking das atividades com maior taxa de falha.
import { ref, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import * as R from '../servicos/rotina-servico.js';

export default {
  setup() {
    const r = inject('rot');
    const per = ref('30');
    const periodos = [['30', '30 dias'], ['90', '3 meses'], ['tudo', 'Tudo']];
    const lista = computed(() => {
      const c = r.calc.value;
      const ini = per.value === 'tudo' ? c.inicioDados() : R.somaDias(r.hoje.value, -Number(per.value));
      return c.falhas(ini).map((f) => ({ ...f, sub: f.sub.map((s) => ({ ...s, nome: s.hora || 'sem horário' })) }));
    });
    return { per, periodos, lista };
  },
  template: `
  <div class="pilha">
    <div class="chips"><button v-for="[k, n] in periodos" :key="k" class="chip" :class="{ ativo: per===k }" @click="per=k">{{ n }}</button></div>
    <p v-if="!lista.length" class="vazio">Sem dados no período (conta até ontem).</p>
    <div v-for="f in lista" :key="f.id" class="pilha-p">
      <div class="entre"><b>{{ f.nome }}</b><span class="suave">{{ f.p }}% · falhou {{ f.n }} de {{ f.t }}{{ f.semanal ? ' semanas' : '' }}</span></div>
      <span class="barra grossa vermelha"><i :style="{ width: f.p + '%' }"></i></span>
      <div v-for="s in f.sub" :key="s.hora" class="sub-falha">
        <span>{{ s.nome }}</span><span class="barra vermelha cresce"><i :style="{ width: s.p + '%' }"></i></span><span>{{ s.p }}%</span>
      </div>
    </div>
    <p class="dica">Ordenado pela taxa de falha. Considera até ontem.</p>
  </div>`
};
