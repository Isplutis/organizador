// Finanças > novo lançamento: Despesa | Receita | Transferência (contas, moedas, cartões, caixinhas).
import { reactive, computed, inject, watch } from '../../lib/vue.esm-browser.prod.js';
import { lerNumero } from '../db.js';
import { avisar, Modal } from '../ui.js';
import { hojeStr } from '../servicos/rotina-servico.js';
import * as F from '../servicos/fin-servico.js';

export default {
  components: { Modal },
  props: { inicial: Object },
  emits: ['fechar'],
  setup(props, { emit }) {
    const { fin, cot, D } = inject('fin');
    const i = props.inicial || {};
    const origemInicial = i.cartaoId ? 'k:' + i.cartaoId : i.contaId ? `c:${i.contaId}:${i.moeda || 'BRL'}` : '';
    const f = reactive({
      tipo: i.tipo || 'desp', valor: i.valor != null ? String(i.valor).replace('.', ',') : '', descricao: i.descricao || '', data: i.data || hojeStr(),
      cat: '', sub: '', origem: origemInicial, parcelas: '1', cotacao: String(cot.value.valor || '').replace('.', ','), fixaId: i.fixaId || null,
      de: i.deConta ? `c:${i.deConta}:BRL` : '', para: i.paraCartao ? `f:${i.paraCartao}:${i.fatura}` : '', valorPara: ''
    });
    // categoria inicial (pode vir como subcategoria)
    if (i.categoriaId) { const c = fin.value.catPor[i.categoriaId]; if (c) { f.cat = c.paiId || c.id; f.sub = c.paiId ? c.id : ''; } }
    if (i.desc) f.descricao = i.desc;

    const cats = computed(() => fin.value.categorias.filter((c) => !c.paiId && c.tipo === (f.tipo === 'rec' ? 'rec' : 'desp')).sort((a, b) => a.ordem - b.ordem));
    const subs = computed(() => fin.value.categorias.filter((c) => c.paiId === f.cat).sort((a, b) => a.ordem - b.ordem));
    // categoria por nome (vinda da Lista de compras): aplica quando as categorias terminarem de carregar
    if (i.catNome) watch(cats, (lista) => { if (!f.cat) { const c = lista.find((x) => x.nome.toLowerCase() === i.catNome.toLowerCase()); if (c) f.cat = c.id; } }, { immediate: true });
    watch(() => f.tipo, () => { if (!cats.value.some((c) => c.id === f.cat)) { f.cat = ''; f.sub = ''; } });
    const opcoesConta = computed(() => fin.value.todasContas.flatMap((c) => (c.moedas || ['BRL']).map((m) => ({ v: `c:${c.id}:${m}`, t: c.nome + (c.moedas.length > 1 ? (m === 'USD' ? ' · US$' : ' · R$') : '') + ' (' + c.pessoa + ')' }))));
    const opcoesOrigem = computed(() => [...(f.tipo === 'desp' ? fin.value.todosCartoes.map((k) => ({ v: 'k:' + k.id, t: k.nome + ' (crédito)' })) : []), ...opcoesConta.value]);
    const opcoesCx = computed(() => fin.value.caixinhas.map((x) => ({ v: 'x:' + x.id, t: '▣ ' + x.nome })));
    const opcoesFatura = computed(() => fin.value.todosCartoes.flatMap((k) => { const ab = k.fechamento ? F.faturaDe(k, hojeStr()) : F.mesDe(hojeStr()); return [F.addMes(ab, -1), ab].map((m) => ({ v: `f:${k.id}:${m}`, t: `Fatura ${k.nome} · ${F.nomeMes(m)}` })); }));
    const ehCartao = computed(() => f.origem.startsWith('k:'));
    const moedaOrigem = computed(() => f.origem.startsWith('c:') ? f.origem.split(':')[2] : 'BRL');
    const ref2 = (v) => { const [t, id, x] = v.split(':'); return t === 'c' ? { contaId: id, moeda: x || 'BRL' } : t === 'x' ? { caixinhaId: id } : t === 'f' ? { cartaoId: id, fatura: x } : null; };
    const moedaDe = computed(() => f.de.startsWith('c:') ? f.de.split(':')[2] : 'BRL');
    const moedaPara = computed(() => f.para.startsWith('c:') ? f.para.split(':')[2] : 'BRL');
    const cambio = computed(() => f.tipo === 'transf' && moedaDe.value !== moedaPara.value);
    const emReais = computed(() => { const v = lerNumero(f.valor), c = lerNumero(f.cotacao); return v > 0 && c > 0 ? F.fmtR(v * c) : '—'; });
    function usarFreq(l) {
      f.tipo = l.tipo; f.descricao = l.descricao; f.valor = String(l.parcela ? l.valor * l.parcela.total : l.valor).replace('.', ',');
      const c = fin.value.catPor[l.categoriaId]; if (c) { f.cat = c.paiId || c.id; f.sub = c.paiId ? c.id : ''; }
      f.origem = l.cartaoId ? 'k:' + l.cartaoId : `c:${l.contaId}:${l.moeda || 'BRL'}`;
    }
    async function salvar() {
      const v = lerNumero(f.valor);
      if (!(v > 0)) return avisar('Informe o valor');
      if (!f.data) return avisar('Informe a data');
      const ini = D.inicio.value?.data;
      if (ini && f.data < ini && !confirm(`A data é anterior ao início dos registros (${ini.split('-').reverse().join('/')}). O lançamento será salvo, mas não aparece nos totais. Continuar?`)) return;
      if (f.tipo === 'transf') {
        if (!f.de || !f.para) return avisar('Escolha origem e destino');
        if (f.de === f.para) return avisar('Origem e destino iguais');
        const vp = cambio.value ? lerNumero(f.valorPara) : v;
        if (!(vp > 0)) return avisar('Informe o valor recebido no destino');
        await F.transferir({ data: f.data, descricao: f.descricao, de: ref2(f.de), para: ref2(f.para), valorDe: v, valorPara: vp, fixaId: f.fixaId });
      } else {
        if (!f.origem) return avisar('Escolha a conta ou o cartão');
        if (!f.descricao.trim()) return avisar('Informe a descrição');
        const c = lerNumero(f.cotacao);
        if (moedaOrigem.value === 'USD' && !(c > 0)) return avisar('Informe a cotação do dólar');
        const [t, id] = f.origem.split(':');
        await F.lancar({ tipo: f.tipo, data: f.data, descricao: f.descricao, valor: v, moeda: moedaOrigem.value, cotacao: c, categoriaId: f.sub || f.cat || null,
          contaId: t === 'c' ? id : null, cartaoId: t === 'k' ? id : null, parcelas: f.parcelas, fixaId: f.fixaId });
      }
      avisar('Lançado'); emit('fechar');
    }
    return { f, fin, cats, subs, opcoesOrigem, opcoesConta, opcoesCx, opcoesFatura, ehCartao, moedaOrigem, cambio, moedaDe, moedaPara, emReais, usarFreq, salvar, tom: F.tom };
  },
  template: `
  <Modal titulo="Novo lançamento" @fechar="$emit('fechar')">
    <div class="abas-seg"><button v-for="[k, n] in [['desp','Despesa'],['rec','Receita'],['transf','Transferência']]" :key="k" :class="{ ativo: f.tipo===k }" @click="f.tipo=k">{{ n }}</button></div>
    <div v-if="f.tipo!=='transf' && fin.frequentes.length" class="chips"><button v-for="l in fin.frequentes" :key="l.id" class="chip" @click="usarFreq(l)">{{ l.descricao }}</button></div>
    <label class="campo">Valor{{ f.tipo==='transf' ? ' (saindo)' : '' }} ({{ (f.tipo==='transf' ? moedaDe : moedaOrigem)==='USD' ? 'US$' : 'R$' }}) <input v-model="f.valor" inputmode="decimal" class="valor-g" autofocus></label>
    <label class="campo">Descrição <input v-model="f.descricao" :placeholder="f.tipo==='transf' ? 'Ex.: Retirada, Conversão, Pagamento fatura' : ''"></label>
    <template v-if="f.tipo!=='transf'">
      <div class="chips"><button v-for="c in cats" :key="c.id" class="chip-cat" :style="f.cat===c.id ? { background: tom(c.hue, 0), borderColor: tom(c.hue, 0), color: '#0A1324' } : {}" @click="f.cat=c.id; f.sub=''">{{ c.nome }}</button></div>
      <div v-if="subs.length" class="chips"><button v-for="(s, i) in subs" :key="s.id" class="chip-cat" :style="f.sub===s.id ? { background: tom(s.hue, i + 1), borderColor: tom(s.hue, i + 1), color: '#0A1324' } : {}" @click="f.sub = f.sub===s.id ? '' : s.id">{{ s.nome }}</button></div>
      <div class="grade-2">
        <label class="campo">Conta ou cartão <select v-model="f.origem"><option value="" disabled>Escolha…</option><option v-for="o in opcoesOrigem" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
        <label class="campo">Data <input type="date" v-model="f.data"></label>
      </div>
      <label v-if="ehCartao" class="campo">Parcelas <select v-model="f.parcelas"><option v-for="n in [1,2,3,4,5,6,7,8,9,10,11,12,18,24]" :key="n" :value="String(n)">{{ n===1 ? 'À vista' : n + 'x' }}</option></select></label>
      <div v-if="moedaOrigem==='USD'" class="grade-2">
        <label class="campo">Cotação (R$ por US$) <input v-model="f.cotacao" inputmode="decimal"></label>
        <div class="campo"><span>Em reais</span><b class="num valor-conv">{{ emReais }}</b></div>
      </div>
    </template>
    <template v-else>
      <label class="campo">De <select v-model="f.de"><option value="" disabled>Escolha…</option><option v-for="o in [...opcoesConta, ...opcoesCx]" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
      <label class="campo">Para <select v-model="f.para"><option value="" disabled>Escolha…</option><option v-for="o in [...opcoesConta, ...opcoesCx, ...opcoesFatura]" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
      <label v-if="cambio" class="campo">Valor recebido ({{ moedaPara==='USD' ? 'US$' : 'R$' }}) — com a cotação real <input v-model="f.valorPara" inputmode="decimal"></label>
      <label class="campo">Data <input type="date" v-model="f.data"></label>
      <p class="dica">Transferências não contam como gasto nem receita. PJ → PF aparece como retirada na visão Pessoal.</p>
    </template>
    <div class="acoes"><button class="btn" @click="$emit('fechar')">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
  </Modal>`
};
