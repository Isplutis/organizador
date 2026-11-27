// Componentes do xadrez: visualizador de lances, gravador de linhas e os dois treinadores.
import { ref, reactive, computed, watch, onUnmounted } from '../../lib/vue.esm-browser.prod.js';
import { avisar } from '../ui.js';
import { Chess } from '../../lib/chess.mjs';
import * as X from '../servicos/xadrez-servico.js';
import Tabuleiro from './xadrez-tabuleiro.js';

// percorre uma sequência de lances (abertura ou partida)
export const Visualizador = {
  components: { Tabuleiro },
  props: { lances: { type: Array, default: () => [] }, fen: { type: String, default: '' }, orientacao: { type: String, default: 'w' }, inicio: { type: Number, default: -1 } },
  setup(props) {
    const i = ref(props.inicio >= 0 ? props.inicio : props.lances.length);
    watch(() => props.lances, () => { i.value = props.lances.length; });
    const pos = computed(() => { const c = props.fen ? new Chess(props.fen) : new Chess(); let ult = null; for (let k = 0; k < i.value; k++) { try { ult = c.move(props.lances[k]); } catch { break; } } return { fen: c.fen(), ult: ult ? [ult.from, ult.to] : [] }; });
    const pares = computed(() => { const out = []; const preto = props.fen && props.fen.split(' ')[1] === 'b'; let n = props.fen ? +props.fen.split(' ')[5] || 1 : 1; let k = 0;
      if (preto && props.lances.length) { out.push({ n, w: null, b: { san: props.lances[0], k: 1 } }); k = 1; n++; }
      for (; k < props.lances.length; k += 2, n++) out.push({ n, w: { san: props.lances[k], k: k + 1 }, b: props.lances[k + 1] ? { san: props.lances[k + 1], k: k + 2 } : null });
      return out; });
    const ir = (k) => { i.value = Math.max(0, Math.min(props.lances.length, k)); };
    return { i, pos, pares, ir };
  },
  template: `
  <div class="pilha-p">
    <Tabuleiro :fen="pos.fen" :orientacao="orientacao" :interativo="false" :destaque="pos.ult"></Tabuleiro>
    <div class="x-nav"><button class="btn mini" @click="ir(0)" aria-label="Início">⏮</button><button class="btn mini" @click="ir(i-1)" aria-label="Voltar">◀</button><small class="suave">{{ i }}/{{ lances.length }}</small><button class="btn mini" @click="ir(i+1)" aria-label="Avançar">▶</button><button class="btn mini" @click="ir(lances.length)" aria-label="Fim">⏭</button></div>
    <div class="x-lances"><span v-for="p in pares" :key="p.n"><small>{{ p.n }}.</small><button v-if="p.w" :class="{ on: i===p.w.k }" @click="ir(p.w.k)">{{ p.w.san }}</button><span v-else>…</span><button v-if="p.b" :class="{ on: i===p.b.k }" @click="ir(p.b.k)">{{ p.b.san }}</button></span></div>
  </div>`
};

// grava uma linha jogando no tabuleiro (os dois lados) ou colando o texto
export const Gravador = {
  components: { Tabuleiro },
  props: { modelValue: { type: Array, default: () => [] }, fen: { type: String, default: '' }, orientacao: { type: String, default: 'w' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const lances = ref([...props.modelValue]);
    const pos = computed(() => { const c = props.fen ? new Chess(props.fen) : new Chess(); let ult = null; for (const m of lances.value) ult = c.move(m); return { fen: c.fen(), ult: ult ? [ult.from, ult.to] : [] }; });
    const salvar = () => emit('update:modelValue', [...lances.value]);
    function lance(m) { lances.value.push(m.san); salvar(); }
    const voltar = () => { lances.value.pop(); salvar(); };
    const limpar = () => { lances.value = []; salvar(); };
    const txt = ref('');
    function colar() { const r = props.fen ? X.validarLances(txt.value.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean), props.fen) : X.lerTextoLances(txt.value); if (!r.ok) return avisar(r.erro); lances.value = r.lances; txt.value = ''; salvar(); }
    return { lances, pos, lance, voltar, limpar, txt, colar };
  },
  template: `
  <div class="pilha-p">
    <Tabuleiro :fen="pos.fen" :orientacao="orientacao" :destaque="pos.ult" @lance="lance"></Tabuleiro>
    <p class="x-texto">{{ lances.length ? lances.map((m, k) => (k % 2 === 0 ? (k/2+1) + '. ' : '') + m).join(' ') : 'Jogue os lances no tabuleiro (os dois lados).' }}</p>
    <div class="acoes"><button class="btn mini" :disabled="!lances.length" @click="voltar">↶ Desfazer</button><button class="btn mini" :disabled="!lances.length" @click="limpar">Limpar</button></div>
    <div class="campo-voz"><input v-model="txt" placeholder="ou cole: 1. e4 e5 2. Nf3 Nc6 (ou PGN)"><button class="btn mini" @click="colar">Usar</button></div>
  </div>`
};

// treino de aberturas: o app joga o adversário, você precisa lembrar os seus lances
export const TreinoAbertura = {
  components: { Tabuleiro },
  props: { fila: Array },
  emits: ['fim'],
  setup(props, { emit }) {
    const s = reactive({ k: 0, idx: 0, fen: '', ult: [], dica: [], erro: '', errou: false, feita: false, acertos: 0, total: 0, msg: '' });
    let jogo = null, timers = [];
    const atual = computed(() => props.fila[s.k]);
    const later = (f, ms) => timers.push(setTimeout(f, ms));
    onUnmounted(() => timers.forEach(clearTimeout));
    function sync(m) { s.fen = jogo.fen(); if (m) s.ult = [m.from, m.to]; }
    function iniciar() { const { a } = atual.value; jogo = new Chess(); Object.assign(s, { idx: 0, ult: [], dica: [], erro: '', errou: false, feita: false, msg: a.cor === 'w' ? 'Você joga de brancas' : 'Você joga de pretas' }); sync(); adversario(); }
    function adversario() {
      const { a, l } = atual.value;
      if (s.idx >= l.lances.length) return concluir();
      if (jogo.turn() !== a.cor) later(() => { const m = jogo.move(l.lances[s.idx]); s.idx++; sync(m); if (s.idx >= l.lances.length) concluir(); }, 500);
    }
    function lance(mv) {
      const { l } = atual.value; if (s.feita) return;
      const esperado = l.lances[s.idx];
      if (mv.san === esperado) { const m = jogo.move(esperado); s.idx++; s.dica = []; sync(m); adversario(); return; }
      s.errou = true; s.erro = mv.to; later(() => { s.erro = ''; }, 900);
      mostrarDica();
    }
    function mostrarDica() { const c = new Chess(jogo.fen()); const m = c.move(atual.value.l.lances[s.idx]); s.dica = [m.from, m.to]; s.errou = true; s.msg = 'Lance esperado: ' + m.san; }
    async function concluir() { if (s.feita) return; s.feita = true; s.total++; if (!s.errou) s.acertos++; s.msg = s.errou ? 'Linha concluída com ajuda — volta amanhã.' : 'Linha certinha! ✓'; await X.responderLinha(atual.value.a.id, atual.value.l.id, !s.errou); }
    function proxima() { if (s.k + 1 >= props.fila.length) return emit('fim', { acertos: s.acertos, total: s.total }); s.k++; iniciar(); }
    iniciar();
    return { s, atual, lance, mostrarDica, proxima };
  },
  template: `
  <div class="pilha">
    <div class="entre"><small class="suave">{{ atual.a.nome }} · {{ atual.l.nome || 'linha' }} · {{ s.k + 1 }}/{{ fila.length }}</small><button class="btn-link" @click="$emit('fim', { acertos: s.acertos, total: s.total })">Sair</button></div>
    <Tabuleiro :fen="s.fen" :orientacao="atual.a.cor" :destaque="s.ult" :dica="s.dica" :erro="s.erro" :interativo="!s.feita" @lance="lance"></Tabuleiro>
    <p class="centro" :class="s.feita && !s.errou ? 'pos' : ''">{{ s.msg }}</p>
    <div class="acoes"><button v-if="!s.feita" class="btn" @click="mostrarDica">Mostrar lance</button><button v-else class="btn primario" @click="proxima">Próxima</button></div>
  </div>`
};

// treino de mates e táticas
export const TreinoPadrao = {
  components: { Tabuleiro },
  props: { fila: Array },
  emits: ['fim'],
  setup(props, { emit }) {
    const s = reactive({ k: 0, idx: 0, fen: '', ult: [], dica: [], erro: '', errou: false, feita: false, acertos: 0, total: 0, msg: '' });
    let jogo = null, timers = [];
    const atual = computed(() => props.fila[s.k]);
    const later = (f, ms) => timers.push(setTimeout(f, ms));
    onUnmounted(() => timers.forEach(clearTimeout));
    const lado = computed(() => atual.value.fen.split(' ')[1]);
    function sync(m) { s.fen = jogo.fen(); if (m) s.ult = [m.from, m.to]; }
    function iniciar() { jogo = new Chess(atual.value.fen); const p = atual.value; Object.assign(s, { idx: 0, ult: [], dica: [], erro: '', errou: false, feita: false, msg: (lado.value === 'w' ? 'Brancas' : 'Pretas') + ' jogam' + (p.tipo === 'mate' ? (p.solucao.length > 1 ? ' e dão mate em ' + Math.ceil(p.solucao.length / 2) : ' e dão mate em 1') : ' e ganham material') }); sync(); }
    function lance(mv) {
      if (s.feita) return; const p = atual.value;
      const c = new Chess(jogo.fen()); c.move(mv.san);
      if (X.conferirLancePadrao(p, c, mv.san, s.idx)) {
        const m = jogo.move(mv.san); s.idx++; s.dica = []; sync(m);
        if (s.idx >= p.solucao.length || (p.tipo === 'mate' && jogo.isCheckmate())) return concluir();
        later(() => { const r = jogo.move(p.solucao[s.idx]); s.idx++; sync(r); if (s.idx >= p.solucao.length) concluir(); }, 550);
        return;
      }
      s.errou = true; s.erro = mv.to; s.msg = 'Não é esse. Tente de novo ou veja a solução.'; later(() => { s.erro = ''; }, 900);
    }
    function verSolucao() { const c = new Chess(jogo.fen()); const m = c.move(atual.value.solucao[s.idx]); s.dica = [m.from, m.to]; s.errou = true; s.msg = 'Solução: ' + m.san; }
    async function concluir() { if (s.feita) return; s.feita = true; s.total++; if (!s.errou) s.acertos++; s.msg = (s.errou ? 'Resolvido com ajuda.' : 'Isso! ✓') + (atual.value.reconhecer ? ' ' + atual.value.reconhecer : ''); await X.responderPadrao(atual.value, !s.errou); }
    function proxima() { if (s.k + 1 >= props.fila.length) return emit('fim', { acertos: s.acertos, total: s.total }); s.k++; iniciar(); }
    iniciar();
    return { s, atual, lado, lance, verSolucao, proxima };
  },
  template: `
  <div class="pilha">
    <div class="entre"><small class="suave">{{ atual.nome }} · {{ atual.tema }} · {{ s.k + 1 }}/{{ fila.length }}</small><button class="btn-link" @click="$emit('fim', { acertos: s.acertos, total: s.total })">Sair</button></div>
    <Tabuleiro :fen="s.fen" :orientacao="lado" :destaque="s.ult" :dica="s.dica" :erro="s.erro" :interativo="!s.feita" @lance="lance"></Tabuleiro>
    <p class="centro" :class="s.feita && !s.errou ? 'pos' : ''">{{ s.msg }}</p>
    <div class="acoes"><button v-if="!s.feita" class="btn" @click="verSolucao">Ver solução</button><button v-else class="btn primario" @click="proxima">Próxima</button></div>
  </div>`
};
