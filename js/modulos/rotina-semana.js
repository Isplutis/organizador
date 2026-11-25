// Rotina > Semana: faixa de dias, % e checklist do dia escolhido.
import { ref, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { fmtNum } from '../db.js';
import { avisar } from '../ui.js';
import * as R from '../servicos/rotina-servico.js';
import { duoIdioma, hm } from '../servicos/estudos-servico.js';

const SIGLAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default {
  setup() {
    const r = inject('rot');
    const sel = ref(r.hoje.value);
    const c = computed(() => r.calc.value);
    const seg = computed(() => R.segundaDe(sel.value));
    const dias = computed(() => SIGLAS.map((sg, i) => {
      const s = R.somaDias(seg.value, i), d = c.value.dia(s), fut = s > r.hoje.value;
      return { s, sg, num: R.pd(s).getDate(), viagem: !!c.value.viagemEm(s), pct: d.viagem ? '✈' : fut ? '·' : d.t ? Math.round(d.f / d.t * 100) + '%' : '–', fut, hoje: s === r.hoje.value };
    }));
    // Semanas futuras: só visualização (para planejar viagens), até 1 ano à frente
    const limite = computed(() => R.somaDias(r.hoje.value, 364));
    const mudarSemana = (n) => { const s = R.somaDias(sel.value, n * 7); sel.value = s > limite.value ? limite.value : s; };
    const ehSemanaAtual = computed(() => R.somaDias(seg.value, 7) > limite.value);

    const pct = (x) => (x == null ? '–' : x + '%');
    const pDia = computed(() => { const d = c.value.dia(sel.value); return d.t ? Math.round(d.f / d.t * 100) + '%' : '–'; });
    const pSemana = computed(() => pct(c.value.periodo(seg.value, R.somaDias(seg.value, 6))));
    const pMes = computed(() => { const i = sel.value.slice(0, 8) + '01'; return pct(c.value.periodo(i, R.somaDias(R.ds(new Date(R.pd(i).getFullYear(), R.pd(i).getMonth() + 1, 1)), -1))); });

    const editavel = computed(() => R.podeEditar(sel.value, r.hoje.value));
    const aviso = computed(() => {
      const d = R.difDias(sel.value, r.hoje.value);
      return d > 0 ? 'Dia futuro — não é possível marcar.' : d === 0 ? '' : d === -1 ? 'Ontem — último dia editável. Sem marcação conta como falha.' : 'Bloqueado — só hoje e ontem podem ser alterados.';
    });
    const ocs = computed(() => c.value.ocorrencias(sel.value).map((o) => ({ ...o, st: c.value.status(o, sel.value), marca: c.value.marcaDe(o.id) })));
    const cfgDia = computed(() => c.value.cfgEm(sel.value));
    const litros = computed(() => c.value.litros(sel.value));
    const semanais = computed(() => c.value.semanaisAtivas(sel.value).map((a) => ({ a, ...c.value.semanaAtual(a, sel.value) })));
    const soAgua = computed(() => !r.atividades.value.some((a) => !a.agua && !a.excluido));

    async function marcar(o, v) {
      if (!editavel.value) return avisar('Bloqueado para alteração');
      await R.marcar(sel.value, o.a.id, o.hora, o.marca === v ? null : v);
    }
    async function sugerir() { await R.adicionarSugestoes(R.SUGESTOES.map((x) => x.nome)); avisar('Atividades carregadas. Toque no nome para editar.'); }
    const viagem = computed(() => c.value.viagemEm(sel.value));
    const podeViagem = computed(() => sel.value >= R.somaDias(r.hoje.value, -1));
    const fmtData = (x) => R.pd(x).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    return { r, sel, dias, mudarSemana, ehSemanaAtual, pDia, pSemana, pMes, editavel, aviso, ocs, cfgDia, litros, semanais, soAgua,
      irEstudos: () => { sessionStorage.setItem('estudosAba', 'pos'); location.hash = 'estudos'; }, duoIdioma, hm, marcar, sugerir, viagem, podeViagem, fmtData, fmtHora: R.fmtHora, fmtNum, R };
  },
  template: `
  <div class="pilha">
    <div class="nav-semana">
      <button class="btn-mini" @click="mudarSemana(-1)" aria-label="Semana anterior">‹</button>
      <div class="faixa-dias">
        <button v-for="d in dias" :key="d.s" class="dia" :class="{ sel: d.s===sel, fut: d.fut, hoje: d.hoje, viagem: d.viagem }" @click="sel=d.s">
          <small>{{ d.sg }}</small><b>{{ d.num }}</b><small>{{ d.pct }}</small>
        </button>
      </div>
      <button class="btn-mini" @click="mudarSemana(1)" :disabled="ehSemanaAtual" aria-label="Próxima semana">›</button>
    </div>
    <div class="trio">
      <div class="mini-cartao"><small>Dia</small><b>{{ pDia }}</b></div>
      <div class="mini-cartao"><small>Semana</small><b>{{ pSemana }}</b></div>
      <div class="mini-cartao"><small>Mês</small><b>{{ pMes }}</b></div>
    </div>
    <p v-if="aviso" class="dica" :class="{ alerta: !editavel }">{{ aviso }}</p>
    <div v-if="viagem" class="faixa-viagem">
      <span>✈ Viagem {{ fmtData(viagem.inicio) }}–{{ fmtData(viagem.fim) }} · não conta nos percentuais</span>
      <button v-if="podeViagem" class="btn" @click="r.abrirViagem(viagem)">Editar</button>
    </div>
    <button v-else-if="podeViagem" class="btn btn-viagem" @click="r.abrirViagem({ inicio: sel })">✈ Marcar viagem</button>

    <div v-if="soAgua && editavel" class="cartao-vazio">
      <p>Nenhuma atividade cadastrada ainda.</p>
      <button class="btn" @click="r.editar()">+ Criar do zero</button>
    </div>

    <div v-for="o in ocs" :key="o.id" class="linha" :class="{ ok: o.st==='f' || o.st==='o' }">
      <button class="linha-info" @click="r.editar(o.a)" :aria-label="'Editar ' + o.a.nome">
        <strong>{{ o.a.nome }}</strong>
        <span v-if="o.a.agua" class="suave">{{ fmtNum(litros) }} / {{ fmtNum(cfgDia.meta) }} L · conclui com {{ fmtNum(cfgDia.limiar) }} L</span>
        <span v-else-if="o.a.duo" class="suave">Hoje: {{ duoIdioma(sel) }}{{ o.marca==='o' ? ' · ' + o.a.outraPessoa + ' fez' : '' }}</span>
        <span v-else class="suave">{{ o.surpresa ? 'Surpresa do dia' : fmtHora(o.a, o.hora) }}{{ o.marca==='o' ? ' · ' + o.a.outraPessoa + ' fez' : '' }}</span>
        <span v-if="o.a.agua" class="barra"><i :style="{ width: Math.min(100, litros / cfgDia.meta * 100) + '%' }"></i></span>
      </button>
      <template v-if="o.a.agua">
        <button v-if="sel===r.hoje.value" class="btn" @click="r.irAba('agua')">{{ o.st==='f' ? '✓' : '+' }}</button>
        <span v-else class="selo-st" :class="o.st">{{ o.st==='f' ? 'Feita' : 'Falha' }}</span>
      </template>
      <template v-else-if="editavel">
        <button class="btn-st f" :class="{ on: o.marca==='f' }" @click="marcar(o,'f')" aria-label="Feita">✓</button>
        <button v-if="o.a.outraPessoa" class="btn-st o" :class="{ on: o.marca==='o' }" @click="marcar(o,'o')" :aria-label="o.a.outraPessoa + ' fez'">{{ o.a.outraPessoa[0] }}</button>
        <button class="btn-st n" :class="{ on: o.marca==='n' }" @click="marcar(o,'n')" aria-label="Não feita">✕</button>
      </template>
      <span v-else class="selo-st" :class="o.st">{{ o.st==='o' ? o.a.outraPessoa + ' fez' : { f: 'Feita', n: 'Falha', p: 'Pendente', x: 'Futuro' }[o.st] }}</span>
    </div>

    <template v-if="semanais.length">
      <h2 class="rotulo">Nesta semana</h2>
      <div v-for="w in semanais" :key="w.a.id" class="linha" :class="{ ok: w.feitos >= w.meta }">
        <button class="linha-info" @click="r.editar(w.a)">
          <strong>{{ w.a.nome }}</strong>
          <span class="suave">{{ w.feitos }} de {{ w.meta }} {{ w.a.estudo ? 'dias' : '' }} nesta semana{{ w.feitos > w.meta ? ' (bônus!)' : '' }}{{ w.a.estudo ? ' · completa sozinha pelo cronômetro' : '' }}</span>
        </button>
        <button v-if="w.a.estudo" class="btn" @click="irEstudos">Estudar</button>
        <template v-else-if="editavel">
          <button v-if="w.noDia" class="btn" @click="R.semanalDesfazer(sel, w.a.id)">Desfazer</button>
          <button class="btn primario" @click="R.semanalFeito(sel, w.a.id)">+ Fiz</button>
        </template>
      </div>
    </template>
    <button v-if="editavel" class="btn-tracejado" @click="r.editar()">+ Atividade</button>
  </div>`
};
