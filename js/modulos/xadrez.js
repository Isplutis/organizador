// Duolingo › Xadrez: Aberturas | Mates e táticas | Partidas | Progresso
import { ref, reactive, computed, onMounted } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { avisar, Modal } from '../ui.js';
import { Chess } from '../../lib/chess.mjs';
import * as X from '../servicos/xadrez-servico.js';
import * as E from '../servicos/estudos-servico.js';
import { hojeStr } from '../servicos/rotina-servico.js';
import * as I from '../servicos/idiomas-servico.js';
import { ABERTURAS_SUG } from '../dados/xadrez-aberturas.js';
import { PADROES, TEMAS } from '../dados/xadrez-padroes.js';
import Tabuleiro from './xadrez-tabuleiro.js';
import { Visualizador, Gravador, TreinoAbertura, TreinoPadrao } from './xadrez-pecas.js';

const SUBS = [['aberturas', '📖 Aberturas'], ['taticas', '⚔️ Mates e táticas'], ['partidas', '🗒️ Partidas'], ['progresso', '📈 Progresso']];
const fimDe = (lances, fen) => { const c = fen ? new Chess(fen) : new Chess(); let u = null; for (const m of lances || []) { try { u = c.move(m); } catch { break; } } return { fen: c.fen(), ult: u ? [u.from, u.to] : [] }; };
const fd = (d) => d ? d.split('-').reverse().join('/') : '';

export default {
  components: { Modal, Tabuleiro, Visualizador, Gravador, TreinoAbertura, TreinoPadrao },
  setup() {
    const sub = ref(sessionStorage.getItem('xadrezSub') || 'aberturas');
    const irSub = (k) => { sub.value = k; sessionStorage.setItem('xadrezSub', k); tela.tipo = ''; };
    const aberturas = vivo(() => db.xAberturas.toArray(), []), partidas = vivo(() => db.xPartidas.toArray(), []), treinos = vivo(() => db.xTreinos.toArray(), []);
    const pad = vivo(() => X.lerPadroes(), { liberados: [], srs: {}, notas: {}, proprios: [] });
    const ratings = vivo(() => db.duoRating.filter((r) => !r.excluido).sortBy('data'), []);
    const cc = vivo(() => db.meta.get('chesscomCache'), null), cfg = vivo(() => I.lerCfg(), { chesscom: '' });
    const hoje = hojeStr();
    const minhas = computed(() => aberturas.value.filter((a) => !a.excluido).sort((a, b) => a.cor.localeCompare(b.cor) || a.nome.localeCompare(b.nome, 'pt-BR')));
    const pendAb = computed(() => X.linhasPendentes(minhas.value, hoje));
    const pendDe = (a) => X.linhasPendentes([a], hoje).length;
    const sugestoes = computed(() => ABERTURAS_SUG.filter((s) => !minhas.value.some((a) => a.origem === 'sugestao:' + s.id)));
    // telas internas: '', 'abertura', 'editarAb', 'treinoAb', 'padrao', 'novoPadrao', 'treinoPad', 'partida', 'fimTreino'
    const tela = reactive({ tipo: '', a: null, l: null, p: null, fila: [], res: null, volta: '' });
    // ---------- aberturas ----------
    const abrirAb = (a) => Object.assign(tela, { tipo: 'abertura', a, l: a.linhas?.[0] || null });
    const edAb = reactive({ v: null, linha: null });
    function novaAb() { edAb.v = { nome: '', cor: 'w', ideia: '', armadilhas: '', link: '', notas: '', linhas: [] }; edAb.linha = { nome: 'Linha principal', lances: [] }; tela.tipo = 'editarAb'; }
    function editarAb(a) { edAb.v = JSON.parse(JSON.stringify(a)); edAb.linha = null; tela.tipo = 'editarAb'; }
    function novaLinha(a) { edAb.v = JSON.parse(JSON.stringify(a)); edAb.linha = { nome: 'Variante ' + ((a.linhas || []).length + 1), lances: [...(tela.l?.lances || []).slice(0, 4)] }; tela.tipo = 'editarAb'; }
    function editarLinha(a, l) { edAb.v = JSON.parse(JSON.stringify(a)); edAb.linha = JSON.parse(JSON.stringify(l)); tela.tipo = 'editarAb'; }
    async function salvarAb() {
      const v = edAb.v; if (!v.nome.trim()) return avisar('Dê um nome à abertura');
      if (edAb.linha) { if (!edAb.linha.lances.length) return avisar('Grave pelo menos um lance na linha'); const ls = (v.linhas || []).filter((l) => l.id !== edAb.linha.id); v.linhas = [...ls, edAb.linha]; }
      const id = await X.salvarAbertura(v); avisar('Abertura salva');
      const a = await db.xAberturas.get(id); abrirAb(a); if (edAb.linha?.id) tela.l = a.linhas.find((l) => l.id === edAb.linha.id) || a.linhas[0]; else tela.l = a.linhas[a.linhas.length - 1];
    }
    async function excluirLinha(a, l) { if (!confirm('Excluir esta linha?')) return; await X.salvarAbertura({ ...a, linhas: a.linhas.filter((x) => x.id !== l.id) }); const n = await db.xAberturas.get(a.id); abrirAb(n); }
    async function excluirAb(a) { if (!confirm('Excluir a abertura "' + a.nome + '"?')) return; await X.excluirAbertura(a.id); tela.tipo = ''; }
    async function marcarDominada(a) { await X.salvarAbertura({ ...a, status: a.status === 'dominada' ? 'aprendendo' : 'dominada' }); tela.a = await db.xAberturas.get(a.id); }
    const sugAberta = ref('');
    async function addSug(s) { await X.adicionarSugestao(s); avisar(s.nome + ' entrou no seu repertório'); sugAberta.value = ''; }
    function treinarAb(lista, volta = 'aberturas') { if (!lista.length) return avisar('Nada para revisar agora 🎉'); Object.assign(tela, { tipo: 'treinoAb', fila: lista.slice(0, 15), volta }); }
    // ---------- padrões ----------
    const todos = computed(() => X.todosPadroes(pad.value));
    const lib = computed(() => new Set(pad.value.liberados));
    const pendPad = computed(() => X.padroesPendentes(pad.value, hoje));
    const grupo = (tipo) => todos.value.filter((p) => (p.tipo === tipo) && !p.proprio).sort((a, b) => a.nivel - b.nivel);
    const proprios = computed(() => todos.value.filter((p) => p.proprio));
    const abrirPad = (p) => Object.assign(tela, { tipo: 'padrao', p, nota: pad.value.notas[p.id] || '' });
    const notaPad = ref('');
    async function liberar(p) { await X.liberarPadrao(p.id); abrirPad(p); notaPad.value = ''; }
    async function salvarNota(p) { await X.salvarNotaPadrao(p.id, notaPad.value); avisar('Anotação salva'); }
    function treinarPad(lista) { if (!lista.length) return avisar('Nada para treinar agora. Libere padrões ou volte amanhã.'); Object.assign(tela, { tipo: 'treinoPad', fila: lista.slice(0, 15), volta: 'taticas' }); }
    const novoP = reactive({ v: null, fenOk: true });
    function novoPadrao() { novoP.v = { nome: '', tipo: 'tatica', tema: 'Garfo', fen: '', solucao: [], reconhecer: '' }; tela.tipo = 'novoPadrao'; }
    const fenValida = computed(() => { try { if (!novoP.v?.fen) return false; new Chess(novoP.v.fen.trim()); return true; } catch { return false; } });
    async function salvarPadrao() {
      const v = novoP.v; if (!v.nome.trim()) return avisar('Dê um nome'); if (!fenValida.value) return avisar('Posição (FEN) inválida'); if (!v.solucao.length) return avisar('Jogue a solução no tabuleiro');
      const c = new Chess(v.fen.trim()); for (const m of v.solucao) c.move(m);
      if (v.tipo === 'mate' && !c.isCheckmate()) return avisar('A solução não termina em mate');
      await X.salvarProprio({ ...v, fen: v.fen.trim() }); avisar('Posição salva'); tela.tipo = '';
    }
    async function excluirProprio(p) { if (!confirm('Excluir esta posição?')) return; await X.excluirProprio(p.id); tela.tipo = ''; }
    const temaErro = ref('');
    async function erroManual(t) { await X.registrarErroManual(t); avisar('Anotado: errei ' + t.toLowerCase()); }
    // ---------- partidas ----------
    const est = computed(() => X.estatPartidas(partidas.value));
    const fP = ref('todas');
    const listaP = computed(() => partidas.value.filter((p) => !p.excluido && (fP.value === 'todas' || (fP.value === 'manual' ? p.origem === 'manual' : fP.value === 'cc' ? p.origem === 'chesscom' : p.resultado === fP.value))).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 60));
    const edP = reactive({ aberto: false, v: {} });
    const novaPartida = () => Object.assign(edP, { aberto: true, v: { data: hoje, cor: 'w', resultado: 'v', adversario: '', ratingAdv: '', abertura: '', link: '', pgn: '', licao: '' } });
    const editarPartida = (p) => Object.assign(edP, { aberto: true, v: { ...p } });
    async function salvarPartida() { if (edP.v.pgn) { const r = X.lerTextoLances(edP.v.pgn); if (!r.ok) return avisar('PGN inválido: ' + r.erro); } await X.salvarPartida(edP.v); edP.aberto = false; avisar('Partida salva'); if (tela.tipo === 'partida') tela.p = await db.xPartidas.get(edP.v.id) || tela.p; }
    async function excluirPartida() { if (!confirm('Excluir esta partida?')) return; await X.excluirPartida(edP.v.id); edP.aberto = false; tela.tipo = ''; }
    const lancesPartida = (p) => p?.pgn ? X.lerTextoLances(p.pgn).lances : [];
    const ccEst = reactive({ ocupado: false });
    async function atualizarCC() { ccEst.ocupado = true; try { const r = await X.atualizarChesscom(); avisar(r.novas ? r.novas + ' partida(s) nova(s) do Chess.com' : 'Chess.com atualizado (nada novo)'); } catch (e) { avisar(e.message); } ccEst.ocupado = false; }
    const userCC = reactive({ aberto: false, v: '' });
    async function salvarUserCC() { await I.salvarCfg({ chesscom: userCC.v.trim() }); userCC.aberto = false; }
    // ---------- progresso ----------
    const fracos = computed(() => X.pontosFracos(treinos.value, hoje));
    const maxFraco = computed(() => Math.max(1, ...fracos.value.map((f) => f.er)));
    const t30 = computed(() => { const d = treinos.value.filter((t) => !t.excluido && t.data > new Date(Date.now() - 30 * 864e5).toLocaleDateString('sv-SE') && t.tipo !== 'manual'); return { n: d.length, ok: d.filter((t) => t.ok).length }; });
    const rating = computed(() => ratings.value[ratings.value.length - 1]);
    const evol = computed(() => ratings.value.slice(-12));
    const maxR = computed(() => Math.max(...evol.value.map((r) => r.valor), 1)), minR = computed(() => Math.min(...evol.value.map((r) => r.valor)));
    const edR = reactive({ aberto: false, v: '' });
    async function salvarRating() { const n = parseInt(edR.v, 10); if (!(n >= 0)) return avisar('Número inválido'); await E.salvarRating(n); edR.aberto = false; }
    function treinarTema(t) { const ps = todos.value.filter((p) => p.tema === t); const lib2 = ps.filter((p) => lib.value.has(p.id)); if (!ps.length) return avisar('Ainda não há posições desse tema. Crie uma em Mates e táticas.'); if (!lib2.length) { irSub('taticas'); return avisar('Libere as posições de "' + t + '" para treinar'); } treinarPad(lib2); }
    function fimTreino(r) { Object.assign(tela, { tipo: 'fimTreino', res: r }); }
    // atalho vindo da aba Hoje
    onMounted(() => { const k = sessionStorage.getItem('xadrezIniciar'); if (!k) return; sessionStorage.removeItem('xadrezIniciar'); setTimeout(() => { if (k === 'aberturas') treinarAb(pendAb.value); else treinarPad(pendPad.value); }, 300); });
    return { SUBS, sub, irSub, tela, minhas, pendAb, pendDe, sugestoes, abrirAb, edAb, novaAb, editarAb, novaLinha, editarLinha, salvarAb, excluirLinha, excluirAb, marcarDominada, sugAberta, addSug, treinarAb,
      todos, lib, pendPad, grupo, proprios, abrirPad, notaPad, liberar, salvarNota, treinarPad, novoP, novoPadrao, fenValida, salvarPadrao, excluirProprio, temaErro, erroManual, TEMAS,
      est, fP, listaP, edP, novaPartida, editarPartida, salvarPartida, excluirPartida, lancesPartida, ccEst, atualizarCC, userCC, salvarUserCC, cc, cfg,
      fracos, maxFraco, t30, rating, evol, maxR, minR, edR, salvarRating, treinarTema, fimTreino, fimDe, fd, pad, X };
  },
  template: `
  <div class="pilha xadrez">
    <div class="sub-abas"><button v-for="s in SUBS" :key="s[0]" class="chip" :class="{ ativo: sub===s[0] && !tela.tipo.startsWith('treino') }" @click="irSub(s[0])">{{ s[1] }}</button></div>

    <!-- TREINOS E RESULTADO -->
    <TreinoAbertura v-if="tela.tipo==='treinoAb'" :fila="tela.fila" @fim="fimTreino"></TreinoAbertura>
    <TreinoPadrao v-else-if="tela.tipo==='treinoPad'" :fila="tela.fila" @fim="fimTreino"></TreinoPadrao>
    <div v-else-if="tela.tipo==='fimTreino'" class="caixa centro-col pilha"><span class="t-emo">{{ tela.res.total && tela.res.acertos/tela.res.total >= .8 ? '🏆' : '♟️' }}</span><b class="grande-3">{{ tela.res.acertos }} / {{ tela.res.total }}</b><small class="suave">sem ajuda / concluídos</small><button class="btn primario" @click="tela.tipo=''">Fechar</button></div>

    <!-- ABERTURAS -->
    <template v-else-if="sub==='aberturas'">
      <template v-if="tela.tipo==='abertura'">
        <div class="entre"><button class="btn-link" @click="tela.tipo=''">‹ Aberturas</button><span class="suave">{{ tela.a.cor==='w' ? '⚪ de brancas' : '⚫ de pretas' }}</span></div>
        <h3 class="x-titulo">{{ tela.a.nome }} <small v-if="tela.a.status==='dominada'" class="pos">✓ dominada</small></h3>
        <div v-if="tela.a.linhas.length > 1" class="sub-abas"><button v-for="l in tela.a.linhas" :key="l.id" class="chip" :class="{ ativo: tela.l && tela.l.id===l.id }" @click="tela.l = l">{{ l.nome || 'linha' }}</button></div>
        <Visualizador v-if="tela.l" :key="tela.l.id" :lances="tela.l.lances" :orientacao="tela.a.cor"></Visualizador>
        <p v-if="tela.a.ideia" class="dica">💡 {{ tela.a.ideia }}</p>
        <p v-if="tela.a.armadilhas" class="dica">⚠️ {{ tela.a.armadilhas }}</p>
        <p v-if="tela.a.notas" class="dica">📝 {{ tela.a.notas }}</p>
        <a v-if="tela.a.link" :href="tela.a.link" target="_blank" rel="noopener" class="btn-link">Abrir link de estudo ↗</a>
        <div class="chips"><button class="chip ativo" @click="treinarAb(X.linhasPendentes([tela.a], '', true))">🎯 Treinar</button><button class="chip" @click="novaLinha(tela.a)">+ Variante</button><button v-if="tela.l" class="chip" @click="editarLinha(tela.a, tela.l)">Editar linha</button><button class="chip" @click="editarAb(tela.a)">Editar abertura</button><button class="chip" @click="marcarDominada(tela.a)">{{ tela.a.status==='dominada' ? 'Voltar a aprender' : 'Marcar dominada' }}</button></div>
        <div class="acoes"><button v-if="tela.l && tela.a.linhas.length > 1" class="btn mini perigo" @click="excluirLinha(tela.a, tela.l)">Excluir linha</button><button class="btn mini perigo" @click="excluirAb(tela.a)">Excluir abertura</button></div>
      </template>
      <template v-else-if="tela.tipo==='editarAb'">
        <div class="entre"><button class="btn-link" @click="tela.tipo = tela.a ? 'abertura' : ''">‹ Voltar</button><b>{{ edAb.v.id ? 'Editar' : 'Nova abertura' }}</b></div>
        <label class="campo">Nome <input v-model="edAb.v.nome" placeholder="ex.: Italiana"></label>
        <div class="campo"><span>Você joga com</span><div class="seg-visao"><button :class="{ ativo: edAb.v.cor==='w' }" @click="edAb.v.cor='w'">⚪ Brancas</button><button :class="{ ativo: edAb.v.cor==='b' }" @click="edAb.v.cor='b'">⚫ Pretas</button></div></div>
        <template v-if="edAb.linha"><label class="campo">Nome da linha <input v-model="edAb.linha.nome"></label><Gravador v-model="edAb.linha.lances" :orientacao="edAb.v.cor"></Gravador></template>
        <label class="campo">Ideia / plano <input v-model="edAb.v.ideia"></label>
        <label class="campo">Armadilhas <input v-model="edAb.v.armadilhas"></label>
        <label class="campo">Link (Lichess, Chess.com, vídeo) <input v-model="edAb.v.link" inputmode="url"></label>
        <label class="campo">Anotações <input v-model="edAb.v.notas"></label>
        <div class="acoes"><button class="btn" @click="tela.tipo = tela.a ? 'abertura' : ''">Cancelar</button><button class="btn primario" @click="salvarAb">Salvar</button></div>
      </template>
      <template v-else>
        <div class="caixa entre"><div class="pilha-p"><b class="grande-3">{{ pendAb.length }}</b><small class="suave">linhas para revisar hoje</small></div><button class="btn" :class="pendAb.length ? 'primario' : ''" @click="treinarAb(pendAb.length ? pendAb : X.linhasPendentes(minhas, '', true))">{{ pendAb.length ? 'Revisar' : 'Treinar todas' }}</button></div>
        <div class="entre"><h3 class="rotulo">Meu repertório</h3><button class="btn mini primario" @click="tela.a=null; novaAb()">+ Abertura</button></div>
        <button v-for="a in minhas" :key="a.id" class="linha bx-item" @click="abrirAb(a)"><span class="bx-emo">{{ a.cor==='w' ? '⚪' : '⚫' }}</span><div class="linha-info"><strong>{{ a.nome }}</strong><span class="suave">{{ a.linhas.length }} linha(s){{ a.status==='dominada' ? ' · dominada ✓' : '' }}{{ pendDe(a) ? ' · ' + pendDe(a) + ' para revisar' : '' }}</span></div></button>
        <p v-if="!minhas.length" class="vazio">Escolha nas sugestões abaixo ou grave a sua jogando no tabuleiro.</p>
        <h3 class="rotulo">Sugestões</h3>
        <div v-for="s in sugestoes" :key="s.id" class="caixa pilha-p">
          <button class="entre btn-sem" @click="sugAberta = sugAberta===s.id ? '' : s.id"><span>{{ s.cor==='w' ? '⚪' : '⚫' }} <b>{{ s.nome }}</b></span><small class="suave">{{ sugAberta===s.id ? 'fechar' : 'ver' }}</small></button>
          <template v-if="sugAberta===s.id"><Visualizador :lances="s.lances" :orientacao="s.cor"></Visualizador><p class="dica">💡 {{ s.ideia }}</p><button class="btn primario" @click="addSug(s)">Adicionar ao repertório</button></template>
        </div>
      </template>
    </template>

    <!-- MATES E TÁTICAS -->
    <template v-else-if="sub==='taticas'">
      <template v-if="tela.tipo==='padrao'">
        <div class="entre"><button class="btn-link" @click="tela.tipo=''">‹ Mates e táticas</button><small class="suave">{{ tela.p.tema }}</small></div>
        <h3 class="x-titulo">{{ tela.p.nome }}</h3>
        <Tabuleiro :fen="tela.p.fen" :orientacao="tela.p.fen.split(' ')[1]" :interativo="false"></Tabuleiro>
        <p class="dica">🔎 {{ tela.p.reconhecer }}</p>
        <label class="campo">Minha anotação <input v-model="notaPad" :placeholder="pad.notas[tela.p.id] || ''"></label>
        <div class="acoes"><button v-if="tela.p.proprio" class="btn mini perigo" @click="excluirProprio(tela.p)">Excluir</button><button v-else class="btn mini" @click="X.esconderPadrao(tela.p.id); tela.tipo=''">Esconder</button><button class="btn mini" @click="salvarNota(tela.p)">Salvar anotação</button><button class="btn mini primario" @click="treinarPad([tela.p])">Resolver</button></div>
      </template>
      <template v-else-if="tela.tipo==='novoPadrao'">
        <div class="entre"><button class="btn-link" @click="tela.tipo=''">‹ Voltar</button><b>Nova posição</b></div>
        <label class="campo">Nome <input v-model="novoP.v.nome"></label>
        <div class="grade-2"><label class="campo">Tipo <select v-model="novoP.v.tipo"><option value="tatica">Tática</option><option value="mate">Mate</option></select></label><label class="campo">Tema <select v-model="novoP.v.tema"><option v-for="t in TEMAS" :key="t">{{ t }}</option></select></label></div>
        <label class="campo">Posição (FEN) <input v-model="novoP.v.fen" placeholder="cole o FEN (Lichess/Chess.com: Compartilhar › FEN)" @input="novoP.v.solucao=[]"></label>
        <template v-if="fenValida"><p class="dica">Agora jogue a solução (os lances dos dois lados):</p><Gravador :key="novoP.v.fen" v-model="novoP.v.solucao" :fen="novoP.v.fen.trim()" :orientacao="novoP.v.fen.trim().split(' ')[1]"></Gravador></template>
        <p v-else-if="novoP.v.fen" class="alerta">FEN inválido.</p>
        <label class="campo">Como reconhecer <input v-model="novoP.v.reconhecer"></label>
        <div class="acoes"><button class="btn" @click="tela.tipo=''">Cancelar</button><button class="btn primario" @click="salvarPadrao">Salvar</button></div>
      </template>
      <template v-else>
        <div class="caixa entre"><div class="pilha-p"><b class="grande-3">{{ pendPad.length }}</b><small class="suave">posições para revisar hoje</small></div><button class="btn" :class="pendPad.length ? 'primario' : ''" @click="treinarPad(pendPad.length ? pendPad : X.padroesPendentes(pad, '', { todos: true }))">{{ pendPad.length ? 'Revisar' : 'Treinar liberadas' }}</button></div>
        <p class="dica">As posições ficam escondidas: libere quando quiser estudar cada padrão.</p>
        <h3 class="rotulo">Padrões de mate</h3>
        <div v-for="p in grupo('mate')" :key="p.id" class="linha bx-item"><span class="bx-emo">{{ lib.has(p.id) ? '♚' : '🔒' }}</span><button class="linha-info btn-sem" @click="lib.has(p.id) ? abrirPad(p) : null"><strong>{{ p.nome }}</strong><span class="suave">{{ '★'.repeat(p.nivel) }} · {{ p.solucao.length > 1 ? 'mate em ' + Math.ceil(p.solucao.length/2) : 'mate em 1' }}</span></button><button v-if="!lib.has(p.id)" class="btn mini" @click="liberar(p)">Liberar</button></div>
        <h3 class="rotulo">Táticas</h3>
        <div v-for="p in grupo('tatica')" :key="p.id" class="linha bx-item"><span class="bx-emo">{{ lib.has(p.id) ? '⚔️' : '🔒' }}</span><button class="linha-info btn-sem" @click="lib.has(p.id) ? abrirPad(p) : null"><strong>{{ p.nome }}</strong><span class="suave">{{ '★'.repeat(p.nivel) }} · {{ p.tema }}</span></button><button v-if="!lib.has(p.id)" class="btn mini" @click="liberar(p)">Liberar</button></div>
        <div class="entre"><h3 class="rotulo">Minhas posições</h3><button class="btn mini" @click="novoPadrao">+ Posição</button></div>
        <button v-for="p in proprios" :key="p.id" class="linha bx-item" @click="abrirPad(p)"><span class="bx-emo">✏️</span><div class="linha-info"><strong>{{ p.nome }}</strong><span class="suave">{{ p.tema }}</span></div></button>
        <div class="caixa pilha-p"><b>Errei um problema no Duolingo</b><small class="suave">Toque no tema para anotar. Vira estatística em Progresso › Pontos fracos.</small>
          <div class="chips"><button v-for="t in TEMAS" :key="t" class="chip" @click="erroManual(t)">{{ t }}</button></div></div>
      </template>
    </template>

    <!-- PARTIDAS -->
    <template v-else-if="sub==='partidas'">
      <template v-if="tela.tipo==='partida'">
        <div class="entre"><button class="btn-link" @click="tela.tipo=''">‹ Partidas</button><button class="btn mini" @click="editarPartida(tela.p)">Editar</button></div>
        <h3 class="x-titulo">{{ tela.p.resultado==='v' ? 'Vitória' : tela.p.resultado==='d' ? 'Derrota' : 'Empate' }} {{ tela.p.cor==='w' ? 'de brancas' : 'de pretas' }}<small class="suave"> · {{ fd(tela.p.data) }}</small></h3>
        <p class="suave">{{ tela.p.adversario || 'adversário' }}{{ tela.p.ratingAdv ? ' (' + tela.p.ratingAdv + ')' : '' }}{{ tela.p.abertura ? ' · ' + tela.p.abertura : '' }}{{ tela.p.ritmo ? ' · ' + tela.p.ritmo : '' }}</p>
        <Visualizador v-if="lancesPartida(tela.p).length" :lances="lancesPartida(tela.p)" :orientacao="tela.p.cor" :inicio="0"></Visualizador>
        <p v-if="tela.p.licao" class="dica">📝 {{ tela.p.licao }}</p>
        <a v-if="tela.p.link" :href="tela.p.link" target="_blank" rel="noopener" class="btn-link">Abrir no Chess.com ↗</a>
      </template>
      <template v-else>
        <div class="bx-resumo">
          <div class="mini-cartao"><small>Partidas</small><b class="num">{{ est.total.n }}</b><small class="suave">{{ est.total.v }}V {{ est.total.e }}E {{ est.total.d }}D</small></div>
          <div class="mini-cartao"><small>Aproveitamento</small><b class="num">{{ est.total.pct != null ? est.total.pct + '%' : '—' }}</b><small class="suave">⚪ {{ est.brancas.pct ?? '—' }}% · ⚫ {{ est.pretas.pct ?? '—' }}%</small></div>
        </div>
        <template v-if="est.aberturas.length"><h3 class="rotulo">Aberturas mais jogadas</h3>
          <div v-for="a in est.aberturas" :key="a.nome" class="meta-l" :data-tip="a.nome + ': ' + a.v + 'V ' + a.e + 'E ' + a.d + 'D'"><span class="x-ab">{{ a.nome }}</span><div class="barra-prog"><i :style="{ width: a.pct + '%' }"></i></div><b class="num">{{ a.pct }}%</b></div></template>
        <div class="caixa pilha-p"><div class="entre"><div class="pilha-p"><small class="suave">Chess.com</small><b>{{ cfg.chesscom || 'não informado' }}</b></div><button class="btn mini" @click="userCC.v = cfg.chesscom || ''; userCC.aberto = true">{{ cfg.chesscom ? 'Alterar' : 'Informar' }}</button></div>
          <button class="btn" :disabled="ccEst.ocupado || !cfg.chesscom" @click="atualizarCC">{{ ccEst.ocupado ? 'Buscando…' : '↻ Buscar partidas (últimos 3 meses)' }}</button></div>
        <div class="entre"><div class="sub-abas"><button v-for="f in [['todas','Todas'],['v','Vitórias'],['d','Derrotas'],['e','Empates'],['cc','Chess.com'],['manual','Manuais']]" :key="f[0]" class="chip" :class="{ ativo: fP===f[0] }" @click="fP=f[0]">{{ f[1] }}</button></div></div>
        <button class="btn" @click="novaPartida">+ Anotar partida</button>
        <button v-for="p in listaP" :key="p.id" class="linha bx-item" @click="Object.assign(tela, { tipo: 'partida', p })"><span class="bx-emo">{{ p.resultado==='v' ? '🟢' : p.resultado==='d' ? '🔴' : '⚪' }}</span><div class="linha-info"><strong>{{ p.adversario || 'partida' }}{{ p.ratingAdv ? ' (' + p.ratingAdv + ')' : '' }}</strong><span class="suave">{{ fd(p.data) }} · {{ p.cor==='w' ? 'brancas' : 'pretas' }}{{ p.abertura ? ' · ' + p.abertura : '' }}{{ p.licao ? ' · 📝' : '' }}</span></div></button>
        <p v-if="!listaP.length" class="vazio">Nenhuma partida ainda. Quando voltar a jogar no Chess.com, toque em “Buscar partidas”.</p>
      </template>
    </template>

    <!-- PROGRESSO -->
    <template v-else-if="sub==='progresso'">
      <div class="caixa entre"><div class="pilha-p"><small class="suave">Rating do Xadrez (Duolingo)</small><b class="grande-3">{{ rating ? rating.valor : '—' }}</b><small class="suave" v-if="rating">em {{ fd(rating.data) }}</small></div><button class="btn" @click="edR.v = rating ? String(rating.valor) : ''; edR.aberto = true">Atualizar</button></div>
      <div v-if="evol.length > 1" class="grafico-rating"><i v-for="r in evol" :key="r.id" :style="{ height: (20 + 80 * (r.valor - minR) / Math.max(1, maxR - minR)) + '%' }" :data-tip="fd(r.data) + ': ' + r.valor"></i></div>
      <div v-if="cc && cc.quando" class="bx-resumo">
        <div v-for="k in [['rapida','Rápida'],['blitz','Blitz'],['bullet','Bullet'],['diaria','Diária'],['problemas','Problemas']].filter(k => cc[k[0]])" :key="k[0]" class="mini-cartao"><small>Chess.com · {{ k[1] }}</small><b class="num">{{ cc[k[0]] }}</b></div>
      </div>
      <div class="bx-resumo"><div class="mini-cartao"><small>Treinos (30 dias)</small><b class="num">{{ t30.n }}</b><small class="suave">{{ t30.n ? Math.round(t30.ok / t30.n * 100) + '% sem ajuda' : '' }}</small></div>
        <div class="mini-cartao"><small>Repertório</small><b class="num">{{ minhas.length }}</b><small class="suave">{{ minhas.filter(a => a.status==='dominada').length }} dominada(s)</small></div></div>
      <h3 class="rotulo">Pontos fracos (30 dias)</h3>
      <div v-for="f in fracos" :key="f.tema" class="fraco"><div class="meta-l" :data-tip="f.tema + ': ' + f.er + ' erro(s), ' + f.ac + ' acerto(s)'"><span>{{ f.tema }}</span><div class="barra-prog verm"><i :style="{ width: (f.er / maxFraco * 100) + '%' }"></i></div><b class="num">{{ f.er }}</b></div><button class="btn-link" @click="treinarTema(f.tema)">treinar</button></div>
      <p v-if="!fracos.length" class="vazio">Sem erros registrados. Eles aparecem aqui quando você erra um treino ou anota um erro do Duolingo.</p>
    </template>

    <Modal v-if="edP.aberto" :titulo="edP.v.id ? 'Editar partida' : 'Anotar partida'" @fechar="edP.aberto=false">
      <div class="grade-2"><label class="campo">Data <input type="date" v-model="edP.v.data"></label><label class="campo">Cor <select v-model="edP.v.cor"><option value="w">Brancas</option><option value="b">Pretas</option></select></label></div>
      <div class="seg-visao"><button v-for="r in [['v','Vitória'],['e','Empate'],['d','Derrota']]" :key="r[0]" :class="{ ativo: edP.v.resultado===r[0] }" @click="edP.v.resultado=r[0]">{{ r[1] }}</button></div>
      <div class="grade-2"><label class="campo">Adversário <input v-model="edP.v.adversario"></label><label class="campo">Rating dele <input v-model="edP.v.ratingAdv" inputmode="numeric"></label></div>
      <label class="campo">Abertura <input v-model="edP.v.abertura" list="x-abs"><datalist id="x-abs"><option v-for="a in minhas" :key="a.id" :value="a.nome"></option></datalist></label>
      <label class="campo">Lição aprendida <input v-model="edP.v.licao" placeholder="ex.: deixei o cavalo solto"></label>
      <label class="campo">PGN (opcional) <textarea v-model="edP.v.pgn" rows="2"></textarea></label>
      <label class="campo">Link (opcional) <input v-model="edP.v.link" inputmode="url"></label>
      <div class="acoes"><button v-if="edP.v.id" class="btn perigo" @click="excluirPartida">Excluir</button><span class="espaco"></span><button class="btn" @click="edP.aberto=false">Cancelar</button><button class="btn primario" @click="salvarPartida">Salvar</button></div>
    </Modal>
    <Modal v-if="userCC.aberto" titulo="Usuário do Chess.com" @fechar="userCC.aberto=false">
      <label class="campo">Nome de usuário (público, sem senha) <input v-model="userCC.v" autocapitalize="off" autocomplete="off"></label>
      <div class="acoes"><button class="btn" @click="userCC.aberto=false">Cancelar</button><button class="btn primario" @click="salvarUserCC">Salvar</button></div>
    </Modal>
    <Modal v-if="edR.aberto" titulo="Rating do Xadrez (Duolingo)" @fechar="edR.aberto=false">
      <label class="campo">Rating atual <input v-model="edR.v" inputmode="numeric" @keyup.enter="salvarRating"></label>
      <div class="acoes"><button class="btn" @click="edR.aberto=false">Cancelar</button><button class="btn primario" @click="salvarRating">Salvar</button></div>
    </Modal>
  </div>`
};
