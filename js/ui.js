// Estado de interface compartilhado (aviso rápido / toast).
import { reactive } from '../lib/vue.esm-browser.prod.js';

export const ui = reactive({ toast: '' });
let t;
export function avisar(msg) {
  ui.toast = msg;
  clearTimeout(t);
  t = setTimeout(() => { ui.toast = ''; }, 2800);
}

// Toque curto x toque longo (0,5 s). Uso: @pointerdown="p.iniciar(()=>longo())" @click="p.clique(()=>curto())"
export function criarPressao() {
  let timer = null, longo = false;
  return {
    iniciar(fnLongo) { longo = false; clearTimeout(timer); timer = setTimeout(() => { longo = true; fnLongo(); }, 500); },
    cancelar() { clearTimeout(timer); },
    clique(fnCurto) { clearTimeout(timer); if (longo) { longo = false; return; } fnCurto(); }
  };
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
