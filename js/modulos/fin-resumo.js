// Finanças > Resumo: ampulheta + saldo, contas (cartões), cartões de crédito, vencimentos, projeção.
import { computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { avisar } from '../ui.js';
import { pd, hojeStr } from '../servicos/rotina-servico.js';
import * as F from '../servicos/fin-servico.js';

export default {
  setup() {
    const { fin, visao, abrirLanc, abrirConfig } = inject('fin');
    const f = computed(() => fin.value);
    const n = (x) => x.toFixed(1);
    // areia: em cima = o que ainda resta do que entrou no mês
    const areia = computed(() => {
      const r = f.value.resta, hw = (y) => 27 * Math.abs(60 - y) / 50, yT = 58 - 42 * r, yB = 110 - 40 * (1 - r);
      return { cima: r > 0.02 ? `${n(43 - hw(yT))},${n(yT)} ${n(43 + hw(yT))},${n(yT)} 43,58` : '', baixo: `16,110 70,110 ${n(43 + hw(yB))},${n(yB)} ${n(43 - hw(yB))},${n(yB)}` };
    });
    const rotSaldo = computed(() => ({ pf: 'Saldo pessoal', pj: 'Saldo da empresa', tudo: 'Patrimônio total' })[visao.value]);
    const rotEntradas = computed(() => visao.value === 'pf' ? 'Entradas (com retiradas)' : 'Receitas');
    const dataCurta = (s) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
    const estiloConta = (c) => ({ background: F.ESTILOS_CONTA[c.estilo] || F.ESTILOS_CONTA.marinho, color: F.ESTILO_ESCURO.has(c.estilo) ? '#0E1F06' : '#FFFFFF' });
    // projeção: linha real até hoje (reta simplificada) e trecho previsto com faixa
    const proj = computed(() => {
      const p = f.value.projecao; if (!p) return null;
      const vals = [f.value.saldoTotal, p.fim, p.min, p.max]; const mx = Math.max(...vals) * 1.05, mn = Math.min(...vals, 0);
      const y = (v) => (88 - (v - mn) / ((mx - mn) || 1) * 80).toFixed(1), x = (d) => (d / p.dias * 330).toFixed(1);
      return { hoje: x(p.diaHoje), yHoje: y(f.value.saldoTotal), yFim: y(p.fim), yMin: y(p.min), yMax: y(p.max), fim: p.fim };
    });
    function pagar(fx) {
      abrirLanc({ tipo: fx.tipo, descricao: fx.nome, valor: fx.valor, moeda: fx.moeda || 'BRL', categoriaId: fx.categoriaId, contaId: fx.contaId, cartaoId: fx.cartaoId, fixaId: fx.id, data: hojeStr() });
    }
    function pagarFatura(k) {
      if (!k.anteriorPendente && !k.faturaAberta) return avisar('Nada a pagar neste cartão');
      const fat = k.anteriorPendente > 0 ? F.addMes(k.aberta, -1) : k.aberta;
      abrirLanc({ tipo: 'transf', descricao: 'Pagamento fatura ' + k.nome, valor: k.anteriorPendente > 0 ? k.anteriorPendente : k.faturaAberta, deConta: k.contaId, paraCartao: k.id, fatura: fat, data: hojeStr() });
    }
    return { f, areia, rotSaldo, rotEntradas, dataCurta, estiloConta, proj, pagar, pagarFatura, abrirConfig, fmtR: F.fmtR, fmtU: F.fmtU, visao };
  },
  template: `
  <div class="pilha">
    <div class="fin-hero">
      <svg class="amp-medidor" viewBox="0 0 86 120" role="img" :aria-label="Math.round(f.resta*100) + '% do que entrou ainda resta'">
        <rect x="10" y="2" width="66" height="6" rx="3" fill="#D4AF37"/><rect x="10" y="112" width="66" height="6" rx="3" fill="#D4AF37"/>
        <path d="M16 10h54c0 22-18 32-24 50 6 18 24 28 24 50H16c0-22 18-32 24-50-6-18-24-28-24-50z" fill="none" stroke="#D4AF37" stroke-width="2"/>
        <polygon :points="areia.cima" fill="#A78BFA"/><polygon :points="areia.baixo" fill="#E8CF7A"/>
        <line x1="43" y1="56" x2="43" y2="84" stroke="#E8CF7A" stroke-width="1.5" stroke-dasharray="2 3"/>
      </svg>
      <div class="pilha-p cresce">
        <small class="rot">{{ rotSaldo }}</small>
        <b class="saldo-g">{{ fmtR(f.saldoTotal, 0) }}</b>
        <small><b class="az">{{ Math.round(f.resta * 100) }}%</b> do que entrou ainda resta · <b class="az">{{ f.pctMes }}%</b> do mês passou</small>
        <small v-if="f.folego != null" class="pos">Fôlego: no ritmo atual, o saldo dura {{ f.folego.toFixed(1).replace('.', ',') }} meses</small>
        <small v-else class="suave">Fôlego aparece após o primeiro mês de lançamentos</small>
      </div>
    </div>
    <div class="trio">
      <div class="mini-cartao"><small>{{ rotEntradas }}</small><b class="pos num-p">{{ fmtR(f.entradas, 0) }}</b></div>
      <div class="mini-cartao"><small>Despesas</small><b class="neg num-p">{{ fmtR(f.despesas, 0) }}</b></div>
      <div class="mini-cartao"><small>{{ visao==='pj' ? 'Distribuído a você' : 'Sobra do mês' }}</small><b class="ouro num-p">{{ fmtR(visao==='pj' ? f.retiradas : f.resultado, 0) }}</b></div>
    </div>

    <h2 class="rotulo">Contas</h2>
    <div class="carteira">
      <div v-for="c in f.contas" :key="c.id" class="cartao-conta" :style="estiloConta(c)">
        <div class="entre"><b>{{ c.nome }}</b><span class="etq">{{ c.pessoa }}</span></div>
        <span class="chip-ouro"></span>
        <div v-if="c.moedas.includes('USD')" class="duas-moedas">
          <div><small>US$</small><b>{{ c.usd.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }}</b><small>≈ {{ fmtR(c.usd * f.cot, 0) }}</small></div>
          <div><small>R$</small><b>{{ c.brl.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }}</b></div>
        </div>
        <b v-else class="saldo-c">{{ fmtR(c.brl) }}</b>
        <small v-if="c.caixinhas.length" class="rodape-c">▣ caixinhas {{ fmtR(c.totalCx, 0) }}</small>
      </div>
      <button class="cartao-conta nova" @click="abrirConfig">+ conta</button>
    </div>

    <template v-if="f.cartoes.length">
      <h2 class="rotulo">Cartões de crédito</h2>
      <div class="grade-2">
        <div v-for="k in f.cartoes" :key="k.id" class="caixa pilha-p">
          <small class="suave">{{ k.nome }}</small>
          <template v-if="k.configurado">
            <b class="num">{{ fmtR(k.faturaAberta) }}</b>
            <span class="barra"><i :style="{ width: Math.min(100, k.pct || 0) + '%', background: k.pct >= 80 ? 'var(--perigo)' : k.pct >= 60 ? 'var(--alerta)' : '' }"></i></span>
            <small class="suave">{{ k.pct != null ? 'limite ' + k.pct + '%' : 'sem limite' }} · vence {{ dataCurta(k.vencAberta) }}</small>
            <small v-if="k.anteriorPendente > 0" class="alerta">fatura anterior {{ fmtR(k.anteriorPendente) }} · vence {{ dataCurta(k.vencAnterior) }}</small>
            <button class="btn" @click="pagarFatura(k)">Pagar fatura</button>
          </template>
          <button v-else class="btn" @click="abrirConfig">Configurar datas e limite</button>
        </div>
      </div>
    </template>

    <div class="razao">
      <div class="razao-cab">Vencimentos e recebimentos do mês</div>
      <p v-if="!f.fixas.length" class="suave pequeno">Nenhuma conta fixa. Cadastre em ⚙ › Contas fixas.</p>
      <div v-for="x in f.fixas" :key="x.id" class="razao-linha">
        <span class="num dia-r">{{ x.venc.slice(8, 10) }}</span><span>{{ x.nome }}</span><span class="pontilhado"></span>
        <span class="num" :class="x.tipo==='rec' ? 'pos' : (x.atrasada ? 'neg' : '')">{{ x.moeda==='USD' ? fmtU(x.valor) : fmtR(x.valor, 0) }}</span>
        <button v-if="!x.pago" class="btn-razao" @click="pagar(x)">{{ x.tipo==='rec' ? 'Receber' : 'Pagar' }}</button>
        <span v-else class="ok-razao">✓</span>
      </div>
    </div>

    <div v-if="proj" class="caixa pilha-p">
      <div class="entre"><b class="pequeno">Projeção até o fim do mês</b><small class="suave">≈ {{ fmtR(proj.fim, 0) }}</small></div>
      <svg width="100%" height="96" viewBox="0 0 330 96" role="img" aria-label="Projeção do saldo até o fim do mês">
        <line x1="0" y1="88" x2="330" y2="88" stroke="#2E3331"/>
        <path :d="'M' + proj.hoje + ' ' + proj.yHoje + ' L330 ' + proj.yMax + ' L330 ' + proj.yMin + ' Z'" fill="#A78BFA" opacity=".25"/>
        <line x1="0" :y1="proj.yHoje" :x2="proj.hoje" :y2="proj.yHoje" stroke="#C4B5FD" stroke-width="2.5"/>
        <line :x1="proj.hoje" :y1="proj.yHoje" x2="330" :y2="proj.yFim" stroke="#D4AF37" stroke-width="2.5" stroke-dasharray="6 5"/>
        <circle :cx="proj.hoje" :cy="proj.yHoje" r="4" fill="#D4AF37"/>
      </svg>
      <small class="suave">Considera contas fixas pendentes e o ritmo de gastos do mês.</small>
    </div>
  </div>`
};
