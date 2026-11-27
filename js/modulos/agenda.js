// Agenda unificada (no Início): mês com pontos por tipo ou lista dos próximos 14 dias.
import { ref, reactive, computed } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as R from '../servicos/rotina-servico.js';
import * as A from '../servicos/agenda-servico.js';
import { gcal } from '../gcal.js';

const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export default {
  components: { Modal },
  props: { calc: Object },
  emits: ['ir'],
  setup(props, { emit }) {
    const hoje = R.hojeStr();
    const D = {
      compromissos: vivo(() => db.aCompromissos.toArray(), []), fixas: vivo(() => db.fFixas.toArray(), []), lancs: vivo(() => db.fLanc.toArray(), []),
      cartoes: vivo(() => db.fCartoes.toArray(), []), pedidos: vivo(() => db.oPedidos.toArray(), []), viagens: vivo(() => db.viagens.toArray(), []),
      cursos: vivo(() => db.cursos.toArray(), []), disciplinas: vivo(() => db.disciplinas.toArray(), [])
    };
    const ctx = computed(() => ({ hoje, calc: null, google: gcal.ativo ? gcal.google : [], ...Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.value])) }));
    const modo = ref(localStorage.getItem('agendaModo') || 'mes');
    const irModo = (m) => { modo.value = m; try { localStorage.setItem('agendaModo', m); } catch { /* */ } };
    const mes = ref(hoje.slice(0, 7)), sel = ref(hoje);
    const grade = computed(() => A.gradeMes(mes.value).map((d) => {
      const it = A.itensDoDia(d.s, ctx.value), cores = [...new Set(it.map((x) => x.cor))].slice(0, 4);
      return { ...d, n: +d.s.slice(8, 10), cores };
    }));
    const doDia = computed(() => A.itensDoDia(sel.value, ctx.value));
    const prox = computed(() => Array.from({ length: 14 }, (_, i) => R.somaDias(hoje, i)).map((s) => ({ s, itens: A.itensDoDia(s, ctx.value) })).filter((d) => d.itens.length));
    const mudarMes = (n) => { const [a, m] = mes.value.split('-').map(Number), d = new Date(a, m - 1 + n, 1); mes.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const titMes = computed(() => new Date(mes.value + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    const titDia = (s) => s === hoje ? 'Hoje' : s === R.somaDias(hoje, 1) ? 'Amanhã' : R.pd(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
    const semRotina = ref(localStorage.getItem('agendaSemRotina') === '1');
    const alternarRotina = () => { semRotina.value = !semRotina.value; try { localStorage.setItem('agendaSemRotina', semRotina.value ? '1' : '0'); } catch { /* */ } };
    const filtrar = (its) => its;

    async function tocarFeito(it, s) {
      if (it.rotina) {
        if (!R.podeEditar(s)) return avisar('Só dá para alterar hoje e ontem');
        await R.marcar(s, it.rotina.a.id, it.rotina.hora, it.feito ? null : 'f');
      } else if (it.comp) await A.marcarFeito(it.comp, s, !it.feito);
    }
    function abrirItem(it, s) {
      if (it.comp) return editar(it.comp, s);
      if (it.link) return window.open(it.link, '_blank', 'noopener');
      if (it.ir) { if (it.aba) sessionStorage.setItem('estoqueAba', it.aba); if (it.ir === 'rotina') sessionStorage.setItem('rotinaAba', 'semana'); emit('ir', it.ir); }
    }
    // compromissos e aniversários
    const ed = reactive({ aberto: false, v: {} });
    function novo(tipo = 'comp') { Object.assign(ed, { aberto: true, v: { tipo, titulo: '', data: sel.value || hoje, hora: '', repete: '', anoNasc: '', local: '', obs: '' } }); }
    function editar(c) { Object.assign(ed, { aberto: true, v: { id: c.id, tipo: c.tipo, titulo: c.titulo, data: c.data, hora: c.hora || '', repete: c.repete || '', anoNasc: c.anoNasc ? String(c.anoNasc) : '', local: c.local || '', obs: c.obs || '' } }); }
    async function salvar() {
      const v = ed.v;
      if (!v.titulo.trim()) return avisar(v.tipo === 'aniv' ? 'Informe o nome' : 'Informe o título');
      if (!v.data) return avisar('Informe a data');
      const anoNasc = v.anoNasc ? parseInt(v.anoNasc, 10) : null;
      if (v.anoNasc && !(anoNasc > 1900 && anoNasc <= +hoje.slice(0, 4))) return avisar('Ano de nascimento inválido');
      await A.salvarCompromisso({ ...v, anoNasc }); ed.aberto = false; avisar('Salvo na agenda');
    }
    async function excluir() { if (!confirm(`Excluir "${ed.v.titulo}"?`)) return; await A.excluirCompromisso(ed.v.id); ed.aberto = false; avisar('Excluído'); }
    return { modo, irModo, mes, sel, grade, doDia, prox, mudarMes, titMes, titDia, SEM, hoje, tocarFeito, abrirItem, ed, novo, editar, salvar, excluir, REPETE: A.REPETE, semRotina, alternarRotina, filtrar };
  },
  template: `
  <section class="pilha agenda">
    <div class="entre"><h2 class="rotulo sem-margem">Agenda</h2>
      <div class="seg-visao"><button :class="{ ativo: modo==='mes' }" @click="irModo('mes')">Mês</button><button :class="{ ativo: modo==='lista' }" @click="irModo('lista')">14 dias</button></div></div>
    <template v-if="modo==='mes'">
      <div class="cab-mes"><button class="btn-mini" @click="mudarMes(-1)" aria-label="Mês anterior">‹</button><b class="cresce centro">{{ titMes }}</b><button class="btn-mini" @click="mudarMes(1)" aria-label="Próximo mês">›</button></div>
      <div class="ag-grade">
        <span v-for="d in SEM" :key="d" class="ag-sem">{{ d }}</span>
        <button v-for="d in grade" :key="d.s" class="ag-dia" :class="{ fora: d.fora, hoje: d.s===hoje, sel: d.s===sel }" @click="sel=d.s" :aria-label="d.s">
          <b>{{ d.n }}</b><span class="ag-pts"><i v-for="c in d.cores" :key="c" :class="'ag-' + c"></i></span>
        </button>
      </div>
      <h3 class="ag-tit">{{ titDia(sel) }}</h3>
      <p v-if="!filtrar(doDia).length" class="vazio">Nada neste dia.</p>
      <div v-for="it in filtrar(doDia)" :key="it.k" class="ag-item" :class="['ag-b-' + it.cor, { feito: it.feito }]">
        <button v-if="it.podeFeito" class="ag-check" :class="{ on: it.feito }" :aria-label="(it.feito ? 'Desmarcar ' : 'Marcar ') + it.titulo" @click="tocarFeito(it, sel)">{{ it.feito ? '✓' : '' }}</button>
        <button class="ag-txt" @click="abrirItem(it, sel)"><span class="num ag-hora">{{ it.hora || '' }}</span><strong>{{ it.titulo }}</strong><small v-if="it.sub" class="suave">{{ it.sub }}</small></button>
      </div>
    </template>
    <template v-else>
      <p v-if="!prox.length" class="vazio">Nada nos próximos 14 dias.</p>
      <div v-for="d in prox" :key="d.s" class="pilha">
        <h3 class="ag-tit">{{ titDia(d.s) }}</h3>
        <div v-for="it in filtrar(d.itens)" :key="it.k" class="ag-item" :class="['ag-b-' + it.cor, { feito: it.feito }]">
          <button v-if="it.podeFeito" class="ag-check" :class="{ on: it.feito }" :aria-label="(it.feito ? 'Desmarcar ' : 'Marcar ') + it.titulo" @click="tocarFeito(it, d.s)">{{ it.feito ? '✓' : '' }}</button>
          <button class="ag-txt" @click="abrirItem(it, d.s)"><span class="num ag-hora">{{ it.hora || '' }}</span><strong>{{ it.titulo }}</strong><small v-if="it.sub" class="suave">{{ it.sub }}</small></button>
        </div>
      </div>
    </template>
    <div class="grade-2"><button class="btn" @click="novo('comp')">+ Compromisso</button><button class="btn" @click="novo('aniv')">+ Aniversário</button></div>

    <Modal v-if="ed.aberto" :titulo="(ed.v.id ? 'Editar ' : 'Novo ') + (ed.v.tipo==='aniv' ? 'aniversário' : 'compromisso')" @fechar="ed.aberto=false">
      <label class="campo">{{ ed.v.tipo==='aniv' ? 'Nome da pessoa' : 'Título' }} <input v-model="ed.v.titulo"></label>
      <div class="grade-2">
        <label class="campo">{{ ed.v.tipo==='aniv' ? 'Dia do aniversário' : 'Data' }} <input type="date" v-model="ed.v.data"></label>
        <label v-if="ed.v.tipo!=='aniv'" class="campo">Horário (opcional) <input type="time" v-model="ed.v.hora"></label>
        <label v-else class="campo">Ano de nascimento (opcional) <input v-model="ed.v.anoNasc" inputmode="numeric" placeholder="para mostrar a idade"></label>
      </div>
      <label v-if="ed.v.tipo!=='aniv'" class="campo">Repetição <select v-model="ed.v.repete"><option v-for="(n,k) in REPETE" :key="k" :value="k">{{ n }}</option></select></label>
      <label v-if="ed.v.tipo!=='aniv'" class="campo">Local (opcional) <input v-model="ed.v.local"></label>
      <label class="campo">Observação (opcional) <input v-model="ed.v.obs"></label>
      <div class="acoes"><button v-if="ed.v.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span><button class="btn" @click="ed.aberto=false">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
  </section>`
};
