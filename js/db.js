// Banco local (IndexedDB) + utilitários compartilhados.
import Dexie, { liveQuery } from '../lib/dexie.mjs';
import { ref, onUnmounted } from '../lib/vue.esm-browser.prod.js';

export const db = new Dexie('organizador');

// Regras de sincronização (parte B):
// - categorias, itens, lista: id + atualizadoEm + excluido (último que gravou vence)
// - movimentos: só inserção, nunca editados (saldo = soma dos deltas)
db.version(1).stores({
  categorias: 'id, atualizadoEm',
  itens: 'id, categoriaId, atualizadoEm',
  movimentos: 'id, itemId, data',
  lista: 'id, itemId, status, atualizadoEm',
  meta: 'chave'
});

export const uid = () => crypto.randomUUID();
export const agora = () => new Date().toISOString();
export const r3 = (n) => Math.round(n * 1000) / 1000;

// "0,5" ou "0.5" -> 0.5 ; "1.250,5" -> 1250.5 ; retorna NaN se inválido
export const lerNumero = (txt) => {
  let s = String(txt ?? '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
};
export const fmtNum = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

// Consulta reativa: atualiza a tela sempre que o banco muda.
export function vivo(consulta, inicial) {
  const r = ref(inicial);
  const sub = liveQuery(consulta).subscribe({
    next: (v) => { r.value = v; },
    error: (e) => console.error('[vivo]', e)
  });
  onUnmounted(() => sub.unsubscribe());
  return r;
}
