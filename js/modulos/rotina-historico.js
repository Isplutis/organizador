// Rotina > Histórico: calendário mensal colorido pelo % de cada dia.
import { ref, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import * as R from '../servicos/rotina-servico.js';

const cor = (p) => (p >= 90 ? 'c4' : p >= 70 ? 'c3' : p >= 50 ? 'c2' : 'c1');
const TXT = { f: 'Feita', n: 'Falha', p: 'Pendente', x: 'Futuro' };

export default {
  setup() {
    const r = inject('rot');
    const c = computed(() => r.calc.value);
    const mes = ref(r.hoje.value.slice(0, 7)); // 'AAAA-MM'
    const sel = ref(r.hoje.value);
    const ini = computed(() => mes.value + '-01');
    const fim = computed(() => { const d = R.pd(ini.value); return R.ds(new Date(d.getFullYear(), d.getMonth() + 1, 0)); });
    const titulo = computed(() => { const m = R.pd(ini.value).toLocaleDateString('pt-BR', { month: 'long' }); return m[0].toUpperCase() + m.slice(1) + ' ' + ini.value.slice(0, 4); });
    const mudar = (n) => { const d = R.pd(ini.value); mes.value = R.ds(new Date(d.getFullYear(), d.getMonth() + n, 1)).slice(0, 7); };
    const ehAtual = computed(() => mes.value === r.hoje.value.slice(0, 7));
    const inicio = computed(() => c.value.inicioDados());
    const celulas = computed(() => {
      const out = [], vazias = (R.pd(ini.value).getDay() + 6) % 7;
      for (let i = 0; i < vazias; i++) out.push({ k: 'v' + i, vazio: true });
      for (let s = ini.value; s <= fim.value; s = R.somaDias(s, 1)) {
        const d = c.value.dia(s), fut = s > r.hoje.value, sem = s < inicio.value || !d.t;
        out.push({ k: s, s, num: R.pd(s).getDate(), fut, classe: fut ? 'fut' : sem ? 'sem' : cor(d.f / d.t * 100), hoje: s === r.hoje.value });
      }
      return out;
    });
    const pMes = computed(() => { const x = c.value.periodo(ini.value, fim.value); return x == null ? '–' : x + '%'; });
    const detalhe = computed(() => c.value.ocorrencias(sel.value).map((o) => ({ id: o.id, nome: o.a.nome + (o.hora ? ' (' + R.fmtHora(o.a, o.hora) + ')' : ''), st: c.value.status(o, sel.value) })));
    const pSel = computed(() => { const d = c.value.dia(sel.value); return d.t ? Math.round(d.f / d.t * 100) + '%' : '–'; });
    const tituloSel = computed(() => R.pd(sel.value).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }));
    const editavel = computed(() => R.podeEditar(sel.value, r.hoje.value));
    return { titulo, mudar, ehAtual, celulas, pMes, sel, detalhe, pSel, tituloSel, editavel, TXT };
  },
  template: `
  <div class="pilha">
    <div class="cab-mes">
      <button class="btn-mini" @click="mudar(-1)" aria-label="Mês anterior">‹</button>
      <b class="cresce centro">{{ titulo }} · {{ pMes }}</b>
      <button class="btn-mini" @click="mudar(1)" :disabled="ehAtual" aria-label="Próximo mês">›</button>
    </div>
    <div class="cal cab"><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span></div>
    <div class="cal">
      <template v-for="x in celulas" :key="x.k">
        <span v-if="x.vazio"></span>
        <button v-else class="cel" :class="[x.classe, { hoje: x.hoje, sel: x.s===sel }]" :disabled="x.fut" @click="sel=x.s">{{ x.num }}</button>
      </template>
    </div>
    <div class="legenda"><span><i class="c4"></i>≥ 90%</span><span><i class="c3"></i>70–89%</span><span><i class="c2"></i>50–69%</span><span><i class="c1"></i>&lt; 50%</span><span><i class="sem"></i>sem dados</span></div>
    <div class="caixa pilha">
      <div class="entre"><b>{{ tituloSel }}</b><b>{{ pSel }}</b></div>
      <p v-if="!detalhe.length" class="suave">Nenhuma atividade neste dia.</p>
      <div v-for="d in detalhe" :key="d.id" class="entre item-hist"><span>{{ d.nome }}</span><span class="selo-st" :class="d.st">{{ TXT[d.st] }}</span></div>
      <p class="dica">{{ editavel ? 'Para alterar, use a aba Semana.' : 'Somente leitura.' }}</p>
    </div>
  </div>`
};
