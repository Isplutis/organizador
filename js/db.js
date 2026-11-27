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
// v2: Rotina + Água
// - atividades: versoes[] (edição vale de "desde" em diante); desativadoEm preserva histórico
// - marcacoes: id = "data|atividadeId|hora" (semanal: hora = '*', id aleatório)
db.version(2).stores({
  atividades: 'id, atualizadoEm',
  marcacoes: 'id, data, atividadeId',
  agua: 'id, data'
});
// v3: viagens (dias que não contam nos percentuais)
db.version(3).stores({ viagens: 'id, inicio' });
// v4: Estudos (Pós, Cursos) + Duolingo
db.version(4).stores({
  cursos: 'id', disciplinas: 'id, cursoId', unidades: 'id, disciplinaId', secoes: 'id, unidadeId',
  aulas: 'id, unidadeId, secaoId', sessoes: 'id, cursoId, data', duoRating: 'id, data'
});
// v5: Finanças
db.version(5).stores({
  fContas: 'id', fCartoes: 'id', fCategorias: 'id, paiId', fLanc: 'id, data, grupoId, fixaId', fCaixinhas: 'id, contaId', fFixas: 'id'
});
// v6: Compras online (desejos, histórico de preços, pedidos)
db.version(6).stores({ oDesejos: 'id', oPrecos: 'id, desejoId', oPedidos: 'id' });
// v7: preços da lista de compras (por unidade cheia)
db.version(7).stores({ precosMercado: 'id, itemId, chave, data' });
// v8: Metas pessoais e Leituras
db.version(8).stores({ pMetas: 'id', pLeituras: 'id' });
// v9: Agenda (compromissos e aniversários)
db.version(9).stores({ aCompromissos: 'id, data' });
// v10: Open Finance (movimentações importadas da Pluggy)
db.version(10).stores({ fImport: 'id, status, conta, data' });
// IMPORTANTE: novas versões só ACRESCENTAM tabelas/campos. Nada é apagado ao atualizar o app.

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
