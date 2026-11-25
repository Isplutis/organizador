// Estudos > disciplina: unidades, seções e aulas (com %), notas e edição da estrutura.
import { reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { lerNumero, fmtNum } from '../db.js';
import { avisar, Modal } from '../ui.js';
import * as E from '../servicos/estudos-servico.js';

export default {
  components: { Modal },
  props: { cursoId: String, disciplinaId: String },
  setup(props) {
    const est = inject('est');
    const c = computed(() => est.calcDe(props.cursoId));
    const d = computed(() => c.value?.discs.find((x) => x.id === props.disciplinaId));
    const abertas = reactive({});
    const nomeAula = (a) => a.nome || `Aula ${a.ordem}`;
    const notaTxt = (x) => (x && x.maximo ? `${x.obtido != null ? fmtNum(x.obtido) : '—'}/${fmtNum(x.maximo)}` : '—');

    // Editor único (modal) para todas as ações
    const ed = reactive({ tipo: null, alvo: null, a: '', b: '', c: '' });
    const abrir = (tipo, alvo, a = '', b = '', c2 = '') => Object.assign(ed, { tipo, alvo, a: String(a ?? ''), b: String(b ?? ''), c: String(c2 ?? '') });
    const fechar = () => { ed.tipo = null; };
    const titulos = { aula: 'Concluir aula', feita: 'Aula concluída', ativ: 'Atividade objetiva', prova: 'Prova final', unidade: 'Nova unidade', renUni: 'Unidade', secao: 'Nova seção', addAulas: 'Adicionar aulas', renDisc: 'Disciplina' };

    function clicarAula(a) {
      if (a.concluida) abrir('feita', a, a.duracaoMin ?? '', a.nome);
      else abrir('aula', a, '', a.nome);
    }
    async function salvar() {
      const t = ed.tipo, x = ed.alvo;
      try {
        if (t === 'aula' || t === 'feita') {
          const min = E.lerDuracao(ed.a);
          if (!(min > 0)) return avisar('Informe a duração da aula (ex.: 12, 12min, 1h05)');
          if (t === 'aula') await E.concluirAula(x.id, min, ed.b);
          else await E.editarAula(x.id, { duracaoMin: min, nome: ed.b.trim() });
        } else if (t === 'ativ' || t === 'prova') {
          const ob = ed.a.trim() === '' ? null : lerNumero(ed.a), mx = lerNumero(ed.b);
          if (!(mx > 0)) return avisar('Informe a pontuação máxima');
          if (ob != null && !(ob >= 0 && ob <= mx)) return avisar('Nota obtida deve estar entre 0 e o máximo');
          if (t === 'ativ') await E.salvarAtividadeObj(x.id, ob, mx); else await E.salvarProva(x.id, ob, mx);
        } else if (t === 'unidade') {
          const n = parseInt(ed.b || '0', 10);
          await E.salvarUnidade({ disciplinaId: props.disciplinaId, nome: ed.a, aulas: n > 0 ? n : 0 });
        } else if (t === 'renUni') {
          if (!ed.a.trim()) return avisar('Informe o nome');
          await E.salvarUnidade({ id: x.id, nome: ed.a });
        } else if (t === 'secao') {
          const n = parseInt(ed.b || '0', 10);
          await E.salvarSecao({ unidadeId: x.id, nome: ed.a, aulas: n > 0 ? n : 0 });
        } else if (t === 'addAulas') {
          const n = parseInt(ed.a || '0', 10);
          if (!(n > 0 && n <= 100)) return avisar('Quantidade de 1 a 100');
          await E.adicionarAulas(x.unidadeId, x.secaoId, n);
        } else if (t === 'renDisc') {
          if (!ed.a.trim()) return avisar('Informe o nome');
          await E.salvarDisciplina({ id: props.disciplinaId, nome: ed.a });
        }
        fechar();
      } catch (e) { avisar('Erro: ' + e.message); }
    }
    async function desmarcar() { await E.desmarcarAula(ed.alvo.id); fechar(); }
    async function excluirAula() { if (confirm('Excluir esta aula?')) { await E.excluirAula(ed.alvo.id); fechar(); } }
    async function excluirUni() { if (confirm(`Excluir "${ed.alvo.nome}" e suas aulas da contagem?`)) { await E.excluirUnidade(ed.alvo.id); fechar(); } }
    async function excluirSec(s) { if (confirm(`Excluir "${s.nome}" e suas aulas?`)) await E.excluirSecao(s.id); }
    async function excluirDisc() { if (confirm(`Excluir a disciplina "${d.value.nome}"?`)) { await E.excluirDisciplina(props.disciplinaId); est.voltar(); } }
    return { est, c, d, abertas, nomeAula, notaTxt, ed, abrir, fechar, titulos, clicarAula, salvar, desmarcar, excluirAula, excluirUni, excluirSec, excluirDisc, hm: E.hm, fmtNum };
  },
  template: `
  <div v-if="d" class="pilha">
    <button class="btn-voltar" @click="est.voltar()">‹ Voltar</button>
    <button class="titulo-ed" @click="abrir('renDisc', null, d.nome)"><h2>{{ d.ordem }}. {{ d.nome }}</h2></button>
    <div class="trio">
      <div class="mini-cartao"><small>Conteúdo</small><b>{{ d.pct }}%</b></div>
      <div class="mini-cartao"><small>Nota</small><b>{{ d.nota.maximo ? d.nota.pct + '%' : '—' }}</b></div>
      <div class="mini-cartao"><small>Aulas × real</small><b class="menor">{{ hm(d.dur) }} × {{ hm(d.realMin) }}</b></div>
    </div>
    <p class="dica" :class="{ okt: d.situacao==='Aprovado', alerta: d.situacao.startsWith('Abaixo') }">{{ d.situacao }} · pontos lançados {{ fmtNum(d.nota.obtido) }}/{{ fmtNum(d.nota.maximo) }} · mínimo {{ c.curso.notaMin || 60 }}%</p>

    <div v-for="u in d.unidades" :key="u.id" class="caixa-uni">
      <button class="cab-uni" @click="abertas[u.id] = !abertas[u.id]">
        <div class="entre"><b>{{ u.nome }}</b><b>{{ u.pct }}%</b></div>
        <span class="barra"><i :style="{ width: u.pct + '%' }"></i></span>
        <small class="suave">{{ u.feitas }}/{{ u.total }} aulas · {{ hm(u.dur) }} · atividade {{ notaTxt(u.atividade) }}</small>
      </button>
      <div v-if="abertas[u.id]" class="corpo-uni">
        <template v-for="s in u.secoes" :key="s.id">
          <div class="entre cab-sec"><span>{{ s.nome }} · {{ s.pct }}% ({{ s.feitas }}/{{ s.total }})</span><span><button class="btn-link" @click="abrir('addAulas', { unidadeId: u.id, secaoId: s.id })">+ aulas</button> <button class="btn-link perigo" @click="excluirSec(s)">excluir</button></span></div>
          <button v-for="a in s.aulas" :key="a.id" class="aula" @click="clicarAula(a)"><span class="caixa-check" :class="{ on: a.concluida }">{{ a.concluida ? '✓' : '' }}</span><span class="cresce">{{ nomeAula(a) }}</span><small class="suave">{{ a.concluida ? hm(a.duracaoMin) : '' }}</small></button>
        </template>
        <div v-if="u.secoes.length && u.aulasSoltas.length" class="cab-sec"><span>Sem seção</span></div>
        <button v-for="a in u.aulasSoltas" :key="a.id" class="aula" @click="clicarAula(a)"><span class="caixa-check" :class="{ on: a.concluida }">{{ a.concluida ? '✓' : '' }}</span><span class="cresce">{{ nomeAula(a) }}</span><small class="suave">{{ a.concluida ? hm(a.duracaoMin) : '' }}</small></button>
        <div class="acoes-uni">
          <button class="btn" @click="abrir('ativ', u, u.atividade?.obtido ?? '', u.atividade?.maximo ?? '')">Atividade {{ notaTxt(u.atividade) }}</button>
          <button class="btn" @click="abrir('addAulas', { unidadeId: u.id, secaoId: null })">+ Aulas</button>
          <button class="btn" @click="abrir('secao', u)">+ Seção</button>
          <button class="btn" @click="abrir('renUni', u, u.nome)">Editar</button>
        </div>
      </div>
    </div>
    <button class="btn-tracejado" @click="abrir('prova', d, d.prova?.obtido ?? '', d.prova?.maximo ?? '')">Prova final: {{ notaTxt(d.prova) }} — lançar nota</button>
    <button class="btn-tracejado" @click="abrir('unidade', null, '', '')">+ Unidade</button>
    <button class="btn perigo" @click="excluirDisc">Excluir disciplina</button>

    <Modal v-if="ed.tipo" :titulo="titulos[ed.tipo]" @fechar="fechar">
      <template v-if="ed.tipo==='aula' || ed.tipo==='feita'">
        <label class="campo">Duração da aula (ex.: 12, 12min, 1h05) <input v-model="ed.a" autofocus @keyup.enter="salvar"></label>
        <label class="campo">Nome (opcional) <input v-model="ed.b" :placeholder="nomeAula(ed.alvo)"></label>
        <p class="dica">Tempo do vídeo/material. Seu tempo real vem do cronômetro.</p>
        <div class="acoes"><template v-if="ed.tipo==='feita'"><button class="btn" @click="desmarcar">Desmarcar</button></template><button class="btn perigo" @click="excluirAula">Excluir</button><span class="espaco"></span><button class="btn" @click="fechar">Cancelar</button><button class="btn primario" @click="salvar">{{ ed.tipo==='aula' ? 'Concluir' : 'Salvar' }}</button></div>
      </template>
      <template v-else-if="ed.tipo==='ativ' || ed.tipo==='prova'">
        <div class="grade-2"><label class="campo">Nota obtida <input v-model="ed.a" inputmode="decimal" placeholder="vazio = não feita" autofocus></label><label class="campo">Pontuação máxima <input v-model="ed.b" inputmode="decimal"></label></div>
        <div class="acoes"><button class="btn" @click="fechar">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
      </template>
      <template v-else-if="ed.tipo==='unidade' || ed.tipo==='secao'">
        <label class="campo">Nome (opcional) <input v-model="ed.a" :placeholder="ed.tipo==='unidade' ? 'Unidade ' + (d.unidades.length + 1) : 'Seção'"></label>
        <label class="campo">Nº de aulas (cria Aula 1…N) <input v-model="ed.b" inputmode="numeric" autofocus></label>
        <div class="acoes"><button class="btn" @click="fechar">Cancelar</button><button class="btn primario" @click="salvar">Criar</button></div>
      </template>
      <template v-else-if="ed.tipo==='addAulas'">
        <label class="campo">Quantas aulas? <input v-model="ed.a" inputmode="numeric" autofocus @keyup.enter="salvar"></label>
        <div class="acoes"><button class="btn" @click="fechar">Cancelar</button><button class="btn primario" @click="salvar">Adicionar</button></div>
      </template>
      <template v-else>
        <label class="campo">Nome <input v-model="ed.a" autofocus @keyup.enter="salvar"></label>
        <div class="acoes"><button v-if="ed.tipo==='renUni'" class="btn perigo" @click="excluirUni">Excluir unidade</button><span class="espaco"></span><button class="btn" @click="fechar">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
      </template>
    </Modal>
  </div>
  <p v-else class="vazio">Disciplina não encontrada.</p>`
};
