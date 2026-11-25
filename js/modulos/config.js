// Mais / Configurações: categorias do estoque, sincronização (parte B), sobre.
import { ref } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { avisar } from '../ui.js';
import { salvarCategoria, excluirCategoria } from '../servicos/estoque-servico.js';

export const VERSAO = '0.1.0';

export default {
  emits: ['ir'],
  setup() {
    const cats = vivo(() => db.categorias.filter((c) => !c.excluido).sortBy('nome'), []);
    const nova = ref('');
    const persistente = ref('verificando…');
    navigator.storage?.persisted?.().then((p) => { persistente.value = p ? 'sim' : 'não (o navegador pode limpar se faltar espaço)'; });

    async function criar() {
      if (!nova.value.trim()) return;
      if (cats.value.some((c) => c.nome.toLowerCase() === nova.value.trim().toLowerCase())) return avisar('Categoria já existe');
      await salvarCategoria(null, nova.value);
      nova.value = '';
    }
    async function renomear(c) {
      const n = prompt('Novo nome da categoria', c.nome);
      if (n && n.trim()) await salvarCategoria(c.id, n);
    }
    async function excluir(c) {
      if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
      const r = await excluirCategoria(c.id);
      if (r.emUso) avisar(`Não excluída: ${r.emUso} item(ns) usam essa categoria`);
    }
    return { cats, nova, criar, renomear, excluir, persistente, VERSAO };
  },
  template: `
  <section class="pilha">
    <div class="atalhos">
      <button class="linha" @click="$emit('ir','estudos')"><strong>Estudos</strong><span class="suave">Etapa futura</span></button>
      <button class="linha" @click="$emit('ir','atividades')"><strong>Atividades</strong><span class="suave">Etapa futura</span></button>
    </div>

    <h2 class="rotulo">Categorias do estoque</h2>
    <form class="linha-form" @submit.prevent="criar">
      <input v-model="nova" placeholder="Nova categoria" aria-label="Nova categoria" class="cresce">
      <button class="btn primario" type="submit">Criar</button>
    </form>
    <p v-if="!cats.length" class="vazio">Nenhuma categoria.</p>
    <div v-for="c in cats" :key="c.id" class="linha">
      <span class="linha-info"><strong>{{ c.nome }}</strong></span>
      <button class="btn" @click="renomear(c)">Renomear</button>
      <button class="btn perigo" @click="excluir(c)">Excluir</button>
    </div>

    <h2 class="rotulo">Sincronização</h2>
    <p class="suave">Google Drive — será ativada na próxima entrega (parte B).</p>

    <h2 class="rotulo">Sobre</h2>
    <p class="suave">Versão {{ VERSAO }} · Armazenamento persistente: {{ persistente }}</p>
  </section>`
};
