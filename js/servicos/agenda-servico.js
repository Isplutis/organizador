// Agenda unificada: junta compromissos/aniversários com datas de todos os módulos.
import { db, uid, agora } from '../db.js';
import { hojeStr, somaDias, difDias, pd, ds } from './rotina-servico.js';
import { noMes } from './fin-servico.js';

export const REPETE = { '': 'Não repete', semanal: 'Toda semana', mensal: 'Todo mês', anual: 'Todo ano' };
export const CORES = { comp: 'ouro', aniv: 'rosa', fin: 'neg', compras: 'roxo', viagem: 'verde', estudo: 'azul', rotina: 'cinza' };
const diaSeg = (m, d) => { const [a, mm] = m.split('-').map(Number), ult = new Date(a, mm, 0).getDate(); return `${m}-${String(Math.min(d, ult)).padStart(2, '0')}`; };

export async function salvarCompromisso(c) {
  const base = { tipo: c.tipo, titulo: c.titulo.trim(), data: c.data, hora: c.tipo === 'aniv' ? '' : (c.hora || ''), repete: c.tipo === 'aniv' ? 'anual' : (c.repete || ''),
    anoNasc: c.tipo === 'aniv' ? (c.anoNasc || null) : null, local: (c.local || '').trim(), obs: (c.obs || '').trim(), atualizadoEm: agora(), excluido: false };
  if (c.id) { await db.aCompromissos.update(c.id, base); return c.id; }
  const id = uid(); await db.aCompromissos.add({ id, feitos: {}, criadoEm: agora(), ...base }); return id;
}
export async function marcarFeito(c, dia, feito) {
  const feitos = { ...(c.feitos || {}) }; if (feito) feitos[dia] = true; else delete feitos[dia];
  await db.aCompromissos.update(c.id, { feitos, atualizadoEm: agora() });
}
export const excluirCompromisso = (id) => db.aCompromissos.update(id, { excluido: true, atualizadoEm: agora() });

function ocorre(c, s) {
  if (s < c.data && c.tipo !== 'aniv') return false;
  if (!c.repete) return c.data === s;
  if (c.repete === 'semanal') return difDias(s, c.data) % 7 === 0;
  if (c.repete === 'mensal') return diaSeg(s.slice(0, 7), +c.data.slice(8, 10)) === s;
  if (c.repete === 'anual') return c.data.slice(5) === s.slice(5) || (c.data.slice(5) === '02-29' && s.slice(5) === '02-28' && new Date(+s.slice(0, 4), 1, 29).getMonth() !== 1);
  return false;
}

// Monta os itens de um dia. ctx traz os dados já carregados (Finanças entra só com nomes, sem valores).
export function itensDoDia(s, ctx) {
  const out = [], hoje = ctx.hoje || hojeStr();
  for (const c of ctx.compromissos) {
    if (c.excluido || !ocorre(c, s)) continue;
    if (c.tipo === 'aniv') { const idade = c.anoNasc ? +s.slice(0, 4) - c.anoNasc : null; out.push({ k: 'c' + c.id + s, cor: 'aniv', hora: '', titulo: `🎂 ${c.titulo}${idade ? ' faz ' + idade + ' anos' : ''}`, sub: c.obs, comp: c }); }
    else out.push({ k: 'c' + c.id + s, cor: 'comp', hora: c.hora, titulo: c.titulo, sub: [c.local, c.obs].filter(Boolean).join(' · '), comp: c, feito: !!c.feitos?.[s], podeFeito: true });
  }
  const m = s.slice(0, 7);
  for (const f of ctx.fixas) {
    if (f.excluido || !noMes(f, m) || diaSeg(m, f.dia || 1) !== s) continue;
    const pago = ctx.lancs.some((l) => !l.excluido && l.fixaId === f.id && l.data.slice(0, 7) === m);
    out.push({ k: 'f' + f.id + s, cor: 'fin', hora: '', titulo: (f.tipo === 'rec' ? 'Receber: ' : f.assinatura ? 'Assinatura: ' : 'Vence: ') + f.nome, sub: pago ? 'pago ✓' : s < hoje ? 'em atraso' : '', ir: 'financas', feito: pago });
  }
  for (const k of ctx.cartoes) {
    if (k.excluido || !k.vencimento || !k.fechamento || diaSeg(m, k.vencimento) !== s) continue;
    out.push({ k: 'k' + k.id + s, cor: 'fin', hora: '', titulo: 'Fatura: ' + k.nome, sub: 'vencimento', ir: 'financas' });
  }
  for (const p of ctx.pedidos) {
    if (p.excluido) continue;
    if (['aguardando', 'enviado', 'transito'].includes(p.status) && p.prazo === s) out.push({ k: 'pe' + p.id, cor: 'compras', hora: '', titulo: '📦 Entrega prevista: ' + p.nome, sub: '', ir: 'compras', aba: 'online' });
    if (p.status === 'entregue' && p.devolveAte === s) out.push({ k: 'pd' + p.id, cor: 'compras', hora: '', titulo: 'Último dia p/ devolver: ' + p.nome, sub: '', ir: 'compras', aba: 'online' });
    if (p.garantiaAte === s) out.push({ k: 'pg' + p.id, cor: 'compras', hora: '', titulo: 'Fim da garantia: ' + p.nome, sub: '', ir: 'compras', aba: 'online' });
  }
  for (const v of ctx.viagens) {
    if (v.excluido) continue;
    const fim = v.fim || somaDias(v.inicio, (v.dias || 1) - 1);
    if (s >= v.inicio && s <= fim) out.push({ k: 'v' + v.id + s, cor: 'viagem', hora: '', titulo: '✈ ' + (v.nome || 'Viagem') + (s === v.inicio ? ' (início)' : s === fim ? ' (volta)' : ''), sub: '', ir: 'rotina' });
  }
  for (const c of ctx.cursos) {
    if (c.excluido) continue;
    if (c.prazoConteudo === s) out.push({ k: 'pc' + c.id, cor: 'estudo', hora: '', titulo: 'Prazo do conteúdo: ' + c.nome, sub: '', ir: 'estudos' });
    if (c.prazoFinal === s) out.push({ k: 'pf' + c.id, cor: 'estudo', hora: '', titulo: 'Prazo final: ' + c.nome, sub: '', ir: 'estudos' });
  }
  for (const d of ctx.disciplinas) if (!d.excluido && d.dataProva === s) out.push({ k: 'dp' + d.id, cor: 'estudo', hora: '', titulo: '📝 Prova: ' + d.nome, sub: d.provaFeita ? 'feita' : '', ir: 'estudos' });
  for (const e of ctx.google || []) if (s >= e.data && s <= e.fim) out.push({ k: 'g' + e.id + s, cor: e.aniversario ? 'aniv' : 'google', hora: e.hora, titulo: (e.aniversario ? '🎂 ' : '') + e.titulo, sub: 'Google · ' + (e.agenda || ''), link: e.link });
  if (ctx.calc) for (const o of ctx.calc.ocorrencias(s)) {
    const st = ctx.calc.status(o, s);
    out.push({ k: 'r' + o.id, cor: 'rotina', hora: o.hora || '', titulo: o.a.nome + (o.surpresa ? ' (surpresa)' : ''), sub: '', rotina: o, st, feito: st === 'f' || st === 'o', podeFeito: !o.a.agua && st !== 'x' && difDias(s, hoje) >= -1 });
  }
  return out.sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99') || (a.cor === 'rotina') - (b.cor === 'rotina'));
}

// grade do mês: semanas começando na segunda
export function gradeMes(mes) {
  const [a, m] = mes.split('-').map(Number), ini = new Date(a, m - 1, 1), off = ini.getDay(); // semana começa no domingo
  const primeiro = ds(new Date(a, m - 1, 1 - off)), dias = [];
  for (let i = 0; i < 42; i++) { const s = somaDias(primeiro, i); dias.push({ s, fora: s.slice(0, 7) !== mes }); }
  while (dias.length > 35 && dias.slice(-7).every((d) => d.fora)) dias.splice(-7);
  return dias;
}
export { pd };
