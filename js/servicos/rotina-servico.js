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
export function criarCalc({ atividades, marcacoes, agua, cfg, hoje, viagens = [] }) {
  const marc = new Map(), sem = {}, litrosDia = {};
  for (const m of marcacoes) {
    if (!m.valor) continue;
    if (m.hora === '*') (sem[m.atividadeId] ||= []).push(m.data);
    else marc.set(m.id, m.valor);
  }
  for (const r of agua) if (!r.excluido) litrosDia[r.data] = (litrosDia[r.data] || 0) + r.ml / 1000;
  const litros = (s) => Math.round((litrosDia[s] || 0) * 1000) / 1000;
  const cfgEm = (s) => versaoEm(cfg.versoes, s) || { meta: 3, limiar: 2.5 };
  const vivas = atividades.filter((a) => !a.excluido);
  const fixas = vivas.filter((a) => a.tipo === 'fixo');
  const semanais = vivas.filter((a) => a.tipo === 'semanal');
  const vSem = (a, s) => versaoEm(a.versoes, s) || a.versoes[0] || {};
  const ehAleatoria = (a, s) => !!vSem(a, s).aleatoria;
  const trips = viagens.filter((v) => !v.excluido);
  const viagemEm = (s) => trips.find((v) => v.inicio <= s && s <= v.fim) || null;
  const feito = (st) => st === 'f' || st === 'o';

  // ---- Atividades aleatórias: dias sorteados por semana (mesmo resultado em qualquer aparelho) ----
  // Regras (1x a 3x): sem dias seguidos; intervalo máximo G = arred. p/ cima(7/X) (1x/semana: livre).
  // 4x ou mais: dias sorteados livremente (dias seguidos permitidos).
  const memo = new Map();
  function diasAleatorios(a, seg) {
    const k = a.id + seg;
    if (memo.has(k)) return memo.get(k);
    const segIni = segundaDe(a.criadoEm);
    let X = Math.min(7, vSem(a, seg).vezes || 1);
    const G = X === 1 ? 13 : Math.ceil(7 / X);
    const ant = seg > segIni ? diasAleatorios(a, somaDias(seg, -7)) : [];
    const ultimo = ant.length ? difDias(ant[ant.length - 1], seg) : null; // negativo (dias antes desta segunda)
    const minIdx = seg === segIni ? difDias(a.criadoEm, seg) : 0;
    const combos = (n) => { const r = []; const f = (i, acc) => { if (acc.length === n) { r.push([...acc]); return; } for (let j = i; j < 7; j++) { acc.push(j); f(j + 1, acc); acc.pop(); } }; f(minIdx, []); return r; };
    const valido = (c, comAnterior) => {
      if (X >= 4) return true;
      for (let i = 1; i < c.length; i++) { const g = c[i] - c[i - 1]; if (g < 2 || g > G) return false; }
      if (ultimo != null) { const g = c[0] - ultimo; if (g < 2 || (comAnterior && g > G)) return false; }
      // olha a semana seguinte: o último dia precisa permitir que ela respeite o intervalo máximo
      if (comAnterior && X > 1 && c[c.length - 1] < 7 - G) return false;
      return true;
    };
    let ok = [];
    for (let n = X; n >= 1 && !ok.length; n--) { const cs = combos(n); ok = cs.filter((c) => valido(c, true)); if (!ok.length) ok = cs.filter((c) => valido(c, false)); }
    const sorteio = ok.length ? ok[Math.floor(hashNum(k) * ok.length)] : [];
    const res = sorteio.map((i) => somaDias(seg, i));
    memo.set(k, res);
    return res;
  }

  function ocorrencias(s) {
    const dow = pd(s).getDay(), r = [], trip = viagemEm(s);
    for (const a of fixas) {
      if (!ativaEm(a, s)) continue;
      const hs = versaoEm(a.versoes, s)?.horarios?.[dow];
      if (!hs) continue;
      (hs.length ? hs : [null]).forEach((h) => r.push({ a, hora: h || '', id: `${s}|${a.id}|${h || ''}` }));
    }
    for (const a of semanais) {
      if (!ativaEm(a, s) || !ehAleatoria(a, s) || s > hoje) continue; // futuro fica em segredo
      if (diasAleatorios(a, segundaDe(s)).includes(s)) r.push({ a, hora: '', id: `${s}|${a.id}|`, surpresa: true });
    }
    const lista = trip ? r.filter((o) => trip.atividades.includes(o.a.id)) : r;
    return lista.sort((x, y) => (x.hora || '99').localeCompare(y.hora || '99') || x.a.nome.localeCompare(y.a.nome, 'pt-BR'));
  }
  // 'f' feita, 'o' feita por outra pessoa, 'n' falha, 'p' pendente (hoje), 'x' futuro
  function status(o, s) {
    const d = difDias(s, hoje);
    if (d > 0) return 'x';
    if (o.a.agua) return litros(s) + 1e-9 >= cfgEm(s).limiar ? 'f' : d === 0 ? 'p' : 'n';
    return marc.get(o.id) || (d === 0 ? 'p' : 'n');
  }
  // Dias de viagem não entram em nenhum percentual
  function dia(s, soMarcadas = false) {
    let f = 0, t = 0;
    if (viagemEm(s)) return { f, t, viagem: true };
    for (const o of ocorrencias(s)) {
      const st = status(o, s);
      if (st === 'x' || (st === 'p' && soMarcadas)) continue;
      t++; if (feito(st)) f++;
    }
    return { f, t };
  }
  // Semanas fechadas das semanais NÃO aleatórias (semana com viagem não conta)
  function semanasFechadas(ini, fim) {
    const r = [];
    for (const a of semanais) {
      for (let seg = segundaDe(a.criadoEm < ini ? ini : a.criadoEm); ; seg = somaDias(seg, 7)) {
        const dom = somaDias(seg, 6);
        if (dom > fim || dom >= hoje) break;
        if (dom < ini || seg < a.criadoEm || (a.desativadoEm && a.desativadoEm <= dom) || ehAleatoria(a, seg)) continue;
        let temViagem = false; for (let s = seg; s <= dom; s = somaDias(s, 1)) if (viagemEm(s)) temViagem = true;
        if (temViagem) continue;
        const feitos = (sem[a.id] || []).filter((d) => d >= seg && d <= dom).length;
        const meta = vSem(a, dom).vezes || 1;
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
    return { feitos: datas.length, noDia: datas.filter((d) => d === s).length, meta: vSem(a, s).vezes || 1 };
  }
  // "Nesta semana": só as semanais não aleatórias
  function semanaisAtivas(s) { return semanais.filter((a) => ativaEm(a, s) && !ehAleatoria(a, s)); }
  // Ranking de falhas até ontem (dias de viagem fora)
  function falhas(ini) {
    const fim = somaDias(hoje, -1), g = {};
    for (let s = ini; s <= fim; s = somaDias(s, 1)) {
      if (viagemEm(s)) continue;
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
  const inicioDados = () => vivas.reduce((m, a) => (a.criadoEm < m ? a.criadoEm : m), hoje);
  const marcaDe = (id) => marc.get(id);
  // Atividades que podem acontecer num dia (para escolher na viagem), ignorando a viagem
  function candidatasViagem(s) {
    const dow = pd(s).getDay();
    return vivas.filter((a) => ativaEm(a, s) && (a.tipo === 'semanal' ? ehAleatoria(a, s) : !!versaoEm(a.versoes, s)?.horarios?.[dow]));
  }
  return { marcaDe, ocorrencias, status, dia, periodo, semanaAtual, semanaisAtivas, falhas, litros, cfgEm, inicioDados, viagemEm, feito, candidatasViagem, trips, hoje };
}

// Número 0–1 estável a partir de um texto (sorteio reproduzível)
function hashNum(t) { let h = 2166136261; for (const c of t) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

// ---------- Gravação ----------
export const podeEditar = (s, hoje = hojeStr()) => { const d = difDias(s, hoje); return d === 0 || d === -1; };

export async function marcar(s, atividadeId, hora, valor) {
  if (!podeEditar(s)) return false;
  const id = `${s}|${atividadeId}|${hora || ''}`;
  await db.marcacoes.put({ id, data: s, atividadeId, hora: hora || '', valor, atualizadoEm: agora() });
  // Atividade que soma água ao ser concluída (ex.: "Beber 500ml ao acordar")
  const a = await db.atividades.get(atividadeId);
  if (a?.aguaMl > 0) {
    const regId = 'auto|' + id, existe = await db.agua.get(regId), concluida = valor === 'f' || valor === 'o';
    if (concluida) {
      const d = new Date();
      await db.agua.put({ id: regId, data: s, hora: `${z(d.getHours())}:${z(d.getMinutes())}`, ml: a.aguaMl, origem: a.nome, atualizadoEm: agora(), excluido: false });
    } else if (existe && !existe.excluido) await db.agua.update(regId, { excluido: true, atualizadoEm: agora() });
  }
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

// dados: { id?, nome, tipo, modoHora, horarios {dow: [..]}, vezes, aleatoria, outraPessoa, aguaMl }
export async function salvarAtividade(dados) {
  const hoje = hojeStr();
  const versao = dados.tipo === 'semanal' ? { desde: hoje, vezes: dados.vezes, aleatoria: !!dados.aleatoria } : { desde: hoje, horarios: dados.horarios };
  const outraPessoa = (dados.outraPessoa || '').trim();
  const aguaMl = Math.max(0, Math.round(Number(dados.aguaMl) || 0));
  if (dados.id) {
    const a = await db.atividades.get(dados.id);
    const versoes = (a.versoes || []).filter((v) => v.desde !== hoje).concat(a.agua ? [] : [versao]);
    await db.atividades.update(a.id, { nome: dados.nome.trim(), modoHora: dados.modoHora, outraPessoa, aguaMl, versoes: a.agua ? a.versoes : versoes, atualizadoEm: agora() });
  } else {
    await db.atividades.add({
      id: uid(), nome: dados.nome.trim(), tipo: dados.tipo, modoHora: dados.modoHora || 'ate', agua: false, outraPessoa, aguaMl,
      versoes: [versao], criadoEm: hoje, desativadoEm: null, atualizadoEm: agora(), excluido: false
    });
  }
}
// Desativa a partir de hoje (histórico continua)
export async function desativar(id) {
  await db.atividades.update(id, { desativadoEm: hojeStr(), atualizadoEm: agora() });
}
// Exclui de vez: some do histórico, dos % e das falhas
export async function excluirDeVez(id) {
  await db.atividades.update(id, { excluido: true, atualizadoEm: agora() });
}

const TODOS = (hs) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, hs]));
export async function garantirAgua() {
  if (await db.atividades.filter((a) => a.agua && !a.excluido).count()) return;
  await db.atividades.add({ id: 'agua-' + uid(), nome: 'Beber água', tipo: 'fixo', modoHora: 'ate', agua: true, versoes: [{ desde: '0000-01-01', horarios: TODOS([]) }],
    criadoEm: hojeStr(), desativadoEm: null, atualizadoEm: agora(), excluido: false });
}
// Ajuste único pedido pelo usuário: "Remédios da Lua" ganha a opção "Lavinia fez".
export async function migracoes() {
  // Pedido do usuário (25/11): nova atividade, id fixo para não duplicar entre aparelhos
  if (!(await db.atividades.get('beber-500-acordar'))) {
    await db.atividades.add({ id: 'beber-500-acordar', nome: 'Beber 500ml de Água ao acordar 🫗', tipo: 'fixo', modoHora: 'ate', agua: false, outraPessoa: '', aguaMl: 500,
      versoes: [{ desde: hojeStr(), horarios: TODOS(['06:30']) }], criadoEm: hojeStr(), desativadoEm: null, atualizadoEm: agora(), excluido: false });
  }
  if (await db.meta.get('mig-lavinia')) return;
  const a = await db.atividades.filter((x) => !x.excluido && x.nome === 'Remédios da Lua' && !x.outraPessoa).first();
  if (a) await db.atividades.update(a.id, { outraPessoa: 'Lavinia', atualizadoEm: agora() });
  await db.meta.put({ chave: 'mig-lavinia', feito: agora() });
}
// Sugestões (lista do usuário). Só adiciona as que ainda não existem pelo nome.
export const SUGESTOES = [
  { nome: 'Jogar lixo fora', tipo: 'fixo', modoHora: 'ate', horarios: { 1: [], 3: [], 5: [] } },
  { nome: 'Levantar', tipo: 'fixo', modoHora: 'ate', horarios: TODOS(['06:15']) },
  { nome: 'Remédios da Lua', tipo: 'fixo', modoHora: 'as', horarios: TODOS(['07:00', '08:00', '19:00', '20:00']), outraPessoa: 'Lavinia' },
  { nome: 'Sem celular ao acordar', tipo: 'fixo', modoHora: 'ate', horarios: TODOS([]) },
  { nome: 'Sem celular antes de dormir', tipo: 'fixo', modoHora: 'ate', horarios: TODOS([]) },
  { nome: 'Ler 30 min', tipo: 'fixo', modoHora: 'ate', horarios: TODOS([]) },
  { nome: 'Deitar', tipo: 'fixo', modoHora: 'ate', horarios: TODOS(['22:00']) },
  { nome: 'Organizar e limpar o escritório', tipo: 'semanal', vezes: 2 },
  { nome: 'Lavar louça do almoço', tipo: 'fixo', modoHora: 'ate', horarios: TODOS([]) },
  { nome: 'Lavar louça da janta', tipo: 'fixo', modoHora: 'ate', horarios: TODOS([]) },
  { nome: 'Não dormir com louça na pia', tipo: 'fixo', modoHora: 'ate', horarios: TODOS([]) }
];
export async function adicionarSugestoes(nomes) {
  const existentes = new Set((await db.atividades.filter((a) => !a.excluido && !a.desativadoEm).toArray()).map((a) => a.nome.toLowerCase()));
  for (const s of SUGESTOES) if (nomes.includes(s.nome) && !existentes.has(s.nome.toLowerCase())) await salvarAtividade(s);
}

// ---------- Viagens ----------
// v: { id?, inicio, fim, atividades: [ids] }. Datas a partir de ontem.
export async function salvarViagem(v) {
  const reg = { inicio: v.inicio, fim: v.fim, atividades: [...v.atividades], atualizadoEm: agora(), excluido: false };
  if (v.id) await db.viagens.update(v.id, reg); else await db.viagens.add({ id: uid(), ...reg });
}
export async function excluirViagem(id) { await db.viagens.update(id, { excluido: true, atualizadoEm: agora() }); }

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
