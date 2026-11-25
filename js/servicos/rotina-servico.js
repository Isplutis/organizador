// Regras da Rotina + Água (sem interface).
import { db, uid, agora } from '../db.js';

// ---------- Datas (sempre texto 'AAAA-MM-DD', no fuso local) ----------
const z = (n) => String(n).padStart(2, '0');
export const ds = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const pd = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12);
export const hojeStr = () => ds(new Date());
export const somaDias = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
export const difDias = (a, b) => Math.round((pd(a) - pd(b)) / 864e5);
export const segundaDe = (s) => somaDias(s, -((pd(s).getDay() + 6) % 7));
export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Versão válida numa data (edições valem de "desde" em diante)
export function versaoEm(versoes, s) {
  let v = null;
  for (const x of versoes || []) if (x.desde <= s && (!v || x.desde >= v.desde)) v = x;
  return v;
}
const ativaEm = (a, s) => !a.excluido && a.criadoEm <= s && (!a.desativadoEm || s < a.desativadoEm);
export const fmtHora = (a, h) => (h ? (a.modoHora === 'as' ? 'às ' : 'até ') + h : 'sem horário');

// ---------- Cálculo (a partir dos dados carregados) ----------
export function criarCalc({ atividades, marcacoes, agua, cfg, hoje }) {
  const marc = new Map(), sem = {}, litrosDia = {};
  for (const m of marcacoes) {
    if (!m.valor) continue;
    if (m.hora === '*') (sem[m.atividadeId] ||= []).push(m.data);
    else marc.set(m.id, m.valor);
  }
  for (const r of agua) if (!r.excluido) litrosDia[r.data] = (litrosDia[r.data] || 0) + r.ml / 1000;
  const litros = (s) => Math.round((litrosDia[s] || 0) * 1000) / 1000;
  const cfgEm = (s) => versaoEm(cfg.versoes, s) || { meta: 3, limiar: 2.5 };
  const fixas = atividades.filter((a) => a.tipo === 'fixo');
  const semanais = atividades.filter((a) => a.tipo === 'semanal' && !a.excluido);

  function ocorrencias(s) {
    const dow = pd(s).getDay(), r = [];
    for (const a of fixas) {
      if (!ativaEm(a, s)) continue;
      const hs = versaoEm(a.versoes, s)?.horarios?.[dow];
      if (!hs) continue;
      (hs.length ? hs : [null]).forEach((h) => r.push({ a, hora: h || '', id: `${s}|${a.id}|${h || ''}` }));
    }
    return r.sort((x, y) => (x.hora || '99').localeCompare(y.hora || '99') || x.a.nome.localeCompare(y.a.nome, 'pt-BR'));
  }
  // 'f' feita, 'n' falha, 'p' pendente (hoje), 'x' futuro
  function status(o, s) {
    const d = difDias(s, hoje);
    if (d > 0) return 'x';
    if (o.a.agua) return litros(s) + 1e-9 >= cfgEm(s).limiar ? 'f' : d === 0 ? 'p' : 'n';
    return marc.get(o.id) || (d === 0 ? 'p' : 'n');
  }
  function dia(s, soMarcadas = false) {
    let f = 0, t = 0;
    for (const o of ocorrencias(s)) {
      const st = status(o, s);
      if (st === 'x' || (st === 'p' && soMarcadas)) continue;
      t++; if (st === 'f') f++;
    }
    return { f, t };
  }
  // Semanas fechadas (domingo < hoje) de cada atividade semanal, com domingo em [ini, fim]
  function semanasFechadas(ini, fim) {
    const r = [];
    for (const a of semanais) {
      for (let seg = segundaDe(a.criadoEm < ini ? ini : a.criadoEm); ; seg = somaDias(seg, 7)) {
        const dom = somaDias(seg, 6);
        if (dom > fim || dom >= hoje) break;
        if (dom < ini || seg < a.criadoEm || (a.desativadoEm && a.desativadoEm <= dom)) continue;
        const feitos = (sem[a.id] || []).filter((d) => d >= seg && d <= dom).length;
        const meta = (versaoEm(a.versoes, dom) || a.versoes[0])?.vezes || 1;
        r.push({ a, seg, feitos, meta, ok: feitos >= meta });
      }
    }
    return r;
  }
  // % de um período: dias até ontem completos + hoje só com o que já foi marcado
  function periodo(ini, fim = hoje) {
    let f = 0, t = 0;
    for (let s = ini; s <= fim && s <= hoje; s = somaDias(s, 1)) {
      const r = dia(s, s === hoje); f += r.f; t += r.t;
    }
    for (const w of semanasFechadas(ini, fim)) { t++; if (w.ok) f++; }
    return t ? Math.round((f / t) * 100) : null;
  }
  function semanaAtual(a, s) {
    const seg = segundaDe(s), dom = somaDias(seg, 6);
    const datas = (sem[a.id] || []).filter((d) => d >= seg && d <= dom);
    return { feitos: datas.length, noDia: datas.filter((d) => d === s).length, meta: (versaoEm(a.versoes, s) || a.versoes[0])?.vezes || 1 };
  }
  function semanaisAtivas(s) { return semanais.filter((a) => ativaEm(a, s)); }
  // Ranking de falhas até ontem
  function falhas(ini) {
    const fim = somaDias(hoje, -1), g = {};
    for (let s = ini; s <= fim; s = somaDias(s, 1)) {
      for (const o of ocorrencias(s)) {
        const x = (g[o.a.id] ||= { nome: o.a.nome, t: 0, n: 0, sub: {}, horas: new Set() });
        const falhou = status(o, s) === 'n';
        x.t++; if (falhou) x.n++;
        x.horas.add(o.hora);
        const sb = (x.sub[o.hora] ||= { t: 0, n: 0 }); sb.t++; if (falhou) sb.n++;
      }
    }
    for (const w of semanasFechadas(ini, fim)) {
      const x = (g[w.a.id] ||= { nome: w.a.nome, t: 0, n: 0, sub: {}, horas: new Set(), semanal: true });
      x.t++; if (!w.ok) x.n++;
    }
    return Object.entries(g).map(([id, x]) => ({
      id, nome: x.nome, t: x.t, n: x.n, semanal: !!x.semanal, p: x.t ? Math.round((x.n / x.t) * 100) : 0,
      sub: x.horas.size > 1 ? Object.entries(x.sub).sort().map(([h, v]) => ({ hora: h, p: Math.round((v.n / v.t) * 100), n: v.n, t: v.t })) : []
    })).sort((a, b) => b.p - a.p || b.n - a.n);
  }
  const inicioDados = () => atividades.reduce((m, a) => (a.criadoEm < m ? a.criadoEm : m), hoje);
  const marcaDe = (id) => marc.get(id);
  return { marcaDe, ocorrencias, status, dia, periodo, semanaAtual, semanaisAtivas, falhas, litros, cfgEm, inicioDados, hoje };
}

// ---------- Gravação ----------
export const podeEditar = (s, hoje = hojeStr()) => { const d = difDias(s, hoje); return d === 0 || d === -1; };

export async function marcar(s, atividadeId, hora, valor) {
  if (!podeEditar(s)) return false;
  await db.marcacoes.put({ id: `${s}|${atividadeId}|${hora || ''}`, data: s, atividadeId, hora: hora || '', valor, atualizadoEm: agora() });
  return true;
}
export async function semanalFeito(s, atividadeId) {
  if (!podeEditar(s)) return;
  await db.marcacoes.add({ id: uid(), data: s, atividadeId, hora: '*', valor: 'f', atualizadoEm: agora() });
}
export async function semanalDesfazer(s, atividadeId) {
  if (!podeEditar(s)) return;
  const m = (await db.marcacoes.where('data').equals(s).filter((x) => x.atividadeId === atividadeId && x.hora === '*' && x.valor).toArray())
    .sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm)).pop();
  if (m) await db.marcacoes.update(m.id, { valor: null, atualizadoEm: agora() });
}

// dados: { id?, nome, tipo, modoHora, horarios {dow: [..]}, vezes }
export async function salvarAtividade(dados) {
  const hoje = hojeStr();
  const versao = dados.tipo === 'semanal' ? { desde: hoje, vezes: dados.vezes } : { desde: hoje, horarios: dados.horarios };
  if (dados.id) {
    const a = await db.atividades.get(dados.id);
    const versoes = (a.versoes || []).filter((v) => v.desde !== hoje).concat(a.agua ? [] : [versao]);
    await db.atividades.update(a.id, { nome: dados.nome.trim(), modoHora: dados.modoHora, versoes: a.agua ? a.versoes : versoes, atualizadoEm: agora() });
  } else {
    await db.atividades.add({
      id: uid(), nome: dados.nome.trim(), tipo: dados.tipo, modoHora: dados.modoHora || 'ate', agua: false,
      versoes: [versao], criadoEm: hoje, desativadoEm: null, atualizadoEm: agora(), excluido: false
    });
  }
}
// Desativa a partir de hoje (histórico continua)
export async function desativar(id) {
  await db.atividades.update(id, { desativadoEm: hojeStr(), atualizadoEm: agora() });
}

const TODOS = (hs) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, hs]));
export async function garantirAgua() {
  if (await db.atividades.filter((a) => a.agua && !a.excluido).count()) return;
  await db.atividades.add({ id: uid(), nome: 'Beber água', tipo: 'fixo', modoHora: 'ate', agua: true, versoes: [{ desde: '0000-01-01', horarios: TODOS([]) }],
    criadoEm: hojeStr(), desativadoEm: null, atualizadoEm: agora(), excluido: false });
}
export async function carregarSugestoes() {
  const L = [
    ['Jogar lixo fora', 'ate', { 1: [], 3: [], 5: [] }],
    ['Levantar', 'ate', TODOS(['06:15'])],
    ['Remédios da Lua', 'as', TODOS(['07:00', '08:00', '19:00', '20:00'])],
    ['Sem celular ao acordar', 'ate', TODOS([])],
    ['Sem celular antes de dormir', 'ate', TODOS([])],
    ['Ler 30 min', 'ate', TODOS([])],
    ['Deitar', 'ate', TODOS(['22:00'])]
  ];
  for (const [nome, modoHora, horarios] of L) await salvarAtividade({ nome, tipo: 'fixo', modoHora, horarios });
  await salvarAtividade({ nome: 'Organizar e limpar o escritório', tipo: 'semanal', vezes: 2 });
}

// ---------- Água ----------
const CFG_PADRAO = { chave: 'agua', versoes: [{ desde: '0000-01-01', meta: 3, limiar: 2.5 }],
  recipientes: [{ id: 'garrafa', nome: 'Garrafa', ml: 500 }, { id: 'copo', nome: 'Copo', ml: 250 }] };
export async function lerCfgAgua() { return (await db.meta.get('agua')) || CFG_PADRAO; }
export async function salvarCfgAgua(mud) {
  const c = await lerCfgAgua(), hoje = hojeStr();
  const novo = { ...c, atualizadoEm: agora() };
  if (mud.meta != null || mud.limiar != null) {
    const v = versaoEm(c.versoes, hoje);
    novo.versoes = c.versoes.filter((x) => x.desde !== hoje).concat([{ desde: hoje, meta: mud.meta ?? v.meta, limiar: mud.limiar ?? v.limiar }]);
  }
  if (mud.recipientes) novo.recipientes = JSON.parse(JSON.stringify(mud.recipientes)); // remove o "proxy" reativo da tela
  await db.meta.put(novo);
}
export async function beber(ml) {
  const d = new Date();
  await db.agua.add({ id: uid(), data: ds(d), hora: `${z(d.getHours())}:${z(d.getMinutes())}`, ml, atualizadoEm: agora(), excluido: false });
}
export async function desfazerAgua() {
  const ult = (await db.agua.where('data').equals(hojeStr()).filter((r) => !r.excluido).toArray())
    .sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm)).pop();
  if (ult) await db.agua.update(ult.id, { excluido: true, atualizadoEm: agora() });
  return ult;
}
