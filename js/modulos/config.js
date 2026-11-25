// Mais / Configurações: atalhos, sincronização (próxima etapa), sobre.
import { ref } from '../../lib/vue.esm-browser.prod.js';

export const VERSAO = '0.2.2';

export default {
  emits: ['ir'],
  setup() {
    const persistente = ref('verificando…');
    navigator.storage?.persisted?.().then((p) => { persistente.value = p ? 'sim' : 'não (o navegador pode limpar se faltar espaço)'; });
    return { persistente, VERSAO };
  },
  template: `
  <section class="pilha">
    <div class="atalhos">
      <button class="linha" @click="$emit('ir','estudos')"><strong>Estudos</strong><span class="suave">Etapa futura</span></button>
      <button class="linha" @click="$emit('ir','atividades')"><strong>Atividades</strong><span class="suave">Etapa futura</span></button>
    </div>
    <p class="dica">Categorias do estoque: Estoque › Categorias. Atividades da rotina: Rotina › Atividades.</p>
    <h2 class="rotulo">Sincronização</h2>
    <p class="suave">Google Drive — próxima etapa (v0.3.0).</p>
    <h2 class="rotulo">Sobre</h2>
    <p class="suave">Versão {{ VERSAO }} · Armazenamento persistente: {{ persistente }}</p>
  </section>`
};
