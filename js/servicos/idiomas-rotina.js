// Liga o alemão à Rotina: atividade "Revisar flashcards" que se completa sozinha.
import { db, agora } from '../db.js';
import { hojeStr, marcar } from './rotina-servico.js';
import { pendentes } from './idiomas-servico.js';

const ID = 'flashcards';
// cria uma única vez (se o usuário excluir/desativar, não volta)
export async function garantirAtividadeFlash() {
  if (await db.meta.get('flashAtivCriada')) return;
  if (!(await db.atividades.get(ID))) {
    const todos = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, []]));
    await db.atividades.put({ id: ID, nome: 'Revisar flashcards (alemão)', tipo: 'fixo', modoHora: 'ate', agua: false, flash: true, outraPessoa: '', versoes: [{ desde: hojeStr(), horarios: todos }], criadoEm: hojeStr(), desativadoEm: null, atualizadoEm: agora(), excluido: false });
  }
  await db.meta.put({ chave: 'flashAtivCriada', valor: true, atualizadoEm: agora() });
}
// conclui sozinha quando não sobra carta vencida hoje
export async function conferirFlashHoje() {
  const a = await db.atividades.get(ID); if (!a || a.excluido || a.desativadoEm) return false;
  const h = hojeStr();
  const m = await db.marcacoes.get(`${h}|${ID}|`); if (m?.valor) return true;
  const itens = (await db.lItens.toArray()).filter((i) => !i.excluido);
  if (!itens.length || pendentes(itens, h).length) return false;
  await marcar(h, ID, '', 'f'); return true;
}
