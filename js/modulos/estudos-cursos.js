// Estudos > Cursos e certificações: lista de cursos livres (mesma estrutura da Pós).
import { reactive, computed, inject } from '../../lib/vue.esm-browser.prod.js';
import { avisar, Modal } from '../ui.js';
import * as E from '../servicos/estudos-servico.js';

export default {
  components: { Modal },
  setup() {
    const est = inject('est');
    const lista = computed(() => est.dados.cursos.value.filter((c) => c.tipo === 'curso').map((c) => est.calcDe(c.id)).filter(Boolean));
    const nc = reactive({ aberto: false, nome: '', prazo: '' });
    async function salvar() {
      if (!nc.nome.trim()) return avisar('Informe o nome');
      await E.salvarCurso({ nome: nc.nome, prazoConteudo: nc.prazo || null });
      nc.aberto = false;
    }
    async function excluir(c) { if (confirm(`Excluir o curso "${c.curso.nome}"?`)) await E.excluirCurso(c.curso.id); }
    return { est, lista, nc, salvar, excluir };
  },
  template: `
  <div class="pilha">
    <button class="btn primario largo" @click="nc.aberto=true; nc.nome=''; nc.prazo=''">+ Novo curso</button>
    <p v-if="!lista.length" class="vazio">Nenhum curso ainda. Mesma estrutura da Pós: disciplinas → unidades → seções → aulas, com notas, cronômetro e plano (se tiver prazo).</p>
    <div v-for="c in lista" :key="c.curso.id" class="linha">
      <button class="linha-info" @click="est.abrir({ cursoId: c.curso.id })"><strong>{{ c.curso.nome }}</strong><span class="suave">{{ c.tot.feitas }}/{{ c.tot.total }} aulas{{ c.curso.prazoConteudo ? ' · prazo ' + c.curso.prazoConteudo.split('-').reverse().join('/') : '' }}</span></button>
      <button class="btn perigo" @click="excluir(c)">Excluir</button>
    </div>
    <Modal v-if="nc.aberto" titulo="Novo curso" @fechar="nc.aberto=false">
      <label class="campo">Nome <input v-model="nc.nome" autofocus></label>
      <label class="campo">Prazo para terminar (opcional) <input type="date" v-model="nc.prazo"></label>
      <div class="acoes"><button class="btn" @click="nc.aberto=false">Cancelar</button><button class="btn primario" @click="salvar">Criar</button></div>
    </Modal>
  </div>`
};
