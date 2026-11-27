// Rotina > Semana: faixa de dias, % e checklist do dia escolhido.
import { ref, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo, fmtNum } from '../db.js';
import * as A from '../servicos/agenda-servico.js';
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
      return { s, sg, num: R.pd(s).getDate(), viagem: !!c.value.viagemEm(s), pct: d.viagem ? '✈' : d.antes ? '–' : fut ? '·' : d.t ? Math.round(d.f / d.t * 100) + '%' : '–', fut, hoje: s === r.hoje.value };
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
    const fmtIni = computed(() => c.value.inicio ? c.value.inicio.split('-').reverse().join('/') : '');
    const aviso = computed(() => {
      if (c.value.antesDoInicio(sel.value)) return `Período de teste: não conta nos percentuais nem nas falhas (contagem começa em ${fmtIni.value}).` + (R.difDias(sel.value, r.hoje.value) < -1 ? ' Bloqueado para alteração.' : '');
      const d = R.difDias(sel.value, r.hoje.value);
      return d > 0 ? 'Dia futuro — não é possível marcar.' : d === 0 ? '' : d === -1 ? 'Ontem — último dia editável. Sem marcação conta como falha.' : 'Bloqueado — só hoje e ontem podem ser alterados.';
    });
    const ocs = computed(() => c.value.ocorrencias(sel.value).map((o) => ({ ...o, st: c.value.status(o, sel.value), marca: c.value.marcaDe(o.id) })));
    // compromissos da Agenda no dia (não contam no percentual)
    const compromissos = vivo(() => db.aCompromissos.toArray(), []);
    const compsDia = computed(() => A.itensDoDia(sel.value, { hoje: r.hoje.value, compromissos: compromissos.value, fixas: [], lancs: [], cartoes: [], pedidos: [], viagens: [], cursos: [], disciplinas: [], google: [] }));
    // sem horário primeiro (para lembrar cedo); depois por horário, com os compromissos intercalados
    const semHora = computed(() => [...ocs.value.filter((o) => !o.hora).map((o) => ({ k: o.id, o })), ...compsDia.value.filter((x) => !x.hora).map((x) => ({ k: x.k, comp: x }))]);
    const comHora = computed(() => [...ocs.value.filter((o) => o.hora).map((o) => ({ k: o.id, o, h: o.hora })), ...compsDia.value.filter((x) => x.hora).map((x) => ({ k: x.k, comp: x, h: x.hora }))].sort((a, b) => a.h.localeCompare(b.h)));
    async function feitoComp(x) { if (x.comp && x.podeFeito) await A.marcarFeito(x.comp, sel.value, !x.feito); }
    const irAgua = () => { sessionStorage.setItem('saudeAba', 'agua'); location.hash = 'saude'; };
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

    return { semHora, comHora, feitoComp, irAgua, r, sel, dias, mudarSemana, ehSemanaAtual, pDia, pSemana, pMes, editavel, aviso, ocs, cfgDia, litros, semanais, soAgua,
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

    <template v-for="(grupo, gi) in [{ t: 'Sem horário — faça quando puder', l: semHora }, { t: 'Com horário', l: comHora }]" :key="gi">
      <h2 v-if="grupo.l.length" class="rotulo">{{ grupo.t }}</h2>
      <template v-for="it in grupo.l" :key="it.k">
        <div v-if="it.comp" class="linha lembrete-comp" :class="{ ok: it.comp.feito }">
          <span class="linha-info"><strong>{{ it.comp.titulo }}</strong><small class="suave">{{ it.comp.hora ? 'às ' + it.comp.hora + ' · ' : '' }}compromisso{{ it.comp.sub ? ' · ' + it.comp.sub : '' }} · não conta no percentual</small></span>
          <button v-if="it.comp.podeFeito" class="btn-st f" :class="{ on: it.comp.feito }" @click="feitoComp(it.comp)" aria-label="Feito">✓</button>
        </div>
        <template v-else>
    <div class="linha" :class="{ ok: it.o.st==='f' || it.o.st==='o' }">
            <button class="linha-info" @click="r.editar(it.o.a)" :aria-label="'Editar ' + it.o.a.nome">
              <strong>{{ it.o.a.nome }}</strong>
              <span v-if="it.o.a.agua" class="suave">{{ fmtNum(litros) }} / {{ fmtNum(cfgDia.meta) }} L · conclui com {{ fmtNum(cfgDia.limiar) }} L</span>
              <span v-else-if="it.o.a.duo" class="suave">Hoje: {{ duoIdioma(sel) }}{{ it.o.marca==='o' ? ' · ' + it.o.a.outraPessoa + ' fez' : '' }}</span>
              <span v-else class="suave">{{ it.o.surpresa ? 'Surpresa do dia' : fmtHora(it.o.a, it.o.hora) }}{{ it.o.marca==='o' ? ' · ' + it.o.a.outraPessoa + ' fez' : '' }}</span>
              <span v-if="it.o.a.agua" class="barra"><i :style="{ width: Math.min(100, litros / cfgDia.meta * 100) + '%' }"></i></span>
            </button>
            <template v-if="it.o.a.agua">
              <button v-if="sel===r.hoje.value" class="btn" @click="irAgua">{{ it.o.st==='f' ? '✓' : '+' }}</button>
              <span v-else class="selo-st" :class="it.o.st">{{ it.o.st==='f' ? 'Feita' : 'Falha' }}</span>
            </template>
            <template v-else-if="editavel">
              <button class="btn-st f" :class="{ on: it.o.marca==='f' }" @click="marcar(it.o,'f')" aria-label="Feita">✓</button>
              <button v-if="it.o.a.outraPessoa" class="btn-st o" :class="{ on: it.o.marca==='o' }" @click="marcar(it.o,'o')" :aria-label="it.o.a.outraPessoa + ' fez'">{{ it.o.a.outraPessoa[0] }}</button>
              <button class="btn-st n" :class="{ on: it.o.marca==='n' }" @click="marcar(it.o,'n')" aria-label="Não feita">✕</button>
            </template>
            <span v-else class="selo-st" :class="it.o.st">{{ it.o.st==='o' ? it.o.a.outraPessoa + ' fez' : { f: 'Feita', n: 'Falha', p: 'Pendente', x: 'Futuro' }[it.o.st] }}</span>
          </div>

        </template>
      </template>
    </template>
    <template v-if="sel===r.hoje.value && r.contasHoje.value.length">
      <h2 class="rotulo">Contas que vencem hoje</h2>
      <a v-for="x in r.contasHoje.value" :key="x.id" href="#financas" class="linha lembrete-conta"><span class="linha-info"><strong>{{ x.nome }}</strong><small class="suave">lembrete · não conta no percentual · toque para pagar em Finanças</small></span><b class="num">{{ x.valorTxt }}</b></a>
    </template>
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
