// Início (Dashboard): por enquanto só a estrutura de cartões plugáveis.
import { computed } from '../../lib/vue.esm-browser.prod.js';
import { db, vivo } from '../db.js';
import { mapaSaldos } from '../servicos/estoque-servico.js';

export default {
  emits: ['ir'],
  setup() {
    const itens = vivo(() => db.itens.filter((i) => !i.excluido).toArray(), []);
    const saldos = vivo(() => mapaSaldos(), {});
    const nLista = vivo(() => db.lista.where('status').equals('pendente').filter((l) => !l.excluido).count(), 0);
    const nZerados = computed(() => itens.value.filter((i) => (saldos.value[i.id] || 0) <= 0).length);
    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return { nZerados, nLista, hoje };
  },
  template: `
  <section class="pilha">
    <p class="suave">{{ hoje }}</p>
    <div class="cartoes">
      <button class="cartao" @click="$emit('ir','estoque')"><span class="suave">Estoque zerado</span><b class="alerta">{{ nZerados }}</b><span class="suave">itens</span></button>
      <button class="cartao" @click="$emit('ir','compras')"><span class="suave">Lista de compras</span><b>{{ nLista }}</b><span class="suave">pendentes</span></button>
      <div class="cartao futuro"><span class="suave">Rotina</span><span>Etapa futura</span></div>
      <div class="cartao futuro"><span class="suave">Estudos</span><span>Etapa futura</span></div>
    </div>
  </section>`
};
