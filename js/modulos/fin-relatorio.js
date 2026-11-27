// Finanças › Relatório (mês ou ano), pronto para "Imprimir › Salvar como PDF".
import { ref, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import * as F from '../servicos/fin-servico.js';
import { hojeStr } from '../servicos/rotina-servico.js';

export default {
  setup() {
    const { D, cot, visao, mes } = inject('fin');
    const modo = ref('mes'), ano = ref(mes.value.slice(0, 4)), mesSel = ref(mes.value), mesDe = ref(F.addMes(mes.value, -2)), mesAte = ref(mes.value);
    const hoje = hojeStr();
    const base = computed(() => ({ contas: D.contas.value, cartoes: D.cartoes.value, categorias: D.categorias.value, caixinhas: D.caixinhas.value, fixas: D.fixas.value, lancs: D.lancs.value, cotacao: cot.value.valor, hoje, inicio: D.inicio.value?.data || '' }));
    const fin = (m) => F.criarFin(base.value, visao.value, m);
    // patrimônio no fim do mês: contas + caixinhas − tudo que falta pagar nos cartões (com lançamentos até aquele dia)
    const fimDoMes = (m) => { const [a, mm] = m.split('-').map(Number); return `${m}-${String(new Date(a, mm, 0).getDate()).padStart(2, '0')}`; };
    const patrimonio = (m) => {
      const fim = fimDoMes(m), compraDe = {};
      for (const l of base.value.lancs) if (l.grupoId && (!compraDe[l.grupoId] || l.data < compraDe[l.grupoId])) compraDe[l.grupoId] = l.data;
      // parcelas futuras de compras já feitas contam como dívida do cartão
      const f = F.criarFin({ ...base.value, lancs: base.value.lancs.filter((l) => l.data <= fim || (l.grupoId && compraDe[l.grupoId] <= fim)) }, visao.value, m); return f.saldoTotal - f.cartoes.reduce((a, k) => a + Math.max(0, k.usado), 0); };
    // câmbio médio: conversões US$→R$ e recebimentos em US$ dentro dos meses
    const cambio = (meses) => {
      const ls = base.value.lancs.filter((l) => !l.excluido && meses.includes(l.data.slice(0, 7)));
      const conv = ls.filter((l) => l.tipo === 'transf' && l.de?.moeda === 'USD' && (l.para?.moeda || 'BRL') === 'BRL' && l.valorDe > 0);
      const rec = ls.filter((l) => l.tipo === 'rec' && l.moeda === 'USD' && l.valor > 0);
      const sd = conv.reduce((a, l) => a + l.valorDe, 0), sp = conv.reduce((a, l) => a + l.valorPara, 0);
      const ru = rec.reduce((a, l) => a + l.valor, 0), rb = rec.reduce((a, l) => a + (l.valorBRL ?? l.valor * (l.cotacao || 0)), 0);
      return { conv: sd ? { usd: sd, brl: sp, taxa: sp / sd, n: conv.length } : null, rec: ru ? { usd: ru, brl: rb, taxa: rb / ru, n: rec.length } : null };
    };
    const nomeVisao = computed(() => ({ pf: 'Pessoal', pj: 'Empresa', tudo: 'Tudo (consolidado)' })[visao.value]);
    const nomeMes = (m) => new Date(m + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const curto = (m) => new Date(m + '-15T12:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

    // ---- Mensal ----
    const M = computed(() => {
      const f = fin(mesSel.value), ant = [1, 2, 3].map((i) => fin(F.addMes(mesSel.value, -i)));
      const mediaCat = (id) => { const v = ant.map((a) => a.categoriasV.find((c) => c.id === id)?.total || 0).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const cats = f.categoriasV.filter((c) => c.total > 0).map((c) => { const md = mediaCat(c.id); return { ...c, pctTotal: f.despesas ? Math.round(c.total / f.despesas * 100) : 0, media: md, varPct: md ? Math.round((c.total - md) / md * 100) : null, cor: F.tom(c.hue, 0) }; });
      const maiores = f.lancsMes.filter((l) => l.tipo === 'desp').sort((a, b) => b.mostra - a.mostra).slice(0, 10);
      const despAnt = ant.map((a) => a.despesas).filter((x) => x > 0);
      const assin = F.assinaturas(D.fixas.value, D.lancs.value, cot.value.valor, hoje);
      return { f, cats, maiores, mediaDesp: despAnt.length ? despAnt.reduce((a, b) => a + b, 0) / despAnt.length : null, assin, estouros: cats.filter((c) => c.pct >= 100), patrimonio: patrimonio(mesSel.value), cambio: cambio([mesSel.value]) };
    });
    // ---- Anual ----
    const A = computed(() => {
      let meses;
      if (modo.value === 'intervalo') { meses = []; for (let m = mesDe.value; m && m <= mesAte.value && meses.length < 36; m = F.addMes(m, 1)) meses.push(m); }
      else meses = Array.from({ length: 12 }, (_, i) => `${ano.value}-${String(i + 1).padStart(2, '0')}`).filter((m) => m <= hoje.slice(0, 7));
      let acum = 0;
      const todas = meses.map((m) => ({ m, f: fin(m) }));
      const primeiro = todas.findIndex((x) => x.f.entradas > 0 || x.f.despesas > 0);
      const linhas = (primeiro < 0 ? [] : (modo.value === 'intervalo' ? todas : todas.slice(primeiro))).map(({ m, f }) => { acum += f.resultado; return { m, entradas: f.entradas, despesas: f.despesas, resultado: f.resultado, acum: Math.round(acum * 100) / 100, cats: f.categoriasV, patr: patrimonio(m) }; });
      const tot = { entradas: linhas.reduce((a, l) => a + l.entradas, 0), despesas: linhas.reduce((a, l) => a + l.despesas, 0) };
      tot.resultado = tot.entradas - tot.despesas;
      const porCat = {};
      for (const l of linhas) for (const c of l.cats) if (c.total > 0) { const x = (porCat[c.id] ||= { nome: c.nome, cor: F.tom(c.hue, 0), total: 0 }); x.total += c.total; }
      const cats = Object.values(porCat).sort((a, b) => b.total - a.total).map((c) => ({ ...c, pct: tot.despesas ? Math.round(c.total / tot.despesas * 100) : 0 }));
      const max = Math.max(1, ...linhas.map((l) => Math.max(l.entradas, l.despesas)));
      return { cambio: cambio(linhas.map((l) => l.m)), linhas, tot, cats, max, mediaDesp: linhas.length ? tot.despesas / linhas.length : 0, taxa: tot.entradas ? Math.round(tot.resultado / tot.entradas * 100) : null };
    });
    const imprimir = () => window.print();
    const mudar = (n) => { if (modo.value === 'mes') mesSel.value = F.addMes(mesSel.value, n); else ano.value = String(+ano.value + n); };
    const titulo = computed(() => modo.value === 'mes' ? nomeMes(mesSel.value) : modo.value === 'ano' ? ano.value : `${nomeMes(mesDe.value)} a ${nomeMes(mesAte.value)}`);
    const fmtT = (x) => x.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    const seta = (v) => v == null ? '' : v > 0 ? `▲ ${v}%` : v < 0 ? `▼ ${-v}%` : '=';
    const fd = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
    return { titulo, fmtT, mesDe, mesAte, modo, ano, mesSel, M, A, nomeVisao, nomeMes, curto, imprimir, mudar, seta, fd, fmtR: F.fmtR, geradoEm: new Date().toLocaleString('pt-BR') };
  },
  template: `
  <div class="pilha relatorio">
    <div class="entre nao-imprimir">
      <div class="seg-visao"><button :class="{ ativo: modo==='mes' }" @click="modo='mes'">Mês</button><button :class="{ ativo: modo==='ano' }" @click="modo='ano'">Ano</button><button :class="{ ativo: modo==='intervalo' }" @click="modo='intervalo'">Período</button></div>
      <button class="btn primario" @click="imprimir">Salvar PDF</button>
    </div>
    <div v-if="modo==='intervalo'" class="grade-2 nao-imprimir"><label class="campo">De (mês) <input type="month" v-model="mesDe"></label><label class="campo">Até (mês) <input type="month" v-model="mesAte"></label></div>
    <div v-else class="cab-mes nao-imprimir"><button class="btn-mini" @click="mudar(-1)" aria-label="Anterior">‹</button><b class="cresce centro">{{ modo==='mes' ? nomeMes(mesSel) : ano }}</b><button class="btn-mini" @click="mudar(1)" aria-label="Próximo">›</button></div>

    <header class="rel-cab"><h2>Relatório financeiro · {{ titulo }}</h2><span class="suave">Visão: {{ nomeVisao }} · gerado em {{ geradoEm }}</span></header>

    <template v-if="modo==='mes'">
      <div class="trio">
        <div class="mini-cartao"><small>Entradas</small><b class="num pos">{{ fmtR(M.f.entradas) }}</b></div>
        <div class="mini-cartao"><small>Despesas</small><b class="num neg">{{ fmtR(M.f.despesas) }}</b></div>
        <div class="mini-cartao"><small>Sobra</small><b class="num" :class="M.f.resultado >= 0 ? 'pos' : 'neg'">{{ fmtR(M.f.resultado) }}</b></div>
      </div>
      <p class="dica">Patrimônio no fim do mês (contas + caixinhas − cartões a pagar): <b>{{ fmtR(M.patrimonio) }}</b></p>
      <p v-if="M.cambio.conv || M.cambio.rec" class="dica">Câmbio médio: <template v-if="M.cambio.rec">recebimentos US$ 1 = R$ {{ fmtT(M.cambio.rec.taxa) }} ({{ M.cambio.rec.n }})</template><template v-if="M.cambio.rec && M.cambio.conv"> · </template><template v-if="M.cambio.conv">conversões US$ 1 = R$ {{ fmtT(M.cambio.conv.taxa) }} ({{ M.cambio.conv.n }})</template></p>
      <p class="dica">Saldo atual das contas e caixinhas: <b>{{ fmtR(M.f.saldoTotal) }}</b><template v-if="M.mediaDesp"> · média de despesas dos 3 meses anteriores: {{ fmtR(M.mediaDesp) }} ({{ seta(Math.round((M.f.despesas - M.mediaDesp) / M.mediaDesp * 100)) }})</template></p>
      <h3 class="rotulo">Para onde foi o dinheiro</h3>
      <p v-if="!M.cats.length" class="vazio">Sem despesas neste mês.</p>
      <div v-for="c in M.cats" :key="c.id" class="rel-cat">
        <div class="entre"><span><i class="rel-cor" :style="{ background: c.cor }"></i>{{ c.nome }} <small class="suave">{{ c.pctTotal }}%</small></span><b class="num">{{ fmtR(c.total) }}</b></div>
        <span class="barra"><i :style="{ width: c.pctTotal + '%', background: c.cor }"></i></span>
        <small class="suave">{{ c.media != null ? 'média 3 meses ' + fmtR(c.media) + ' · ' + seta(c.varPct) : 'sem histórico' }}<template v-if="c.pct != null"> · orçamento {{ c.pct }}%</template></small>
        <small v-if="c.subs.length" class="suave rel-subs">{{ c.subs.map(s => s.nome + ' ' + fmtR(s.total)).join(' · ') }}</small>
      </div>
      <p v-if="M.estouros.length" class="alerta">Orçamento estourado: {{ M.estouros.map(c => c.nome + ' (' + c.pct + '%)').join(', ') }}</p>
      <h3 class="rotulo">Maiores despesas</h3>
      <div class="rel-tab"><div v-for="l in M.maiores" :key="l.id"><span class="suave">{{ fd(l.data) }}</span><span class="cresce">{{ l.descricao }}<small class="suave"> · {{ l.sub }}</small></span><b class="num">{{ fmtR(l.mostra) }}</b></div></div>
      <h3 class="rotulo">Assinaturas</h3>
      <p class="dica">{{ M.assin.lista.length }} assinaturas · {{ fmtR(M.assin.mensal) }}/mês · {{ fmtR(M.assin.anual) }}/ano</p>
      <template v-if="M.f.metas.length"><h3 class="rotulo">Caixinhas</h3>
        <div class="rel-tab"><div v-for="x in M.f.metas" :key="x.id"><span class="cresce">{{ x.nome }} <small class="suave">{{ x.conta }}</small></span><span class="suave">{{ x.pct != null ? x.pct + '% da meta' : '' }}</span><b class="num">{{ fmtR(x.saldo) }}</b></div></div></template>
    </template>

    <template v-else>
      <div class="trio">
        <div class="mini-cartao"><small>Entradas{{ modo==='ano' ? ' no ano' : '' }}</small><b class="num pos">{{ fmtR(A.tot.entradas) }}</b></div>
        <div class="mini-cartao"><small>Despesas{{ modo==='ano' ? ' no ano' : '' }}</small><b class="num neg">{{ fmtR(A.tot.despesas) }}</b></div>
        <div class="mini-cartao"><small>Sobra{{ modo==='ano' ? ' no ano' : '' }}</small><b class="num" :class="A.tot.resultado >= 0 ? 'pos' : 'neg'">{{ fmtR(A.tot.resultado) }}</b></div>
      </div>
      <p class="dica">Despesa média por mês: {{ fmtR(A.mediaDesp) }}<template v-if="A.taxa != null"> · você guardou {{ A.taxa }}% do que entrou</template></p>
      <p v-if="A.cambio.conv || A.cambio.rec" class="dica">Câmbio médio: <template v-if="A.cambio.rec">recebimentos US$ 1 = R$ {{ fmtT(A.cambio.rec.taxa) }}</template><template v-if="A.cambio.rec && A.cambio.conv"> · </template><template v-if="A.cambio.conv">conversões US$ 1 = R$ {{ fmtT(A.cambio.conv.taxa) }}</template></p>
      <h3 class="rotulo">Mês a mês</h3>
      <div class="rel-barras"><div v-for="l in A.linhas" :key="l.m" class="rel-mes"><span class="rel-b"><i class="e" :style="{ height: (l.entradas / A.max * 100) + '%' }" :data-tip="curto(l.m) + ' · entradas ' + fmtR(l.entradas)"></i><i class="d" :style="{ height: (l.despesas / A.max * 100) + '%' }" :data-tip="curto(l.m) + ' · despesas ' + fmtR(l.despesas)"></i></span><small>{{ curto(l.m) }}</small></div></div>
      <p class="dica"><i class="rel-cor e"></i>entradas <i class="rel-cor d"></i>despesas</p>
      <div class="rel-tab"><div class="rel-th"><span class="cresce">Mês</span><span>Entradas</span><span>Despesas</span><span>Sobra acum.</span><span>Patrimônio</span></div>
        <div v-for="l in A.linhas" :key="l.m"><span class="cresce">{{ curto(l.m) }}</span><span class="num">{{ fmtR(l.entradas) }}</span><span class="num">{{ fmtR(l.despesas) }}</span><b class="num" :class="l.acum >= 0 ? 'pos' : 'neg'">{{ fmtR(l.acum) }}</b><span class="num">{{ fmtR(l.patr) }}</span></div></div>
      <h3 class="rotulo">Categorias {{ modo==='ano' ? 'no ano' : 'no período' }}</h3>
      <div v-for="c in A.cats" :key="c.nome" class="rel-cat"><div class="entre"><span><i class="rel-cor" :style="{ background: c.cor }"></i>{{ c.nome }} <small class="suave">{{ c.pct }}%</small></span><b class="num">{{ fmtR(c.total) }}</b></div><span class="barra" :data-tip="c.nome + ': ' + fmtR(c.total) + ' (' + c.pct + '%)'"><i :style="{ width: c.pct + '%', background: c.cor }"></i></span></div>
    </template>
  </div>`
};
