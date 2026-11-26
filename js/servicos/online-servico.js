// Compras online: desejos (preço-alvo + histórico), pedidos (status/entrega/devolução/garantia) e servidor Cloudflare.
import { db, uid, agora } from '../db.js';
import { hojeStr, somaDias, difDias } from './rotina-servico.js';

export const LOJAS = { ml: 'Mercado Livre', amz: 'Amazon', shp: 'Shopee', out: 'Outra loja' };
export const STATUS = { aguardando: 'Aguardando envio', enviado: 'Enviado', transito: 'Em trânsito', entregue: 'Entregue', devolvido: 'Devolvido', cancelado: 'Cancelado' };
export const ETAPAS = ['aguardando', 'enviado', 'transito', 'entregue'];
export const PRIOS = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const DIAS_DEVOLUCAO = 7; // direito de arrependimento (CDC, compra fora da loja)

export const detectarLoja = (u) => { u = String(u || '').toLowerCase(); return /mercadoli[vb]re|meli\.la|\bmlb-?\d/.test(u) ? 'ml' : /amazon\.|amzn\./.test(u) ? 'amz' : /shopee\.|shp\.ee/.test(u) ? 'shp' : 'out'; };
export const fmtR = (n) => n == null || isNaN(n) ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtD = (s) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + (s.slice(0, 4) !== hojeStr().slice(0, 4) ? '/' + s.slice(0, 4) : '') : '—';

// ---------- Desejos ----------
export async function salvarDesejo(d) {
  const base = { nome: d.nome.trim(), url: (d.url || '').trim(), loja: d.loja || detectarLoja(d.url), alvo: d.alvo, prio: d.prio || 'media',
    disp: d.disp !== false, atualizadoEm: agora(), excluido: false };
  if (d.id) { await db.oDesejos.update(d.id, base); return d.id; }
  const id = uid();
  await db.oDesejos.add({ id, criadoEm: agora(), ...base });
  if (d.preco > 0) await registrarPreco(id, d.preco, 'manual');
  return id;
}
export async function registrarPreco(desejoId, valor, origem = 'manual', disp = true, em = agora()) {
  const id = desejoId + '|' + em;
  await db.oPrecos.put({ id, desejoId, em, valor, disp, origem, atualizadoEm: agora() });
  if (origem === 'manual') await db.oDesejos.update(desejoId, { disp, atualizadoEm: agora() });
}
export async function excluirPreco(id) { await db.oPrecos.update(id, { excluido: true, atualizadoEm: agora() }); }
export async function excluirDesejo(id) { await db.oDesejos.update(id, { excluido: true, atualizadoEm: agora() }); }

// "Comprei": vira pedido; o desejo sai da lista (histórico preservado)
export async function comprar(desejo, { valor, compra, prazo, primeiroPreco }) {
  const id = uid();
  await db.oPedidos.add({ id, nome: desejo.nome, loja: desejo.loja, url: desejo.url, valor, compra, prazo: prazo || '', rastreio: '', status: 'aguardando',
    desejoId: desejo.id, precoInicial: primeiroPreco ?? null, origem: 'manual', criadoEm: agora(), atualizadoEm: agora(), excluido: false });
  await db.oDesejos.update(desejo.id, { compradoEm: agora(), atualizadoEm: agora() });
  return id;
}

// ---------- Pedidos ----------
export async function salvarPedido(p) {
  const base = { nome: p.nome.trim(), loja: p.loja || detectarLoja(p.url), url: (p.url || '').trim(), valor: p.valor, compra: p.compra, prazo: p.prazo || '',
    rastreio: (p.rastreio || '').trim(), status: p.status || 'aguardando', garantiaAte: p.garantiaAte || '', atualizadoEm: agora(), excluido: false };
  if (p.id) { await db.oPedidos.update(p.id, base); return p.id; }
  const id = uid();
  await db.oPedidos.add({ id, origem: 'manual', criadoEm: agora(), ...base });
  return id;
}
export async function mudarStatus(p, status, extra = {}) {
  const mud = { status, atualizadoEm: agora(), ...extra };
  if (status === 'entregue' && !p.entregueEm) { mud.entregueEm = extra.entregueEm || hojeStr(); mud.devolveAte = somaDias(mud.entregueEm, DIAS_DEVOLUCAO); }
  await db.oPedidos.update(p.id, mud);
}
export async function excluirPedido(id) { await db.oPedidos.update(id, { excluido: true, atualizadoEm: agora() }); }

// ---------- Cálculos (puros) ----------
export function montar({ desejos, precos, pedidos, hoje = hojeStr() }) {
  const porDesejo = {};
  for (const p of precos) if (!p.excluido) (porDesejo[p.desejoId] ||= []).push(p);
  for (const k in porDesejo) porDesejo[k].sort((a, b) => a.em.localeCompare(b.em));
  const ativos = desejos.filter((d) => !d.excluido && !d.compradoEm);
  const ds = ativos.map((d) => {
    const hist = (porDesejo[d.id] || []).filter((p) => p.valor != null);
    const pts = porDesejo[d.id] || [];
    const ult = pts[pts.length - 1];
    const atual = hist.length ? hist[hist.length - 1].valor : null;
    const disp = ult ? ult.disp !== false : d.disp !== false;
    const vals = hist.map((p) => p.valor);
    const min = vals.length ? Math.min(...vals) : null, max = vals.length ? Math.max(...vals) : null;
    const media = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const noAlvo = disp && atual != null && atual <= d.alvo;
    const menor = disp && vals.length > 1 && atual <= min && vals.slice(0, -1).some((v) => v > atual);
    const ant = pts[pts.length - 2];
    const voltou = disp && ant && ant.disp === false && difDias(hoje, ult.em.slice(0, 10)) <= 3;
    return { ...d, hist, atual, disp, min, max, media, noAlvo, menor, voltou, primeiro: vals[0] ?? null, ultimaEm: ult?.em || null };
  });
  const ps = pedidos.filter((p) => !p.excluido).map((p) => {
    const aberto = ['aguardando', 'enviado', 'transito'].includes(p.status);
    const atraso = aberto && p.prazo && p.prazo < hoje ? difDias(hoje, p.prazo) : 0;
    const faltam = aberto && p.prazo && p.prazo >= hoje ? difDias(p.prazo, hoje) : null;
    const devolveDias = p.status === 'entregue' && p.devolveAte && p.devolveAte >= hoje ? difDias(p.devolveAte, hoje) : null;
    const garantiaDias = p.garantiaAte && p.garantiaAte >= hoje && p.status === 'entregue' ? difDias(p.garantiaAte, hoje) : null;
    return { ...p, aberto, atraso, faltam, devolveDias, garantiaDias, etapa: ETAPAS.indexOf(p.status) };
  }).sort((a, b) => (b.aberto - a.aberto) || (b.atraso - a.atraso) || (b.compra || '').localeCompare(a.compra || ''));
  const economia = ps.reduce((s, p) => s + (p.precoInicial > p.valor ? p.precoInicial - p.valor : 0), 0);
  const avisos = [];
  for (const d of ds) {
    if (d.noAlvo) avisos.push({ chave: `alvo|${d.id}|${d.atual}`, cor: 'pos', texto: `${d.nome} chegou no preço-alvo: ${fmtR(d.atual)}`, desejoId: d.id });
    if (d.menor) avisos.push({ chave: `menor|${d.id}|${d.atual}`, cor: 'roxo', texto: `${d.nome} está no menor preço já registrado: ${fmtR(d.atual)}`, desejoId: d.id });
    if (!d.disp) avisos.push({ chave: `indisp|${d.id}|${d.ultimaEm?.slice(0, 10)}`, cor: 'neg', texto: `${d.nome} ficou indisponível`, desejoId: d.id });
    if (d.voltou) avisos.push({ chave: `voltou|${d.id}|${d.ultimaEm}`, cor: 'pos', texto: `${d.nome} voltou ao estoque: ${fmtR(d.atual)}`, desejoId: d.id });
  }
  for (const p of ps) {
    if (p.atraso) avisos.push({ chave: `atraso|${p.id}|${hoje}`, cor: 'neg', texto: `${p.nome}: entrega atrasada ${p.atraso} ${p.atraso === 1 ? 'dia' : 'dias'}`, pedidoId: p.id });
    if (p.devolveDias != null && p.devolveDias <= 2) avisos.push({ chave: `devol|${p.id}|${p.devolveAte}`, cor: 'alerta', texto: `${p.nome}: prazo de devolução termina ${p.devolveDias === 0 ? 'hoje' : 'em ' + p.devolveDias + (p.devolveDias === 1 ? ' dia' : ' dias')}`, pedidoId: p.id });
    if (p.garantiaDias != null && p.garantiaDias <= 30) avisos.push({ chave: `garantia|${p.id}|${p.garantiaAte}`, cor: 'alerta', texto: `${p.nome}: garantia termina em ${fmtD(p.garantiaAte)}`, pedidoId: p.id });
  }
  return {
    desejos: ds, pedidos: ps, economia, avisos,
    nAlvo: ds.filter((d) => d.noAlvo).length, nCaminho: ps.filter((p) => p.aberto && !p.atraso).length,
    nAtraso: ps.filter((p) => p.atraso).length, nDevol: ps.filter((p) => p.devolveDias != null).length
  };
}

// avisos já vistos (por aparelho); a chave muda quando o fato muda, então o aviso volta
const LS = 'onlineAvisosVistos';
export const vistos = () => { try { return new Set(JSON.parse(localStorage.getItem(LS) || '[]')); } catch { return new Set(); } };
export function marcarVisto(chave) { const s = vistos(); s.add(chave); try { localStorage.setItem(LS, JSON.stringify([...s].slice(-300))); } catch { /* sem armazenamento */ } }

// ---------- Servidor (Cloudflare) ----------
export async function lerCfg() { return (await db.meta.get('onlineCfg')) || null; }
export async function salvarCfg(url, segredo) {
  url = String(url || '').trim().replace(/\/+$/, '');
  await db.meta.put({ chave: 'onlineCfg', url, segredo: String(segredo || '').trim(), atualizadoEm: agora() });
}
async function chamar(cfg, caminho, corpo) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(cfg.url + caminho, { method: corpo === undefined ? 'GET' : 'POST', signal: ctl.signal,
      headers: { 'X-Chave': cfg.segredo, ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'servidor respondeu ' + r.status);
    return j;
  } finally { clearTimeout(t); }
}
export const testar = (cfg) => chamar(cfg, '/status');
export const iniciarML = (cfg) => chamar(cfg, '/ml/iniciar', {});
export const consultar = (cfg, url) => chamar(cfg, '/consultar', { url });

export const estadoOnline = { ultima: null, erro: '' };
// Envia a lista de desejos do ML, recebe histórico e pedidos. Chamado ao abrir o app (no máx. a cada 10 min).
export async function atualizarOnline({ forcar = false } = {}) {
  const cfg = await lerCfg();
  if (!cfg?.url || !cfg?.segredo || !navigator.onLine) return null;
  let ult = 0; try { ult = +sessionStorage.getItem('onlineUlt') || 0; } catch { /* */ }
  if (!forcar && Date.now() - ult < 10 * 60e3) return null;
  try { sessionStorage.setItem('onlineUlt', String(Date.now())); } catch { /* */ }
  const desejos = (await db.oDesejos.toArray()).filter((d) => !d.excluido && !d.compradoEm && d.loja === 'ml' && d.url);
  try {
    const r = await chamar(cfg, '/sync', { desejos: desejos.map((d) => ({ id: d.id, url: d.url })) });
    const existentes = new Set(await db.oPrecos.toCollection().primaryKeys());
    const novos = [];
    for (const [id, pontos] of Object.entries(r.hist || {})) for (const [em, valor, disp] of pontos) {
      const pid = id + '|' + em;
      if (!existentes.has(pid)) novos.push({ id: pid, desejoId: id, em, valor, disp: disp !== false, origem: 'auto', atualizadoEm: em });
    }
    if (novos.length) await db.oPrecos.bulkPut(novos);
    for (const [id, inf] of Object.entries(r.info || {})) {
      const d = desejos.find((x) => x.id === id);
      if (d && inf.titulo && !d.nome) await db.oDesejos.update(id, { nome: inf.titulo, atualizadoEm: agora() });
    }
    estadoOnline.ultima = r.ultima; estadoOnline.erro = r.ultima?.erros?.length ? r.ultima.erros.join(' · ') : '';
    await atualizarPedidosML(cfg);
    return r;
  } catch (e) { estadoOnline.erro = e.message; return null; }
}
async function atualizarPedidosML(cfg) {
  let r; try { r = await chamar(cfg, '/pedidos', {}); } catch (e) { return; }
  if (!r.pedidos) { estadoOnline.pedidosErro = r.erro || ''; return; }
  for (const p of r.pedidos) {
    const id = 'ml-' + p.mlId, atual = await db.oPedidos.get(id);
    const dados = { nome: p.nome, loja: 'ml', valor: p.valor, compra: p.compra, prazo: p.prazo, rastreio: p.rastreio, status: p.status, mlId: p.mlId, origem: 'ml' };
    if (!atual) {
      const extra = p.status === 'entregue' ? { entregueEm: p.entregueEm || p.compra, devolveAte: somaDias(p.entregueEm || p.compra, DIAS_DEVOLUCAO) } : {};
      await db.oPedidos.put({ id, ...dados, ...extra, url: 'https://www.mercadolivre.com.br/minhas-compras', criadoEm: agora(), atualizadoEm: agora(), excluido: false });
    } else if (!atual.excluido && (atual.status !== p.status || atual.prazo !== p.prazo || atual.rastreio !== p.rastreio)) {
      const mud = { status: p.status, prazo: p.prazo || atual.prazo, rastreio: p.rastreio || atual.rastreio, atualizadoEm: agora() };
      if (p.status === 'entregue' && !atual.entregueEm) { mud.entregueEm = p.entregueEm || hojeStr(); mud.devolveAte = somaDias(mud.entregueEm, DIAS_DEVOLUCAO); }
      await db.oPedidos.update(id, mud);
    }
  }
}
