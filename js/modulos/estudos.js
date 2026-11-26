// Módulo Estudos: abas Pós | Duolingo | Cursos. Carrega os dados e o cronômetro.
import { ref, computed, provide, watch, onUnmounted } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { hojeStr } from '../servicos/rotina-servico.js';
import * as E from '../servicos/estudos-servico.js';
import Curso from './estudos-curso.js';
import Disciplina from './estudos-disciplina.js';
import Duolingo from './duolingo.js';
import Cursos from './estudos-cursos.js';
import Metas from './estudos-metas.js';
import Leituras from './estudos-leituras.js';

export default {
  components: { Curso, Disciplina, Duolingo, Cursos, Metas, Leituras },
  setup() {
    const dados = {
      cursos: vivo(() => db.cursos.filter((c) => !c.excluido).toArray(), []),
      disciplinas: vivo(() => db.disciplinas.toArray(), []),
      unidades: vivo(() => db.unidades.toArray(), []),
      secoes: vivo(() => db.secoes.toArray(), []),
      aulas: vivo(() => db.aulas.toArray(), []),
      sessoes: vivo(() => db.sessoes.toArray(), [])
    };
    // Cronômetro: relê o estado salvo e atualiza a cada segundo enquanto roda
    const cron = ref(E.lerCron());
    const tick = ref(0);
    const t = setInterval(() => { if (cron.value.inicio) tick.value++; }, 1000);
    onUnmounted(() => clearInterval(t));
    const cronSeg = computed(() => { tick.value; return E.segundosCron(cron.value); });
    const hoje = ref(hojeStr());

    const calcDe = (cursoId) => {
      const curso = dados.cursos.value.find((c) => c.id === cursoId);
      if (!curso) return null;
      return E.calcCurso({ curso, disciplinas: dados.disciplinas.value, unidades: dados.unidades.value, secoes: dados.secoes.value, aulas: dados.aulas.value, sessoes: dados.sessoes.value, hoje: hoje.value,
        cronSeg: cronSeg.value, cronDisc: cron.value.inicio || cron.value.acumulado ? cron.value.disciplinaId : null });
    };
    const pos = computed(() => calcDe('pos-puc'));
    // guarda a meta da semana para a rotina "Estudar a Pós"
    watch(() => pos.value?.plano?.metaSem, (m) => { if (m) E.registrarMetaSemana(pos.value.seg, m); }, { immediate: true });

    const aba = ref(sessionStorage.getItem('estudosAba') || 'pos');
    const irAba = (k) => { aba.value = k; sessionStorage.setItem('estudosAba', k); tela.value = null; };
    const tela = ref(null); // { cursoId, disciplinaId } ou { cursoId } (curso livre)
    provide('est', { dados, cron, cronSeg, calcDe, hoje, abrir: (x) => { tela.value = x; window.scrollTo(0, 0); }, voltar: () => { tela.value = tela.value?.disciplinaId && tela.value.cursoId !== 'pos-puc' ? { cursoId: tela.value.cursoId } : null; } });
    return { aba, irAba, tela };
  },
  template: `
  <section class="pilha">
    <div v-if="!tela" class="abas-seg">
      <button :class="{ ativo: aba==='pos' }" @click="irAba('pos')">Pós</button>
      <button :class="{ ativo: aba==='duo' }" @click="irAba('duo')">Duolingo</button>
      <button :class="{ ativo: aba==='cursos' }" @click="irAba('cursos')">Cursos</button>
      <button :class="{ ativo: aba==='metas' }" @click="irAba('metas')">Metas</button>
      <button :class="{ ativo: aba==='leit' }" @click="irAba('leit')">Hobbies</button>
    </div>
    <Disciplina v-if="tela && tela.disciplinaId" :curso-id="tela.cursoId" :disciplina-id="tela.disciplinaId"></Disciplina>
    <Curso v-else-if="tela && tela.cursoId" :curso-id="tela.cursoId" :voltar="true"></Curso>
    <Curso v-else-if="aba==='pos'" curso-id="pos-puc"></Curso>
    <Duolingo v-else-if="aba==='duo'"></Duolingo>
    <Metas v-else-if="aba==='metas'"></Metas>
    <Leituras v-else-if="aba==='leit'"></Leituras>
    <Cursos v-else></Cursos>
  </section>`
};
