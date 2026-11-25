// Estudos > Duolingo: idioma do dia (sorteado), ofensiva e rating do Xadrez.
import { reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as R from '../servicos/rotina-servico.js';
import * as E from '../servicos/estudos-servico.js';

export default {
  components: { Modal },
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
    return { ofen, idioma, feitoHoje, hist, rating, evol, maxR, minR, concluir, ed, salvar };
  },
  template: `
  <div class="pilha">
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
    <div class="caixa entre">
      <div class="pilha-p"><small class="suave">Rating do Xadrez</small><b class="grande-3">{{ rating ? rating.valor : '—' }}</b><small class="suave" v-if="rating">em {{ rating.data.split('-').reverse().join('/') }}</small></div>
      <button class="btn" @click="ed.tipo='rating'; ed.v=rating ? String(rating.valor) : ''">Atualizar</button>
    </div>
    <div v-if="evol.length > 1" class="grafico-rating">
      <i v-for="r in evol" :key="r.id" :style="{ height: (20 + 80 * (r.valor - minR) / Math.max(1, maxR - minR)) + '%' }" :title="r.data + ': ' + r.valor"></i>
    </div>
    <button class="btn-link" @click="ed.tipo='ofensiva'; ed.v=String(ofen)">Corrigir ofensiva manualmente</button>
    <Modal v-if="ed.tipo" :titulo="ed.tipo==='rating' ? 'Rating do Xadrez' : 'Corrigir ofensiva'" @fechar="ed.tipo=null">
      <label class="campo">{{ ed.tipo==='rating' ? 'Rating atual' : 'Ofensiva atual (como aparece no Duolingo)' }} <input v-model="ed.v" inputmode="numeric" autofocus @keyup.enter="salvar"></label>
      <div class="acoes"><button class="btn" @click="ed.tipo=null">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
  </div>`
};
