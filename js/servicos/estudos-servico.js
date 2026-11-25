// Regras do módulo Estudos (Pós, Cursos, Duolingo) — sem interface.
import { db, uid, agora, r3 } from '../db.js';
import { ds, pd, hojeStr, somaDias, difDias, segundaDe } from './rotina-servico.js';

// Registros criados automaticamente usam data antiga: qualquer edição real sempre vence na sincronização.
const SEMENTE = '2026-11-25T00:00:00.000Z';
export const META_INICIAL_MIN = 300; // 5h por semana
export const DIAS_ESTUDO = 5;

// ---------- Leitura de duração: "12", "12min", "1h05", "1:05", "1h" ----------
export function lerDuracao(txt) {
  const t = String(txt || '').toLowerCase().replace(/\s/g, '');
  let m = t.match(/^(\d+)h(\d+)?(min|m)?$/); if (m) return +m[1] * 60 + +(m[2] || 0);
  m = t.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2];
  m = t.match(/^(\d+)(min|m)?$/); if (m) return +m[1];
  return NaN;
}
export const hm = (min) => { min = Math.max(0, Math.round(min || 0)); const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`; };

// ---------- Dados iniciais (ids fixos: não duplicam entre aparelhos) ----------
export async function garantirEstudos() {
  if (await db.cursos.get('pos-puc')) return;
  const base = { atualizadoEm: SEMENTE, excluido: false };
  await db.transaction('rw', ['cursos', 'disciplinas', 'unidades', 'aulas', 'atividades', 'meta', 'duoRating'], async () => {
    await db.cursos.put({ id: 'pos-puc', tipo: 'pos', nome: 'Pós Analytics & BI — PUC Minas', inicio: '2026-07-01', prazoConteudo: '2027-12-31', prazoFinal: '2028-01-31', totalDisciplinas: 13, notaMin: 60, ...base });
    await db.disciplinas.put({ id: 'pos-d1', cursoId: 'pos-puc', ordem: 1, nome: 'Inteligência e Performance Corporativa', prova: { obtido: null, maximo: null }, ...base });
    const U = [[15, 15], [11, 15], [11, null], [8, null]];
    for (let i = 0; i < U.length; i++) {
      const uId = `pos-d1-u${i + 1}`;
      await db.unidades.put({ id: uId, disciplinaId: 'pos-d1', ordem: i + 1, nome: `Unidade ${i + 1}`, atividade: { obtido: U[i][1], maximo: 15 }, ...base });
      for (let a = 1; a <= U[i][0]; a++) await db.aulas.put({ id: `${uId}-a${a}`, unidadeId: uId, secaoId: null, ordem: a, nome: '', concluida: false, duracaoMin: null, concluidaEm: null, ...base });
    }
    const todos = (hs) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, hs]));
    if (!(await db.atividades.get('estudar-pos'))) await db.atividades.put({ id: 'estudar-pos', nome: 'Estudar a Pós', tipo: 'semanal', modoHora: 'ate', agua: false, estudo: 'pos-puc', outraPessoa: '', versoes: [{ desde: hojeStr(), vezes: DIAS_ESTUDO, aleatoria: false }], criadoEm: hojeStr(), desativadoEm: null, ...base });
    if (!(await db.atividades.get('duolingo'))) await db.atividades.put({ id: 'duolingo', nome: 'Duolingo', tipo: 'fixo', modoHora: 'ate', agua: false, duo: true, outraPessoa: '', versoes: [{ desde: hojeStr(), horarios: todos([]) }], criadoEm: hojeStr(), desativadoEm: null, ...base });
    if (!(await db.meta.get('duoBase'))) await db.meta.put({ chave: 'duoBase', valor: 51, data: '2026-11-24', atualizadoEm: SEMENTE });
    if (!(await db.duoRating.count())) await db.duoRating.put({ id: 'r-2026-11-25', data: '2026-11-25', valor: 492, atualizadoEm: SEMENTE, excluido: false });
  });
}

// ---------- Duolingo ----------
// Idioma do dia: sorteio reproduzível (igual em qualquer aparelho), nunca 3 dias seguidos do mesmo.
const IDIOMAS = ['Alemão', 'Xadrez'];
const memoDuo = new Map();
function hashNum(t) { let h = 2166136261; for (const c of t) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
export function duoIdioma(s) {
  if (memoDuo.has(s)) return memoDuo.get(s);
  const INI = '2026-11-01';
  let a = null, b = null; // dois dias anteriores
  for (let d = INI; d <= s; d = somaDias(d, 1)) {
    let x = memoDuo.get(d);
    if (!x) { x = IDIOMAS[hashNum('duo' + d) < 0.5 ? 0 : 1]; if (a && a === b && x === a) x = IDIOMAS.find((i) => i !== a); memoDuo.set(d, x); }
    b = a; a = x;
  }
  return memoDuo.get(s);
}
// Ofensiva: base = valor ao fim do dia "data". Dia passado sem marcar zera; hoje sem marcar não zera ainda.
export function ofensiva(base, feitos, hoje = hojeStr()) {
  let v = base?.valor || 0;
  for (let d = somaDias(base?.data || hoje, 1); d <= hoje; d = somaDias(d, 1)) {
    if (feitos.has(d)) v++; else if (d < hoje) v = 0;
  }
  return v;
}
export async function corrigirOfensiva(valorAtual, hojeFeito) {
  await db.meta.put({ chave: 'duoBase', valor: Math.max(0, valorAtual - (hojeFeito ? 1 : 0)), data: somaDias(hojeStr(), -1), atualizadoEm: agora() });
}
export async function salvarRating(valor) {
  const h = hojeStr();
  await db.duoRating.put({ id: 'r-' + h, data: h, valor, atualizadoEm: agora(), excluido: false });
}

// ---------- Cronômetro (fica no aparelho; continua contando com o app fechado) ----------
const CRON = 'cronometro';
export function lerCron() { try { return JSON.parse(localStorage.getItem(CRON)) || { disciplinaId: null, inicio: null, acumulado: 0 }; } catch { return { disciplinaId: null, inicio: null, acumulado: 0 }; } }
function gravarCron(c) { try { localStorage.setItem(CRON, JSON.stringify(c)); } catch { /* sem armazenamento */ } }
export const segundosCron = (c) => (c.acumulado || 0) + (c.inicio ? Math.floor((Date.now() - c.inicio) / 1000) : 0);
export function iniciarCron(disciplinaId) { const c = lerCron(); if (c.inicio) return c; const n = { ...c, disciplinaId: c.disciplinaId || disciplinaId, inicio: Date.now(), dia: c.dia || hojeStr() }; gravarCron(n); return n; }
export function pausarCron() { const c = lerCron(); if (!c.inicio) return c; const n = { ...c, acumulado: segundosCron(c), inicio: null }; gravarCron(n); return n; }
export async function encerrarCron(cursoId) {
  const c = lerCron(), seg = segundosCron(c);
  gravarCron({ disciplinaId: null, inicio: null, acumulado: 0 });
  const min = Math.round(seg / 60);
  if (min >= 1 && c.disciplinaId) await lancarTempo({ cursoId, disciplinaId: c.disciplinaId, data: c.dia || hojeStr(), minutos: min });
  return min;
}
export async function lancarTempo({ cursoId, disciplinaId, data, minutos }) {
  await db.sessoes.add({ id: uid(), cursoId, disciplinaId, data, minutos: Math.round(minutos), atualizadoEm: agora(), excluido: false });
}

// ---------- Edição da estrutura ----------
const toque = () => ({ atualizadoEm: agora() });
export async function salvarCurso(c) {
  if (c.id) await db.cursos.update(c.id, { nome: c.nome.trim(), prazoConteudo: c.prazoConteudo || null, totalDisciplinas: c.totalDisciplinas || null, ...toque() });
  else await db.cursos.add({ id: uid(), tipo: 'curso', nome: c.nome.trim(), inicio: hojeStr(), prazoConteudo: c.prazoConteudo || null, prazoFinal: null, totalDisciplinas: c.totalDisciplinas || null, notaMin: 60, ...toque(), excluido: false });
}
export async function excluirCurso(id) { await db.cursos.update(id, { excluido: true, ...toque() }); }
export async function salvarDisciplina(d) {
  if (d.id) return db.disciplinas.update(d.id, { nome: d.nome.trim(), ...toque() });
  const n = (await db.disciplinas.where('cursoId').equals(d.cursoId).filter((x) => !x.excluido).count()) + 1;
  await db.disciplinas.add({ id: uid(), cursoId: d.cursoId, ordem: n, nome: d.nome.trim(), prova: { obtido: null, maximo: null }, ...toque(), excluido: false });
}
export async function excluirDisciplina(id) { await db.disciplinas.update(id, { excluido: true, ...toque() }); }
export async function salvarProva(id, obtido, maximo) { await db.disciplinas.update(id, { prova: { obtido, maximo }, ...toque() }); }
export async function salvarUnidade(u) {
  if (u.id) return db.unidades.update(u.id, { nome: u.nome.trim(), ...toque() });
  const n = (await db.unidades.where('disciplinaId').equals(u.disciplinaId).filter((x) => !x.excluido).count()) + 1;
  const id = uid();
  await db.unidades.add({ id, disciplinaId: u.disciplinaId, ordem: n, nome: u.nome?.trim() || `Unidade ${n}`, atividade: { obtido: null, maximo: null }, ...toque(), excluido: false });
  if (u.aulas > 0) await adicionarAulas(id, null, u.aulas);
}
export async function salvarAtividadeObj(unidadeId, obtido, maximo) { await db.unidades.update(unidadeId, { atividade: { obtido, maximo }, ...toque() }); }
export async function excluirUnidade(id) { await db.unidades.update(id, { excluido: true, ...toque() }); }
export async function salvarSecao(s) {
  if (s.id) return db.secoes.update(s.id, { nome: s.nome.trim(), ...toque() });
  const n = (await db.secoes.where('unidadeId').equals(s.unidadeId).filter((x) => !x.excluido).count()) + 1;
  const id = uid();
  await db.secoes.add({ id, unidadeId: s.unidadeId, ordem: n, nome: s.nome?.trim() || `Seção ${n}`, ...toque(), excluido: false });
  if (s.aulas > 0) await adicionarAulas(s.unidadeId, id, s.aulas);
}
export async function excluirSecao(id) {
  await db.secoes.update(id, { excluido: true, ...toque() });
  for (const a of await db.aulas.where('secaoId').equals(id).toArray()) await db.aulas.update(a.id, { excluido: true, ...toque() });
}
export async function adicionarAulas(unidadeId, secaoId, qtd) {
  const exist = await db.aulas.where('unidadeId').equals(unidadeId).filter((a) => !a.excluido).toArray();
  let ordem = exist.reduce((m, a) => Math.max(m, a.ordem), 0);
  for (let i = 0; i < qtd; i++) await db.aulas.add({ id: uid(), unidadeId, secaoId: secaoId || null, ordem: ++ordem, nome: '', concluida: false, duracaoMin: null, concluidaEm: null, ...toque(), excluido: false });
}
export async function concluirAula(id, duracaoMin, nome) {
  await db.aulas.update(id, { concluida: true, duracaoMin, concluidaEm: hojeStr(), ...(nome != null ? { nome: nome.trim() } : {}), ...toque() });
}
export async function editarAula(id, campos) { await db.aulas.update(id, { ...campos, ...toque() }); }
export async function desmarcarAula(id) { await db.aulas.update(id, { concluida: false, concluidaEm: null, ...toque() }); }
export async function excluirAula(id) { await db.aulas.update(id, { excluido: true, ...toque() }); }

// ---------- Cálculos ----------
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
// Dias (de um curso) em que o tempo estudado atingiu a meta diária da semana
export function diasDeEstudo(sessoes, metas, cursoId = 'pos-puc') {
  const porDia = {};
  for (const s of sessoes) if (!s.excluido && s.cursoId === cursoId) porDia[s.data] = (porDia[s.data] || 0) + s.minutos;
  const ok = new Set();
  for (const [d, min] of Object.entries(porDia)) {
    const metaSem = metas['estudoMeta-' + segundaDe(d)] ?? META_INICIAL_MIN;
    if (min >= metaSem / DIAS_ESTUDO) ok.add(d);
  }
  return ok;
}

// dados: { curso, disciplinas, unidades, secoes, aulas, sessoes, hoje, cronSeg, cronDisc }
export function calcCurso({ curso, disciplinas, unidades, secoes, aulas, sessoes, hoje = hojeStr(), cronSeg = 0, cronDisc = null }) {
  const D = disciplinas.filter((d) => d.cursoId === curso.id && !d.excluido).sort((a, b) => a.ordem - b.ordem);
  const idsD = new Set(D.map((d) => d.id));
  const U = unidades.filter((u) => idsD.has(u.disciplinaId) && !u.excluido).sort((a, b) => a.ordem - b.ordem);
  const idsU = new Set(U.map((u) => u.id));
  const S = secoes.filter((s) => idsU.has(s.unidadeId) && !s.excluido).sort((a, b) => a.ordem - b.ordem);
  const idsS = new Set(S.map((s) => s.id));
  const A = aulas.filter((a) => idsU.has(a.unidadeId) && !a.excluido && (!a.secaoId || idsS.has(a.secaoId))).sort((a, b) => a.ordem - b.ordem);
  const SES = sessoes.filter((s) => s.cursoId === curso.id && !s.excluido);
  const resumoAulas = (lista) => { const f = lista.filter((a) => a.concluida); return { total: lista.length, feitas: f.length, dur: f.reduce((s, a) => s + (a.duracaoMin || 0), 0), pct: pct(f.length, lista.length) }; };
  const nota = (itens) => { const l = itens.filter((x) => x && x.obtido != null && x.maximo > 0); const o = l.reduce((s, x) => s + x.obtido, 0), m = l.reduce((s, x) => s + x.maximo, 0); return { obtido: r3(o), maximo: r3(m), pct: pct(o, m) }; };
  const minDisc = {};
  for (const s of SES) minDisc[s.disciplinaId] = (minDisc[s.disciplinaId] || 0) + s.minutos;
  if (cronDisc) minDisc[cronDisc] = (minDisc[cronDisc] || 0) + cronSeg / 60;

  const discs = D.map((d) => {
    const us = U.filter((u) => u.disciplinaId === d.id).map((u) => {
      const au = A.filter((a) => a.unidadeId === u.id);
      const secs = S.filter((s) => s.unidadeId === u.id).map((s) => ({ ...s, aulas: au.filter((a) => a.secaoId === s.id), ...resumoAulas(au.filter((a) => a.secaoId === s.id)) }));
      return { ...u, secoes: secs, aulasSoltas: au.filter((a) => !a.secaoId), ...resumoAulas(au) };
    });
    const r = resumoAulas(A.filter((a) => us.some((u) => u.id === a.unidadeId)));
    const n = nota([...us.map((u) => u.atividade), d.prova]);
    const provaFeita = d.prova?.obtido != null && d.prova?.maximo > 0;
    const notaMin = curso.notaMin || 60;
    const situacao = provaFeita ? (n.pct >= notaMin ? 'Aprovado' : 'Abaixo de ' + notaMin + '%') : r.pct === 100 ? 'Falta a prova' : 'Em andamento';
    return { ...d, unidades: us, ...r, nota: n, provaFeita, situacao, realMin: minDisc[d.id] || 0, completa: r.pct === 100 && provaFeita };
  });

  const tot = resumoAulas(A);
  const comAulas = discs.filter((d) => d.total > 0);
  const totalDisc = Math.max(curso.totalDisciplinas || D.length, D.length);
  const mediaAulas = comAulas.length ? comAulas.reduce((s, d) => s + d.total, 0) / comAulas.length : 0;
  const faltamCadastrar = Math.max(0, totalDisc - comAulas.length);
  const totalEst = Math.round(tot.total + faltamCadastrar * mediaAulas);
  const realMin = SES.reduce((s, x) => s + x.minutos, 0) + (cronDisc ? cronSeg / 60 : 0);
  // Médias só valem com pelo menos 5 aulas com duração (antes disso: 15 min por aula e fator 1)
  const comDur = A.filter((a) => a.concluida && a.duracaoMin > 0);
  const confiavel = comDur.length >= 5;
  const durMedia = confiavel ? tot.dur / comDur.length : 15;
  const fator = confiavel && realMin > 0 ? realMin / tot.dur : 1;
  const atual = discs.find((d) => !d.completa) || discs[discs.length - 1] || null;

  // Semana atual
  const seg = segundaDe(hoje), dom = somaDias(seg, 6);
  const minPorDia = {};
  for (const s of SES) if (s.data >= seg && s.data <= dom) minPorDia[s.data] = (minPorDia[s.data] || 0) + s.minutos;
  if (cronDisc) minPorDia[hoje] = (minPorDia[hoje] || 0) + cronSeg / 60;
  const semMin = Object.values(minPorDia).reduce((s, x) => s + x, 0);

  let plano = null;
  if (curso.prazoConteudo && curso.inicio) {
    const ini = pd(curso.inicio), fim = pd(curso.prazoConteudo), h = pd(hoje);
    const pctTempo = Math.round(Math.min(1, Math.max(0, (h - ini) / (fim - ini))) * 100);
    const semanasRest = Math.max(1, difDias(curso.prazoConteudo, seg) / 7);
    const restantes = Math.max(0, totalEst - tot.feitas);
    const horasRestMin = restantes * durMedia * fator;
    const necessario = horasRestMin / semanasRest;
    const metaSem = Math.max(META_INICIAL_MIN, Math.round(necessario));
    const esperado = Math.round(totalEst * pctTempo / 100);
    const atraso = esperado - tot.feitas;
    // datas-alvo: proporcionais ao nº de aulas (média para as não cadastradas)
    const pesos = []; for (let i = 0; i < totalDisc; i++) pesos.push(discs[i]?.total || mediaAulas || 1);
    const somaP = pesos.reduce((s, x) => s + x, 0); let acc = 0;
    const alvos = pesos.map((p) => { acc += p; return ds(new Date(ini.getTime() + (fim - ini) * (acc / somaP))); });
    plano = {
      pctTempo, pctConteudo: pct(tot.feitas, totalEst), totalEst, restantes, semanasRest, necessario, metaSem,
      metaDia: metaSem / DIAS_ESTUDO, ritmo: Math.ceil(restantes / semanasRest), atraso, alvos, estimado: faltamCadastrar > 0,
      status: atraso <= 0 ? 'em-dia' : atraso <= Math.max(5, totalEst * 0.03) ? 'pouco' : 'atrasado'
    };
  }
  const metaDia = plano ? plano.metaDia : META_INICIAL_MIN / DIAS_ESTUDO;
  const diasSem = Object.values(minPorDia).filter((m) => m >= metaDia).length;
  return { confiavel, curso, discs, tot, totalDisc, faltamCadastrar, realMin, fator, durMedia, atual, plano, semMin, diasSem, hojeMin: minPorDia[hoje] || 0, metaDia, seg };
}

// Guarda a meta da semana (para a rotina "Estudar a Pós" usar o mesmo valor depois)
export async function registrarMetaSemana(seg, minutos) {
  const k = 'estudoMeta-' + seg, atual = await db.meta.get(k);
  if (!atual || Math.abs(atual.minutos - minutos) >= 1) await db.meta.put({ chave: k, minutos, atualizadoEm: agora() });
}
export { pct as porcento };
