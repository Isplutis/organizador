// Peças comuns do Duolingo › Alemão: teclado äöüß, botão de voz, editor de item e captura rápida.
import { reactive, computed, inject, watch } from '../../lib/vue.esm-browser.prod.js';
import { avisar, Modal } from '../ui.js';
import * as I from '../servicos/idiomas-servico.js';

// insere o caractere no campo que está com o foco (sem perder o foco)
function inserir(ch) {
  const el = document.activeElement;
  if (!el || !('value' in el) || el.readOnly) return;
  const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, a) + ch + el.value.slice(b);
  el.selectionStart = el.selectionEnd = a + ch.length;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
export const Teclas = {
  data: () => ({ mai: false }),
  template: `<div class="teclas-de" aria-label="Letras do alemão">
    <button v-for="c in (mai ? ['Ä','Ö','Ü','ẞ'] : ['ä','ö','ü','ß'])" :key="c" type="button" @mousedown.prevent @touchstart.prevent="ins(c)" @click="ins(c)">{{ c }}</button>
    <button type="button" class="t-mai" :class="{ on: mai }" @mousedown.prevent @click="mai=!mai" aria-label="Maiúsculas">⇧</button></div>`,
  methods: { ins(c) { if (this._t && Date.now() - this._t < 400) return; this._t = Date.now(); inserir(c); } }
};
export const Falar = {
  props: { texto: String, voz: { type: String, default: 'de-DE' } },
  setup: () => ({ tem: I.temVoz() }),
  template: `<button v-if="tem && texto" type="button" class="btn-voz" :aria-label="'Ouvir ' + texto" @click.stop="falar">🔊</button>`,
  methods: { falar() { if (!I.falar(this.texto, this.voz)) avisar('Seu aparelho não tem voz em alemão instalada'); } }
};
export const Artigo = { props: { a: String }, template: `<span v-if="a" class="art" :class="'art-' + a">{{ a }}</span>` };

// Editor completo de palavra / frase / erro
export const EditorItem = {
  components: { Modal, Teclas, Falar },
  props: { item: Object },
  emits: ['fechar'],
  setup(props, { emit }) {
    const idi = inject('idi');
    const v = reactive({ tipo: 'palavra', termo: '', traducao: '', classe: '', artigo: '', plural: '', exemplo: '', exemploTrad: '', notas: '', unidadeId: '', errado: '', certo: '', porque: '', falsoAmigo: '', relacionados: [], verbo: { aux: 'haben', partizip: '', separavel: false, irregular: false, praeteritum: '' }, ...JSON.parse(JSON.stringify(props.item || {})) });
    if (!v.verbo) v.verbo = { aux: 'haben', partizip: '', separavel: false, irregular: false, praeteritum: '' };
    if (!v.relacionados) v.relacionados = [];
    if (!v.unidadeId && !v.id) v.unidadeId = idi.unidadeAtual.value?.id || '';
    const dica = computed(() => v.tipo === 'palavra' && v.classe === 'subst' ? I.dicaArtigo(v.termo) : null);
    const lac = computed(() => v.tipo === 'palavra' && v.exemplo ? I.lacuna(v) : null);
    const busca = reactive({ t: '' });
    const candidatos = computed(() => { const t = I.norm(busca.t); if (!t) return []; return idi.itens.value.filter((i) => !i.excluido && i.id !== v.id && i.tipo === 'palavra' && !v.relacionados.includes(i.id) && (I.norm(i.termo).includes(t) || I.norm(i.traducao).includes(t))).slice(0, 6); });
    const relItens = computed(() => v.relacionados.map((id) => idi.itens.value.find((i) => i.id === id)).filter(Boolean));
    const dup = computed(() => v.tipo !== 'erro' && v.termo && idi.itens.value.find((i) => !i.excluido && i.id !== v.id && i.tipo === v.tipo && I.norm(i.termo) === I.norm(v.termo)));
    async function salvar() {
      if (v.tipo === 'erro' ? !v.errado || !v.certo : !v.termo) return avisar(v.tipo === 'erro' ? 'Preencha o errado e o certo' : 'Preencha a palavra/frase');
      const it = { ...v, unidadeId: v.unidadeId || null };
      if (it.tipo !== 'palavra' || it.classe !== 'verbo') delete it.verbo;
      if (it.tipo !== 'palavra' || it.classe !== 'subst') { it.artigo = ''; it.plural = it.tipo === 'palavra' && it.classe === 'subst' ? it.plural : ''; }
      const id = await I.salvarItem(it);
      // ligação nos dois sentidos
      for (const r of relItens.value) if (!(r.relacionados || []).includes(id)) await I.salvarItem({ ...r, relacionados: [...(r.relacionados || []), id] });
      avisar(v.id ? 'Atualizado' : 'Adicionado'); emit('fechar');
    }
    async function excluir() { if (!confirm('Excluir este item? O progresso dos flashcards dele também sai.')) return; await I.excluirItem(v.id); emit('fechar'); }
    return { v, idi, dica, lac, busca, candidatos, relItens, dup, salvar, excluir, CLASSES: I.CLASSES, nomeU: I.nomeUnidade };
  },
  template: `
  <Modal :titulo="v.id ? 'Editar' : 'Adicionar ao alemão'" @fechar="$emit('fechar')">
    <div v-if="!v.id" class="seg-visao"><button v-for="t in [['palavra','Palavra'],['frase','Frase'],['erro','Erro do Duolingo']]" :key="t[0]" :class="{ ativo: v.tipo===t[0] }" @click="v.tipo=t[0]">{{ t[1] }}</button></div>
    <Teclas></Teclas>
    <template v-if="v.tipo==='erro'">
      <label class="campo">Como eu escrevi (errado) <input v-model="v.errado" lang="de" autocapitalize="off"></label>
      <label class="campo">Correto <input v-model="v.certo" lang="de" autocapitalize="off"></label>
      <label class="campo">Por quê? (sua explicação) <input v-model="v.porque" placeholder="ex.: movimento usa sein"></label>
    </template>
    <template v-else>
      <div v-if="v.tipo==='palavra'" class="grade-2">
        <label class="campo">Classe <select v-model="v.classe"><option value="">—</option><option v-for="c in CLASSES" :key="c[0]" :value="c[0]">{{ c[1] }}</option></select></label>
        <div v-if="v.classe==='subst'" class="campo"><span>Artigo</span><div class="art-esc"><button v-for="a in ['der','die','das']" :key="a" type="button" :class="['art-' + a, { on: v.artigo===a }]" @click="v.artigo = v.artigo===a ? '' : a">{{ a }}</button></div></div>
      </div>
      <label class="campo">{{ v.tipo==='frase' ? 'Frase em alemão' : 'Palavra em alemão' }} <span class="campo-voz"><input v-model="v.termo" lang="de" autocapitalize="off"><Falar :texto="(v.artigo ? v.artigo + ' ' : '') + v.termo"></Falar></span></label>
      <p v-if="dup" class="alerta">Já existe: {{ dup.termo }} = {{ dup.traducao }}</p>
      <p v-if="dica" class="dica" :class="{ 'alerta': v.artigo && v.artigo !== dica.artigo && dica.forte }">💡 Palavras terminadas em <b>{{ dica.sufixo }}</b> costumam ser <b :class="'art-' + dica.artigo">{{ dica.artigo }}</b>{{ v.artigo && v.artigo !== dica.artigo ? ' (você marcou ' + v.artigo + ' — confira)' : '' }}.</p>
      <label class="campo">Tradução <input v-model="v.traducao"></label>
      <label v-if="v.tipo==='palavra' && v.classe==='subst'" class="campo">Plural <input v-model="v.plural" lang="de" autocapitalize="off" placeholder="ex.: Hunde (ou - se não tem)"></label>
      <template v-if="v.tipo==='palavra' && v.classe==='verbo'">
        <div class="grade-2">
          <label class="campo">Particípio (Partizip II) <input v-model="v.verbo.partizip" lang="de" autocapitalize="off" placeholder="ex.: gegangen"></label>
          <div class="campo"><span>Auxiliar</span><div class="seg-visao"><button v-for="a in ['haben','sein']" :key="a" :class="{ ativo: v.verbo.aux===a }" @click="v.verbo.aux=a">{{ a }}</button></div></div>
        </div>
        <label class="campo">Präteritum (opcional) <input v-model="v.verbo.praeteritum" lang="de" autocapitalize="off" placeholder="ex.: ging"></label>
        <div class="grade-2"><label class="caixa-linha"><input type="checkbox" v-model="v.verbo.separavel"> Separável</label><label class="caixa-linha"><input type="checkbox" v-model="v.verbo.irregular"> Irregular</label></div>
      </template>
      <template v-if="v.tipo==='palavra'">
        <label class="campo">Exemplo em alemão (opcional) <span class="campo-voz"><input v-model="v.exemplo" lang="de" autocapitalize="off"><Falar :texto="v.exemplo"></Falar></span></label>
        <p v-if="v.exemplo" class="dica">{{ lac ? '✓ Vai virar exercício de lacuna: ' + lac.antes + '____' + lac.depois : 'A palavra não aparece no exemplo, então não vira exercício de lacuna.' }}</p>
        <label v-if="v.exemplo" class="campo">Tradução do exemplo <input v-model="v.exemploTrad"></label>
        <label class="campo">Falso amigo? (opcional) <input v-model="v.falsoAmigo" placeholder="ex.: parece 'become', mas significa receber"></label>
        <div class="campo"><span>Palavras relacionadas</span>
          <div class="chips"><span v-for="r in relItens" :key="r.id" class="chip-cat">{{ r.termo }} <button class="btn-link" @click="v.relacionados = v.relacionados.filter(x => x !== r.id)" aria-label="Remover">✕</button></span></div>
          <input v-model="busca.t" placeholder="Buscar no seu vocabulário para ligar" lang="de">
          <div class="chips"><button v-for="c in candidatos" :key="c.id" class="chip" @click="v.relacionados.push(c.id); busca.t=''">+ {{ c.termo }}</button></div>
        </div>
      </template>
      <label class="campo">Anotação (opcional) <input v-model="v.notas"></label>
    </template>
    <label class="campo">Unidade <select v-model="v.unidadeId"><option value="">Sem unidade</option><option v-for="u in idi.unidadesOrd.value" :key="u.id" :value="u.id">{{ nomeU(u) }}</option></select></label>
    <div class="acoes"><button v-if="v.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="$emit('fechar')">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
  </Modal>`
};

// Captura rápida: só palavra + tradução; completa depois
export const CapturaRapida = {
  components: { Modal, Teclas },
  emits: ['fechar'],
  setup(_, { emit }) {
    const v = reactive({ termo: '', traducao: '', tipo: 'palavra' });
    let n = 0;
    async function salvar(continuar) {
      if (!v.termo.trim()) return avisar('Escreva a palavra');
      await I.capturaRapida({ ...v, unidadeId: null }); n++;
      avisar(`Anotado (${n}). Complete depois em “A completar”.`);
      if (continuar) Object.assign(v, { termo: '', traducao: '' }); else emit('fechar');
    }
    return { v, salvar };
  },
  template: `
  <Modal titulo="Anotar rápido (alemão)" @fechar="$emit('fechar')">
    <div class="seg-visao"><button :class="{ ativo: v.tipo==='palavra' }" @click="v.tipo='palavra'">Palavra</button><button :class="{ ativo: v.tipo==='frase' }" @click="v.tipo='frase'">Frase</button></div>
    <Teclas></Teclas>
    <label class="campo">Em alemão <input v-model="v.termo" lang="de" autocapitalize="off" autofocus></label>
    <label class="campo">Tradução (pode deixar para depois) <input v-model="v.traducao" @keyup.enter="salvar(true)"></label>
    <div class="acoes"><button class="btn" @click="salvar(true)">Salvar e anotar outra</button><button class="btn primario" @click="salvar(false)">Salvar</button></div>
  </Modal>`
};
