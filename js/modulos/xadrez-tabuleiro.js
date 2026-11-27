// Tabuleiro próprio: peças minimalistas desenhadas para o app, toque para mover, só lances válidos (regras pela chess.js).
import { ref, reactive, computed, watch } from '../../lib/vue.esm-browser.prod.js';
import { Chess } from '../../lib/chess.mjs';

const C = { w: 'fill="#F4F1E8" stroke="#121413"', b: 'fill="#1E2221" stroke="#D4AF37"' };
const FORMAS = {
  p: (c) => `<circle cx="22.5" cy="14" r="5.5" ${c}/><path d="M17 33 L19.5 21 H25.5 L28 33 Z" ${c}/><rect x="12" y="33" width="21" height="5" rx="2" ${c}/>`,
  r: (c) => `<path d="M14 10 H18 V13 H20.5 V10 H24.5 V13 H27 V10 H31 V17 H14 Z" ${c}/><rect x="16" y="17" width="13" height="16" ${c}/><rect x="12" y="33" width="21" height="5" rx="2" ${c}/>`,
  n: (c) => `<path d="M14 38 H32 L30 30 C35 23 33 12 23 9 L21 6 L19 10 C13 13 10 20 12 26 L17 24.5 L19.5 27.5 L15 32 Z" ${c}/><circle cx="21" cy="15" r="1.4" fill="currentColor" stroke="none"/>`,
  b: (c) => `<circle cx="22.5" cy="8.5" r="2.6" ${c}/><path d="M22.5 11 C14 18 15 28 18 31 H27 C30 28 31 18 22.5 11 Z" ${c}/><path d="M25 17 L21 23" stroke-width="1.6" ${c.includes('#F4F1E8') ? 'stroke="#121413"' : 'stroke="#D4AF37"'}/><rect x="12" y="32" width="21" height="6" rx="2" ${c}/>`,
  q: (c) => `<path d="M11 15 L15 30 H30 L34 15 L28 23 L22.5 11 L17 23 Z" ${c}/><circle cx="11" cy="14" r="2" ${c}/><circle cx="22.5" cy="10" r="2" ${c}/><circle cx="34" cy="14" r="2" ${c}/><rect x="12" y="30" width="21" height="8" rx="2" ${c}/>`,
  k: (c) => `<path d="M22.5 5 V12 M19 8.5 H26" stroke-width="2.2" ${c}/><path d="M14 18 C14 13 31 13 31 18 L28 31 H17 Z" ${c}/><rect x="12" y="31" width="21" height="7" rx="2" ${c}/>`
};
export const pecaSVG = (t, cor) => `<svg viewBox="0 0 45 45" stroke-width="1.5" stroke-linejoin="round" style="color:${cor === 'w' ? '#121413' : '#D4AF37'}">${FORMAS[t](C[cor])}</svg>`;
const ARQ = 'abcdefgh';

export default {
  props: { fen: { type: String, default: 'start' }, orientacao: { type: String, default: 'w' }, interativo: { type: Boolean, default: true }, destaque: { type: Array, default: () => [] }, dica: { type: Array, default: () => [] }, erro: { type: String, default: '' } },
  emits: ['lance'],
  setup(props, { emit }) {
    const jogo = computed(() => { try { return props.fen === 'start' ? new Chess() : new Chess(props.fen); } catch { return new Chess(); } });
    const sel = ref(''); const promo = reactive({ de: '', para: '' });
    watch(() => props.fen, () => { sel.value = ''; promo.de = ''; });
    const casas = computed(() => {
      const b = jogo.value.board(); const out = [];
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const rr = props.orientacao === 'w' ? r : 7 - r, ff = props.orientacao === 'w' ? f : 7 - f;
        const sq = ARQ[ff] + (8 - rr); const p = b[rr][ff];
        out.push({ sq, clara: (rr + ff) % 2 === 0, p, svg: p ? pecaSVG(p.type, p.color) : '', arq: r === 7 ? ARQ[ff] : '', fil: f === 0 ? String(8 - rr) : '' });
      }
      return out;
    });
    const alvos = computed(() => sel.value ? new Set(jogo.value.moves({ square: sel.value, verbose: true }).map((m) => m.to)) : new Set());
    function tocar(c) {
      if (!props.interativo || promo.de) return;
      const vez = jogo.value.turn();
      if (sel.value && alvos.value.has(c.sq)) {
        const mv = jogo.value.moves({ square: sel.value, verbose: true }).filter((m) => m.to === c.sq);
        if (mv.some((m) => m.promotion)) { Object.assign(promo, { de: sel.value, para: c.sq }); return; }
        emit('lance', { from: sel.value, to: c.sq, san: mv[0].san }); sel.value = ''; return;
      }
      sel.value = c.p && c.p.color === vez && sel.value !== c.sq ? c.sq : '';
    }
    function promover(t) { const mv = jogo.value.moves({ square: promo.de, verbose: true }).find((m) => m.to === promo.para && m.promotion === t); emit('lance', { from: promo.de, to: promo.para, san: mv.san, promotion: t }); Object.assign(promo, { de: '', para: '' }); sel.value = ''; }
    return { casas, sel, alvos, tocar, promo, promover, vez: computed(() => jogo.value.turn()), pecaSVG, xeque: computed(() => jogo.value.inCheck() ? jogo.value.board().flat().find((p) => p && p.type === 'k' && p.color === jogo.value.turn())?.square : '') };
  },
  template: `
  <div class="tab-x" :class="{ inativo: !interativo }">
    <button v-for="c in casas" :key="c.sq" class="cx" :class="{ clara: c.clara, escura: !c.clara, sel: sel===c.sq, ult: destaque.includes(c.sq), dica: dica.includes(c.sq), xq: xeque===c.sq, err: erro===c.sq, alvo: alvos.has(c.sq), cap: alvos.has(c.sq) && c.p }" :aria-label="c.sq + (c.p ? ' ' + c.p.color + c.p.type : '')" @click="tocar(c)">
      <span v-if="c.svg" class="pc" v-html="c.svg"></span>
      <small v-if="c.fil" class="coord f">{{ c.fil }}</small><small v-if="c.arq" class="coord a">{{ c.arq }}</small>
    </button>
    <div v-if="promo.de" class="promo"><button v-for="t in ['q','r','b','n']" :key="t" @click="promover(t)" v-html="pecaSVG(t, vez)" :aria-label="'Promover a ' + t"></button></div>
  </div>`
};
