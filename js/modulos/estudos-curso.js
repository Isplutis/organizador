// Estudos > curso (Pós ou curso livre): cronômetro, plano anti-acúmulo e disciplinas.
import { reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { avisar, Modal } from '../ui.js';
import { hojeStr, pd, somaDias } from '../servicos/rotina-servico.js';
import * as E from '../servicos/estudos-servico.js';

const fmtMes = (s) => pd(s).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');

export default {
  components: { Modal },
  props: { cursoId: String, voltar: Boolean },
  setup(props) {
    const est = inject('est');
    const c = computed(() => est.calcDe(props.cursoId));
    const rodando = computed(() => !!est.cron.value.inicio);
    const cronTxt = computed(() => { const s = est.cronSeg.value; return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':'); });
    const discCron = computed(() => c.value?.discs.find((d) => d.id === (est.cron.value.disciplinaId || c.value?.atual?.id)));
    const cronDeOutro = computed(() => est.cron.value.disciplinaId && !c.value?.discs.some((d) => d.id === est.cron.value.disciplinaId));

    function play() {
      if (cronDeOutro.value) return avisar('O cronômetro está rodando em outro curso');
      if (!c.value?.atual) return avisar('Cadastre uma disciplina primeiro');
      est.cron.value = rodando.value ? E.pausarCron() : E.iniciarCron(c.value.atual.id);
    }
    async function encerrar() {
      const min = await E.encerrarCron(props.cursoId);
      est.cron.value = E.lerCron();
      avisar(min >= 1 ? `Sessão salva: ${E.hm(min)}` : 'Sessão menor que 1 minuto não foi salva');
    }
    // Lançamento manual de tempo
    const lan = reactive({ aberto: false, data: hojeStr(), dur: '', disc: '' });
    const abrirLan = () => Object.assign(lan, { aberto: true, data: hojeStr(), dur: '', disc: c.value?.atual?.id || '' });
    async function salvarLan() {
      const min = E.lerDuracao(lan.dur);
      if (!(min > 0)) return avisar('Duração inválida (ex.: 40, 1h20)');
      if (!lan.disc) return avisar('Escolha a disciplina');
      if (lan.data > hojeStr()) return avisar('Data no futuro');
      await E.lancarTempo({ cursoId: props.cursoId, disciplinaId: lan.disc, data: lan.data, minutos: min });
      lan.aberto = false; avisar(`Lançado: ${E.hm(min)}`);
    }
    // Nova disciplina
    const nd = reactive({ aberto: false, nome: '' });
    async function salvarNd() {
      if (!nd.nome.trim()) return avisar('Informe o nome');
      await E.salvarDisciplina({ cursoId: props.cursoId, nome: nd.nome }); nd.aberto = false;
    }
    const statusTxt = computed(() => { const p = c.value?.plano; if (!p) return ''; return p.status === 'em-dia' ? 'Em dia' : p.status === 'pouco' ? 'Um pouco atrás' : `${p.atraso} aulas atrás`; });
    const placeholders = computed(() => { const x = c.value; if (!x) return []; const n = Math.max(0, x.totalDisc - x.discs.length); return Array.from({ length: n }, (_, i) => x.discs.length + i + 1); });
    return { est, c, rodando, cronTxt, discCron, play, encerrar, lan, abrirLan, salvarLan, nd, salvarNd, statusTxt, placeholders, hm: E.hm, fmtMes, ontem: somaDias(hojeStr(), -1), hoje: hojeStr() };
  },
  template: `
  <div v-if="c" class="pilha">
    <div v-if="voltar" class="entre"><button class="btn-voltar" @click="est.voltar()">‹ Cursos</button><b>{{ c.curso.nome }}</b></div>

    <div class="caixa pilha">
      <div class="entre"><b>Cronômetro</b><span class="suave curto-txt">{{ discCron ? discCron.ordem + '. ' + discCron.nome : 'sem disciplina' }}</span></div>
      <div class="cron">{{ cronTxt }}</div>
      <div class="grade-2">
        <button class="btn primario" @click="play">{{ rodando ? 'Pausar' : (est.cronSeg.value ? 'Continuar' : 'Iniciar') }}</button>
        <button class="btn" :disabled="!est.cronSeg.value" @click="encerrar">Encerrar sessão</button>
      </div>
      <div class="entre"><span class="dica">Hoje: {{ hm(c.hojeMin) }} de {{ hm(c.metaDia) }}{{ c.curso.id==='pos-puc' ? ' · completa “Estudar a Pós”' : '' }}</span><a href="#" class="dica" @click.prevent="abrirLan">+ lançar tempo</a></div>
      <span class="barra"><i :style="{ width: Math.min(100, c.hojeMin / c.metaDia * 100) + '%' }"></i></span>
    </div>

    <div v-if="c.plano" class="caixa pilha">
      <div class="entre"><b>Plano até {{ fmtMes(c.curso.prazoConteudo) }}</b><span class="status-plano" :class="c.plano.status">{{ statusTxt }}</span></div>
      <div class="grade-2">
        <div><small class="suave">Conteúdo feito</small><div class="num-g">{{ c.plano.pctConteudo }}%</div></div>
        <div><small class="suave">Tempo do curso passado</small><div class="num-g">{{ c.plano.pctTempo }}%</div></div>
      </div>
      <span class="barra grossa marcador"><i :style="{ width: c.plano.pctConteudo + '%' }"></i><em :style="{ left: c.plano.pctTempo + '%' }"></em></span>
      <div class="tabela-p">
        <div class="entre"><span class="suave">Meta desta semana</span><b>{{ hm(c.plano.metaSem) }}</b></div>
        <div class="entre"><span class="suave">Estudado nesta semana</span><b>{{ hm(c.semMin) }} · {{ c.diasSem }} de 5 dias</b></div>
        <div class="entre"><span class="suave">Ritmo necessário</span><b>{{ c.plano.ritmo }} aulas/semana</b></div>
        <div class="entre"><span class="suave">Aulas feitas</span><b>{{ c.tot.feitas }} de {{ c.plano.totalEst }}{{ c.plano.estimado ? ' (estimado)' : '' }}</b></div>
        <div class="entre"><span class="suave">Seu fator (real ÷ aula)</span><b>{{ c.confiavel ? c.fator.toFixed(1).replace('.', ',') + '×' : 'após 5 aulas' }}</b></div>
      </div>
      <p class="dica">Meta = maior entre 5h e o necessário para o prazo ({{ hm(c.plano.necessario) }}/semana). Estudando menos, a meta sobe nas próximas semanas.{{ c.plano.estimado ? ' Total de aulas estimado pelas disciplinas já cadastradas.' : '' }}</p>
    </div>

    <div class="entre"><h2 class="rotulo">Disciplinas · mínimo {{ c.curso.notaMin || 60 }}%</h2><button class="btn" @click="nd.aberto=true; nd.nome=''">+ Disciplina</button></div>
    <button v-for="(d, i) in c.discs" :key="d.id" class="cartao-disc" :class="{ atual: c.atual && d.id===c.atual.id, completa: d.completa }" @click="est.abrir({ cursoId, disciplinaId: d.id })">
      <div class="entre"><strong>{{ d.ordem }}. {{ d.nome }}</strong><b>{{ d.pct }}%</b></div>
      <span class="barra"><i :style="{ width: d.pct + '%' }"></i></span>
      <div class="entre"><small class="suave">{{ d.feitas }}/{{ d.total }} aulas · nota {{ d.nota.maximo ? d.nota.pct + '%' : '—' }} · {{ d.situacao }}</small><small class="suave" v-if="c.plano">alvo {{ fmtMes(c.plano.alvos[i]) }}</small></div>
    </button>
    <div v-for="n in placeholders" :key="'p' + n" class="cartao-disc vazio-d">
      <div class="entre"><span class="suave">{{ n }}. Disciplina a cadastrar</span><small class="suave" v-if="c.plano">alvo {{ fmtMes(c.plano.alvos[n - 1]) }}</small></div>
    </div>

    <Modal v-if="lan.aberto" titulo="Lançar tempo de estudo" @fechar="lan.aberto=false">
      <div class="grade-2">
        <label class="campo">Data <input type="date" v-model="lan.data" :max="hoje"></label>
        <label class="campo">Duração <input v-model="lan.dur" placeholder="40 ou 1h20" autofocus></label>
      </div>
      <label class="campo">Disciplina <select v-model="lan.disc"><option v-for="d in c.discs" :key="d.id" :value="d.id">{{ d.ordem }}. {{ d.nome }}</option></select></label>
      <div class="acoes"><button class="btn" @click="lan.aberto=false">Cancelar</button><button class="btn primario" @click="salvarLan">Lançar</button></div>
    </Modal>
    <Modal v-if="nd.aberto" titulo="Nova disciplina" @fechar="nd.aberto=false">
      <label class="campo">Nome <input v-model="nd.nome" autofocus @keyup.enter="salvarNd"></label>
      <p class="dica">Ela entra como a disciplina {{ c.discs.length + 1 }}. Depois adicione unidades, seções e aulas.</p>
      <div class="acoes"><button class="btn" @click="nd.aberto=false">Cancelar</button><button class="btn primario" @click="salvarNd">Criar</button></div>
    </Modal>
  </div>
  <p v-else class="vazio">Carregando…</p>`
};
