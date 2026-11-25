// Estoque > Categorias: criar, renomear e excluir.
import { reactive } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { avisar, Modal } from '../ui.js';
import { salvarCategoria, excluirCategoria } from '../servicos/estoque-servico.js';

export default {
  components: { Modal },
  setup() {
    const cats = vivo(() => db.categorias.filter((c) => !c.excluido).sortBy('nome'), []);
    const contagem = vivo(async () => {
      const m = {}; await db.itens.each((i) => { if (!i.excluido) m[i.categoriaId || ''] = (m[i.categoriaId || ''] || 0) + 1; }); return m;
    }, {});
    const ed = reactive({ aberto: false, id: null, nome: '' });
    const abrir = (c) => Object.assign(ed, { aberto: true, id: c?.id || null, nome: c?.nome || '' });
    async function salvar() {
      const n = ed.nome.trim();
      if (!n) return avisar('Informe o nome');
      if (cats.value.some((c) => c.id !== ed.id && c.nome.toLowerCase() === n.toLowerCase())) return avisar('Categoria já existe');
      await salvarCategoria(ed.id, n); ed.aberto = false;
    }
    async function excluir() {
      if (!confirm(`Excluir a categoria "${ed.nome}"?`)) return;
      const r = await excluirCategoria(ed.id);
      if (r.emUso) return avisar(`Não excluída: ${r.emUso} item(ns) usam essa categoria`);
      ed.aberto = false;
    }
    return { cats, contagem, ed, abrir, salvar, excluir };
  },
  template: `
  <div class="pilha">
    <button class="btn primario largo" @click="abrir(null)">+ Nova categoria</button>
    <p v-if="!cats.length" class="vazio">Nenhuma categoria.</p>
    <button v-for="c in cats" :key="c.id" class="linha" @click="abrir(c)">
      <span class="linha-info"><strong>{{ c.nome }}</strong><span class="suave">{{ contagem[c.id] || 0 }} item(ns)</span></span>
      <span class="suave">Editar ›</span>
    </button>
    <p class="dica">Itens sem categoria: {{ contagem[''] || 0 }}. Só é possível excluir categorias sem itens.</p>
    <Modal v-if="ed.aberto" :titulo="ed.id ? 'Editar categoria' : 'Nova categoria'" @fechar="ed.aberto=false">
      <label class="campo">Nome <input v-model="ed.nome" autofocus @keyup.enter="salvar"></label>
      <div class="acoes"><button v-if="ed.id" class="btn perigo" @click="excluir">Excluir</button><span class="espaco"></span>
        <button class="btn" @click="ed.aberto=false">Cancelar</button><button class="btn primario" @click="salvar">Salvar</button></div>
    </Modal>
  </div>`
};
