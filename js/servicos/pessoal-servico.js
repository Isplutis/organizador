// Metas pessoais (automáticas ou manuais) e Leituras / lista pessoal (livros, filmes, séries, cursos, lugares…).
import { db, uid, agora } from '../db.js';
import { hojeStr, somaDias, difDias } from './rotina-servico.js';

export const TIPOS_LEIT = { livro: 'Livro', filme: 'Filme', serie: 'Série', curso: 'Curso', lugar: 'Lugar', outro: 'Outro' };
export const STATUS_LEIT = { quero: 'Quero', andamento: 'Em andamento', concluido: 'Concluído', abandonado: 'Abandonado' };
export const FONTES = {
  estudo: { nome: 'Horas de estudo (todas as sessões)', unidade: 'h' },
  caixinha: { nome: 'Valor guardado numa caixinha (Finanças)', unidade: 'R$' },
  rotina: { nome: 'Média de % da rotina', unidade: '%' },
  agua: { nome: 'Dias com a água concluída', unidade: 'dias' },
  duo: { nome: 'Dias de Duolingo feitos', unidade: 'dias' },
  leituras: { nome: 'Itens concluídos em Leituras', unidade: 'itens' }
};

// período → [início, fim]
export function intervalo(periodo, ref = {}) {
  const ano = ref.ano || hojeStr().slice(0, 4);
  if (periodo === 'ano') return [`${ano}-01-01`, `${ano}-12-31`];
  if (periodo === 'trimestre') { const q = +ref.tri || Math.floor((+hojeStr().slice(5, 7) - 1) / 3) + 1, m1 = (q - 1) * 3 + 1, m3 = m1 + 2; return [`${ano}-${String(m1).padStart(2, '0')}-01`, `${ano}-${String(m3).padStart(2, '0')}-${new Date(+ano, m3, 0).getDate()}`]; }
  if (periodo === 'mes') { const m = ref.mes || hojeStr().slice(0, 7); const [a, mm] = m.split('-').map(Number); const ult = new Date(a, mm, 0).getDate(); return [`${m}-01`, `${m}-${ult}`]; }
  return [ref.inicio || hojeStr(), ref.fim || somaDias(hojeStr(), 90)];
}

export async function salvarMeta(m) {
  const [inicio, fim] = intervalo(m.periodo, m);
  const base = { nome: m.nome.trim(), tipo: m.tipo, fonte: m.tipo === 'auto' ? m.fonte : null, caixinhaId: m.fonte === 'caixinha' ? m.caixinhaId : null, filtroTipo: m.fonte === 'leituras' ? (m.filtroTipo || '') : '',
    alvo: m.alvo, unidade: m.tipo === 'auto' ? FONTES[m.fonte].unidade : (m.unidade || '').trim(), periodo: m.periodo, inicio, fim, atualizadoEm: agora(), excluido: false };
  if (m.id) { await db.pMetas.update(m.id, base); return m.id; }
  const id = uid(); await db.pMetas.add({ id, progresso: 0, criadoEm: agora(), ...base }); return id;
}
export const progressoManual = (id, valor) => db.pMetas.update(id, { progresso: Math.max(0, valor), atualizadoEm: agora() });
export const excluirMeta = (id) => db.pMetas.update(id, { excluido: true, atualizadoEm: agora() });

// ctx: { sessoes, leituras, aguaDia(s)->bool, duoDias:Set, rotinaDia(s)->{f,t}|null, caixinhas:{id:{saldo,nome}}|null, hoje }
export function calcularMetas(metas, ctx) {
  const hoje = ctx.hoje || hojeStr();
  return metas.filter((m) => !m.excluido).map((m) => {
    const fimC = m.fim < hoje ? m.fim : hoje;
    let atual = m.progresso || 0, bloqueado = false;
    if (m.tipo === 'auto') {
      if (m.fonte === 'estudo') atual = ctx.sessoes.filter((s) => !s.excluido && s.data >= m.inicio && s.data <= m.fim).reduce((a, s) => a + s.minutos, 0) / 60;
      else if (m.fonte === 'leituras') atual = ctx.leituras.filter((l) => !l.excluido && l.status === 'concluido' && (l.fim || '') >= m.inicio && (l.fim || '') <= m.fim && (!m.filtroTipo || l.tipo === m.filtroTipo)).length;
      else if (m.fonte === 'agua' || m.fonte === 'duo' || m.fonte === 'rotina') {
        let n = 0, f = 0, t = 0;
        for (let s = m.inicio; s <= fimC; s = somaDias(s, 1)) {
          if (m.fonte === 'agua' && ctx.aguaDia(s)) n++;
          if (m.fonte === 'duo' && ctx.duoDias.has(s)) n++;
          if (m.fonte === 'rotina') { const d = ctx.rotinaDia(s); if (d && d.t) { f += d.f; t += d.t; } }
        }
        atual = m.fonte === 'rotina' ? (t ? Math.round(f / t * 100) : 0) : n;
      } else if (m.fonte === 'caixinha') { if (!ctx.caixinhas) bloqueado = true; else atual = ctx.caixinhas[m.caixinhaId]?.saldo || 0; }
    }
    const pct = m.alvo > 0 ? Math.min(100, Math.round(atual / m.alvo * 100)) : 0;
    // meta manual começa do zero ao ser criada: o ritmo conta a partir da criação
    const ini = m.tipo === 'manual' && m.criadoEm && m.criadoEm.slice(0, 10) > m.inicio ? m.criadoEm.slice(0, 10) : m.inicio;
    const total = Math.max(1, difDias(m.fim, ini) + 1), passados = Math.min(total, Math.max(0, difDias(fimC, ini) + 1));
    const esperado = m.fonte === 'rotina' ? m.alvo : m.alvo * passados / total;
    const concluida = atual >= m.alvo;
    const estado = concluida ? 'concluida' : m.fim < hoje ? 'encerrada' : hoje < m.inicio ? 'futura' : m.fonte === 'rotina' ? (atual >= m.alvo ? 'ritmo' : 'atrasada') : atual >= esperado * 0.97 ? 'ritmo' : 'atrasada';
    const restamDias = Math.max(0, difDias(m.fim, hoje));
    return { ...m, atual, pct, esperado, estado, bloqueado, restamDias, passadosPct: Math.round(passados / total * 100) };
  });
}

// ---------- Leituras ----------
export async function salvarLeitura(l) {
  const base = { titulo: l.titulo.trim(), tipo: l.tipo, status: l.status, detalhe: (l.detalhe || '').trim(), link: (l.link || '').trim(),
    paginas: l.tipo === 'livro' ? (l.paginas || null) : null, paginaAtual: l.tipo === 'livro' ? (l.paginaAtual || 0) : null,
    nota: l.status === 'concluido' ? (l.nota || null) : null, comentario: l.status === 'concluido' ? (l.comentario || '').trim().slice(0, 280) : '', atualizadoEm: agora(), excluido: false };
  const atual = l.id ? await db.pLeituras.get(l.id) : null;
  if (l.status === 'andamento' && !atual?.inicio) base.inicio = hojeStr();
  if (l.status === 'concluido') { base.fim = atual?.fim && atual.status === 'concluido' ? atual.fim : hojeStr(); if (base.paginas) base.paginaAtual = base.paginas; }
  if (l.id) { await db.pLeituras.update(l.id, base); return l.id; }
  const id = uid(); await db.pLeituras.add({ id, criadoEm: agora(), ...base }); return id;
}
export async function avancarPaginas(l, n) {
  const pag = Math.max(0, Math.min(l.paginas || Infinity, (l.paginaAtual || 0) + n));
  const mud = { paginaAtual: pag, atualizadoEm: agora() };
  if (l.status === 'quero') { mud.status = 'andamento'; mud.inicio = hojeStr(); }
  await db.pLeituras.update(l.id, mud);
  return l.paginas && pag >= l.paginas;
}
export const excluirLeitura = (id) => db.pLeituras.update(id, { excluido: true, atualizadoEm: agora() });
