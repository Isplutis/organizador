// Finanças › Banco: caixa de entrada do Open Finance (Pluggy), histórico de 6 meses (só leitura), alertas e contas conectadas.
import { ref, reactive, computed, inject, onMounted } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, lerNumero } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as F from '../servicos/fin-servico.js';
import * as P from '../servicos/pluggy-servico.js';
import { hojeStr } from '../servicos/rotina-servico.js';
import CatPicker, { emojiCat, INTERNO } from './fin-catpicker.js';

const fd = (s) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) : '';
export default {
  components: { Modal, CatPicker },
  setup() {
    const { fin, D, cot, irAba } = inject('fin');
    const imports = vivo(() => db.fImport.toArray(), []);
    const cfgP = vivo(() => P.lerCfgPluggy(), { mapa: {}, regras: [], contas: [] });
    const seg = ref(sessionStorage.getItem('bancoSeg') || 'entrada');
    const irSeg = (k) => { seg.value = k; sessionStorage.setItem('bancoSeg', k); };
    const est = reactive({ ocupado: false, erro: P.estadoPluggy.erro, ultima: P.estadoPluggy.ultima });
    async function atualizar() {
      est.ocupado = true; est.erro = '';
      try { const r = await P.atualizarPluggy(); await P.absorverParcelas(); avisar(r.novas ? `${r.novas} nova(s) movimentação(ões) na caixa de entrada` : 'Nada novo na caixa de entrada'); }
      catch (e) { avisar('Erro: ' + e.message); }
      Object.assign(est, { ocupado: false, erro: P.estadoPluggy.erro, ultima: P.estadoPluggy.ultima });
    }
    // busca sozinha ao abrir se a última busca tiver mais de 6 h (a Pluggy sincroniza o banco 1x por dia)
    onMounted(() => { if (!est.ocupado && (!est.ultima || Date.now() - new Date(est.ultima) > 6 * 36e5)) atualizar(); });
    const ctx = computed(() => ({ caixinhas: D.caixinhas.value, mapa: cfgP.value?.mapa || {}, regras: cfgP.value?.regras || [], categorias: D.categorias.value, cartoes: D.cartoes.value, contas: D.contas.value, lancs: D.lancs.value, importados: imports.value }));
    const contaInfo = computed(() => Object.fromEntries((cfgP.value?.contas || []).flatMap((it) => (it.contas || []).map((c) => [c.id, c]))));
    const pendentes = computed(() => imports.value.filter((x) => x.status === 'pendente').sort((a, b) => b.data.localeCompare(a.data)).map((x) => ({ ...x, s: P.sugerir(x, ctx.value) })));

    // opções de seleção
    const optOrigem = computed(() => [...fin.value.todasContas.filter((c) => !c.excluido).map((c) => ({ v: 'c:' + c.id, t: c.nome })), ...fin.value.todosCartoes.filter((k) => !k.excluido).map((k) => ({ v: 'k:' + k.id, t: k.nome + ' (crédito)' }))]);
    const optConta = computed(() => [...fin.value.todasContas.filter((c) => !c.excluido).flatMap((c) => c.moedas.map((m) => ({ v: `c:${c.id}:${m}`, t: c.nome + (c.moedas.length > 1 ? (m === 'USD' ? ' · US$' : ' · R$') : '') }))), ...D.caixinhas.value.filter((x) => !x.excluido).map((x) => ({ v: 'x:' + x.id, t: 'Caixinha ' + x.nome }))]);
    const optPara = computed(() => {
      const hoje = hojeStr(), out = [...optConta.value];
      for (const k of fin.value.todosCartoes.filter((k) => !k.excluido)) for (const i of [-2, -1, 0, 1]) { const f = F.addMes(F.faturaDe(k, hoje), i); out.push({ v: `f:${k.id}:${f}`, t: `Fatura ${k.nome} ${f.slice(5)}/${f.slice(0, 4)}` }); }
      return out;
    });
    const optCats = (tipo) => D.categorias.value.filter((c) => !c.excluido && c.tipo === tipo).sort((a, b) => (a.paiId || a.id).localeCompare(b.paiId || b.id) || (a.paiId ? 1 : -1)).map((c) => ({ id: c.id, t: c.paiId ? '   › ' + c.nome : c.nome }));
    const nomeCat = (id) => { const c = D.categorias.value.find((x) => x.id === id); if (!c) return '—'; const p = c.paiId && D.categorias.value.find((x) => x.id === c.paiId); return p ? p.nome + ' › ' + c.nome : c.nome; };
    const nomeRef = (ref) => [...optOrigem.value, ...optPara.value].find((o) => o.v === ref)?.t || '—';

    // editor da caixa de entrada: tudo editável antes de confirmar
    const ed = reactive({ aberto: false, x: null, v: {} });
    function abrir(x) {
      const s = x.s, de = s.transf?.de || (x.saida ? (s.origem.startsWith('c:') ? s.origem + ':BRL' : '') : ''), para = s.transf?.para || (!x.saida && s.origem.startsWith('c:') ? s.origem + ':BRL' : '');
      Object.assign(ed, { aberto: true, x, v: { tipo: s.ignorar ? (x.saida ? 'desp' : 'rec') : s.tipo, nome: s.nome, valor: String(x.valor).replace('.', ','), valorTotal: String(s.valorTotal).replace('.', ','), data: x.data, origem: s.origem, de, para,
        categoriaId: s.categoriaId || '', parcelas: String(s.parcelas || 1), juntar: s.juntar || '', usarJuntar: !!s.juntar, parId: s.parId || null, criarRegra: false, padrao: P.padraoDe(x.descricao), motivo: s.motivo, ignorarSug: s.ignorar } });
    }
    const ehCartao = computed(() => (ed.v.origem || '').startsWith('k:'));
    const lancJuntar = computed(() => ed.v.juntar ? D.lancs.value.find((l) => l.id === ed.v.juntar) : null);
    async function confirmar() {
      const v = ed.v, valor = lerNumero(v.valor);
      if (!v.usarJuntar) {
        if (!v.nome.trim()) return avisar('Informe o nome');
        if (!(valor > 0)) return avisar('Valor inválido');
        if (!v.data) return avisar('Informe a data');
        if (v.tipo !== 'transf' && !v.categoriaId) return avisar('Escolha a categoria');
      }
      try {
        await P.confirmar(ed.x, { tipo: v.tipo, nome: v.nome.trim(), valor, valorTotal: lerNumero(v.valorTotal) || valor, data: v.data, origem: v.origem, de: v.de, para: v.para, categoriaId: v.categoriaId,
          parcelas: Math.max(1, parseInt(v.parcelas, 10) || 1), juntar: v.usarJuntar ? v.juntar : null, parId: v.parId, criarRegra: v.criarRegra, padrao: v.padrao });
        ed.aberto = false; await P.absorverParcelas(); avisar(v.usarJuntar ? 'Juntado ao lançamento existente' : 'Lançamento confirmado');
      } catch (e) { avisar('Erro: ' + e.message); }
    }
    async function ignorar() { await P.ignorar(ed.x); ed.aberto = false; avisar('Ignorado'); }
    const ignorados = computed(() => imports.value.filter((x) => x.status === 'ignorado').sort((a, b) => b.data.localeCompare(a.data)).slice(0, 30));
    const verIgnorados = ref(false);
    async function restaurar(x) { await P.desfazer(x); avisar('Voltou para a caixa de entrada'); }

    // histórico (só leitura; categoria editável)
    const mesH = ref(F.addMes(hojeStr().slice(0, 7), 0));
    const filtroH = reactive({ texto: '', cat: '' });
    const paiDe = (id) => D.categorias.value.find((c) => c.id === id)?.paiId || '';
    const emo = (id) => id === INTERNO ? '↔' : emojiCat(D.categorias.value.find((c) => c.id === id), D.categorias.value);
    const optFiltro = computed(() => { const cs = D.categorias.value.filter((c) => !c.excluido); const ord = (a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.nome.localeCompare(b.nome, 'pt-BR'); const out = [];
      for (const [tipo, rot] of [['desp', 'Despesas'], ['rec', 'Receitas']]) out.push({ rot, itens: cs.filter((c) => !c.paiId && c.tipo === tipo).sort(ord).flatMap((t) => [{ id: t.id, t: emojiCat(t, cs) + ' ' + t.nome + ' (todas)' }, ...cs.filter((s) => s.paiId === t.id).sort(ord).map((s) => ({ id: s.id, t: '\u00a0\u00a0\u00a0\u00a0' + emojiCat(s, cs) + ' ' + s.nome }))]) });
      return out; });
    const histTodos = computed(() => imports.value.filter((x) => x.status === 'historico' && x.data.slice(0, 7) === mesH.value).sort((a, b) => b.data.localeCompare(a.data))
      .map((x) => { const interno = P.internoDe(x, ctx.value.regras); return { ...x, interno, cat: interno ? '' : (x.categoriaApp || P.aplicaRegra(ctx.value.regras, x.descricao)?.categoriaId || P.sugerir({ ...x }, ctx.value).categoriaId) }; }));
    const histMes = computed(() => { const t = P.norm(filtroH.texto); return histTodos.value.filter((x) => (!t || P.norm(x.descricao).includes(t)) && (!filtroH.cat || (filtroH.cat === '__interno' ? x.interno : filtroH.cat === '__sem' ? (!x.interno && !x.cat) : (x.cat === filtroH.cat || paiDe(x.cat) === filtroH.cat)))); });
    const resumoH = computed(() => { const t = {}; let e = 0, s = 0, i = 0; for (const x of histTodos.value) { if (x.interno) { i++; continue; } if (x.saida) { s += x.valor; const n = nomeCat(x.cat).split(' › ')[0]; t[n] = (t[n] || 0) + x.valor; } else e += x.valor; } return { e, s, i, cats: Object.entries(t).sort((a, b) => b[1] - a[1]) }; });
    const catsTopo = computed(() => D.categorias.value.filter((c) => !c.excluido && !c.paiId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    // saldo das contas no fim do mês: saldo atual do banco menos o que entrou/saiu depois
    const saldosFim = computed(() => {
      const [a, m] = mesH.value.split('-').map(Number), fim = `${mesH.value}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`, atual = mesH.value === hojeStr().slice(0, 7);
      const lista = [];
      for (const it of cfgP.value?.contas || []) for (const c of it.contas || []) {
        if (c.tipo !== 'BANK' || c.saldo == null) continue;
        const movs = imports.value.filter((x) => x.conta === c.id);
        const primeira = movs.reduce((m, x) => (!m || x.data < m ? x.data : m), '');
        if (!atual && (!primeira || fim < primeira.slice(0, 7) + '-00')) continue; // conta ainda não usada nesse mês
        // reservado = cofrinhos/caixinhas automáticas que o banco tira do saldo disponível
        const res = c.reservado > 0 ? c.reservado : 0, base = c.saldo + res;
        const depois = movs.filter((x) => x.data > fim && !(res && P.internoDe(x, ctx.value.regras))).reduce((s2, x) => s2 + (x.saida ? -x.valor : x.valor), 0);
        lista.push({ nome: it.banco, saldo: atual ? base : base - depois, res: atual ? res : 0 });
      }
      return { atual, lista, total: lista.reduce((s2, x) => s2 + x.saldo, 0) };
    });
    const lote = reactive({ ativo: false, sel: new Set(), aberto: false, cat: '' });
    const selLista = computed(() => histMes.value.filter((y) => lote.sel.has(y.id)));
    const tipoLote = computed(() => selLista.value.length && selLista.value.every((y) => !y.saida) ? 'rec' : 'desp');
    function alternarSel(x) {
      const s2 = new Set(lote.sel);
      if (!s2.has(x.id) && selLista.value.length && selLista.value[0].saida !== x.saida) return avisar('Selecione só saídas ou só entradas');
      s2.has(x.id) ? s2.delete(x.id) : s2.add(x.id); lote.sel = s2;
    }
    const selTodos = () => { const sai = histMes.value.some((x) => x.saida); lote.sel = new Set(histMes.value.filter((x) => x.saida === sai).map((x) => x.id)); };
    async function aplicarLote() {
      if (!lote.cat) return avisar('Escolha a categoria');
      for (const x of selLista.value) await P.categorizarHistorico(x, lote.cat);
      avisar(`${lote.sel.size} lançamento(s) recategorizados`); Object.assign(lote, { aberto: false, ativo: false, sel: new Set(), cat: '' });
    }
    const optCatsDesp = computed(() => optCats('desp'));
    const hc = reactive({ aberto: false, x: null, cat: '', regra: false, padrao: '' });
    const abrirHist = (x) => Object.assign(hc, { aberto: true, x, cat: x.interno ? INTERNO : (x.cat || ''), regra: false, padrao: P.padraoDe(x.descricao) });
    async function salvarHist() {
      if (!hc.cat) return avisar('Escolha a categoria');
      await P.categorizarHistorico(hc.x, hc.cat);
      if (hc.regra && hc.padrao.trim()) await P.salvarRegra({ padrao: P.padraoDe(hc.padrao), categoriaId: hc.cat, nome: '' });
      hc.aberto = false; avisar(hc.regra ? 'Categoria salva e regra criada' : 'Categoria salva');
    }

    // alertas
    const vistosA = ref((() => { try { return new Set(JSON.parse(localStorage.getItem('alertasVistos') || '[]')); } catch { return new Set(); } })());
    const listaAlertas = computed(() => P.alertas({ importados: imports.value, lancs: D.lancs.value, categorias: D.categorias.value, fixas: D.fixas.value, regras: ctx.value.regras }).filter((a) => !vistosA.value.has(a.chave)));
    const det = reactive({ aberto: false, a: null });
    const detItens = computed(() => (det.a?.refs || []).map((r) => {
      if (r.imp) { const x = imports.value.find((y) => y.id === r.imp); return x ? { k: r.imp, x, data: x.data, nome: x.descricao, valor: x.valor, saida: x.saida, onde: x.banco + (x.tipoConta === 'CREDIT' ? ' cartão' : ' conta'), status: x.status } : null; }
      if (r.lanc) { const l = D.lancs.value.find((y) => y.id === r.lanc); return l ? { k: r.lanc, l, data: l.data, nome: l.descricao || 'Lançamento', valor: l.valorBRL ?? l.valor, saida: l.tipo === 'desp', onde: nomeCat(l.categoriaId), status: 'lancado' } : null; }
      return null;
    }).filter(Boolean).sort((a, b) => b.data.localeCompare(a.data)));
    function abrirAlerta(a) { Object.assign(det, { aberto: true, a }); }
    function abrirItemAlerta(it) {
      if (!it.x) return;
      if (it.x.status === 'historico') { det.aberto = false; abrirHist({ ...it.x, cat: it.x.categoriaApp || P.sugerir({ ...it.x }, ctx.value).categoriaId }); }
      else if (it.x.status === 'pendente') { det.aberto = false; abrir({ ...it.x, s: P.sugerir(it.x, ctx.value) }); }
    }
    function cadastrarAssinatura(a) { sessionStorage.setItem('assinNova', JSON.stringify({ nome: a.nome, valor: Math.round(a.valor * 100) / 100, dia: a.dia || 1 })); det.aberto = false; irAba('assin'); }
    const stTxt = { historico: 'histórico', pendente: 'na caixa de entrada', confirmado: 'confirmado', ignorado: 'ignorado', lancado: 'lançamento' };
    function dispensar(a) { const s = new Set(vistosA.value); s.add(a.chave); vistosA.value = s; try { localStorage.setItem('alertasVistos', JSON.stringify([...s].slice(-400))); } catch { /* */ } }

    // contas conectadas: vínculo e conferência de saldo
    const finTudo = computed(() => F.criarFin({ contas: D.contas.value, cartoes: D.cartoes.value, categorias: D.categorias.value, caixinhas: D.caixinhas.value, fixas: D.fixas.value, lancs: D.lancs.value, cotacao: cot.value.valor, hoje: hojeStr(), inicio: D.inicio.value?.data || '' }, 'tudo'));
    function saldoApp(refV) {
      const [t, id] = String(refV || '').split(':');
      if (t === 'c') { const c = finTudo.value.contas.find((x) => x.id === id); return c ? c.brl : null; }
      if (t === 'k') { const k = finTudo.value.cartoes.find((x) => x.id === id); return k ? k.usado : null; }
      return null;
    }
    async function vincular(c, v) { await P.salvarVinculo(c.id, v); avisar('Vínculo salvo'); }
    const regras = computed(() => cfgP.value?.regras || []);
    async function excluirRegra(r) { if (confirm(`Excluir a regra "${r.padrao}"?`)) await P.excluirRegra(r.padrao); }
    const abrirMeuPluggy = () => window.open('https://meu.pluggy.ai', '_blank', 'noopener');
    const ultTxt = computed(() => est.ultima ? new Date(est.ultima).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca');
    return { optFiltro, emo, tipoLote, det, detItens, abrirAlerta, abrirItemAlerta, cadastrarAssinatura, stTxt, filtroH, histTodos, catsTopo, saldosFim, lote, alternarSel, selTodos, aplicarLote, optCatsDesp, seg, irSeg, est, atualizar, pendentes, contaInfo, ed, abrir, ehCartao, lancJuntar, confirmar, ignorar, ignorados, verIgnorados, restaurar, optOrigem, optConta, optPara, optCats, nomeCat, nomeRef,
      mesH, histMes, resumoH, hc, abrirHist, salvarHist, listaAlertas, dispensar, cfgP, saldoApp, vincular, regras, excluirRegra, abrirMeuPluggy, ultTxt, fd, fmtR: F.fmtR, addMes: F.addMes, nomeMes: F.nomeMes };
  },
  template: `
  <div class="pilha banco">
    <div class="entre"><span class="suave">Atualizado: {{ ultTxt }}</span><button class="btn mini" :disabled="est.ocupado" @click="atualizar">{{ est.ocupado ? 'Buscando…' : 'Atualizar' }}</button></div>
    <p v-if="est.erro" class="alerta">{{ est.erro }}</p>
    <div class="seg-visao leit-status">
      <button :class="{ ativo: seg==='entrada' }" @click="irSeg('entrada')">Entrada <small>{{ pendentes.length }}</small></button>
      <button :class="{ ativo: seg==='hist' }" @click="irSeg('hist')">Histórico</button>
      <button :class="{ ativo: seg==='alertas' }" @click="irSeg('alertas')">Alertas <small>{{ listaAlertas.length }}</small></button>
      <button :class="{ ativo: seg==='contas' }" @click="irSeg('contas')">Contas</button>
    </div>

    <template v-if="seg==='entrada'">
      <p v-if="!pendentes.length" class="vazio">Caixa de entrada vazia. Toque em “Atualizar” para buscar no banco (a Pluggy atualiza os dados 1x por dia).</p>
      <button v-for="x in pendentes" :key="x.id" class="linha bx-item" @click="abrir(x)">
        <div class="linha-info"><strong>{{ x.s.nome }}</strong><span class="suave">{{ fd(x.data) }} · {{ x.banco }} {{ x.tipoConta==='CREDIT' ? 'cartão' : 'conta' }}{{ x.parcela ? ' · parcela ' + x.parcela.n + '/' + x.parcela.total : '' }}</span>
          <span v-if="x.s.motivo" class="bx-motivo">{{ x.s.motivo }}</span></div>
        <b class="num" :class="x.saida ? 'neg' : 'pos'">{{ x.saida ? '−' : '+' }} {{ fmtR(x.valor) }}</b>
      </button>
      <button v-if="ignorados.length" class="btn-link" @click="verIgnorados=!verIgnorados">{{ verIgnorados ? 'Esconder ignorados' : 'Ver ignorados (' + ignorados.length + ')' }}</button>
      <div v-if="verIgnorados" class="pilha"><div v-for="x in ignorados" :key="x.id" class="entre bx-ign"><span class="suave">{{ fd(x.data) }} · {{ x.descricao }} · {{ fmtR(x.valor) }}</span><button class="btn mini" @click="restaurar(x)">Voltar</button></div></div>
    </template>

    <template v-else-if="seg==='hist'">
      <p class="dica">Histórico do banco só para consulta e análise (não mexe nos saldos). Você pode corrigir a categoria.</p>
      <div class="cab-mes"><button class="btn-mini" @click="mesH=addMes(mesH,-1)" aria-label="Mês anterior">‹</button><b class="cresce centro">{{ nomeMes(mesH) }}</b><button class="btn-mini" @click="mesH=addMes(mesH,1)" aria-label="Próximo mês">›</button></div>
      <div v-if="histTodos.length" class="bx-resumo">
        <div class="mini-cartao"><small>Entradas</small><b class="num pos">{{ fmtR(resumoH.e) }}</b></div>
        <div class="mini-cartao"><small>Saídas</small><b class="num neg">{{ fmtR(resumoH.s) }}</b></div>
        <div class="mini-cartao"><small>Resultado</small><b class="num" :class="resumoH.e - resumoH.s >= 0 ? 'pos' : 'neg'">{{ fmtR(resumoH.e - resumoH.s) }}</b></div>
        <div class="mini-cartao"><small>{{ saldosFim.atual ? 'Saldo atual' : 'Saldo no fim do mês' }}</small><b class="num">{{ saldosFim.lista.length ? fmtR(saldosFim.total) : '—' }}</b><small v-if="saldosFim.lista.length" class="suave">{{ saldosFim.lista.map(s => s.nome + ' ' + fmtR(s.saldo) + (s.res ? ' (incl. ' + fmtR(s.res) + ' reservado)' : '')).join(' · ') }}</small></div>
      </div>
      <p v-if="resumoH.cats.length" class="dica">{{ resumoH.cats.slice(0, 5).map(([n, v]) => n + ' ' + fmtR(v)).join(' · ') }}<template v-if="resumoH.i"> · {{ resumoH.i }} movimento(s) de caixinha fora dos totais</template></p>
      <div v-if="histTodos.length" class="grade-2">
        <input v-model="filtroH.texto" placeholder="Buscar descrição" aria-label="Buscar no histórico">
        <select v-model="filtroH.cat" aria-label="Filtrar categoria ou subcategoria"><option value="">Todas as categorias</option><optgroup v-for="g in optFiltro" :key="g.rot" :label="g.rot"><option v-for="c in g.itens" :key="c.id" :value="c.id">{{ c.t }}</option></optgroup><optgroup label="Outros"><option value="__sem">❔ Sem categoria</option><option value="__interno">↔ Caixinhas (fora dos totais)</option></optgroup></select>
      </div>
      <div v-if="histMes.length" class="entre"><button class="btn mini" @click="lote.ativo = !lote.ativo; lote.sel = new Set()">{{ lote.ativo ? 'Cancelar seleção' : 'Selecionar vários' }}</button>
        <span v-if="lote.ativo" class="acoes"><button class="btn mini" @click="selTodos">Todos</button><button class="btn mini primario" :disabled="!lote.sel.size" @click="lote.aberto = true">Mudar categoria ({{ lote.sel.size }})</button></span></div>
      <p v-if="!histMes.length" class="vazio">{{ histTodos.length ? 'Nada com esse filtro.' : 'Sem histórico neste mês.' }}</p>
      <button v-for="x in histMes" :key="x.id" class="linha bx-item" :class="{ 'bx-sel': lote.sel.has(x.id), 'bx-int': x.interno }" @click="lote.ativo ? alternarSel(x) : abrirHist(x)">
        <span v-if="lote.ativo" class="bx-check">{{ lote.sel.has(x.id) ? '✓' : '' }}</span>
        <span class="bx-emo">{{ x.interno ? '↔' : emo(x.cat) }}</span><div class="linha-info"><strong>{{ x.descricao }}</strong><span class="suave">{{ fd(x.data) }} · {{ x.banco }} · {{ x.interno ? 'caixinha — não conta como entrada/saída' : nomeCat(x.cat) + (x.categoriaManual ? ' ✓' : '') }}</span></div>
        <b class="num" :class="x.interno ? 'suave' : x.saida ? 'neg' : 'pos'">{{ x.saida ? '−' : '+' }} {{ fmtR(x.valor) }}</b>
      </button>
    </template>

    <template v-else-if="seg==='alertas'">
      <p v-if="!listaAlertas.length" class="vazio">Nenhum alerta. Eles aparecem aqui quando algo foge do seu padrão.</p>
      <div v-for="a in listaAlertas" :key="a.chave" class="on-aviso" :class="a.nivel==='alto' ? 'neg' : a.nivel==='medio' ? 'alerta' : 'roxo'"><button class="on-aviso-txt" @click="abrirAlerta(a)">{{ a.texto }} ›</button><button class="btn-x" aria-label="Dispensar" @click="dispensar(a)">×</button></div>
    </template>

    <template v-else>
      <p class="dica">Bancos conectados pelo Meu Pluggy. Vincule cada conta do banco à conta ou ao cartão do app.</p>
      <div v-for="it in cfgP.contas || []" :key="it.itemId" class="caixa pilha">
        <div class="entre"><b>{{ it.banco || it.itemId }}</b><span class="suave">{{ it.erro ? 'erro' : (it.status === 'UPDATED' ? 'conectado ✓' : it.status) }}</span></div>
        <p v-if="it.erro" class="alerta">{{ it.erro }}</p>
        <p v-if="it.consentimentoAte" class="dica">Autorização válida até {{ fd(it.consentimentoAte.slice(0,10)) }} · dados do banco de {{ it.atualizadoEm ? new Date(it.atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' }}</p>
        <div v-for="c in it.contas || []" :key="c.id" class="pilha bx-conta">
          <div class="entre"><span>{{ c.tipo === 'CREDIT' ? 'Cartão' : 'Conta' }} {{ c.apelido || c.nome }} <small class="suave">{{ c.numero }}</small></span>
            <b class="num">{{ c.tipo === 'CREDIT' ? 'fatura ' + fmtR(c.saldo) : fmtR(c.saldo) }}</b></div>
          <span v-if="c.reservado > 0" class="dica">+ {{ fmtR(c.reservado) }} reservado (cofrinhos) · total {{ fmtR(c.saldo + c.reservado) }}</span>
          <label class="campo">Vincular a <select :value="(cfgP.mapa || {})[c.id] || ''" @change="vincular(c, $event.target.value)"><option value="">— não importar —</option><option v-for="o in optOrigem" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
          <span v-if="saldoApp((cfgP.mapa || {})[c.id]) != null" class="dica">No app: {{ c.tipo === 'CREDIT' ? 'usado ' : 'saldo ' }}{{ fmtR(saldoApp((cfgP.mapa || {})[c.id])) }}<template v-if="c.tipo==='CREDIT' && c.limite"> · limite no banco {{ fmtR(c.limite) }}, disponível {{ fmtR(c.disponivel) }}</template></span>
        </div>
      </div>
      <p v-if="!(cfgP.contas || []).length" class="vazio">Nenhuma conta ainda. Toque em “Atualizar”.</p>
      <button class="btn" @click="abrirMeuPluggy">Abrir meu.pluggy.ai (reconectar ou forçar atualização)</button>
      <h3 class="rotulo">Regras de categoria</h3>
      <p v-if="!regras.length" class="dica">Nenhuma regra. Crie ao confirmar ou ao corrigir uma categoria.</p>
      <div v-for="r in regras" :key="r.padrao" class="entre bx-ign"><span>“{{ r.padrao }}” → {{ nomeCat(r.categoriaId) }}{{ r.nome ? ' · nome: ' + r.nome : '' }}</span><button class="btn-x" aria-label="Excluir regra" @click="excluirRegra(r)">×</button></div>
    </template>

    <Modal v-if="ed.aberto" titulo="Confirmar movimentação" @fechar="ed.aberto=false">
      <p class="dica bx-orig">Banco: <b>{{ ed.x.descricao }}</b> · {{ fd(ed.x.data) }} · {{ ed.x.saida ? 'saída' : 'entrada' }} {{ fmtR(ed.x.valor) }}{{ ed.x.categoriaBanco ? ' · categoria do banco: ' + ed.x.categoriaBanco : '' }}{{ ed.x.metodo ? ' · ' + ed.x.metodo : '' }}{{ ed.x.contraparte ? ' · ' + ed.x.contraparte : '' }}</p>
      <p v-if="ed.v.motivo" class="bx-motivo">Sugestão: {{ ed.v.motivo }}</p>
      <label v-if="lancJuntar" class="caixa-linha"><input type="checkbox" v-model="ed.v.usarJuntar"> Juntar com “{{ lancJuntar.descricao || 'lançamento' }}” de {{ fd(lancJuntar.data) }} (não cria outro)</label>
      <template v-if="!ed.v.usarJuntar">
        <div class="abas-seg"><button :class="{ ativo: ed.v.tipo==='desp' }" @click="ed.v.tipo='desp'">Despesa</button><button :class="{ ativo: ed.v.tipo==='rec' }" @click="ed.v.tipo='rec'">Receita</button><button :class="{ ativo: ed.v.tipo==='transf' }" @click="ed.v.tipo='transf'">Transferência</button></div>
        <label class="campo">Nome <input v-model="ed.v.nome"></label>
        <div class="grade-2">
          <label class="campo">Valor <input v-model="ed.v.valor" inputmode="decimal"></label>
          <label class="campo">Data <input type="date" v-model="ed.v.data"></label>
        </div>
        <template v-if="ed.v.tipo!=='transf'">
          <label class="campo">Conta / cartão <select v-model="ed.v.origem"><option value="">Escolha…</option><option v-for="o in optOrigem" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
          <div v-if="ehCartao && ed.v.tipo==='desp'" class="grade-2">
            <label class="campo">Parcelas <input v-model="ed.v.parcelas" inputmode="numeric"></label>
            <label v-if="+ed.v.parcelas > 1" class="campo">Valor total da compra <input v-model="ed.v.valorTotal" inputmode="decimal"></label>
          </div>
          <div class="campo"><span>Categoria</span><CatPicker v-model="ed.v.categoriaId" :tipo="ed.v.tipo"></CatPicker></div>
          <label class="caixa-linha"><input type="checkbox" v-model="ed.v.criarRegra"> Sempre categorizar assim</label>
          <label v-if="ed.v.criarRegra" class="campo">Quando a descrição contiver <input v-model="ed.v.padrao"></label>
        </template>
        <template v-else>
          <label class="campo">De <select v-model="ed.v.de"><option value="">Escolha…</option><option v-for="o in optConta" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
          <label class="campo">Para <select v-model="ed.v.para"><option value="">Escolha…</option><option v-for="o in optPara" :key="o.v" :value="o.v">{{ o.t }}</option></select></label>
        </template>
      </template>
      <div class="acoes"><button class="btn" @click="ignorar">Ignorar</button><span class="espaco"></span><button class="btn" @click="ed.aberto=false">Depois</button><button class="btn primario" @click="confirmar">Confirmar</button></div>
    </Modal>

    <Modal v-if="det.aberto" titulo="Detalhes do alerta" @fechar="det.aberto=false">
      <p class="dica">{{ det.a.texto }}</p>
      <p v-if="!detItens.length" class="vazio">Não encontrei os lançamentos deste alerta.</p>
      <button v-for="it in detItens" :key="it.k" class="linha bx-item" @click="abrirItemAlerta(it)">
        <div class="linha-info"><strong>{{ it.nome }}</strong><span class="suave">{{ fd(it.data) }} · {{ it.onde }} · {{ stTxt[it.status] }}</span></div>
        <b class="num" :class="it.saida ? 'neg' : 'pos'">{{ it.saida ? '−' : '+' }} {{ fmtR(it.valor) }}</b>
      </button>
      <p class="dica">Toque num item do histórico para corrigir a categoria, ou num item da caixa de entrada para confirmar/ignorar.</p>
      <div class="acoes">
        <button v-if="det.a.acao==='assinatura'" class="btn primario" @click="cadastrarAssinatura(det.a)">Cadastrar como assinatura</button>
        <button class="btn" @click="dispensar(det.a); det.aberto=false">{{ det.a.tipo==='dup' ? 'Não é duplicado' : 'Dispensar alerta' }}</button>
        <button class="btn" @click="det.aberto=false">Fechar</button>
      </div>
    </Modal>

    <Modal v-if="lote.aberto" :titulo="'Mudar categoria de ' + lote.sel.size + ' lançamento(s)'" @fechar="lote.aberto=false">
      <CatPicker v-model="lote.cat" :tipo="tipoLote" interno></CatPicker>
      <div class="acoes"><button class="btn" @click="lote.aberto=false">Cancelar</button><button class="btn primario" @click="aplicarLote">Aplicar</button></div>
    </Modal>

    <Modal v-if="hc.aberto" titulo="Categoria (histórico)" @fechar="hc.aberto=false">
      <p class="dica">{{ hc.x.descricao }} · {{ fd(hc.x.data) }} · {{ fmtR(hc.x.valor) }} · {{ hc.x.banco }}</p>
      <CatPicker v-model="hc.cat" :tipo="hc.x.saida ? 'desp' : 'rec'" interno></CatPicker>
      <label class="caixa-linha"><input type="checkbox" v-model="hc.regra"> Aplicar a todos parecidos (criar regra)</label>
      <label v-if="hc.regra" class="campo">Quando a descrição contiver <input v-model="hc.padrao"></label>
      <div class="acoes"><button class="btn" @click="hc.aberto=false">Cancelar</button><button class="btn primario" @click="salvarHist">Salvar</button></div>
    </Modal>
  </div>`
};
