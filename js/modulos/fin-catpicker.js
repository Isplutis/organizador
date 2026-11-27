// Seletor visual de categorias: emojis, cores, busca e criação de categoria/subcategoria (salvas para sempre).
import { ref, reactive, computed, inject, watch } from '../../lib/vue.esm-browser.prod.js';
import * as F from '../servicos/fin-servico.js';
import { avisar } from '../ui.js';

export const INTERNO = '__interno';
const EMO_TOPO = { moradia: '🏠', mercado: '🛒', alimentacao: '🍔', transporte: '🚗', saude: '💊', lua: '🐶', educacao: '🎓', lazer: '🎉', assinaturas: '🔁', compras: '🛍️', taxas: '🧾', empresa: '💼', 'outros-d': '📦', consultoria: '💻', 'outros-trab': '🧰', rendimentos: '📈', reembolsos: '↩️', 'outros-r': '💰' };
const EMO_SUB = [[/aluguel/, '🔑'], [/condom/, '🏢'], [/energia|luz/, '💡'], [/agua/, '💧'], [/internet|wifi/, '🌐'], [/supermerc/, '🛒'], [/feira|horti/, '🥬'], [/acougue|carne/, '🥩'], [/restaur/, '🍽️'], [/delivery|ifood/, '🛵'], [/cafe/, '☕'], [/uber|taxi|99/, '🚕'], [/combust|gasolina/, '⛽'], [/onibus|metro/, '🚌'], [/farmac/, '💊'], [/consulta|medic/, '🩺'], [/plano/, '🏥'], [/racao/, '🦴'], [/remedio|vacina/, '💉'], [/veterin/, '🐾'], [/banho|tosa/, '🛁'], [/pos|faculdade/, '🎓'], [/livro/, '📚'], [/curso/, '🧑‍🏫'], [/viage|hotel|passag/, '✈️'], [/passeio/, '🌳'], [/jogo|game/, '🎮'], [/stream|netflix|spotify/, '📺'], [/app/, '📱'], [/\bia\b|chatgpt|claude/, '🤖'], [/roupa/, '👕'], [/eletron/, '🔌'], [/casa|movel/, '🛋️'], [/iof/, '🌎'], [/tarifa|banco/, '🏦'], [/imposto|das\b/, '🧾'], [/contador/, '📊'], [/salario|pro-labore/, '💵'], [/caixinha|rendim/, '🐷'], [/presente/, '🎁'], [/academia|esporte/, '🏋️']];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function emojiCat(c, cats = []) {
  if (!c) return '❔';
  if (c.emoji) return c.emoji;
  if (!c.paiId) return EMO_TOPO[c.id] || '🏷️';
  const n = norm(c.nome); const m = EMO_SUB.find(([r]) => r.test(n));
  return m ? m[1] : emojiCat(cats.find((x) => x.id === c.paiId), cats);
}
export const HUES = [0, 20, 40, 55, 95, 150, 175, 200, 220, 265, 290, 320];
export const corCat = (hue) => ({ '--h': hue });

export default {
  props: { modelValue: { type: String, default: '' }, tipo: { type: String, default: 'desp' }, interno: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const { D } = inject('fin');
    const cats = computed(() => D.categorias.value.filter((c) => !c.excluido));
    const topos = computed(() => cats.value.filter((c) => !c.paiId && c.tipo === props.tipo).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.nome.localeCompare(b.nome, 'pt-BR')));
    const subsDe = (id) => cats.value.filter((c) => c.paiId === id).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const sel = computed(() => cats.value.find((c) => c.id === props.modelValue));
    const aberto = ref(sel.value ? (sel.value.paiId || sel.value.id) : '');
    watch(() => props.modelValue, () => { if (sel.value) aberto.value = sel.value.paiId || sel.value.id; });
    const busca = ref('');
    const achados = computed(() => { const t = norm(busca.value); if (!t) return []; return cats.value.filter((c) => c.tipo === props.tipo && norm(c.nome).includes(t)).slice(0, 12); });
    const nomeLongo = (c) => { const p = c.paiId && cats.value.find((x) => x.id === c.paiId); return p ? `${p.nome} › ${c.nome}` : c.nome; };
    const hueDe = (c) => c ? (c.paiId ? (cats.value.find((x) => x.id === c.paiId)?.hue ?? c.hue) : c.hue) : 220;
    function escolher(c) { emit('update:modelValue', c.id); if (!c.paiId) aberto.value = c.id; busca.value = ''; }
    const nova = reactive({ modo: '', nome: '', emoji: '', hue: 150 });
    const abrirNova = (modo) => Object.assign(nova, { modo, nome: '', emoji: '', hue: HUES[(topos.value.length * 5) % HUES.length] });
    async function criar() {
      const nome = nova.nome.trim(); if (!nome) return avisar('Dê um nome');
      const pai = nova.modo === 'sub' ? cats.value.find((c) => c.id === aberto.value) : null;
      if (cats.value.some((c) => c.tipo === props.tipo && (c.paiId || null) === (pai?.id || null) && norm(c.nome) === norm(nome))) return avisar('Já existe com esse nome');
      const id = (pai ? pai.id + '--' : '') + norm(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-4);
      await F.salvar.categoria({ id, nome, tipo: props.tipo, hue: pai ? pai.hue : nova.hue, paiId: pai?.id || null, orcamento: 0, pj: !!pai?.pj, emoji: nova.emoji.trim() || null, ordem: pai ? subsDe(pai.id).length : 99 });
      nova.modo = ''; emit('update:modelValue', id); if (!pai) aberto.value = id; avisar(pai ? 'Subcategoria criada' : 'Categoria criada');
    }
    return { topos, subsDe, sel, aberto, busca, achados, nomeLongo, hueDe, escolher, nova, abrirNova, criar, HUES, INTERNO, emo: (c) => emojiCat(c, cats.value) };
  },
  template: `
  <div class="cp">
    <div class="cp-atual" :class="{ vazio: !modelValue }" :style="{ '--h': modelValue === INTERNO ? 265 : hueDe(sel) }">
      <template v-if="modelValue === INTERNO">↔ Caixinha / entre minhas contas <small>não conta nos totais</small></template>
      <template v-else-if="sel">{{ emo(sel) }} {{ nomeLongo(sel) }}</template>
      <template v-else>Escolha uma categoria</template>
    </div>
    <input v-model="busca" class="cp-busca" placeholder="🔎 Buscar categoria ou subcategoria" aria-label="Buscar categoria">
    <div v-if="busca" class="cp-subs">
      <button v-for="c in achados" :key="c.id" class="cp-sub" :style="{ '--h': hueDe(c) }" @click="escolher(c)">{{ emo(c) }} {{ nomeLongo(c) }}</button>
      <p v-if="!achados.length" class="dica">Nada encontrado. Crie abaixo.</p>
    </div>
    <div class="cp-grade">
      <button v-for="c in topos" :key="c.id" class="cp-topo" :class="{ on: aberto === c.id, sel: modelValue === c.id }" :style="{ '--h': c.hue }" @click="escolher(c)">
        <span class="cp-emo">{{ emo(c) }}</span><span class="cp-nome">{{ c.nome }}</span><small v-if="subsDe(c.id).length" class="cp-n">{{ subsDe(c.id).length }}</small></button>
      <button v-if="interno" class="cp-topo cp-int" :class="{ sel: modelValue === INTERNO }" :style="{ '--h': 265 }" @click="$emit('update:modelValue', INTERNO)"><span class="cp-emo">↔</span><span class="cp-nome">Caixinha / minhas contas</span></button>
      <button class="cp-topo cp-novo" @click="abrirNova('topo')"><span class="cp-emo">＋</span><span class="cp-nome">Nova categoria</span></button>
    </div>
    <div v-if="!busca && aberto && topos.some(t => t.id === aberto)" class="cp-subs" :style="{ '--h': topos.find(t => t.id === aberto).hue }">
      <small class="cp-rot">{{ emo(topos.find(t => t.id === aberto)) }} Subcategorias de {{ topos.find(t => t.id === aberto).nome }}</small>
      <button v-for="s in subsDe(aberto)" :key="s.id" class="cp-sub" :class="{ sel: modelValue === s.id }" @click="escolher(s)">{{ emo(s) }} {{ s.nome }}</button>
      <button class="cp-sub cp-novo" @click="abrirNova('sub')">＋ Nova subcategoria</button>
    </div>
    <div v-if="nova.modo" class="cp-form caixa pilha">
      <b>{{ nova.modo === 'sub' ? 'Nova subcategoria em ' + topos.find(t => t.id === aberto)?.nome : 'Nova categoria de ' + (tipo === 'desp' ? 'despesa' : 'receita') }}</b>
      <div class="grade-2"><label class="campo">Nome <input v-model="nova.nome" @keyup.enter="criar"></label><label class="campo">Emoji (opcional) <input v-model="nova.emoji" maxlength="4" placeholder="ex.: 🎁"></label></div>
      <div v-if="nova.modo === 'topo'" class="cp-cores"><button v-for="h in HUES" :key="h" :class="{ on: nova.hue === h }" :style="{ '--h': h }" :aria-label="'cor ' + h" @click="nova.hue = h"></button></div>
      <p class="dica">Fica salva e aparece nos próximos lançamentos, no Histórico e em Configurações.</p>
      <div class="acoes"><button class="btn" @click="nova.modo=''">Cancelar</button><button class="btn primario" @click="criar">Criar</button></div>
    </div>
  </div>`
};
