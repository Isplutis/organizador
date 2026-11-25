// Estado de interface compartilhado (aviso rápido / toast).
import { reactive } from '../lib/vue.esm-browser.prod.js';

export const ui = reactive({ toast: '' });
let t;
export function avisar(msg) {
  ui.toast = msg;
  clearTimeout(t);
  t = setTimeout(() => { ui.toast = ''; }, 2800);
}

// Componente de janela modal simples (fecha clicando fora ou no Esc do teclado via botão).
export const Modal = {
  props: { titulo: String },
  emits: ['fechar'],
  template: `
  <div class="modal-fundo" @click.self="$emit('fechar')">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="titulo">
      <h2>{{ titulo }}</h2>
      <slot></slot>
    </div>
  </div>`
};
