// Revisão do período: o usuário escolhe o período e exporta quando quiser (nada automático).
import { ref, computed } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, fmtNum } from '../db.js';
import * as R from '../servicos/rotina-servico.js';
import * as A from '../servicos/agenda-servico.js';
import { desbloqueadoRecente, fmtR } from '../servicos/fin-servico.js';
import { gcal } from '../gcal.js';

const segunda = (s) => R.somaDias(s, -((R.pd(s).getDay() + 6) % 7));
export default {
  props: { calc: Object },
  emits: ['fechar'],
  setup(props) {
    const hoje = R.hojeStr();
    const atalho = ref('semana-passada');
    const de = ref(R.somaDias(segunda(hoje), -7)), ate = ref(R.somaDias(segunda(hoje), -1));
    function usar(k) {
      atalho.value = k;
      const seg = segunda(hoje), m = hoje.slice(0, 7), [a, mm] = m.split('-').map(Number);
      if (k === 'semana-passada') { de.value = R.somaDias(seg, -7); ate.value = R.somaDias(seg, -1); }
      if (k === 'esta-semana') { de.value = seg; ate.value = R.somaDias(seg, 6); }
      if (k === 'mes-passado') { const ini = new Date(a, mm - 2, 1); de.value = R.ds(ini); ate.value = R.ds(new Date(a, mm - 1, 0)); }
      if (k === 'este-mes') { de.value = m + '-01'; ate.value = R.ds(new Date(a, mm, 0)); }
    }
    const fin = desbloqueadoRecente();
    const D = {
      sessoes: vivo(() => db.sessoes.toArray(), []), marcacoes: vivo(() => db.marcacoes.toArray(), []), pedidos: vivo(() => db.oPedidos.toArray(), []),
      precos: vivo(() => db.precosMercado.toArray(), []), leituras: vivo(() => db.pLeituras.toArray(), []), lancs: vivo(() => fin ? db.fLanc.toArray() : [], []),
      categorias: vivo(() => fin ? db.fCategorias.toArray() : [], []), compromissos: vivo(() => db.aCompromissos.toArray(), []), fixas: vivo(() => db.fFixas.toArray(), []),
      cartoes: vivo(() => db.fCartoes.toArray(), []), viagens: vivo(() => db.viagens.toArray(), []), cursos: vivo(() => db.cursos.toArray(), []), disciplinas: vivo(() => db.disciplinas.toArray(), [])
    };
    const valido = computed(() => de.value && ate.value && de.value <= ate.value && R.difDias(ate.value, de.value) <= 366);
    const P = computed(() => {
      const c = props.calc; if (!c || !valido.value) return null;
      const no = (s) => s && s >= de.value && s <= ate.value;
      const fimC = ate.value < hoje ? ate.value : hoje;
      let f = 0, t = 0, falhas = 0, aguaOk = 0, litros = 0, nd = 0;
      for (let s = de.value; s <= fimC; s = R.somaDias(s, 1)) {
        nd++;
        const d = c.dia(s); if (d && !d.viagem && !d.antes) { f += d.f; t += d.t; }
        if (s < hoje) for (const o of c.ocorrencias(s)) if (c.status(o, s) === 'n') falhas++;
        const l = c.litros(s); litros += l; if (l >= c.cfgEm(s).limiar) aguaOk++;
      }
      const minEst = D.sessoes.value.filter((x) => !x.excluido && no(x.data)).reduce((a, x) => a + x.minutos, 0);
      const duo = new Set(D.marcacoes.value.filter((m) => m.atividadeId === 'duolingo' && (m.valor === 'f' || m.valor === 'o') && no(m.data)).map((m) => m.data)).size;
      const entregues = D.pedidos.value.filter((p) => !p.excluido && p.status === 'entregue' && no(p.entregueEm));
      const mercado = D.precos.value.filter((r) => !r.excluido && no(r.data)).reduce((a, r) => a + (r.total || 0), 0);
      const leit = D.leituras.value.filter((l) => !l.excluido && l.status === 'concluido' && no(l.fim));
      let gastos = null;
      if (fin) {
        const catPor = Object.fromEntries(D.categorias.value.map((x) => [x.id, x]));
        const topo = (id) => { let x = catPor[id]; while (x?.paiId && catPor[x.paiId]) x = catPor[x.paiId]; return x; };
        const ls = D.lancs.value.filter((l) => !l.excluido && l.tipo === 'desp' && no(l.data));
        const por = {}; for (const l of ls) { const n = topo(l.categoriaId)?.nome || 'Sem categoria'; por[n] = (por[n] || 0) + (l.valorBRL ?? l.valor); }
        gastos = { total: ls.reduce((a, l) => a + (l.valorBRL ?? l.valor), 0), top: Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 5) };
      }
      return { nd, pct: t ? Math.round(f / t * 100) : null, falhas, aguaOk, litrosMedia: nd ? litros / nd : 0, horas: minEst / 60, duo, entregues, mercado, leit, gastos };
    });
    const proxima = computed(() => {
      if (!valido.value) return [];
      const ini = R.somaDias(ate.value, 1), ctx = { hoje, calc: null, google: gcal.ativo ? gcal.google : [], ...Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.value])) };
      return Array.from({ length: 7 }, (_, i) => R.somaDias(ini, i)).map((s) => ({ s, itens: A.itensDoDia(s, ctx) })).filter((d) => d.itens.length);
    });
    const fdia = (s) => R.pd(s).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
    const fd = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
    const imprimir = () => window.print();
    return { atalho, usar, de, ate, valido, P, proxima, fdia, fd, fin, fmtR, fmtNum, imprimir, geradoEm: new Date().toLocaleString('pt-BR') };
  },
  template: `
  <section class="pilha revisao relatorio">
    <button class="btn-voltar nao-imprimir" @click="$emit('fechar')">‹ Início</button>
    <div class="pilha nao-imprimir">
      <div class="chips on-filtros"><button v-for="a in [['semana-passada','Semana passada'],['esta-semana','Esta semana'],['mes-passado','Mês passado'],['este-mes','Este mês']]" :key="a[0]" class="chip" :class="{ ativo: atalho===a[0] }" @click="usar(a[0])">{{ a[1] }}</button></div>
      <div class="grade-2"><label class="campo">De <input type="date" v-model="de" @change="atalho=''"></label><label class="campo">Até <input type="date" v-model="ate" @change="atalho=''"></label></div>
      <button class="btn primario" :disabled="!valido" @click="imprimir">Salvar PDF</button>
      <p v-if="!valido" class="alerta">Escolha um período válido (até 1 ano).</p>
    </div>
    <template v-if="P">
      <header class="rel-cab"><h2>Revisão · {{ fd(de) }} a {{ fd(ate) }}</h2><span class="suave">gerado em {{ geradoEm }}</span></header>
      <div class="trio">
        <div class="mini-cartao"><small>Rotina</small><b class="num">{{ P.pct == null ? '–' : P.pct + '%' }}</b><small>{{ P.falhas }} falha(s)</small></div>
        <div class="mini-cartao"><small>Água</small><b class="num">{{ P.aguaOk }}/{{ P.nd }}</b><small>média {{ fmtNum(Math.round(P.litrosMedia * 10) / 10) }} L</small></div>
        <div class="mini-cartao"><small>Estudo</small><b class="num">{{ fmtNum(Math.round(P.horas * 10) / 10) }} h</b><small>Duolingo {{ P.duo }}/{{ P.nd }}</small></div>
      </div>
      <h3 class="rotulo">Dinheiro</h3>
      <p v-if="!fin" class="dica">🔒 Abra Finanças e digite o PIN para incluir os gastos (vale 5 min).</p>
      <template v-else-if="P.gastos"><p>Gastos no período: <b class="num">{{ fmtR(P.gastos.total) }}</b></p><p v-if="P.gastos.top.length" class="dica">Mais gasto: {{ P.gastos.top.map(([n, v]) => n + ' ' + fmtR(v)).join(' · ') }}</p></template>
      <p v-if="P.mercado" class="dica">Compras de mercado registradas na lista: {{ fmtR(P.mercado) }}</p>
      <h3 class="rotulo">Conquistas</h3>
      <p v-if="!P.entregues.length && !P.leit.length" class="dica">Nenhuma compra recebida ou atividade concluída no período.</p>
      <p v-for="p in P.entregues" :key="p.id" class="dica">📦 Recebido: {{ p.nome }}</p>
      <p v-for="l in P.leit" :key="l.id" class="dica">✔ Concluído: {{ l.titulo }}{{ l.nota ? ' · ' + '★'.repeat(l.nota) : '' }}</p>
      <h3 class="rotulo">7 dias seguintes ao período</h3>
      <p v-if="!proxima.length" class="dica">Nada agendado.</p>
      <div v-for="d in proxima" :key="d.s" class="rev-dia"><b>{{ fdia(d.s) }}</b><span v-for="it in d.itens" :key="it.k" class="dica">{{ it.hora ? it.hora + ' · ' : '' }}{{ it.titulo }}</span></div>
    </template>
  </section>`
};
