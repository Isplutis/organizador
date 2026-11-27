// Treino do alemão: flashcards (Leitner), quiz de artigos, plural, lacuna, particípio, erros, ditado e áudio.
import { ref, reactive, computed, inject, onUnmounted } from '../../lib/vue.esm-browser.prod.js';
import { avisar } from '../ui.js';
import * as I from '../servicos/idiomas-servico.js';
import { Teclas, Falar, Artigo } from './duo-comum.js';

const NOMES = { 'de-pt': 'Alemão → Português', 'pt-de': 'Português → Alemão', artigo: 'Artigo', plural: 'Plural', cloze: 'Lacuna', partizip: 'Particípio', erro: 'Erro do Duolingo' };
export const SESSOES = [
  { id: 'revisao', emoji: '🗂️', nome: 'Revisão do dia', desc: 'Tudo que está vencido hoje, todos os modos' },
  { id: 'artigo', emoji: '🎨', nome: 'Quiz de artigos', desc: 'der · die · das, rápido' },
  { id: 'plural', emoji: '👥', nome: 'Plural', desc: 'Escreva o plural' },
  { id: 'cloze', emoji: '🧩', nome: 'Lacunas', desc: 'Complete os seus exemplos' },
  { id: 'partizip', emoji: '⏪', nome: 'Particípio', desc: 'haben/sein + Partizip II' },
  { id: 'erro', emoji: '🩹', nome: 'Caderno de erros', desc: 'Reescreva certo' },
  { id: 'ditado', emoji: '✍️', nome: 'Ditado', desc: 'Ouça e escreva' },
  { id: 'audio', emoji: '🎧', nome: 'Só ouvir', desc: 'Revisão sem tela, para andar' }
];

export default {
  components: { Teclas, Falar, Artigo },
  props: { inicial: { type: String, default: '' } },
  setup(props) {
    const idi = inject('idi');
    const filtroU = ref('');
    const contagem = computed(() => {
      const c = {}; const base = idi.itens.value.filter((i) => !i.excluido && (!filtroU.value || i.unidadeId === filtroU.value));
      c.revisao = I.pendentes(base, idi.hoje.value).length;
      for (const m of ['artigo', 'plural', 'cloze', 'partizip', 'erro']) c[m] = I.pendentes(base, idi.hoje.value, { modos: [m], todos: true }).length;
      c.ditado = c.audio = base.filter((i) => i.tipo !== 'erro' && i.termo && i.traducao).length;
      return c;
    });
    const s = reactive({ ativa: null, fila: [], i: 0, resp: '', aux: '', estado: 'perg', res: null, acertos: 0, total: 0, erradas: [], repete: new Set() });
    const carta = computed(() => s.fila[s.i]);
    function iniciar(tipo, lista = null) {
      const base = idi.itens.value.filter((i) => !i.excluido && (!filtroU.value || i.unidadeId === filtroU.value));
      let fila;
      if (lista) fila = lista;
      else if (tipo === 'revisao') fila = I.pendentes(base, idi.hoje.value).slice(0, 60);
      else if (tipo === 'ditado' || tipo === 'audio') fila = base.filter((i) => i.tipo !== 'erro' && i.termo && i.traducao).sort(() => Math.random() - 0.5).slice(0, tipo === 'audio' ? 30 : 12).map((it) => ({ it, modo: tipo }));
      else fila = I.pendentes(base, idi.hoje.value, { modos: [tipo], todos: true }).sort((a, b) => a.caixa - b.caixa).slice(0, 30);
      if (!fila.length) return avisar(tipo === 'revisao' ? 'Nada vencido hoje 🎉' : 'Nenhum item para esse treino ainda. Cadastre palavras primeiro.');
      Object.assign(s, { ativa: tipo, fila, i: 0, resp: '', aux: '', estado: 'perg', res: null, acertos: 0, total: 0, erradas: [], repete: new Set() });
      if (tipo === 'audio') tocarAudio(); else falarAuto();
    }
    const voz = computed(() => (idi.cfg.value.idiomas || [])[0]?.voz || 'de-DE');
    const alemao = (c) => c.it.tipo === 'palavra' && c.it.classe === 'subst' && c.it.artigo ? `${c.it.artigo} ${c.it.termo}` : c.it.termo;
    function falarAuto() { const c = carta.value; if (!c) return; if (c.modo === 'de-pt' || c.modo === 'ditado') setTimeout(() => I.falar(alemao(c), voz.value), 250); }
    const lac = computed(() => carta.value?.modo === 'cloze' ? I.lacuna(carta.value.it) : null);
    const esperado = computed(() => {
      const c = carta.value; if (!c) return '';
      return { 'pt-de': alemao(c), plural: c.it.plural, cloze: lac.value?.resp, erro: c.it.certo, ditado: c.it.termo, partizip: c.it.verbo?.partizip }[c.modo] || '';
    });
    function conferir() {
      const c = carta.value; let r;
      if (c.modo === 'pt-de' && c.it.artigo) {
        // aceita sem artigo; se escrever artigo, tem que ser o certo
        const partes = I.norm(s.resp).split(' '); const temArt = ['der', 'die', 'das'].includes(partes[0]);
        r = temArt ? I.conferir(s.resp, alemao(c)) : I.conferir(s.resp, c.it.termo);
        if (r !== 'erro' && !temArt) r = 'semart';
      } else if (c.modo === 'plural') r = I.conferir(s.resp.replace(/^die\s+/i, ''), c.it.plural);
      else if (c.modo === 'partizip') { r = I.conferir(s.resp, c.it.verbo.partizip); if (r !== 'erro' && s.aux !== c.it.verbo.aux) r = 'aux'; }
      else r = I.conferir(s.resp, esperado.value);
      s.res = r; s.estado = 'resp';
      if (c.modo === 'ditado') { c._contou = true; if (r !== 'erro') s.acertos++; else s.erradas.push(c); s.total++; I.registrarDia({ ditado: 1, total: 1, acertos: r !== 'erro' ? 1 : 0 }); }
      else if (r === 'ok' || r === 'quase' || r === 'semart') registrar(true, false);
      if (c.modo !== 'ditado' && c.modo !== 'pt-de') I.falar(c.modo === 'erro' ? c.it.certo : c.modo === 'cloze' ? c.it.exemplo : c.modo === 'plural' ? 'die ' + c.it.plural : c.it.termo, voz.value);
    }
    function registrar(ok, avancar = true) {
      const c = carta.value; if (!c || c._contou) return; c._contou = true;
      if (!s.repete.has(c)) { I.responder(c.it, c.modo, ok); s.total++; if (ok) s.acertos++; else s.erradas.push(c); }
      if (!ok && !s.repete.has(c)) { const copia = { ...c, _contou: false }; s.repete.add(copia); s.fila.push(copia); }
      if (avancar) proxima();
    }
    function escolherArtigo(a) {
      if (s.estado !== 'perg') return; const ok = a === carta.value.it.artigo;
      s.res = ok ? 'ok' : 'erro'; s.aux = a; s.estado = 'resp'; I.falar(alemao(carta.value), voz.value);
      registrar(ok, false); setTimeout(() => { if (s.estado === 'resp' && s.ativa) proxima(); }, ok ? 700 : 1600);
    }
    function proxima() { s.i++; s.resp = ''; s.aux = ''; s.res = null; s.estado = s.i >= s.fila.length ? 'fim' : 'perg'; if (s.estado === 'perg') falarAuto(); else fim(); }
    async function fim() { await idi.aposTreino(); }
    const ouvir = () => I.falar(carta.value.it.termo, voz.value, 0.8);
    const sair = () => { s.ativa = null; pararAudio(); };
    // modo "só ouvir": alemão → pausa → tradução → próxima
    const audio = reactive({ tocando: false, fase: '' }); let parar = false;
    async function tocarAudio() {
      audio.tocando = true; parar = false;
      while (!parar && s.i < s.fila.length) {
        const c = carta.value; audio.fase = 'de'; await I.falarEsperar(alemao(c), voz.value, 0.85); if (parar) break;
        await new Promise((r) => setTimeout(r, 2500)); if (parar) break;
        audio.fase = 'pt'; await I.falarEsperar(c.it.traducao, 'pt-BR', 1); if (parar) break;
        await new Promise((r) => setTimeout(r, 1200)); s.i++;
      }
      if (!parar) { I.registrarDia({ audio: s.fila.length }); s.estado = 'fim'; }
      audio.tocando = false;
    }
    function pararAudio() { parar = true; try { speechSynthesis.cancel(); } catch { /* */ } }
    onUnmounted(pararAudio);
    if (props.inicial) setTimeout(() => iniciar(props.inicial), 0);
    return { ouvir, idi, filtroU, contagem, s, carta, iniciar, alemao, lac, esperado, conferir, registrar, escolherArtigo, proxima, sair, audio, pararAudio, tocarAudio, NOMES, SESSOES, nomeU: I.nomeUnidade, temVoz: I.temVoz() };
  },
  template: `
  <div class="pilha treino">
    <template v-if="!s.ativa">
      <label class="campo">Treinar só a unidade <select v-model="filtroU"><option value="">Todas as unidades</option><option v-for="u in idi.unidadesOrd.value" :key="u.id" :value="u.id">{{ nomeU(u) }}</option></select></label>
      <div class="treino-grade">
        <button v-for="t in SESSOES" :key="t.id" class="treino-op" :class="{ destaque: t.id==='revisao' && contagem.revisao, vazio: !contagem[t.id] || ((t.id==='ditado'||t.id==='audio') && !temVoz) }" @click="iniciar(t.id)">
          <span class="t-emo">{{ t.emoji }}</span><b>{{ t.nome }}</b><small>{{ t.desc }}</small><span class="t-n">{{ contagem[t.id] || 0 }}</span></button>
      </div>
      <p class="dica">Os exercícios usam só o que você cadastrou. Acertou: a carta volta em 1, 2, 4, 8 e 16 dias. Errou: volta para o começo.</p>
    </template>

    <template v-else-if="s.estado==='fim'">
      <div class="caixa centro-col pilha"><span class="t-emo">{{ s.ativa==='audio' ? '🎧' : s.total && s.acertos/s.total >= .8 ? '🎉' : '💪' }}</span>
        <b class="grande-3" v-if="s.ativa!=='audio'">{{ s.acertos }} / {{ s.total }}</b><span v-else>Sessão de áudio concluída</span>
        <small class="suave" v-if="s.erradas.length">Para reforçar: {{ s.erradas.map(c => c.it.termo || c.it.certo).slice(0, 8).join(' · ') }}</small></div>
      <div class="acoes"><button class="btn" @click="sair">Fechar</button><button v-if="s.erradas.length" class="btn primario" @click="iniciar(s.ativa, s.erradas.map(c => ({ it: c.it, modo: c.modo })))">Treinar os errados</button></div>
    </template>

    <template v-else-if="s.ativa==='audio'">
      <div class="caixa centro-col pilha treino-carta">
        <small class="suave">{{ s.i + 1 }} / {{ s.fila.length }}</small>
        <b class="t-de">{{ alemao(carta) }}</b><span class="t-pt" :class="{ oculto: audio.fase!=='pt' }">{{ carta.it.traducao }}</span>
      </div>
      <div class="acoes"><button class="btn" @click="sair">Parar</button></div>
    </template>

    <template v-else-if="carta">
      <div class="entre"><small class="suave">{{ NOMES[carta.modo] || (carta.modo==='ditado' ? 'Ditado' : '') }} · {{ Math.min(s.i + 1, s.fila.length) }}/{{ s.fila.length }}</small><button class="btn-link" @click="sair">Sair</button></div>
      <div class="barra-prog"><i :style="{ width: (s.i / s.fila.length * 100) + '%' }"></i></div>
      <div class="caixa pilha treino-carta" :class="{ 'res-ok': s.estado==='resp' && s.res!=='erro', 'res-erro': s.estado==='resp' && s.res==='erro' }">
        <!-- pergunta -->
        <template v-if="carta.modo==='de-pt'"><b class="t-de"><Artigo :a="carta.it.artigo"></Artigo> {{ carta.it.termo }} <Falar :texto="alemao(carta)"></Falar></b><small class="suave">{{ carta.it.tipo==='frase' ? 'frase' : 'o que significa?' }}</small></template>
        <template v-else-if="carta.modo==='pt-de'"><b class="t-pt-g">{{ carta.it.traducao }}</b><small class="suave">em alemão{{ carta.it.artigo ? ' (com artigo vale mais 😉)' : '' }}</small></template>
        <template v-else-if="carta.modo==='artigo'"><b class="t-de">___ {{ carta.it.termo }}</b><small class="suave">{{ carta.it.traducao }}</small></template>
        <template v-else-if="carta.modo==='plural'"><b class="t-de"><Artigo :a="carta.it.artigo"></Artigo> {{ carta.it.termo }}</b><small class="suave">plural de “{{ carta.it.traducao }}”: die ___</small></template>
        <template v-else-if="carta.modo==='cloze'"><b class="t-frase">{{ lac.antes }}<span class="lacuna">____</span>{{ lac.depois }}</b><small class="suave">{{ carta.it.exemploTrad || ('palavra: ' + carta.it.traducao) }}</small></template>
        <template v-else-if="carta.modo==='partizip'"><b class="t-de">{{ carta.it.termo }}</b><small class="suave">{{ carta.it.traducao }} · ich ___ ___ (passado)</small></template>
        <template v-else-if="carta.modo==='erro'"><b class="t-frase riscado">{{ carta.it.errado }}</b><small class="suave">escreva a forma correta</small></template>
        <template v-else-if="carta.modo==='ditado'"><button class="btn largo" @mousedown.prevent @click="ouvir">🔊 Ouvir de novo</button><small class="suave">escreva o que ouviu</small></template>

        <!-- resposta -->
        <template v-if="carta.modo==='de-pt'">
          <button v-if="s.estado==='perg'" class="btn primario largo" @click="s.estado='resp'; s.res='ver'">Mostrar</button>
          <template v-else><b class="t-pt-g">{{ carta.it.traducao }}</b><small v-if="carta.it.exemplo" class="suave">{{ carta.it.exemplo }}{{ carta.it.exemploTrad ? ' — ' + carta.it.exemploTrad : '' }}</small>
            <div class="grade-2"><button class="btn perigo" @click="registrar(false)">Errei</button><button class="btn primario" @click="registrar(true)">Acertei</button></div></template>
        </template>
        <template v-else-if="carta.modo==='artigo'">
          <div class="art-esc grande"><button v-for="a in ['der','die','das']" :key="a" :class="['art-' + a, { on: s.estado==='resp' && a===carta.it.artigo, x: s.estado==='resp' && a===s.aux && a!==carta.it.artigo }]" @click="escolherArtigo(a)">{{ a }}</button></div>
          <small v-if="s.estado==='resp'" :class="s.res==='ok' ? 'pos' : 'neg'">{{ s.res==='ok' ? 'Isso!' : 'É ' + carta.it.artigo + ' ' + carta.it.termo }}</small>
        </template>
        <template v-else>
          <div v-if="carta.modo==='partizip'" class="seg-visao"><button v-for="a in ['habe','bin']" :key="a" :class="{ ativo: s.aux===(a==='habe'?'haben':'sein') }" :disabled="s.estado!=='perg'" @click="s.aux = a==='habe'?'haben':'sein'">ich {{ a }}</button></div>
          <Teclas v-if="s.estado==='perg'"></Teclas>
          <input v-model="s.resp" class="t-input" lang="de" autocapitalize="off" autocomplete="off" spellcheck="false" :readonly="s.estado!=='perg'" @keyup.enter="s.estado==='perg' ? conferir() : carta._contou && proxima()" placeholder="Sua resposta">
          <button v-if="s.estado==='perg'" class="btn primario largo" @click="conferir">Conferir</button>
          <template v-else>
            <p :class="s.res==='erro' ? 'neg' : 'pos'"><b>{{ { ok: 'Certo!', quase: 'Certo! (use ä ö ü ß)', semart: 'Certo! Da próxima, com o artigo: ' + alemao(carta), aux: 'Particípio certo, mas o auxiliar é ' + carta.it.verbo?.aux, erro: 'Resposta:' }[s.res] }}</b> <span v-if="s.res==='erro' || s.res==='aux'">{{ carta.modo==='partizip' ? (carta.it.verbo.aux==='sein' ? 'ich bin ' : 'ich habe ') + carta.it.verbo.partizip : esperado }}</span></p>
            <small v-if="carta.modo==='erro' && carta.it.porque" class="suave">💡 {{ carta.it.porque }}</small>
            <small v-if="carta.modo==='ditado'" class="suave">{{ carta.it.traducao }}</small>
            <div v-if="(s.res==='erro' || s.res==='aux') && carta.modo!=='ditado'" class="grade-2"><button class="btn" @click="registrar(true)">Contar como certo</button><button class="btn primario" @click="registrar(false)">Próxima</button></div>
            <button v-else class="btn primario largo" @click="proxima">Próxima</button>
          </template>
        </template>
      </div>
    </template>
  </div>`
};
