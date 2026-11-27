// Finanças > configurações: contas, cartões, categorias, contas fixas, início e PIN.
import { ref, reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { db, lerNumero, agora } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as F from '../servicos/fin-servico.js';
import { emojiCat } from './fin-catpicker.js';

const HUES = [0, 20, 35, 45, 55, 75, 95, 120, 150, 160, 175, 190, 210, 220, 240, 265, 280, 300, 330];

export default {
  components: { Modal },
  setup() {
    const { fin, D } = inject('fin');
    const sec = ref('contas');
    const contas = computed(() => fin.value.todasContas);
    const cartoes = computed(() => fin.value.todosCartoes);
    const catsTopo = computed(() => fin.value.categorias.filter((c) => !c.paiId).sort((a, b) => (a.tipo > b.tipo ? 1 : a.tipo < b.tipo ? -1 : a.ordem - b.ordem)));
    const subsDe = (id) => fin.value.categorias.filter((c) => c.paiId === id).sort((a, b) => a.ordem - b.ordem);
    const fixas = computed(() => D.fixas.value.filter((f) => !f.excluido).sort((a, b) => (a.dia || 0) - (b.dia || 0)));
    const nomeConta = (id) => contas.value.find((c) => c.id === id)?.nome || cartoes.value.find((k) => k.id === id)?.nome || '—';

    // editor genérico
    const ed = reactive({ tipo: null, v: {} });
    const abrir = (tipo, v) => { ed.tipo = tipo; ed.v = JSON.parse(JSON.stringify(v)); };
    const num = (x) => (String(x ?? '').trim() === '' ? 0 : lerNumero(x));
    async function salvar() {
      const v = ed.v;
      if (!String(v.nome || '').trim()) return avisar('Informe o nome');
      try {
        if (ed.tipo === 'conta') {
          const moedas = v.usd ? ['BRL', 'USD'] : ['BRL'];
          await F.salvar.conta({ id: v.id, nome: v.nome.trim(), pessoa: v.pessoa, moedas, estilo: v.estilo, saldoInicial: { BRL: num(v.sBRL), USD: v.usd ? num(v.sUSD) : 0 } });
        } else if (ed.tipo === 'cartao') {
          const fe = parseInt(v.fechamento, 10), ve = parseInt(v.vencimento, 10);
          if (!(fe >= 1 && fe <= 31) || !(ve >= 1 && ve <= 31)) return avisar('Dias de fechamento e vencimento: 1 a 31');
          await F.salvar.cartao({ id: v.id, nome: v.nome.trim(), contaId: v.contaId, limite: num(v.limite), fechamento: fe, vencimento: ve, estilo: v.estilo });
        } else if (ed.tipo === 'categoria') {
          await F.salvar.categoria({ id: v.id, nome: v.nome.trim(), tipo: v.tipo, hue: +v.hue, paiId: null, orcamento: num(v.orcamento), pj: !!v.pj, emoji: (v.emoji || '').trim() || null });
          for (const s of subsDe(v.id || '')) if (s.hue !== +v.hue) await F.salvar.categoria({ id: s.id, hue: +v.hue });
        } else if (ed.tipo === 'sub') {
          await F.salvar.categoria({ id: v.id, nome: v.nome.trim(), tipo: v.tipo, hue: v.hue, paiId: v.paiId, orcamento: 0, pj: !!v.pj, emoji: (v.emoji || '').trim() || null, ordem: v.ordem ?? subsDe(v.paiId).length });
        } else if (ed.tipo === 'fixa') {
          const dia = parseInt(v.dia, 10), valor = num(v.valor);
          if (!(dia >= 1 && dia <= 31) || !(valor > 0) || !v.origem) return avisar('Preencha valor, dia e conta');
          const [t, id, moeda] = v.origem.split(':');
          await F.salvar.fixa({ id: v.id, nome: v.nome.trim(), tipo: v.tipoF, valor, moeda: moeda || 'BRL', dia, contaId: t === 'c' ? id : null, cartaoId: t === 'k' ? id : null, categoriaId: v.categoriaId || null });
        }
        ed.tipo = null; avisar('Salvo');
      } catch (e) { avisar('Erro: ' + e.message); }
    }
    async function excluir() {
      const mapa = { conta: 'fContas', cartao: 'fCartoes', categoria: 'fCategorias', sub: 'fCategorias', fixa: 'fFixas' };
      if (!confirm('Excluir? Lançamentos já feitos continuam no histórico.')) return;
      await F.excluir(mapa[ed.tipo], ed.v.id); ed.tipo = null;
    }
    const novaConta = () => abrir('conta', { nome: '', pessoa: 'PF', usd: false, estilo: 'marinho', sBRL: '0', sUSD: '0' });
    const editarConta = (c) => abrir('conta', { id: c.id, nome: c.nome, pessoa: c.pessoa, usd: c.moedas.includes('USD'), estilo: c.estilo, sBRL: String(c.saldoInicial?.BRL || 0), sUSD: String(c.saldoInicial?.USD || 0) });
    const novoCartao = () => abrir('cartao', { nome: '', contaId: contas.value[0]?.id, limite: '', fechamento: '', vencimento: '', estilo: 'marinho' });
    const editarCartao = (k) => abrir('cartao', { id: k.id, nome: k.nome, contaId: k.contaId, limite: String(k.limite || ''), fechamento: String(k.fechamento || ''), vencimento: String(k.vencimento || ''), estilo: k.estilo });
    const novaCat = (tipo) => abrir('categoria', { nome: '', tipo, hue: HUES[Math.floor(Math.random() * HUES.length)], orcamento: '', pj: false });
    const editarCat = (c) => abrir('categoria', { id: c.id, nome: c.nome, emoji: c.emoji || '', tipo: c.tipo, hue: c.hue, orcamento: String(c.orcamento || ''), pj: c.pj });
    const novaSub = (c) => abrir('sub', { nome: '', tipo: c.tipo, hue: c.hue, paiId: c.id, pj: c.pj });
    const editarSub = (s) => abrir('sub', { ...s });
    const opcoesOrigem = computed(() => [...cartoes.value.map((k) => ({ v: 'k:' + k.id, t: k.nome + ' (crédito)' })), ...contas.value.flatMap((c) => c.moedas.map((m) => ({ v: `c:${c.id}:${m}`, t: c.nome + (c.moedas.length > 1 ? (m === 'USD' ? ' · US$' : ' · R$') : '') })))]);
    const catsOpc = computed(() => fin.value.categorias.filter((c) => c.tipo === (ed.v.tipoF === 'rec' ? 'rec' : 'desp')).sort((a, b) => (a.paiId || a.id).localeCompare(b.paiId || b.id) || (a.paiId ? 1 : -1)).map((c) => ({ id: c.id, t: c.paiId ? '   › ' + c.nome : c.nome })));
    const novaFixa = () => abrir('fixa', { nome: '', tipoF: 'desp', valor: '', dia: '', origem: '', categoriaId: '' });
    const editarFixa = (f) => abrir('fixa', { id: f.id, nome: f.nome, tipoF: f.tipo, valor: String(f.valor), dia: String(f.dia), origem: f.cartaoId ? 'k:' + f.cartaoId : `c:${f.contaId}:${f.moeda || 'BRL'}`, categoriaId: f.categoriaId || '' });

    const inicio = ref(D.inicio.value?.data || F.INICIO_PADRAO);
    async function salvarInicio() { await db.meta.put({ chave: 'finInicio', data: inicio.value || '', atualizadoEm: agora() }); avisar('Início salvo'); }
    function trocarPin() { if (confirm('Trocar o PIN? Você vai criar um novo ao voltar para Finanças.')) { F.removerPin(); sessionStorage.removeItem('finDesbloq'); location.reload(); } }
    const emo = (c) => emojiCat({ ...c, emoji: c.emoji || null }, D.categorias.value);
    return { emo, sec, contas, cartoes, catsTopo, subsDe, fixas, nomeConta, ed, abrir, salvar, excluir, novaConta, editarConta, novoCartao, editarCartao, novaCat, editarCat, novaSub, editarSub,
      opcoesOrigem, catsOpc, novaFixa, editarFixa, inicio, salvarInicio, trocarPin, ESTILOS: Object.keys(F.ESTILOS_CONTA), GRAD: F.ESTILOS_CONTA, HUES, tom: F.tom, fmtR: F.fmtR, fmtU: F.fmtU };
  },
  template: `
  <div class="pilha">
    <div class="chips"><button v-for="[k, n] in [['contas','Contas'],['cartoes','Cartões'],['cats','Categorias'],['fixas','Contas fixas'],['geral','Geral']]" :key="k" class="chip" :class="{ ativo: sec===k }" @click="sec=k">{{ n }}</button></div>

    <template v-if="sec==='contas'">
      <button v-for="c in contas" :key="c.id" class="linha" @click="editarConta(c)"><span class="mini-cartao-cor" :style="{ background: GRAD[c.estilo] }"></span><span class="linha-info"><strong>{{ c.nome }}</strong><small class="suave">{{ c.pessoa }} · {{ c.moedas.join(' + ') }} · saldo inicial {{ fmtR(c.saldoInicial?.BRL || 0) }}{{ c.moedas.includes('USD') ? ' / ' + fmtU(c.saldoInicial?.USD || 0) : '' }}</small></span></button>
      <button class="btn-tracejado" @click="novaConta">+ Conta</button>
    </template>
    <template v-else-if="sec==='cartoes'">
      <button v-for="k in cartoes" :key="k.id" class="linha" @click="editarCartao(k)"><span class="mini-cartao-cor" :style="{ background: GRAD[k.estilo] }"></span><span class="linha-info"><strong>{{ k.nome }}</strong><small class="suave">{{ k.fechamento ? 'fecha dia ' + k.fechamento + ' · vence dia ' + k.vencimento : 'datas não configuradas' }} · limite {{ k.limite ? fmtR(k.limite, 0) : '—' }} · paga com {{ nomeConta(k.contaId) }}</small></span></button>
      <button class="btn-tracejado" @click="novoCartao">+ Cartão de crédito</button>
    </template>
    <template v-else-if="sec==='cats'">
      <div v-for="c in catsTopo" :key="c.id" class="caixa pilha-p">
        <div class="entre"><button class="cat-nome btn-sem" @click="editarCat(c)"><i :style="{ background: tom(c.hue, 0) }"></i><b>{{ emo(c) }} {{ c.nome }}</b><small class="suave">{{ c.tipo==='rec' ? 'receita' : 'despesa' }}{{ c.pj ? ' · PJ' : '' }}{{ c.orcamento ? ' · orçamento ' + fmtR(c.orcamento, 0) : '' }}</small></button><button class="btn-link" @click="novaSub(c)">+ sub</button></div>
        <div class="chips"><button v-for="(s, i) in subsDe(c.id)" :key="s.id" class="chip-cat" :style="{ borderColor: tom(c.hue, i + 1), color: tom(c.hue, i + 1) }" @click="editarSub(s)">{{ emo(s) }} {{ s.nome }}</button></div>
      </div>
      <div class="grade-2"><button class="btn-tracejado" @click="novaCat('desp')">+ Categoria de despesa</button><button class="btn-tracejado" @click="novaCat('rec')">+ Categoria de receita</button></div>
    </template>
    <template v-else-if="sec==='fixas'">
      <p v-if="!fixas.length" class="vazio">Nenhuma conta fixa. Ex.: aluguel, internet, salário.</p>
      <button v-for="x in fixas" :key="x.id" class="linha" @click="editarFixa(x)"><span class="num dia-r">{{ String(x.dia).padStart(2, '0') }}</span><span class="linha-info"><strong>{{ x.nome }}</strong><small class="suave">{{ x.tipo==='rec' ? 'a receber' : 'a pagar' }} · {{ nomeConta(x.cartaoId || x.contaId) }}</small></span><b class="num" :class="{ pos: x.tipo==='rec' }">{{ x.moeda==='USD' ? fmtU(x.valor) : fmtR(x.valor, 0) }}</b></button>
      <button class="btn-tracejado" @click="novaFixa">+ Conta fixa</button>
      <p class="dica">Contas a pagar aparecem como lembrete na Rotina no dia do vencimento, se ainda não pagas (não contam nos percentuais).</p>
    </template>
    <template v-else>
      <div class="caixa pilha"><label class="campo">Início dos registros <input type="date" v-model="inicio" @change="salvarInicio"></label><p class="dica">Lançamentos antes dessa data são ignorados. Informe o saldo inicial de cada conta nessa data (aba Contas).</p></div>
      <button class="btn" @click="trocarPin">Trocar PIN deste aparelho</button>
    </template>

    <Modal v-if="ed.tipo" :titulo="({ conta: 'Conta', cartao: 'Cartão de crédito', categoria: 'Categoria', sub: 'Subcategoria', fixa: 'Conta fixa' })[ed.tipo]" @fechar="ed.tipo=null">
      <label class="campo">Nome <input v-model="ed.v.nome" autofocus></label>
      <template v-if="ed.tipo==='conta'">
        <div class="abas-seg"><button :class="{ ativo: ed.v.pessoa==='PF' }" @click="ed.v.pessoa='PF'">Pessoal (PF)</button><button :class="{ ativo: ed.v.pessoa==='PJ' }" @click="ed.v.pessoa='PJ'">Empresa (PJ)</button></div>
        <label class="entre"><span>Também tem saldo em dólar (US$)</span><input type="checkbox" v-model="ed.v.usd" class="check-g"></label>
        <div class="grade-2"><label class="campo">Saldo inicial R$ <input v-model="ed.v.sBRL" inputmode="decimal"></label><label v-if="ed.v.usd" class="campo">Saldo inicial US$ <input v-model="ed.v.sUSD" inputmode="decimal"></label></div>
      </template>
      <template v-if="ed.tipo==='cartao'">
        <label class="campo">Paga a fatura com <select v-model="ed.v.contaId"><option v-for="c in contas" :key="c.id" :value="c.id">{{ c.nome }}</option></select></label>
        <div class="grade-2"><label class="campo">Dia do fechamento <input v-model="ed.v.fechamento" inputmode="numeric"></label><label class="campo">Dia do vencimento <input v-model="ed.v.vencimento" inputmode="numeric"></label></div>
        <label class="campo">Limite (R$) <input v-model="ed.v.limite" inputmode="decimal"></label>
      </template>
      <div v-if="ed.tipo==='conta' || ed.tipo==='cartao'" class="estilos"><button v-for="e in ESTILOS" :key="e" :style="{ background: GRAD[e] }" :class="{ on: ed.v.estilo===e }" @click="ed.v.estilo=e" :aria-label="'Cor ' + e"></button></div>
      <label v-if="ed.tipo==='categoria' || ed.tipo==='sub'" class="campo">Emoji (opcional; vazio = automático {{ emo(ed.v) }}) <input v-model="ed.v.emoji" maxlength="4"></label>
      <template v-if="ed.tipo==='categoria'">
        <div class="estilos"><button v-for="h in HUES" :key="h" :style="{ background: tom(h, 0) }" :class="{ on: +ed.v.hue===h }" @click="ed.v.hue=h" :aria-label="'Cor ' + h"></button></div>
        <label v-if="ed.v.tipo==='desp'" class="campo">Orçamento mensal (R$, opcional) <input v-model="ed.v.orcamento" inputmode="decimal"></label>
        <label v-if="ed.v.tipo==='desp'" class="entre"><span>Despesa da empresa (PJ)</span><input type="checkbox" v-model="ed.v.pj" class="check-g"></label>
      </template>
      <template v-if="ed.tipo==='fixa'">
        <div class="abas-seg"><button :class="{ ativo: ed.v.tipoF==='desp' }" @click="ed.v.tipoF='desp'">A pagar</button><button :class="{ ativo: ed.v.tipoF==='rec' }" @click="ed.v.tipoF='rec'">A receber</button></div>
        <div class="grade-2"><label class="campo">Valor <input v-model="ed.v.valor" inputmode="decimal"></label><label class="campo">Dia <input v-model="ed.v.dia" inputmode="numeric"></label></div>
        <label class="campo">Conta ou cartão <select v-model="ed.v.origem"><option value="" disabled>Escolha…</option><option v-for="o in opcoesOrigem" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
        <label class="campo">Categoria <select v-model="ed.v.categoriaId"><option value="">—</option><option v-for="c in catsOpc" :key="c.id" :value="c.id">{{ c.t }}</option></select></label>
      </template>
      <div class="acoes"><button v-if="ed.v.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="ed.tipo=null">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
  </div>`
};
