// Xadrez: repertório de aberturas (com treino espaçado por linha), padrões de mate/táticas, partidas e Chess.com.
import { db, uid, agora } from '../db.js';
import { hojeStr, somaDias } from './rotina-servico.js';
import { Chess } from '../../lib/chess.mjs';
import { PADROES } from '../dados/xadrez-padroes.js';
import { lerCfg } from './idiomas-servico.js';

const cru = (o) => JSON.parse(JSON.stringify(o ?? null));
export const INTERVALOS = [0, 1, 2, 4, 8, 16];
const novaSrs = () => ({ caixa: 1, proxima: hojeStr(), ac: 0, er: 0 });
function avancaSrs(s, ok) { s = { ...novaSrs(), ...(s || {}) }; const caixa = ok ? Math.min(5, s.caixa + 1) : 1; return { caixa, proxima: somaDias(hojeStr(), ok ? (s.caixa >= 5 ? 30 : INTERVALOS[caixa]) : 1), ac: s.ac + (ok ? 1 : 0), er: s.er + (ok ? 0 : 1), ultima: hojeStr() }; }
export { Chess };

// valida uma sequência SAN; devolve { ok, lances (SAN normalizados), erro }
export function validarLances(lances, fen) {
  const c = fen ? new Chess(fen) : new Chess(); const out = [];
  for (const m of lances) { try { out.push(c.move(m).san); } catch { return { ok: false, lances: out, erro: `Lance inválido: ${m} (depois de ${out.length} lances)` }; } }
  return { ok: true, lances: out };
}
// aceita "1. e4 e5 2. Nf3" ou PGN completo
export function lerTextoLances(txt) {
  const t = String(txt || '').trim(); if (!t) return { ok: false, lances: [], erro: 'Vazio' };
  try { const c = new Chess(); c.loadPgn(t); return { ok: true, lances: c.history() }; } catch { /* tenta lista simples */ }
  const toks = t.replace(/\{[^}]*\}/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter((x) => x && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(x));
  return validarLances(toks);
}

// ---------- aberturas ----------
export async function salvarAbertura(a) {
  a = cru(a);
  const base = { nome: (a.nome || '').trim(), cor: a.cor || 'w', ideia: (a.ideia || '').trim(), armadilhas: (a.armadilhas || '').trim(), link: (a.link || '').trim(), status: a.status || 'aprendendo', notas: (a.notas || '').trim(),
    linhas: (a.linhas || []).map((l) => ({ id: l.id || uid(), nome: (l.nome || '').trim(), lances: l.lances || [], srs: l.srs || novaSrs() })), origem: a.origem || 'meu', atualizadoEm: agora(), excluido: false };
  if (a.id) { await db.xAberturas.update(a.id, base); return a.id; }
  const id = uid(); await db.xAberturas.add({ id, criadoEm: agora(), ...base }); return id;
}
export const excluirAbertura = (id) => db.xAberturas.update(id, { excluido: true, atualizadoEm: agora() });
export async function adicionarSugestao(s) { return salvarAbertura({ nome: s.nome, cor: s.cor, ideia: s.ideia, origem: 'sugestao:' + s.id, linhas: [{ nome: 'Linha principal', lances: s.lances }] }); }
export function linhasPendentes(aberturas, hoje = hojeStr(), todas = false) {
  const out = [];
  for (const a of aberturas) if (!a.excluido) for (const l of a.linhas || []) if (l.lances?.length && (todas || (l.srs?.proxima || hoje) <= hoje)) out.push({ a, l });
  return out.sort(() => Math.random() - 0.5);
}
export async function responderLinha(aId, lId, ok) {
  const a = await db.xAberturas.get(aId); if (!a) return;
  const linhas = a.linhas.map((l) => l.id === lId ? { ...l, srs: avancaSrs(l.srs, ok) } : l);
  await db.xAberturas.update(aId, { linhas, atualizadoEm: agora() });
  await registrarTreino({ tipo: 'abertura', ref: aId, tema: 'Abertura: ' + a.nome, ok });
}

// ---------- padrões (biblioteca escondida + próprios) ----------
export async function lerPadroes() { return { liberados: [], srs: {}, notas: {}, proprios: [], ...((await db.meta.get('xadrezPadroes')) || {}) }; }
async function gravarPadroes(p) { const g = await lerPadroes(); await db.meta.put({ ...cru(g), ...cru(p), chave: 'xadrezPadroes', atualizadoEm: agora() }); }
export async function liberarPadrao(id) { const g = await lerPadroes(); if (!g.liberados.includes(id)) await gravarPadroes({ liberados: [...g.liberados, id], srs: { ...g.srs, [id]: novaSrs() } }); }
export async function esconderPadrao(id) { const g = await lerPadroes(); await gravarPadroes({ liberados: g.liberados.filter((x) => x !== id) }); }
export async function salvarNotaPadrao(id, txt) { const g = await lerPadroes(); await gravarPadroes({ notas: { ...g.notas, [id]: txt } }); }
export async function salvarProprio(p) {
  const g = await lerPadroes(); const id = p.id || 'meu-' + uid();
  const item = { id, tipo: p.tipo, tema: p.tema, nome: p.nome.trim(), nivel: 0, fen: p.fen, solucao: p.solucao, reconhecer: (p.reconhecer || '').trim(), proprio: true };
  await gravarPadroes({ proprios: [...g.proprios.filter((x) => x.id !== id), item], liberados: g.liberados.includes(id) ? g.liberados : [...g.liberados, id], srs: g.srs[id] ? g.srs : { ...g.srs, [id]: novaSrs() } });
  return id;
}
export async function excluirProprio(id) { const g = await lerPadroes(); await gravarPadroes({ proprios: g.proprios.filter((x) => x.id !== id), liberados: g.liberados.filter((x) => x !== id) }); }
export const todosPadroes = (g) => [...PADROES, ...(g?.proprios || [])];
export function padroesPendentes(g, hoje = hojeStr(), filtro = {}) {
  return todosPadroes(g).filter((p) => g.liberados.includes(p.id) && (!filtro.tema || p.tema === filtro.tema) && (filtro.todos || (g.srs[p.id]?.proxima || hoje) <= hoje)).sort(() => Math.random() - 0.5);
}
export async function responderPadrao(p, ok) { const g = await lerPadroes(); await gravarPadroes({ srs: { ...g.srs, [p.id]: avancaSrs(g.srs[p.id], ok) } }); await registrarTreino({ tipo: 'padrao', ref: p.id, tema: p.tema, ok }); }
// confere um lance do usuário contra a solução; em mate final aceita qualquer mate
export function conferirLancePadrao(p, jogo, san, idx) {
  const esperado = p.solucao[idx];
  if (san === esperado) return true;
  const ultimo = idx === p.solucao.length - 1;
  return p.tipo === 'mate' && ultimo && jogo.isCheckmate();
}

// ---------- treinos e pontos fracos ----------
export async function registrarTreino({ tipo, ref = '', tema = '', ok }) { await db.xTreinos.add({ id: uid(), data: hojeStr(), tipo, ref, tema, ok: !!ok, atualizadoEm: agora(), excluido: false }); }
export async function registrarErroManual(tema) { await registrarTreino({ tipo: 'manual', tema, ok: false }); }
export function pontosFracos(treinos, hoje = hojeStr()) {
  const desde = somaDias(hoje, -30), t = {};
  for (const x of treinos) if (!x.excluido && x.data > desde && x.tema && !x.tema.startsWith('Abertura:')) { const o = (t[x.tema] ||= { tema: x.tema, er: 0, ac: 0 }); x.ok ? o.ac++ : o.er++; }
  return Object.values(t).filter((o) => o.er > 0).map((o) => ({ ...o, taxa: Math.round(o.er / (o.er + o.ac) * 100) })).sort((a, b) => b.er - a.er || b.taxa - a.taxa);
}

// ---------- partidas ----------
export async function salvarPartida(p) {
  p = cru(p);
  const base = { data: p.data || hojeStr(), cor: p.cor || 'w', resultado: p.resultado || 'v', adversario: (p.adversario || '').trim(), ratingAdv: p.ratingAdv ? +p.ratingAdv : null, abertura: (p.abertura || '').trim(), aberturaId: p.aberturaId || null,
    link: (p.link || '').trim(), pgn: p.pgn || '', licao: (p.licao || '').trim(), ritmo: p.ritmo || '', meuRating: p.meuRating ?? null, origem: p.origem || 'manual', atualizadoEm: agora(), excluido: false };
  if (p.id && (await db.xPartidas.get(p.id))) { await db.xPartidas.update(p.id, base); return p.id; }
  const id = p.id || uid(); await db.xPartidas.put({ id, criadoEm: agora(), ...base }); return id;
}
export const excluirPartida = (id) => db.xPartidas.update(id, { excluido: true, atualizadoEm: agora() });
export function estatPartidas(partidas) {
  const v = partidas.filter((p) => !p.excluido);
  const g = (lst) => ({ n: lst.length, v: lst.filter((p) => p.resultado === 'v').length, e: lst.filter((p) => p.resultado === 'e').length, d: lst.filter((p) => p.resultado === 'd').length, pct: lst.length ? Math.round((lst.filter((p) => p.resultado === 'v').length + lst.filter((p) => p.resultado === 'e').length / 2) / lst.length * 100) : null });
  const porAb = {}; for (const p of v) if (p.abertura) (porAb[p.abertura] ||= []).push(p);
  return { total: g(v), brancas: g(v.filter((p) => p.cor === 'w')), pretas: g(v.filter((p) => p.cor === 'b')), aberturas: Object.entries(porAb).map(([nome, l]) => ({ nome, ...g(l) })).sort((a, b) => b.n - a.n).slice(0, 8) };
}

// ---------- Chess.com (API pública, somente leitura, sem chave) ----------
const API = 'https://api.chess.com/pub/player/';
async function getJSON(caminho) {
  try { const r = await fetch(API + caminho); if (r.ok) return r.json(); if (r.status === 404) throw new Error('Usuário não encontrado no Chess.com'); } catch (e) { if (/não encontrado/.test(e.message)) throw e; }
  // plano B: via seu Worker do Cloudflare (se o navegador bloquear a chamada direta)
  const cfg = await db.meta.get('onlineCfg');
  if (!cfg?.url) throw new Error('Não consegui falar com o Chess.com');
  const r = await fetch(cfg.url.replace(/\/$/, '') + '/chesscom?p=' + encodeURIComponent(caminho), { headers: { 'X-Chave': cfg.chave || '' } });
  if (!r.ok) throw new Error('Chess.com indisponível (' + r.status + ')');
  return r.json();
}
const resultado = (r) => r === 'win' ? 'v' : ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(r) ? 'e' : 'd';
const nomeAbertura = (eco) => { if (!eco) return ''; const s = decodeURIComponent(String(eco).split('/').pop() || ''); return s.replace(/-/g, ' ').replace(/\s+\d.*$/, '').trim(); };
export async function atualizarChesscom() {
  const { chesscom } = await lerCfg(); const u = (chesscom || '').trim().toLowerCase();
  if (!u) throw new Error('Informe seu usuário do Chess.com');
  const stats = await getJSON(encodeURIComponent(u) + '/stats');
  const arq = await getJSON(encodeURIComponent(u) + '/games/archives');
  const meses = (arq.archives || []).slice(-3);
  let novas = 0;
  for (const url of meses) {
    const m = url.match(/games\/(\d{4})\/(\d{2})$/); if (!m) continue;
    const d = await getJSON(`${encodeURIComponent(u)}/games/${m[1]}/${m[2]}`);
    for (const g of d.games || []) {
      const eu = g.white?.username?.toLowerCase() === u ? 'white' : 'black', ele = eu === 'white' ? 'black' : 'white';
      const id = 'cc:' + (g.uuid || g.url);
      if (await db.xPartidas.get(id)) continue;
      await salvarPartida({ id, data: new Date((g.end_time || 0) * 1000).toLocaleDateString('sv-SE'), cor: eu === 'white' ? 'w' : 'b', resultado: resultado(g[eu]?.result), adversario: g[ele]?.username, ratingAdv: g[ele]?.rating, meuRating: g[eu]?.rating,
        abertura: nomeAbertura(g.eco), link: g.url, pgn: g.pgn || '', ritmo: g.time_class || '', origem: 'chesscom' });
      novas++;
    }
  }
  const r = (k) => stats[k]?.last?.rating ?? null;
  const resumo = { quando: agora(), rapida: r('chess_rapid'), blitz: r('chess_blitz'), bullet: r('chess_bullet'), diaria: r('chess_daily'), problemas: stats.tactics?.highest?.rating ?? null };
  await db.meta.put({ chave: 'chesscomCache', ...resumo, atualizadoEm: agora() });
  return { novas, resumo };
}
