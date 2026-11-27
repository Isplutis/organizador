// Idiomas (Duolingo › Alemão): unidades, vocabulário, frases, erros, diário, flashcards (Leitner) e estatísticas.
// Regra: nada vem pronto. Tudo nasce do que o usuário cadastra.
import { db, uid, agora } from '../db.js';
import { hojeStr, somaDias } from './rotina-servico.js';

export const IDIOMAS_PADRAO = [{ id: 'de', nome: 'Alemão', voz: 'de-DE', emoji: '🇩🇪' }];
export const INTERVALOS = [0, 1, 2, 4, 8, 16]; // dias por caixa (1–5)
export const CLASSES = [['subst', 'Substantivo'], ['verbo', 'Verbo'], ['adj', 'Adjetivo'], ['adv', 'Advérbio'], ['expr', 'Expressão'], ['outro', 'Outro']];
export const COR_ARTIGO = { der: 'art-der', die: 'art-die', das: 'art-das' };
// remove proxies do Vue antes de gravar no IndexedDB
const cru = (o) => JSON.parse(JSON.stringify(o ?? null));
export const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?¿¡,;:"“”]/g, '');
const semAcento = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
// compara respostas: exato (ignora maiúsc./pontuação); "quase" aceita ae/oe/ue/ss no lugar de ä/ö/ü/ß
export function conferir(resp, certo) {
  const a = norm(resp), b = norm(certo);
  if (a === b) return 'ok';
  const t = (s) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  if (t(a) === t(b)) return 'quase';
  return 'erro';
}

// ---------- configuração ----------
export async function lerCfg() { return { metaNovas: 20, metaRevisoes: 20, idiomas: IDIOMAS_PADRAO, chesscom: '', ...((await db.meta.get('idiomasCfg')) || {}) }; }
export async function salvarCfg(p) { const c = await lerCfg(); await db.meta.put({ ...cru(c), ...cru(p), chave: 'idiomasCfg', atualizadoEm: agora() }); }

// ---------- unidades ----------
export async function salvarUnidade(u) {
  u = cru(u);
  const base = { idioma: u.idioma || 'de', secao: +u.secao || 1, numero: +u.numero || 1, titulo: (u.titulo || '').trim(), status: u.status || 'andamento', notas: (u.notas || '').trim(), atualizadoEm: agora(), excluido: false };
  if (u.id) { await db.lUnidades.update(u.id, base); return u.id; }
  const id = uid(); await db.lUnidades.add({ id, criadoEm: agora(), inicio: hojeStr(), ...base }); return id;
}
export async function concluirUnidade(u, feita) { await db.lUnidades.update(u.id, { status: feita ? 'concluida' : 'andamento', fim: feita ? hojeStr() : null, atualizadoEm: agora() }); }
export const excluirUnidade = (id) => db.lUnidades.update(id, { excluido: true, atualizadoEm: agora() });
export const nomeUnidade = (u) => u ? `S${u.secao} · U${u.numero}${u.titulo ? ' — ' + u.titulo : ''}` : 'Sem unidade';

// ---------- itens (palavra | frase | erro) ----------
export function modosDe(it) {
  if (it.tipo === 'erro') return it.certo ? ['erro'] : [];
  if (!it.termo || !it.traducao) return [];
  const m = ['de-pt', 'pt-de'];
  if (it.tipo === 'palavra' && it.classe === 'subst' && it.artigo) m.push('artigo');
  if (it.tipo === 'palavra' && it.classe === 'subst' && it.plural && it.plural !== '-') m.push('plural');
  if (it.tipo === 'palavra' && it.exemplo && lacuna(it)) m.push('cloze');
  if (it.tipo === 'palavra' && it.classe === 'verbo' && it.verbo?.partizip) m.push('partizip');
  return m;
}
export const completo = (it) => it.tipo !== 'palavra' || !!(it.termo && it.traducao && it.classe && (it.classe !== 'subst' || it.artigo));
export async function salvarItem(it) {
  it = cru(it);
  const limpo = (v) => typeof v === 'string' ? v.trim() : v;
  const base = Object.fromEntries(Object.entries({ ...it }).map(([k, v]) => [k, limpo(v)]));
  delete base.id; base.atualizadoEm = agora(); base.excluido = false; base.idioma = base.idioma || 'de';
  if (base.tipo === 'palavra' && base.classe === 'subst' && base.termo) base.termo = base.termo.charAt(0).toUpperCase() + base.termo.slice(1);
  const ant = it.id ? await db.lItens.get(it.id) : null;
  // mantém o progresso dos modos que continuam existindo; cria os novos como pendentes para hoje
  const srs = { ...(ant?.srs || {}) };
  for (const m of modosDe(base)) if (!srs[m]) srs[m] = { caixa: 1, proxima: hojeStr(), ac: 0, er: 0 };
  base.srs = srs; base.completo = completo(base);
  if (ant) { await db.lItens.update(it.id, base); return it.id; }
  const id = uid(); await db.lItens.add({ id, criadoEm: agora(), dataCriacao: hojeStr(), ...base }); return id;
}
export const excluirItem = (id) => db.lItens.update(id, { excluido: true, atualizadoEm: agora() });
export async function capturaRapida({ termo, traducao, unidadeId, tipo = 'palavra' }) {
  return salvarItem({ tipo, termo, traducao, unidadeId: unidadeId || null, classe: '', artigo: '', plural: '', exemplo: '', exemploTrad: '', notas: '' });
}

// ---------- dica de artigo pelo final da palavra (só confere o que você digitou) ----------
const SUF = [
  ['die', ['ung', 'heit', 'keit', 'schaft', 'tion', 'sion', 'tät', 'ik', 'ur', 'ei', 'ie', 'enz', 'anz', 'ade', 'age', 'ette', 'in']],
  ['das', ['chen', 'lein', 'ment', 'um', 'tum', 'ma', 'o']],
  ['der', ['ling', 'ismus', 'or', 'ig', 'ich', 'ast', 'ant', 'ent', 'eur', 'ist', 'ner']]
];
export function dicaArtigo(termo) {
  const t = String(termo || '').trim().toLowerCase(); if (t.length < 4) return null;
  let melhor = null;
  for (const [art, lst] of SUF) for (const s of lst) if (t.endsWith(s) && (!melhor || s.length > melhor.s.length)) melhor = { art, s };
  return melhor && { artigo: melhor.art, sufixo: '-' + melhor.s, forte: melhor.s.length >= 3 };
}

// ---------- lacuna (frase com a palavra escondida) ----------
export function lacuna(it) {
  const ex = it.exemplo || ''; if (!ex || !it.termo) return null;
  const formas = [it.termo, it.plural, it.verbo?.partizip].filter((f) => f && f.length > 1);
  for (const f of formas.sort((a, b) => b.length - a.length)) {
    const i = ex.toLowerCase().indexOf(f.toLowerCase());
    if (i >= 0) return { antes: ex.slice(0, i), resp: ex.slice(i, i + f.length), depois: ex.slice(i + f.length) };
  }
  // radical (ex.: "spielen" → "spielt")
  const raiz = it.termo.toLowerCase().replace(/(en|n)$/, ''); if (raiz.length < 4) return null;
  const m = new RegExp(`\\b(${raiz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\p{L}*)`, 'iu').exec(ex);
  return m ? { antes: ex.slice(0, m.index), resp: m[1], depois: ex.slice(m.index + m[1].length) } : null;
}

// ---------- flashcards (Leitner) ----------
export function pendentes(itens, hoje = hojeStr(), filtro = {}) {
  const out = [];
  for (const it of itens) {
    if (it.excluido || (filtro.unidadeId && it.unidadeId !== filtro.unidadeId)) continue;
    for (const m of modosDe(it)) {
      if (filtro.modos && !filtro.modos.includes(m)) continue;
      const s = it.srs?.[m] || { caixa: 1, proxima: hoje };
      if (filtro.todos || s.proxima <= hoje) out.push({ it, modo: m, caixa: s.caixa });
    }
  }
  // embaralha mantendo cartas da mesma palavra separadas
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export async function responder(it, modo, ok) {
  const atual = await db.lItens.get(it.id); if (!atual) return;
  const s = { caixa: 1, proxima: hojeStr(), ac: 0, er: 0, ...(atual.srs?.[modo] || {}) };
  const caixa = ok ? Math.min(5, s.caixa + 1) : 1;
  const prox = somaDias(hojeStr(), ok ? (s.caixa >= 5 ? 30 : INTERVALOS[caixa]) : 1);
  await db.lItens.update(it.id, { srs: { ...(atual.srs || {}), [modo]: { caixa, proxima: prox, ac: s.ac + (ok ? 1 : 0), er: s.er + (ok ? 0 : 1), ultima: hojeStr() } }, atualizadoEm: agora() });
  await registrarDia({ total: 1, acertos: ok ? 1 : 0 });
}
export async function registrarDia(inc) {
  const id = hojeStr(); const d = (await db.lRevDia.get(id)) || { id, data: id, total: 0, acertos: 0, ditado: 0, audio: 0 };
  for (const [k, v] of Object.entries(inc)) d[k] = (d[k] || 0) + v;
  await db.lRevDia.put({ ...d, atualizadoEm: agora(), excluido: false });
}
export const dominado = (it) => { const m = modosDe(it); return m.length > 0 && m.every((k) => (it.srs?.[k]?.caixa || 1) >= 5); };
export const nivel = (it) => { const m = modosDe(it); if (!m.length) return 0; return m.reduce((a, k) => a + (it.srs?.[k]?.caixa || 1), 0) / m.length; };

// ---------- diário ----------
export async function salvarDiario(e) {
  e = cru(e);
  const base = { idioma: e.idioma || 'de', data: e.data || hojeStr(), texto: (e.texto || '').trim(), traducao: (e.traducao || '').trim(), atualizadoEm: agora(), excluido: false };
  if (e.id) { await db.lDiario.update(e.id, base); return e.id; }
  const id = uid(); await db.lDiario.add({ id, criadoEm: agora(), ...base }); return id;
}
export const excluirDiario = (id) => db.lDiario.update(id, { excluido: true, atualizadoEm: agora() });
// marca no texto as palavras do vocabulário (termo, plural, particípio)
export function marcarTexto(texto, itens) {
  const mapa = new Map();
  for (const it of itens) if (!it.excluido && it.tipo === 'palavra') for (const f of [it.termo, it.plural, it.verbo?.partizip]) if (f && f.length > 1 && f !== '-') mapa.set(f.toLowerCase(), it);
  const partes = []; const usados = new Set(); const re = /[\p{L}ßäöüÄÖÜ]+/gu; let ult = 0, m;
  while ((m = re.exec(texto))) {
    const it = mapa.get(m[0].toLowerCase());
    if (!it) continue;
    if (m.index > ult) partes.push({ t: texto.slice(ult, m.index) });
    partes.push({ t: m[0], it }); usados.add(it.id); ult = m.index + m[0].length;
  }
  if (ult < texto.length) partes.push({ t: texto.slice(ult) });
  return { partes, usados: usados.size };
}

// ---------- estatísticas, metas, calendário e conquistas ----------
export function estat({ itens, unidades, dias, diario, cfg, hoje = hojeStr(), duoFeitos = new Set() }) {
  const vivos = itens.filter((i) => !i.excluido);
  const pal = vivos.filter((i) => i.tipo === 'palavra'), fra = vivos.filter((i) => i.tipo === 'frase'), err = vivos.filter((i) => i.tipo === 'erro');
  const dom = vivos.filter(dominado);
  const segunda = somaDias(hoje, -((new Date(hoje + 'T12:00').getDay() + 6) % 7));
  const novasSemana = vivos.filter((i) => (i.dataCriacao || '') >= segunda).length;
  const diaMap = Object.fromEntries(dias.filter((d) => !d.excluido).map((d) => [d.data, d]));
  const revHoje = diaMap[hoje]?.total || 0;
  const ult30 = dias.filter((d) => d.data > somaDias(hoje, -30));
  const t30 = ult30.reduce((a, d) => a + (d.total || 0), 0), a30 = ult30.reduce((a, d) => a + (d.acertos || 0), 0);
  // sequência de dias revisando
  let seq = 0; for (let d = diaMap[hoje]?.total ? hoje : somaDias(hoje, -1); diaMap[d]?.total; d = somaDias(d, -1)) seq++;
  let recorde = 0, run = 0, ant = null;
  for (const d of Object.keys(diaMap).filter((k) => diaMap[k].total).sort()) { run = ant && somaDias(ant, 1) === d ? run + 1 : 1; recorde = Math.max(recorde, run); ant = d; }
  const erradas = vivos.map((i) => { const s = Object.values(i.srs || {}); const er = s.reduce((a, x) => a + (x.er || 0), 0), tot = s.reduce((a, x) => a + (x.er || 0) + (x.ac || 0), 0); return { it: i, er, tot }; })
    .filter((x) => x.er >= 2).sort((a, b) => b.er / b.tot - a.er / a.tot || b.er - a.er).slice(0, 8);
  const porUnidade = unidades.filter((u) => !u.excluido).sort((a, b) => a.secao - b.secao || a.numero - b.numero).map((u) => {
    const its = vivos.filter((i) => i.unidadeId === u.id); const d = its.filter(dominado).length;
    return { u, n: its.length, dom: d, pct: its.length ? Math.round(d / its.length * 100) : 0, nivel: its.length ? its.reduce((a, i) => a + nivel(i), 0) / its.length : 0 };
  });
  // calendário: 18 semanas, de segunda a domingo
  const inicio = somaDias(segunda, -7 * 17);
  const cal = Array.from({ length: 18 * 7 }, (_, i) => { const d = somaDias(inicio, i); const rev = diaMap[d]?.total || 0; const duo = duoFeitos.has(d); return { d, rev, duo, futuro: d > hoje, n: (duo ? 1 : 0) + (rev >= 1 ? 1 : 0) + (rev >= cfg.metaRevisoes ? 1 : 0) }; });
  const diarioN = diario.filter((e) => !e.excluido).length;
  const errosDom = err.filter(dominado).length;
  const CONQ = [
    ['pal10', '🌱', '10 palavras', pal.length, 10], ['pal50', '🌿', '50 palavras', pal.length, 50], ['pal100', '🌳', '100 palavras', pal.length, 100], ['pal250', '🏔️', '250 palavras', pal.length, 250], ['pal500', '🚀', '500 palavras', pal.length, 500],
    ['fra25', '💬', '25 frases', fra.length, 25], ['dom25', '⭐', '25 itens dominados', dom.length, 25], ['dom100', '🌟', '100 itens dominados', dom.length, 100],
    ['seq7', '🔥', '7 dias seguidos revisando', recorde, 7], ['seq30', '🔥', '30 dias seguidos revisando', recorde, 30], ['seq100', '💯', '100 dias seguidos revisando', recorde, 100],
    ['uni1', '🏁', 'Primeira unidade concluída', unidades.filter((u) => !u.excluido && u.status === 'concluida').length, 1], ['unidom', '👑', 'Unidade 100% dominada', porUnidade.filter((p) => p.n >= 5 && p.pct === 100).length, 1],
    ['dia10', '📔', '10 dias de diário', diarioN, 10], ['erro10', '🩹', '10 erros superados', errosDom, 10]
  ].map(([id, emoji, nome, val, alvo]) => ({ id, emoji, nome, val: Math.min(val, alvo), alvo, ok: val >= alvo }));
  return {
    palavras: pal.length, frases: fra.length, erros: err.length, dominados: dom.length, aCompletar: pal.filter((i) => !i.completo).length,
    novasSemana, revHoje, taxa30: t30 ? Math.round(a30 / t30 * 100) : null, rev30: t30, seq, recorde, erradas, porUnidade, cal, conquistas: CONQ
  };
}
export function palavraDoDia(itens, hoje = hojeStr()) {
  const pal = itens.filter((i) => !i.excluido && i.tipo === 'palavra' && i.traducao).sort((a, b) => a.id.localeCompare(b.id));
  if (!pal.length) return null; let h = 0; for (const c of hoje) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pal[h % pal.length];
}

// ---------- CSV (Excel) ----------
const COLS = ['tipo', 'termo', 'traducao', 'artigo', 'plural', 'classe', 'exemplo', 'exemploTraducao', 'secao', 'unidade', 'notas'];
export function exportarCSV(itens, unidades) {
  const uPor = Object.fromEntries(unidades.map((u) => [u.id, u]));
  const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = itens.filter((i) => !i.excluido).map((i) => { const u = uPor[i.unidadeId];
    return [i.tipo, i.tipo === 'erro' ? i.errado : i.termo, i.tipo === 'erro' ? i.certo : i.traducao, i.artigo, i.plural, i.classe, i.exemplo, i.exemploTrad, u?.secao, u?.numero, i.tipo === 'erro' ? i.porque : i.notas].map(q).join(';'); });
  return '﻿' + [COLS.join(';'), ...linhas].join('\r\n');
}
function lerLinhasCSV(txt) {
  txt = txt.replace(/^﻿/, ''); const prim = txt.split(/\r?\n/)[0] || '';
  const sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? (prim.includes('\t') && !prim.includes(';') ? '\t' : ';') : ',';
  const linhas = []; let lin = [], cel = '', aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) { if (c === '"' && txt[i + 1] === '"') { cel += '"'; i++; } else if (c === '"') aspas = false; else cel += c; continue; }
    if (c === '"') aspas = true; else if (c === sep) { lin.push(cel); cel = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; lin.push(cel); linhas.push(lin); lin = []; cel = ''; } else cel += c;
  }
  if (cel || lin.length) { lin.push(cel); linhas.push(lin); }
  return linhas.filter((l) => l.some((x) => x.trim()));
}
export function previaCSV(txt, itens, unidades) {
  const linhas = lerLinhasCSV(txt); if (!linhas.length) return { novos: [], dup: 0, erros: ['Arquivo vazio'] };
  const cab = linhas[0].map((c) => semAcento(c).replace(/\s/g, ''));
  const idx = Object.fromEntries(COLS.map((c) => [c, cab.indexOf(semAcento(c))]));
  if (idx.termo < 0 || idx.traducao < 0) return { novos: [], dup: 0, erros: ['A primeira linha precisa ter as colunas "termo" e "traducao" (baixe o modelo)'] };
  const exist = new Set(itens.filter((i) => !i.excluido).map((i) => i.tipo + '|' + norm(i.termo || i.errado)));
  const novos = [], erros = []; let dup = 0;
  linhas.slice(1).forEach((l, n) => {
    const g = (c) => idx[c] >= 0 ? (l[idx[c]] || '').trim() : '';
    let tipo = semAcento(g('tipo')) || 'palavra'; if (!['palavra', 'frase', 'erro'].includes(tipo)) tipo = 'palavra';
    const termo = g('termo'), trad = g('traducao'); if (!termo) { erros.push(`Linha ${n + 2}: sem termo`); return; }
    if (exist.has(tipo + '|' + norm(termo))) { dup++; return; }
    exist.add(tipo + '|' + norm(termo));
    const art = semAcento(g('artigo')); const sec = +g('secao') || null, num = +g('unidade') || null;
    const u = num ? unidades.find((x) => !x.excluido && x.numero === num && (!sec || x.secao === sec)) : null;
    const cls = semAcento(g('classe')); const classe = CLASSES.find(([k, t]) => cls && (k === cls || semAcento(t).startsWith(cls)))?.[0] || (['der', 'die', 'das'].includes(art) ? 'subst' : '');
    novos.push(tipo === 'erro' ? { tipo, errado: termo, certo: trad, porque: g('notas'), unidadeId: u?.id || null, _sec: sec, _num: num }
      : { tipo, termo, traducao: trad, artigo: ['der', 'die', 'das'].includes(art) ? art : '', plural: g('plural'), classe, exemplo: g('exemplo'), exemploTrad: g('exemploTraducao'), notas: g('notas'), unidadeId: u?.id || null, _sec: sec, _num: num });
  });
  return { novos, dup, erros };
}
export async function importarCSV(novos) {
  const criadas = {};
  for (const n of novos) {
    let uId = n.unidadeId;
    if (!uId && n._num) { const k = `${n._sec || 1}-${n._num}`; uId = criadas[k] || (criadas[k] = await salvarUnidade({ secao: n._sec || 1, numero: n._num, titulo: '' })); }
    const { _sec, _num, ...it } = n; await salvarItem({ ...it, unidadeId: uId || null });
  }
  return novos.length;
}
export const MODELO_CSV = '﻿' + COLS.join(';') + '\r\npalavra;Hund;cachorro;der;Hunde;substantivo;Der Hund schläft.;O cachorro dorme.;1;2;\r\nfrase;Wie geht es dir?;Como você está?;;;;;;1;1;\r\nerro;Ich habe nach Hause gegangen;Ich bin nach Hause gegangen;;;;;;1;3;movimento usa sein\r\n';

// ---------- voz (pronúncia do próprio celular) ----------
export function falar(texto, voz = 'de-DE', rate = 0.9) {
  try {
    if (!('speechSynthesis' in window) || !texto) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto); u.lang = voz; u.rate = rate;
    const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(voz.slice(0, 2).toLowerCase()));
    if (v) u.voice = v; speechSynthesis.speak(u); return true;
  } catch { return false; }
}
export const temVoz = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export function falarEsperar(texto, voz = 'de-DE', rate = 0.9) {
  return new Promise((ok) => {
    try { if (!temVoz() || !texto) return ok(); const u = new SpeechSynthesisUtterance(texto); u.lang = voz; u.rate = rate; const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(voz.slice(0, 2).toLowerCase())); if (v) u.voice = v; u.onend = ok; u.onerror = ok; speechSynthesis.speak(u); setTimeout(ok, 8000); } catch { ok(); }
  });
}

// ---------- extra opcional: baralho "xadrez em alemão" (só quando o usuário pedir) ----------
export const XADREZ_DE = [
  ['König', 'rei', 'der', 'Könige'], ['Dame', 'dama (rainha)', 'die', 'Damen'], ['Turm', 'torre', 'der', 'Türme'], ['Läufer', 'bispo', 'der', 'Läufer'], ['Springer', 'cavalo', 'der', 'Springer'], ['Bauer', 'peão', 'der', 'Bauern'],
  ['Schachbrett', 'tabuleiro', 'das', 'Schachbretter'], ['Figur', 'peça', 'die', 'Figuren'], ['Zug', 'lance', 'der', 'Züge'], ['Rochade', 'roque', 'die', 'Rochaden'], ['Eröffnung', 'abertura', 'die', 'Eröffnungen'], ['Gegner', 'adversário', 'der', 'Gegner'], ['Remis', 'empate', 'das', 'Remis']
];
export const XADREZ_DE_VERBOS = [['ziehen', 'mover (uma peça)', 'haben', 'gezogen', false, true], ['schlagen', 'capturar', 'haben', 'geschlagen', false, true], ['gewinnen', 'ganhar', 'haben', 'gewonnen', false, true], ['verlieren', 'perder', 'haben', 'verloren', false, true]];
export async function criarBaralhoXadrez() {
  const uId = await salvarUnidade({ secao: 0, numero: 0, titulo: 'Extra: xadrez em alemão' });
  for (const [termo, traducao, artigo, plural] of XADREZ_DE) await salvarItem({ tipo: 'palavra', termo, traducao, artigo, plural, classe: 'subst', exemplo: '', exemploTrad: '', notas: '', unidadeId: uId });
  for (const [termo, traducao, aux, partizip, separavel, irregular] of XADREZ_DE_VERBOS) await salvarItem({ tipo: 'palavra', termo, traducao, classe: 'verbo', artigo: '', plural: '', exemplo: '', exemploTrad: '', notas: '', verbo: { aux, partizip, separavel, irregular }, unidadeId: uId });
  await salvarItem({ tipo: 'frase', termo: 'Schach!', traducao: 'Xeque!', unidadeId: uId, notas: '' });
  await salvarItem({ tipo: 'frase', termo: 'Schachmatt!', traducao: 'Xeque-mate!', unidadeId: uId, notas: '' });
  return uId;
}

// ---------- gramática: tabelas liberadas e notas ----------
export async function lerGram() { return { liberadas: [], notas: {}, ...((await db.meta.get('gramDe')) || {}) }; }
export async function salvarGram(p) { const g = await lerGram(); await db.meta.put({ ...cru(g), ...cru(p), chave: 'gramDe', atualizadoEm: agora() }); }
