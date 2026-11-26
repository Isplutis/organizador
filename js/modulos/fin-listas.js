// Finanças > Lançamentos (livro-razão), Categorias (pizza + orçamento) e Metas (caixinhas).
import { ref, reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { lerNumero } from '../db.js';
import { avisar, Modal } from '../ui.js';
import { hojeStr } from '../servicos/rotina-servico.js';
import * as F from '../servicos/fin-servico.js';

const dataLonga = (s) => { const t = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1); };

export const Lancamentos = {
  components: { Modal },
  setup() {
    const { fin } = inject('fin');
    const filtro = ref('todos');
    const lista = computed(() => {
      let ult = null;
      return fin.value.lancsMes.filter((l) => filtro.value === 'todos' || l.tipo === filtro.value).map((l) => { const cab = l.data !== ult; ult = l.data; return { ...l, cab }; });
    });
    const sel = ref(null);
    async function excluir() {
      const l = sel.value;
      if (!confirm(l.parcela ? `Excluir as ${l.parcela.total} parcelas desta compra?` : 'Excluir este lançamento?')) return;
      await F.excluirLanc(l); sel.value = null; avisar('Lançamento excluído');
    }
    const sinal = (l) => l.tipo === 'transf' ? '⇄ ' : l.tipo === 'rec' ? '+ ' : '− ';
    return { filtro, lista, sel, excluir, sinal, dataLonga, fmtR: F.fmtR };
  },
  template: `
  <div class="pilha">
    <div class="chips"><button v-for="[k, n] in [['todos','Todos'],['desp','Despesas'],['rec','Receitas'],['transf','Transferências']]" :key="k" class="chip" :class="{ ativo: filtro===k }" @click="filtro=k">{{ n }}</button></div>
    <p v-if="!lista.length" class="vazio">Nenhum lançamento neste mês.</p>
    <template v-for="l in lista" :key="l.id">
      <div v-if="l.cab" class="dia-razao">{{ dataLonga(l.data) }}</div>
      <button class="lanc" @click="sel=l">
        <span class="ponto-cat" :style="{ background: l.cor }"></span>
        <span class="cresce pilha-p"><span>{{ l.descricao }}</span><small class="suave">{{ l.sub }}{{ l.moedaTxt ? ' · ' + l.moedaTxt : '' }}</small></span>
        <span class="num" :class="{ pos: l.tipo==='rec', az: l.tipo==='transf' }">{{ sinal(l) }}{{ fmtR(l.mostra).replace('R$ ', '') }}</span>
      </button>
    </template>
    <Modal v-if="sel" :titulo="sel.descricao" @fechar="sel=null">
      <p class="suave">{{ dataLonga(sel.data) }} · {{ sel.sub }}</p>
      <p class="num grande-3">{{ sinal(sel) }}{{ fmtR(sel.mostra) }}</p>
      <p v-if="sel.moedaTxt" class="suave">{{ sel.moedaTxt }}{{ sel.cotacao ? ' · cotação ' + sel.cotacao : '' }}</p>
      <div class="acoes"><button class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="sel=null">Fechar</button></div>
    </Modal>
  </div>`
};

export const Categorias = {
  components: { Modal },
  setup() {
    const { fin } = inject('fin');
    const cats = computed(() => fin.value.categoriasV.filter((c) => c.total > 0 || c.orcamento > 0));
    const total = computed(() => cats.value.reduce((a, c) => a + c.total, 0));
    // pizza (rosca) com uma fatia por categoria
    const fatias = computed(() => {
      const R = 54, C = 2 * Math.PI * R; let acc = 0;
      return cats.value.filter((c) => c.total > 0).map((c) => { const frac = c.total / (total.value || 1); const s = { cor: F.tom(c.hue, 0), dash: `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`, off: (-acc * C).toFixed(2), nome: c.nome, pct: Math.round(frac * 100) }; acc += frac; return s; });
    });
    const orc = reactive({ cat: null, valor: '' });
    async function salvarOrc() {
      const v = orc.valor.trim() === '' ? 0 : lerNumero(orc.valor);
      if (!(v >= 0)) return avisar('Valor inválido');
      await F.salvar.categoria({ id: orc.cat.id, orcamento: v }); orc.cat = null;
    }
    return { cats, total, fatias, orc, salvarOrc, tom: F.tom, fmtR: F.fmtR };
  },
  template: `
  <div class="pilha">
    <div v-if="total > 0" class="pizza-caixa">
      <svg viewBox="0 0 140 140" class="pizza" role="img" aria-label="Gastos por categoria">
        <circle cx="70" cy="70" r="54" fill="none" stroke="#142544" stroke-width="22"/>
        <circle v-for="s in fatias" :key="s.nome" cx="70" cy="70" r="54" fill="none" :stroke="s.cor" stroke-width="22" :stroke-dasharray="s.dash" :stroke-dashoffset="s.off" transform="rotate(-90 70 70)"><title>{{ s.nome }} {{ s.pct }}%</title></circle>
        <text x="70" y="66" text-anchor="middle" class="pizza-rot">Total</text>
        <text x="70" y="84" text-anchor="middle" class="pizza-val">{{ fmtR(total, 0) }}</text>
      </svg>
      <div class="pizza-leg"><span v-for="s in fatias" :key="s.nome"><i :style="{ background: s.cor }"></i>{{ s.nome }} <b class="num">{{ s.pct }}%</b></span></div>
    </div>
    <p v-if="!cats.length" class="vazio">Sem gastos neste mês.</p>
    <div v-for="c in cats" :key="c.id" class="cat-linha">
      <div class="entre"><span class="cat-nome"><i :style="{ background: tom(c.hue, 0) }"></i>{{ c.nome }}</span>
        <button class="btn-link num" :class="{ alerta: c.pct >= 80 && c.pct < 100, neg: c.pct >= 100 }" @click="orc.cat=c; orc.valor=c.orcamento ? String(c.orcamento) : ''">{{ fmtR(c.total, 0) }}{{ c.orcamento ? ' / ' + fmtR(c.orcamento, 0) : ' · definir orçamento' }}</button></div>
      <div class="barra-sub"><i v-for="s in c.subs" :key="s.id" :style="{ width: Math.min(100, s.total / (c.orcamento || c.total || 1) * 100) + '%', background: s.cor }"></i></div>
      <small class="suave">{{ c.subs.map((s) => s.nome + ' ' + fmtR(s.total, 0)).join(' · ') }}{{ c.pct >= 80 ? ' · ' + c.pct + '% do orçamento' : '' }}</small>
    </div>
    <Modal v-if="orc.cat" :titulo="'Orçamento mensal · ' + orc.cat.nome" @fechar="orc.cat=null">
      <label class="campo">Valor por mês (R$) — vazio = sem orçamento <input v-model="orc.valor" inputmode="decimal" autofocus @keyup.enter="salvarOrc"></label>
      <p class="dica">Aviso em 80% (amarelo) e 100% (vermelho).</p>
      <div class="acoes"><button class="btn" @click="orc.cat=null">Cancelar</button><button class="btn primario" @click="salvarOrc">Salvar</button></div>
    </Modal>
  </div>`
};

export const Metas = {
  components: { Modal },
  setup() {
    const { fin } = inject('fin');
    const metas = computed(() => fin.value.metas);
    const contasCx = computed(() => fin.value.contas);
    const ed = reactive({ aberto: false, id: null, nome: '', contaId: '', meta: '', inicial: '' });
    const abrir = (x) => Object.assign(ed, { aberto: true, id: x?.id || null, nome: x?.nome || '', contaId: x?.contaId || contasCx.value[0]?.id || '', meta: x?.meta ? String(x.meta) : '', inicial: x ? String(x.saldoInicial || 0) : '0' });
    async function salvar() {
      if (!ed.nome.trim() || !ed.contaId) return avisar('Informe nome e conta');
      const meta = ed.meta.trim() ? lerNumero(ed.meta) : 0, inicial = ed.inicial.trim() ? lerNumero(ed.inicial) : 0;
      if (!(meta >= 0) || !(inicial >= 0)) return avisar('Valores inválidos');
      await F.salvar.caixinha({ id: ed.id || undefined, nome: ed.nome.trim(), contaId: ed.contaId, meta, saldoInicial: inicial }); ed.aberto = false;
    }
    async function excluir() { if (confirm('Excluir esta caixinha?')) { await F.excluir('fCaixinhas', ed.id); ed.aberto = false; } }
    const mov = reactive({ x: null, tipo: 'guardar', valor: '' });
    async function movimentar() {
      const v = lerNumero(mov.valor); if (!(v > 0)) return avisar('Informe o valor');
      const x = mov.x, conta = { contaId: x.contaId, moeda: 'BRL' }, cx = { caixinhaId: x.id };
      if (mov.tipo === 'rend') await F.lancar({ tipo: 'rec', data: hojeStr(), descricao: 'Rendimento ' + x.nome, valor: v, categoriaId: 'rendimentos--0', contaId: x.contaId })
        .then(() => F.transferir({ data: hojeStr(), descricao: 'Rendimento para ' + x.nome, de: conta, para: cx, valorDe: v }));
      else await F.transferir({ data: hojeStr(), descricao: (mov.tipo === 'guardar' ? 'Guardar em ' : 'Resgatar de ') + x.nome, de: mov.tipo === 'guardar' ? conta : cx, para: mov.tipo === 'guardar' ? cx : conta, valorDe: v });
      mov.x = null; avisar('Feito');
    }
    return { metas, contasCx, ed, abrir, salvar, excluir, mov, movimentar, fmtR: F.fmtR };
  },
  template: `
  <div class="pilha">
    <p v-if="!metas.length" class="vazio">Nenhuma caixinha nesta visão.</p>
    <div v-for="x in metas" :key="x.id" class="cartao-meta">
      <div class="entre"><b>{{ x.nome }}</b><button class="etq-ouro" @click="abrir(x)">{{ x.conta }} · editar</button></div>
      <b class="num grande-3">{{ fmtR(x.saldo, 0) }}<span class="suave" v-if="x.meta"> / {{ fmtR(x.meta, 0) }}</span></b>
      <span v-if="x.meta" class="barra"><i :style="{ width: x.pct + '%' }"></i></span>
      <small class="suave">{{ x.meta ? x.pct + '%' : 'sem meta' }}{{ x.mesesFalta ? ' · no ritmo atual, meta em ' + x.mesesFalta + ' meses' : '' }}</small>
      <div class="acoes-uni"><button class="btn" @click="mov.x=x; mov.tipo='guardar'; mov.valor=''">Guardar</button><button class="btn" @click="mov.x=x; mov.tipo='resgatar'; mov.valor=''">Resgatar</button><button class="btn" @click="mov.x=x; mov.tipo='rend'; mov.valor=''">Rendimento</button></div>
    </div>
    <button class="btn-tracejado" @click="abrir(null)">+ Caixinha</button>
    <div class="invest-futuro">Investimentos — seção a criar (meta: voltar a investir em 2027)</div>
    <Modal v-if="ed.aberto" :titulo="ed.id ? 'Editar caixinha' : 'Nova caixinha'" @fechar="ed.aberto=false">
      <label class="campo">Nome <input v-model="ed.nome" autofocus></label>
      <label class="campo">Conta <select v-model="ed.contaId"><option v-for="c in contasCx" :key="c.id" :value="c.id">{{ c.nome }}</option></select></label>
      <div class="grade-2"><label class="campo">Meta (R$, opcional) <input v-model="ed.meta" inputmode="decimal"></label><label class="campo">Saldo inicial <input v-model="ed.inicial" inputmode="decimal"></label></div>
      <div class="acoes"><button v-if="ed.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="ed.aberto=false">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
    <Modal v-if="mov.x" :titulo="({ guardar: 'Guardar em ', resgatar: 'Resgatar de ', rend: 'Rendimento de ' })[mov.tipo] + mov.x.nome" @fechar="mov.x=null">
      <label class="campo">Valor (R$) <input v-model="mov.valor" inputmode="decimal" autofocus @keyup.enter="movimentar"></label>
      <p class="dica">{{ mov.tipo==='rend' ? 'Entra como receita (Rendimentos) e vai direto para a caixinha.' : 'Movimento entre a conta e a caixinha — não é gasto nem receita.' }}</p>
      <div class="acoes"><button class="btn" @click="mov.x=null">Cancelar</button><button class="btn primario" @click="movimentar">Confirmar</button></div>
    </Modal>
  </div>`
};
