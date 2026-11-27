// Estudos > Duolingo: Hoje | Alemão | Xadrez. Hoje = ofensiva, idioma do dia, revisões e palavra do dia.
import { ref, reactive, computed, inject, provide, watch } from '../../lib/vue.esm-browser.prod.js';
import * as I from '../servicos/idiomas-servico.js';
import { garantirAtividadeFlash, conferirFlashHoje } from '../servicos/idiomas-rotina.js';
import Alemao from './duo-alemao.js';
import { Falar, Artigo, CapturaRapida } from './duo-comum.js';
import { db, vivo } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as R from '../servicos/rotina-servico.js';
import * as E from '../servicos/estudos-servico.js';

export default {
  components: { Modal, Alemao, Falar, Artigo, CapturaRapida },
  setup() {
    const est = inject('est');
    const marc = vivo(() => db.marcacoes.where('atividadeId').equals('duolingo').toArray(), []);
    const base = vivo(() => db.meta.get('duoBase'), null);
    const ratings = vivo(() => db.duoRating.filter((r) => !r.excluido).sortBy('data'), []);
    const hoje = computed(() => est.hoje.value);
    const feitos = computed(() => new Set(marc.value.filter((m) => m.valor === 'f' || m.valor === 'o').map((m) => m.data)));
    const feitoHoje = computed(() => feitos.value.has(hoje.value));
    const ofen = computed(() => E.ofensiva(base.value, feitos.value, hoje.value));
    const idioma = computed(() => E.duoIdioma(hoje.value));
    const hist = computed(() => Array.from({ length: 14 }, (_, i) => { const s = R.somaDias(hoje.value, i - 13); const id = E.duoIdioma(s); return { s, l: id[0], feito: feitos.value.has(s), hoje: s === hoje.value, xadrez: id === 'Xadrez', tit: R.pd(s).toLocaleDateString('pt-BR') + ' · ' + id }; }));
    const rating = computed(() => ratings.value[ratings.value.length - 1]);
    const evol = computed(() => ratings.value.slice(-12));
    const maxR = computed(() => Math.max(...evol.value.map((r) => r.valor), 1));
    const minR = computed(() => Math.min(...evol.value.map((r) => r.valor)));

    // ---------- idiomas ----------
    const itens = vivo(() => db.lItens.toArray(), []), unidades = vivo(() => db.lUnidades.toArray(), []), dias = vivo(() => db.lRevDia.toArray(), []), diario = vivo(() => db.lDiario.toArray(), []);
    const cfg = vivo(() => I.lerCfg(), { metaNovas: 20, metaRevisoes: 20, idiomas: I.IDIOMAS_PADRAO, chesscom: '' }), gram = vivo(() => I.lerGram(), { liberadas: [], notas: {} });
    const unidadesOrd = computed(() => unidades.value.filter((u) => !u.excluido).sort((a, b) => a.secao - b.secao || a.numero - b.numero));
    const unidadeAtual = computed(() => { const l = unidadesOrd.value.filter((u) => u.status !== 'concluida' && u.secao > 0); return l[l.length - 1] || unidadesOrd.value[unidadesOrd.value.length - 1] || null; });
    const estI = computed(() => I.estat({ itens: itens.value, unidades: unidades.value, dias: dias.value, diario: diario.value, cfg: cfg.value, hoje: hoje.value, duoFeitos: feitos.value }));
    const pend = computed(() => I.pendentes(itens.value.filter((i) => !i.excluido), hoje.value).length);
    const pdd = computed(() => I.palavraDoDia(itens.value, hoje.value));
    const aba = ref(sessionStorage.getItem('duoAba') || 'hoje');
    const irAba = (k) => { aba.value = k; sessionStorage.setItem('duoAba', k); };
    const subAlemao = ref(sessionStorage.getItem('alemaoSub') || 'unidades');
    const treinoInicial = ref(''), treinoChave = ref(0);
    function irTreino(tipo = '', unidadeId = '') { treinoInicial.value = tipo; treinoChave.value++; subAlemao.value = 'treinar'; sessionStorage.setItem('alemaoSub', 'treinar'); irAba('alemao'); }
    async function aposTreino() { await conferirFlashHoje(); }
    provide('idi', { itens, unidades, unidadesOrd, unidadeAtual, dias, diario, cfg, gram, hoje, est: estI, subAlemao, treinoInicial, treinoChave, irTreino, aposTreino });
    watch(() => itens.value.length, async (n) => { if (n) { await garantirAtividadeFlash(); await conferirFlashHoje(); } }, { immediate: true });
    const cap = ref(false);
    const chess = reactive({ aberto: false, v: '' });
    async function salvarChess() { await I.salvarCfg({ chesscom: chess.v.trim() }); chess.aberto = false; avisar('Usuário salvo'); }

    async function concluir() {
      await R.marcar(hoje.value, 'duolingo', '', feitoHoje.value ? null : 'f');
      if (!feitoHoje.value) avisar('Duolingo feito! Ofensiva atualizada.');
    }
    const ed = reactive({ tipo: null, v: '' });
    async function salvar() {
      const n = parseInt(ed.v, 10);
      if (!(n >= 0)) return avisar('Número inválido');
      if (ed.tipo === 'rating') await E.salvarRating(n); else await E.corrigirOfensiva(n, feitoHoje.value);
      ed.tipo = null; avisar('Atualizado');
    }
    return { aba, irAba, estI, pend, pdd, cfg, cap, chess, salvarChess, irTreino, ofen, idioma, feitoHoje, hist, rating, evol, maxR, minR, concluir, ed, salvar };
  },
  template: `
  <div class="pilha">
    <div class="seg-visao duo-abas"><button :class="{ ativo: aba==='hoje' }" @click="irAba('hoje')">Hoje</button><button :class="{ ativo: aba==='alemao' }" @click="irAba('alemao')">🇩🇪 Alemão</button><button :class="{ ativo: aba==='xadrez' }" @click="irAba('xadrez')">♟️ Xadrez</button></div>
    <template v-if="aba==='hoje'">
      <div class="caixa pilha duo-hoje-al">
        <div class="entre"><b>🇩🇪 Alemão</b><button class="btn mini" @click="cap = true">⚡ Anotar</button></div>
        <div class="entre"><div class="pilha-p"><b class="grande-3">{{ pend }}</b><small class="suave">{{ pend ? 'cartas para revisar hoje' : 'nada vencido hoje' }}</small></div>
          <button class="btn" :class="pend ? 'primario' : ''" @click="irTreino(pend ? 'revisao' : '')">{{ pend ? 'Revisar agora' : 'Treinar' }}</button></div>
        <div v-if="pdd" class="pdd"><small class="suave">Palavra do dia</small><b><Artigo :a="pdd.artigo"></Artigo> {{ pdd.termo }} <Falar :texto="(pdd.artigo ? pdd.artigo + ' ' : '') + pdd.termo"></Falar></b><small>{{ pdd.traducao }}{{ pdd.exemplo ? ' · ' + pdd.exemplo : '' }}</small></div>
        <div class="meta-l"><span>Novas na semana</span><div class="barra-prog"><i :style="{ width: Math.min(100, estI.novasSemana / cfg.metaNovas * 100) + '%' }"></i></div><b class="num">{{ estI.novasSemana }}/{{ cfg.metaNovas }}</b></div>
        <div class="meta-l"><span>Revisões hoje</span><div class="barra-prog"><i :style="{ width: Math.min(100, estI.revHoje / cfg.metaRevisoes * 100) + '%' }"></i></div><b class="num">{{ estI.revHoje }}/{{ cfg.metaRevisoes }}</b></div>
        <small v-if="estI.aCompletar" class="suave">✏️ {{ estI.aCompletar }} anotação(ões) para completar em Alemão › Palavras</small>
      </div>

    <div class="caixa centro-col">
      <small class="suave">Ofensiva</small>
      <span class="ofensiva grande-2">{{ ofen }}</span>
      <small class="suave">dias seguidos · zera se um dia passar sem marcar</small>
    </div>
    <div class="caixa entre">
      <div class="pilha-p"><small class="suave">Hoje o app escolheu</small><b class="grande-3">{{ idioma }}</b><small class="suave">Sorteio sem repetir 3 dias o mesmo idioma</small></div>
      <button class="btn" :class="feitoHoje ? 'feito' : 'primario'" @click="concluir">{{ feitoHoje ? 'Feito ✓' : 'Concluir' }}</button>
    </div>
    <small class="suave">Últimos 14 dias</small>
    <div class="duo-hist"><span v-for="h in hist" :key="h.s" :class="{ feito: h.feito, x: h.xadrez, hoje: h.hoje }" :title="h.tit">{{ h.l }}</span></div>
    <small class="suave">A = Alemão · X = Xadrez · apagado = não feito. Também marca pela Rotina.</small>
    <button class="btn-link" @click="ed.tipo='ofensiva'; ed.v=String(ofen)">Corrigir ofensiva manualmente</button>
    </template>
    <Alemao v-else-if="aba==='alemao'"></Alemao>
    <template v-else>
      <div class="caixa entre">
      <div class="pilha-p"><small class="suave">Rating do Xadrez</small><b class="grande-3">{{ rating ? rating.valor : '—' }}</b><small class="suave" v-if="rating">em {{ rating.data.split('-').reverse().join('/') }}</small></div>
      <button class="btn" @click="ed.tipo='rating'; ed.v=rating ? String(rating.valor) : ''">Atualizar</button>
    </div>
    <div v-if="evol.length > 1" class="grafico-rating">
      <i v-for="r in evol" :key="r.id" :style="{ height: (20 + 80 * (r.valor - minR) / Math.max(1, maxR - minR)) + '%' }" :title="r.data + ': ' + r.valor"></i>
    </div>
      <div class="caixa pilha">
        <div class="entre"><div class="pilha-p"><small class="suave">Chess.com</small><b>{{ cfg.chesscom || 'não informado' }}</b></div><button class="btn mini" @click="chess.v = cfg.chesscom || ''; chess.aberto = true">{{ cfg.chesscom ? 'Alterar' : 'Informar' }}</button></div>
        <small class="suave">Só o nome de usuário público, sem senha. Na próxima versão o app busca rating e partidas.</small>
      </div>
      <div class="caixa pilha"><b>Em breve (v0.15)</b><small class="suave">Tabuleiro interativo, treinador de aberturas, mates em 1 e 2, temas táticos, partidas e importação do Chess.com.</small></div>
    </template>
    <Modal v-if="ed.tipo" :titulo="ed.tipo==='rating' ? 'Rating do Xadrez' : 'Corrigir ofensiva'" @fechar="ed.tipo=null">
      <label class="campo">{{ ed.tipo==='rating' ? 'Rating atual' : 'Ofensiva atual (como aparece no Duolingo)' }} <input v-model="ed.v" inputmode="numeric" autofocus @keyup.enter="salvar"></label>
      <div class="acoes"><button class="btn" @click="ed.tipo=null">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
    <CapturaRapida v-if="cap" @fechar="cap = false"></CapturaRapida>
    <Modal v-if="chess.aberto" titulo="Usuário do Chess.com" @fechar="chess.aberto=false">
      <label class="campo">Nome de usuário <input v-model="chess.v" autocapitalize="off" autocomplete="off"></label>
      <div class="acoes"><button class="btn" @click="chess.aberto=false">Cancelar</button><button class="btn primario" @click="salvarChess">Salvar</button></div>
    </Modal>
  </div>`
};
