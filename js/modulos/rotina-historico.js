// Rotina > Histórico: calendário mensal colorido pelo % de cada dia.
import { ref, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import * as R from '../servicos/rotina-servico.js';

const cor = (p) => (p >= 90 ? 'c4' : p >= 70 ? 'c3' : p >= 50 ? 'c2' : 'c1');
const TXT = { f: 'Feita', o: 'Feita', n: 'Falha', p: 'Pendente', x: 'Futuro' };

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
    const ehAtual = computed(() => mes.value >= R.somaDias(r.hoje.value, 365).slice(0, 7)); // até 1 ano à frente
    const inicio = computed(() => c.value.inicioDados());
    const celulas = computed(() => {
      const out = [], vazias = (R.pd(ini.value).getDay() + 6) % 7;
      for (let i = 0; i < vazias; i++) out.push({ k: 'v' + i, vazio: true });
      for (let s = ini.value; s <= fim.value; s = R.somaDias(s, 1)) {
        const d = c.value.dia(s), fut = s > r.hoje.value, sem = s < inicio.value || !d.t;
        out.push({ k: s, s, num: R.pd(s).getDate(), fut, classe: d.viagem || c.value.viagemEm(s) ? 'viagem' : d.antes ? 'antes' : fut ? 'fut' : sem ? 'sem' : cor(d.f / d.t * 100), hoje: s === r.hoje.value });
      }
      return out;
    });
    const pMes = computed(() => { const x = c.value.periodo(ini.value, fim.value); return x == null ? '–' : x + '%'; });
    const detalhe = computed(() => c.value.ocorrencias(sel.value).map((o) => { const st = c.value.status(o, sel.value); return { id: o.id, nome: o.a.nome + (o.hora ? ' (' + R.fmtHora(o.a, o.hora) + ')' : ''), st, txt: st === 'o' ? o.a.outraPessoa + ' fez' : TXT[st] }; }));
    const pSel = computed(() => { const d = c.value.dia(sel.value); if (d.viagem) return '✈ viagem'; if (d.antes) return 'não conta'; return d.t ? Math.round(d.f / d.t * 100) + '%' : '–'; });
    const tituloSel = computed(() => R.pd(sel.value).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }));
    const editavel = computed(() => R.podeEditar(sel.value, r.hoje.value));
    const nomes = computed(() => Object.fromEntries(r.atividades.value.map((a) => [a.id, a.nome])));
    const fmt = (x) => R.pd(x).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const viagens = computed(() => [...c.value.trips].sort((a, b) => b.inicio.localeCompare(a.inicio)).map((v) => ({
      v, periodo: v.inicio === v.fim ? fmt(v.inicio) : fmt(v.inicio) + ' a ' + fmt(v.fim), dias: R.difDias(v.fim, v.inicio) + 1,
      ativs: v.atividades.map((id) => nomes.value[id]).filter(Boolean).join(', ') || 'nenhuma atividade',
      editavel: v.fim >= R.somaDias(r.hoje.value, -1) })));
    const totalDias = computed(() => viagens.value.reduce((s, x) => s + x.dias, 0));
    return { r, viagens, totalDias, titulo, mudar, ehAtual, celulas, pMes, sel, detalhe, pSel, tituloSel, editavel, TXT };
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
        <button v-else class="cel" :class="[x.classe, { hoje: x.hoje, sel: x.s===sel }]" @click="sel=x.s">{{ x.num }}</button>
      </template>
    </div>
    <div class="legenda"><span><i class="c4"></i>≥ 90%</span><span><i class="c3"></i>70–89%</span><span><i class="c2"></i>50–69%</span><span><i class="c1"></i>&lt; 50%</span><span><i class="sem"></i>sem dados</span><span><i class="viagem"></i>viagem</span><span><i class="antes"></i>antes do início</span></div>
    <div class="caixa pilha">
      <div class="entre"><b>{{ tituloSel }}</b><b>{{ pSel }}</b></div>
      <p v-if="!detalhe.length" class="suave">Nenhuma atividade neste dia.</p>
      <div v-for="d in detalhe" :key="d.id" class="entre item-hist"><span>{{ d.nome }}</span><span class="selo-st" :class="d.st">{{ d.txt }}</span></div>
      <p class="dica">{{ editavel ? 'Para alterar, use a aba Semana.' : 'Somente leitura.' }}</p>
    </div>
    <div class="entre"><h2 class="rotulo">Dias viajando · {{ totalDias }}</h2><button class="btn" @click="r.abrirViagem({ inicio: r.hoje.value })">✈ Nova viagem</button></div>
    <p v-if="!viagens.length" class="suave">Nenhuma viagem registrada.</p>
    <div v-for="x in viagens" :key="x.v.id" class="linha viagem-linha">
      <div class="linha-info"><strong>{{ x.periodo }} · {{ x.dias }} dia{{ x.dias > 1 ? 's' : '' }}</strong><span class="suave">{{ x.ativs }}</span></div>
      <button v-if="x.editavel" class="btn" @click="r.abrirViagem(x.v)">Editar</button>
    </div>
  </div>`
};
