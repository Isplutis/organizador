// Finanças › Assinaturas: contas fixas marcadas como assinatura (mensais ou anuais, R$ ou US$).
import { reactive, computed, inject, onMounted } from '../../lib/vue.esm-browser.prod.js';
import { lerNumero } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as F from '../servicos/fin-servico.js';
import { hojeStr } from '../servicos/rotina-servico.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export default {
  components: { Modal },
  setup() {
    const { fin, D, abrirLanc } = inject('fin');
    const A = computed(() => F.assinaturas(D.fixas.value, D.lancs.value, fin.value.cot));
    const opcoes = computed(() => [...fin.value.todosCartoes.map((k) => ({ v: 'k:' + k.id, t: k.nome + ' (crédito)' })),
      ...fin.value.todasContas.flatMap((c) => c.moedas.map((m) => ({ v: `c:${c.id}:${m}`, t: c.nome + (c.moedas.length > 1 ? (m === 'USD' ? ' · US$' : ' · R$') : '') })))]);
    const cats = computed(() => fin.value.categorias.filter((c) => c.tipo === 'desp').sort((a, b) => (a.paiId || a.id).localeCompare(b.paiId || b.id) || (a.paiId ? 1 : -1)).map((c) => ({ id: c.id, t: c.paiId ? '   › ' + c.nome : c.nome })));
    const ed = reactive({ aberto: false, v: {} });
    const catPadrao = () => fin.value.categorias.find((c) => !c.paiId && c.nome === 'Assinaturas')?.id || '';
    function novo() { Object.assign(ed, { aberto: true, v: { nome: '', valor: '', moeda: 'BRL', dia: '', periodo: 'mensal', mesAnual: String(+hojeStr().slice(5, 7)), origem: '', categoriaId: catPadrao() } }); }
    function editar(a) { Object.assign(ed, { aberto: true, v: { id: a.id, nome: a.nome, valor: String(a.valor).replace('.', ','), moeda: a.moeda || 'BRL', dia: String(a.dia), periodo: a.periodo || 'mensal', mesAnual: String(a.mesAnual || 1), origem: a.cartaoId ? 'k:' + a.cartaoId : `c:${a.contaId}:${a.moeda || 'BRL'}`, categoriaId: a.categoriaId || '' } }); }
    const ehCartao = computed(() => (ed.v.origem || '').startsWith('k:'));
    async function salvar() {
      const v = ed.v, valor = lerNumero(v.valor), dia = parseInt(v.dia, 10);
      if (!v.nome.trim()) return avisar('Informe o nome');
      if (!(valor > 0) || !(dia >= 1 && dia <= 31) || !v.origem) return avisar('Preencha valor, dia e forma de pagamento');
      const [t, id, moedaConta] = v.origem.split(':');
      const moeda = t === 'k' ? v.moeda : (moedaConta || 'BRL');
      await F.salvar.fixa({ id: v.id, nome: v.nome.trim(), tipo: 'desp', valor, moeda, dia, contaId: t === 'c' ? id : null, cartaoId: t === 'k' ? id : null,
        categoriaId: v.categoriaId || null, assinatura: true, periodo: v.periodo, mesAnual: v.periodo === 'anual' ? +v.mesAnual : null });
      ed.aberto = false; avisar('Assinatura salva');
    }
    // vindo de um alerta do banco ("parece assinatura não cadastrada")
    onMounted(() => {
      const n = sessionStorage.getItem('assinNova'); if (!n) return;
      sessionStorage.removeItem('assinNova');
      try { const a = JSON.parse(n); novo(); Object.assign(ed.v, { nome: a.nome || '', valor: String(a.valor || '').replace('.', ','), dia: String(a.dia || '') }); } catch { /* */ }
    });
    async function excluir() { if (!confirm(`Excluir a assinatura "${ed.v.nome}"?`)) return; await F.excluir('fFixas', ed.v.id); ed.aberto = false; avisar('Assinatura excluída'); }
    const dataTxt = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + (s.slice(0, 4) !== hojeStr().slice(0, 4) ? '/' + s.slice(0, 4) : '');
    const quando = (a) => a.dias === 0 ? 'renova hoje' : a.dias === 1 ? 'renova amanhã' : `renova em ${a.dias} dias`;
    function pagar(a) {
      abrirLanc({ tipo: 'desp', descricao: a.nome, valor: a.cartaoId && a.moeda === 'USD' ? Math.round(a.brl * 100) / 100 : a.valor, moeda: a.cartaoId ? 'BRL' : a.moeda || 'BRL',
        categoriaId: a.categoriaId, contaId: a.contaId, cartaoId: a.cartaoId, fixaId: a.id, data: hojeStr() });
    }
    return { A, ed, novo, editar, salvar, excluir, opcoes, cats, ehCartao, dataTxt, quando, pagar, MESES, fmtR: F.fmtR, fmtU: F.fmtU, cot: computed(() => fin.value.cot) };
  },
  template: `
  <div class="pilha">
    <div class="trio">
      <div class="mini-cartao"><small>Por mês (equivalente)</small><b class="num">{{ fmtR(A.mensal) }}</b></div>
      <div class="mini-cartao"><small>Por ano</small><b class="num">{{ fmtR(A.anual) }}</b></div>
      <div class="mini-cartao"><small>Assinaturas</small><b class="num">{{ A.lista.length }}</b></div>
    </div>
    <p v-if="A.lista.some(a => a.moeda==='USD')" class="dica">Valores em US$ convertidos pela cotação de hoje (US$ 1 = {{ fmtR(cot) }}); no cartão a fatura ainda soma o IOF.</p>
    <p v-if="!A.lista.length" class="vazio">Nenhuma assinatura. Toque em “+ Assinatura” (ex.: streaming, apps, Claude Pro).</p>
    <div v-for="a in A.lista" :key="a.id" class="linha assin" :class="{ aviso: a.aviso }">
      <button class="linha-info" @click="editar(a)">
        <strong>{{ a.nome }}</strong>
        <span class="suave">{{ a.periodo==='anual' ? 'anual · ' + MESES[(a.mesAnual||1)-1] : 'mensal' }} · dia {{ a.dia }} · <span :class="{ 'prev-curta': a.aviso }">{{ quando(a) }} ({{ dataTxt(a.prox) }})</span></span>
      </button>
      <div class="assin-valor"><b class="num">{{ a.moeda==='USD' ? fmtU(a.valor) : fmtR(a.valor) }}</b><small v-if="a.moeda==='USD'" class="suave">≈ {{ fmtR(a.brl) }}</small><small v-else-if="a.periodo==='anual'" class="suave">{{ fmtR(a.mensal) }}/mês</small></div>
      <button v-if="a.dias <= 3" class="btn mini" @click="pagar(a)">Pagar</button>
    </div>
    <button class="btn-tracejado" @click="novo">+ Assinatura</button>
    <p class="dica">Assinaturas também aparecem em “Vencimentos do mês” (as anuais só no mês de renovação) e no lembrete da Rotina. Aviso de renovação: 7 dias antes (mensal) e 30 dias antes (anual).</p>

    <Modal v-if="ed.aberto" :titulo="ed.v.id ? 'Editar assinatura' : 'Nova assinatura'" @fechar="ed.aberto=false">
      <label class="campo">Nome <input v-model="ed.v.nome" placeholder="Ex.: Netflix, Claude Pro"></label>
      <div class="abas-seg"><button :class="{ ativo: ed.v.periodo==='mensal' }" @click="ed.v.periodo='mensal'">Mensal</button><button :class="{ ativo: ed.v.periodo==='anual' }" @click="ed.v.periodo='anual'">Anual</button></div>
      <label class="campo">Forma de pagamento <select v-model="ed.v.origem"><option value="" disabled>Escolha…</option><option v-for="o in opcoes" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
      <div class="grade-2">
        <label class="campo">Valor <input v-model="ed.v.valor" inputmode="decimal"></label>
        <label v-if="ehCartao" class="campo">Moeda <select v-model="ed.v.moeda"><option value="BRL">R$</option><option value="USD">US$</option></select></label>
        <label class="campo">Dia da cobrança <input v-model="ed.v.dia" inputmode="numeric"></label>
        <label v-if="ed.v.periodo==='anual'" class="campo">Mês da renovação <select v-model="ed.v.mesAnual"><option v-for="(m,i) in MESES" :key="i" :value="String(i+1)">{{ m }}</option></select></label>
      </div>
      <label class="campo">Categoria <select v-model="ed.v.categoriaId"><option value="">—</option><option v-for="c in cats" :key="c.id" :value="c.id">{{ c.t }}</option></select></label>
      <div class="acoes"><button v-if="ed.v.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="ed.aberto=false">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
  </div>`
};
