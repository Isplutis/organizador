// Preços da lista de compras: sempre por unidade "cheia" (1 kg, 1 L, 1 un, 1 pct…), com histórico.
import { db, uid, agora } from '../db.js';
import { hojeStr } from './rotina-servico.js';

// g e ml viram kg e L; as demais unidades ficam como estão
export const base = (u) => u === 'g' ? { base: 'kg', fator: 1000 } : u === 'ml' ? { base: 'L', fator: 1000 } : { base: u || 'un', fator: 1 };
export const chave = (n) => String(n || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
export const fmtR = (n) => n == null || isNaN(n) ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function registrar({ itemId, nome, unidade, qtd, valor, data = hojeStr() }) {
  const b = base(unidade), qtdBase = qtd / b.fator;
  await db.precosMercado.add({ id: uid(), itemId: itemId || null, chave: chave(nome), nome: nome.trim(), unidadeBase: b.base, valor,
    qtdBase, total: Math.round(qtdBase * valor * 100) / 100, data, atualizadoEm: agora(), excluido: false });
}
export async function excluir(id) { await db.precosMercado.update(id, { excluido: true, atualizadoEm: agora() }); }

// histórico de um produto (pelo item do estoque ou pelo nome)
export function historico(regs, { itemId, nome }) {
  const k = chave(nome);
  const h = regs.filter((r) => !r.excluido && ((itemId && r.itemId === itemId) || r.chave === k))
    .sort((a, b) => (a.data + a.atualizadoEm).localeCompare(b.data + b.atualizadoEm));
  if (!h.length) return null;
  const v = h.map((r) => r.valor);
  return { regs: h, ult: v[v.length - 1], min: Math.min(...v), max: Math.max(...v), media: v.reduce((a, b) => a + b, 0) / v.length, base: h[h.length - 1].unidadeBase };
}
