// Regras do módulo Finanças (sem interface).
// Visões: Pessoal (contas PF; receita = retiradas PJ→PF) · Empresa (contas PJ; retiradas = "distribuído") · Tudo (ignora PJ↔PF).
import { db, uid, agora, r3 } from '../db.js';
import { ds, pd, hojeStr, somaDias } from './rotina-servico.js';

const SEMENTE = '2026-11-25T00:00:00.000Z';
export const INICIO_PADRAO = '2026-12-01';
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const fmtR = (n, dec = 2) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const fmtU = (n) => 'US$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const mesDe = (s) => s.slice(0, 7);
export const addMes = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const nomeMes = (m) => { const t = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
const diasNoMes = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
const diaSeguro = (m, dia) => `${m}-${String(Math.min(dia, diasNoMes(m))).padStart(2, '0')}`;

// Cores das contas (estilo cartão) — próprias, inspiradas nas cores de cada banco
export const ESTILOS_CONTA = {
  roxo: 'linear-gradient(135deg, #7A1FC2, #3E0C6E)', azul: 'linear-gradient(135deg, #0B8FD4, #054B78)',
  verde: 'linear-gradient(135deg, #8DD663, #3F7A22)', grafite: 'linear-gradient(135deg, #3A3F48, #12151A)',
  laranja: 'linear-gradient(135deg, #FF8A3D, #B84A0B)', marinho: 'linear-gradient(135deg, #3A3550, #1C1F1E)',
  vermelho: 'linear-gradient(135deg, #E04848, #7E1A1A)', dourado: 'linear-gradient(135deg, #D4AF37, #7A5E12)'
};
export const ESTILO_ESCURO = new Set(['verde', 'dourado']); // texto escuro nesses fundos
export const tom = (hue, i = 0) => `hsl(${hue}, 68%, ${Math.max(28, 60 - i * 11)}%)`;

// ---------- Dados iniciais (ids fixos; data antiga = edições reais sempre vencem na sincronização) ----------
export async function garantirFinancas() {
  if (await db.fContas.get('c-nubank')) return;
  const b = { atualizadoEm: SEMENTE, excluido: false };
  const contas = [
    ['c-nubank', 'Nubank', 'PF', ['BRL'], 'roxo'], ['c-mp', 'Mercado Pago', 'PF', ['BRL'], 'azul'], ['c-wise-pf', 'Wise PF', 'PF', ['BRL', 'USD'], 'verde'],
    ['c-c6', 'C6 PJ', 'PJ', ['BRL'], 'grafite'], ['c-wise-pj', 'Wise PJ', 'PJ', ['BRL', 'USD'], 'verde']
  ];
  const cats = [
    // [id, nome, tipo, hue, subcategorias, pj]
    ['moradia', 'Moradia', 'desp', 265, ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Internet']],
    ['mercado', 'Mercado', 'desp', 150, ['Supermercado', 'Feira', 'Açougue']],
    ['alimentacao', 'Alimentação fora', 'desp', 20, ['Restaurante', 'Delivery', 'Café']],
    ['transporte', 'Transporte', 'desp', 210, ['Uber', 'Combustível', 'Ônibus']],
    ['saude', 'Saúde', 'desp', 0, ['Farmácia', 'Consultas', 'Plano de saúde']],
    ['lua', 'Lua (pet)', 'desp', 35, ['Ração', 'Remédios', 'Veterinário', 'Banho']],
    ['educacao', 'Educação', 'desp', 190, ['Pós-graduação', 'Livros', 'Cursos']],
    ['lazer', 'Lazer', 'desp', 300, ['Viagem', 'Passeios', 'Jogos']],
    ['assinaturas', 'Assinaturas', 'desp', 330, ['Streaming', 'Apps', 'IA']],
    ['compras', 'Compras', 'desp', 280, ['Roupas', 'Eletrônicos', 'Casa']],
    ['taxas', 'Taxas e impostos', 'desp', 55, ['IOF', 'Tarifas']],
    ['empresa', 'Empresa', 'desp', 45, ['Impostos', 'Contador', 'Taxas'], true],
    ['outros-d', 'Outros', 'desp', 220, []],
    ['consultoria', 'Consultoria', 'rec', 160, ['Salário']],
    ['outros-trab', 'Outros trabalhos', 'rec', 120, []],
    ['rendimentos', 'Rendimentos', 'rec', 95, ['Caixinhas']],
    ['reembolsos', 'Reembolsos', 'rec', 75, []],
    ['outros-r', 'Outros', 'rec', 230, []]
  ];
  await db.transaction('rw', ['fContas', 'fCartoes', 'fCategorias', 'meta'], async () => {
    let o = 0;
    for (const [id, nome, pessoa, moedas, estilo] of contas) await db.fContas.put({ id, nome, pessoa, moedas, estilo, saldoInicial: { BRL: 0, USD: 0 }, ordem: o++, ...b });
    await db.fCartoes.put({ id: 'k-nubank', nome: 'Nubank Croma', contaId: 'c-nubank', limite: 0, fechamento: null, vencimento: null, estilo: 'roxo', ...b });
    await db.fCartoes.put({ id: 'k-mp', nome: 'Mercado Pago', contaId: 'c-mp', limite: 0, fechamento: null, vencimento: null, estilo: 'azul', ...b });
    o = 0;
    for (const [id, nome, tipo, hue, subs, pj] of cats) {
      await db.fCategorias.put({ id, nome, tipo, hue, paiId: null, orcamento: 0, pj: !!pj, ordem: o++, ...b });
      let i = 0;
      for (const sn of subs) await db.fCategorias.put({ id: `${id}--${i}`, nome: sn, tipo, hue, paiId: id, orcamento: 0, pj: !!pj, ordem: i++, ...b });
    }
    if (!(await db.meta.get('finInicio'))) await db.meta.put({ chave: 'finInicio', data: INICIO_PADRAO, atualizadoEm: SEMENTE });
  });
}

// ---------- Cotação do dólar (serviço público gratuito; guardada por dia; editável) ----------
export async function cotacaoDolar() {
  const h = hojeStr();
  try { const c = JSON.parse(localStorage.getItem('cotacaoUSD') || 'null'); if (c && c.data === h) return c; } catch { /* sem cache */ }
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { cache: 'no-store' });
    const j = await r.json(); const v = parseFloat(j.USDBRL.bid);
    if (v > 0) { const c = { data: h, valor: r3(v), fonte: 'AwesomeAPI' }; localStorage.setItem('cotacaoUSD', JSON.stringify(c)); return c; }
  } catch { /* offline: usa a última conhecida */ }
  try { const c = JSON.parse(localStorage.getItem('cotacaoUSD') || 'null'); if (c) return { ...c, antiga: true }; } catch { /* nada */ }
  return { data: h, valor: 5.3, fonte: 'padrão', antiga: true };
}

// ---------- Cartão: em qual fatura cai uma compra ----------
// Compra até o dia anterior ao fechamento → fatura que fecha neste mês; no dia do fechamento ou depois → próxima.
export function faturaDe(cartao, data) {
  const m = mesDe(data), d = +data.slice(8, 10), f = cartao.fechamento || 1;
  return d >= f ? addMes(m, 1) : m;
}
export function vencimentoDe(cartao, fatura) {
  const f = cartao.fechamento || 1, v = cartao.vencimento || 10;
  return diaSeguro(v > f ? fatura : addMes(fatura, 1), v);
}

// ---------- Gravação ----------
const toque = () => ({ atualizadoEm: agora() });
// dados: { tipo: 'desp'|'rec', data, descricao, valor, moeda, cotacao, categoriaId, contaId | cartaoId, parcelas, fixaId }
export async function lancar(d) {
  const base = { tipo: d.tipo, descricao: d.descricao.trim(), categoriaId: d.categoriaId || null, fixaId: d.fixaId || null, ...toque(), excluido: false };
  if (d.cartaoId) {
    const cartao = await db.fCartoes.get(d.cartaoId);
    const n = Math.max(1, parseInt(d.parcelas || 1, 10)), grupoId = uid(); let primeiro = null;
    const total = r2(d.valor), parc = r2(total / n);
    for (let i = 0; i < n; i++) {
      const idL = uid(); if (i === 0) primeiro = idL;
      const valor = i === n - 1 ? r2(total - parc * (n - 1)) : parc; // última parcela ajusta os centavos
      const fatura = addMes(faturaDe(cartao, d.data), i);
      await db.fLanc.add({ id: idL, ...base, data: i === 0 ? d.data : diaSeguro(addMes(mesDe(d.data), i), +d.data.slice(8, 10)), valor, moeda: 'BRL', valorBRL: valor,
        cartaoId: d.cartaoId, fatura, grupoId: n > 1 ? grupoId : null, parcela: n > 1 ? { n: i + 1, total: n, grupoId } : null });
    }
    return primeiro;
  }
  const moeda = d.moeda || 'BRL', valor = r2(d.valor), cot = moeda === 'USD' ? r3(d.cotacao || 0) : 1;
  const id = uid();
  await db.fLanc.add({ id, ...base, data: d.data, valor, moeda, cotacao: moeda === 'USD' ? cot : null, valorBRL: r2(valor * cot), contaId: d.contaId });
  return id;
}
// Transferência: origem/destino podem ser conta (com moeda), caixinha ou cartão (pagamento de fatura)
// d: { data, descricao, de: {contaId, moeda} | {caixinhaId}, para: {contaId, moeda} | {caixinhaId} | {cartaoId, fatura}, valorDe, valorPara }
export async function transferir(d) {
  const id = uid();
  await db.fLanc.add({ id, tipo: 'transf', data: d.data, descricao: (d.descricao || '').trim() || 'Transferência', de: d.de, para: d.para,
    valorDe: r2(d.valorDe), valorPara: r2(d.valorPara ?? d.valorDe), fixaId: d.fixaId || null, ...toque(), excluido: false });
  return id;
}
export async function excluirLanc(l) {
  const ids = l.parcela?.grupoId ? (await db.fLanc.where('grupoId').equals(l.parcela.grupoId).toArray()).map((x) => x.id) : [l.id];
  for (const id of ids) await db.fLanc.update(id, { excluido: true, ...toque() });
}
export const salvar = {
  conta: async (c) => c.id && (await db.fContas.get(c.id)) ? db.fContas.update(c.id, { ...c, ...toque() }) : db.fContas.add({ ...c, id: c.id || uid(), ordem: c.ordem ?? 99, ...toque(), excluido: false }),
  cartao: async (k) => k.id && (await db.fCartoes.get(k.id)) ? db.fCartoes.update(k.id, { ...k, ...toque() }) : db.fCartoes.add({ ...k, id: k.id || uid(), ...toque(), excluido: false }),
  categoria: async (c) => c.id && (await db.fCategorias.get(c.id)) ? db.fCategorias.update(c.id, { ...c, ...toque() }) : db.fCategorias.add({ ...c, id: c.id || uid(), ordem: c.ordem ?? 99, ...toque(), excluido: false }),
  caixinha: async (x) => x.id && (await db.fCaixinhas.get(x.id)) ? db.fCaixinhas.update(x.id, { ...x, ...toque() }) : db.fCaixinhas.add({ ...x, id: x.id || uid(), ...toque(), excluido: false }),
  fixa: async (f) => f.id && (await db.fFixas.get(f.id)) ? db.fFixas.update(f.id, { ...f, ...toque() }) : db.fFixas.add({ ...f, id: f.id || uid(), ...toque(), excluido: false })
};
export const excluir = (tabela, id) => db.table(tabela).update(id, { excluido: true, ...toque() });

// ---------- PIN (só neste aparelho; proteção visual) ----------
async function hash(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('org-pin:' + t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
export const temPin = () => !!localStorage.getItem('finPin');
export async function definirPin(p) { localStorage.setItem('finPin', await hash(p)); }
export async function conferirPin(p) { return (await hash(p)) === localStorage.getItem('finPin'); }
export function removerPin() { localStorage.removeItem('finPin'); }
export const desbloqueadoRecente = () => Date.now() - (+sessionStorage.getItem('finDesbloq') || 0) < 5 * 60000;
export const marcarDesbloqueio = () => sessionStorage.setItem('finDesbloq', String(Date.now()));

// ---------- Cálculos ----------
// D: { contas, cartoes, categorias, caixinhas, fixas, lancs, cotacao, hoje, inicio }
export function criarFin(D, visao = 'pf', mes = mesDe(D.hoje)) {
  const vivo = (x) => !x.excluido;
  const contas = D.contas.filter(vivo).sort((a, b) => a.ordem - b.ordem);
  const contaPor = Object.fromEntries(contas.map((c) => [c.id, c]));
  const cartoes = D.cartoes.filter(vivo);
  const cartaoPor = Object.fromEntries(cartoes.map((k) => [k.id, k]));
  const caixinhas = D.caixinhas.filter(vivo);
  const caixaPor = Object.fromEntries(caixinhas.map((x) => [x.id, x]));
  const cats = D.categorias.filter(vivo);
  const catPor = Object.fromEntries(cats.map((c) => [c.id, c]));
  const topo = (id) => { let c = catPor[id]; while (c?.paiId && catPor[c.paiId]) c = catPor[c.paiId]; return c; };
  const L = D.lancs.filter((l) => vivo(l) && l.data >= (D.inicio || '0000'));
  const cot = D.cotacao || 5.3;
  const pessoaDe = (ref) => ref?.contaId ? contaPor[ref.contaId]?.pessoa : ref?.caixinhaId ? contaPor[caixaPor[ref.caixinhaId]?.contaId]?.pessoa : ref?.cartaoId ? contaPor[cartaoPor[ref.cartaoId]?.contaId]?.pessoa || 'PF' : null;
  const pessoaLanc = (l) => l.tipo === 'transf' ? null : l.cartaoId ? (contaPor[cartaoPor[l.cartaoId]?.contaId]?.pessoa || 'PF') : contaPor[l.contaId]?.pessoa;
  const naVisao = (p) => visao === 'tudo' || (visao === 'pf' ? p === 'PF' : p === 'PJ');

  // Saldos de contas (por moeda) e caixinhas
  const saldo = {}; for (const c of contas) saldo[c.id] = { BRL: c.saldoInicial?.BRL || 0, USD: c.saldoInicial?.USD || 0 };
  const saldoCx = {}; for (const x of caixinhas) saldoCx[x.id] = x.saldoInicial || 0;
  const pagoCartao = {}, gastoCartao = {}, porFatura = {};
  for (const l of L) {
    if (l.tipo === 'transf') {
      if (l.de?.contaId && saldo[l.de.contaId]) saldo[l.de.contaId][l.de.moeda || 'BRL'] -= l.valorDe;
      if (l.de?.caixinhaId && saldoCx[l.de.caixinhaId] != null) saldoCx[l.de.caixinhaId] -= l.valorDe;
      if (l.para?.contaId && saldo[l.para.contaId]) saldo[l.para.contaId][l.para.moeda || 'BRL'] += l.valorPara;
      if (l.para?.caixinhaId && saldoCx[l.para.caixinhaId] != null) saldoCx[l.para.caixinhaId] += l.valorPara;
      if (l.para?.cartaoId) { pagoCartao[l.para.cartaoId] = (pagoCartao[l.para.cartaoId] || 0) + l.valorPara; const k = `${l.para.cartaoId}|${l.para.fatura}`; porFatura[k] = porFatura[k] || { gasto: 0, pago: 0 }; porFatura[k].pago += l.valorPara; }
    } else if (l.cartaoId) {
      const sinal = l.tipo === 'rec' ? -1 : 1; // estorno no cartão reduz a fatura
      gastoCartao[l.cartaoId] = (gastoCartao[l.cartaoId] || 0) + sinal * l.valor;
      const k = `${l.cartaoId}|${l.fatura}`; porFatura[k] = porFatura[k] || { gasto: 0, pago: 0 }; porFatura[k].gasto += sinal * l.valor;
    } else if (l.contaId && saldo[l.contaId]) {
      saldo[l.contaId][l.moeda || 'BRL'] += (l.tipo === 'rec' ? 1 : -1) * l.valor;
    }
  }
  const contasV = contas.filter((c) => naVisao(c.pessoa)).map((c) => {
    const s = saldo[c.id]; const cx = caixinhas.filter((x) => x.contaId === c.id).map((x) => ({ ...x, saldo: r2(saldoCx[x.id]) }));
    return { ...c, brl: r2(s.BRL), usd: r2(s.USD), totalBRL: r2(s.BRL + s.USD * cot), caixinhas: cx, totalCx: r2(cx.reduce((a, x) => a + x.saldo, 0)) };
  });
  const saldoTotal = r2(contasV.reduce((a, c) => a + c.totalBRL + c.totalCx, 0));

  // Cartões
  const mesHoje = mesDe(D.hoje);
  const cartoesV = cartoes.filter((k) => naVisao(contaPor[k.contaId]?.pessoa || 'PF')).map((k) => {
    const usado = r2((gastoCartao[k.id] || 0) - (pagoCartao[k.id] || 0));
    const aberta = k.fechamento ? faturaDe(k, D.hoje) : mesHoje;
    const fa = porFatura[`${k.id}|${aberta}`] || { gasto: 0, pago: 0 };
    const anterior = porFatura[`${k.id}|${addMes(aberta, -1)}`] || { gasto: 0, pago: 0 };
    return { ...k, usado, pct: k.limite > 0 ? Math.round(usado / k.limite * 100) : null, livre: k.limite > 0 ? r2(k.limite - usado) : null,
      aberta, faturaAberta: r2(fa.gasto - fa.pago), vencAberta: k.fechamento ? vencimentoDe(k, aberta) : null,
      anteriorPendente: r2(anterior.gasto - anterior.pago), vencAnterior: k.fechamento ? vencimentoDe(k, addMes(aberta, -1)) : null, configurado: !!(k.fechamento && k.vencimento) };
  });

  // Mês: receitas, despesas, retiradas
  const doMes = L.filter((l) => mesDe(l.data) === mes);
  let receitas = 0, despesas = 0, retiradas = 0, aportes = 0;
  const porCat = {};
  for (const l of doMes) {
    if (l.tipo === 'transf') {
      const pDe = pessoaDe(l.de), pPara = pessoaDe(l.para);
      if (pDe === 'PJ' && pPara === 'PF' && !l.para?.cartaoId) retiradas += l.para?.moeda === 'USD' ? l.valorPara * cot : l.valorPara;
      if (pDe === 'PF' && pPara === 'PJ' && !l.para?.cartaoId) aportes += l.valorDe;
      continue;
    }
    if (!naVisao(pessoaLanc(l))) continue;
    const v = l.valorBRL ?? l.valor;
    if (l.tipo === 'rec') receitas += v; else despesas += v;
    if (l.tipo === 'desp') { const t = topo(l.categoriaId); const k = t?.id || 'sem'; (porCat[k] ||= { total: 0, subs: {} }).total += v; const sub = catPor[l.categoriaId]?.paiId ? l.categoriaId : '_'; porCat[k].subs[sub] = (porCat[k].subs[sub] || 0) + v; }
  }
  const entradas = visao === 'pf' ? receitas + retiradas : visao === 'pj' ? receitas + aportes : receitas;
  const resultado = r2(entradas - despesas);
  const categoriasV = cats.filter((c) => !c.paiId && c.tipo === 'desp' && (visao === 'tudo' || (visao === 'pj') === !!c.pj || (porCat[c.id]?.total > 0)))
    .map((c) => { const x = porCat[c.id] || { total: 0, subs: {} }; const subs = cats.filter((s) => s.paiId === c.id).sort((a, b) => a.ordem - b.ordem);
      return { ...c, total: r2(x.total), pct: c.orcamento > 0 ? Math.round(x.total / c.orcamento * 100) : null,
        subs: [...subs.map((s, i) => ({ id: s.id, nome: s.nome, total: r2(x.subs[s.id] || 0), cor: tom(c.hue, i + 1) })), ...(x.subs._ ? [{ id: '_', nome: 'Sem subcategoria', total: r2(x.subs._), cor: tom(c.hue, 0) }] : [])].filter((s) => s.total > 0) }; })
    .sort((a, b) => b.total - a.total);
  if (porCat.sem) categoriasV.push({ id: 'sem', nome: 'Sem categoria', hue: 220, total: r2(porCat.sem.total), subs: [], pct: null });

  // Contas fixas do mês (a pagar / a receber)
  const fixas = D.fixas.filter(vivo).filter((f) => noMes(f, mes)).filter((f) => naVisao(f.cartaoId ? (contaPor[cartaoPor[f.cartaoId]?.contaId]?.pessoa || 'PF') : contaPor[f.contaId]?.pessoa)).map((f) => {
    const venc = diaSeguro(mes, f.dia || 1);
    const pago = L.some((l) => l.fixaId === f.id && mesDe(l.data) === mes);
    return { ...f, venc, pago, atrasada: !pago && venc < D.hoje, hoje: !pago && venc === D.hoje };
  }).sort((a, b) => a.venc.localeCompare(b.venc));

  // Ampulheta, fôlego e projeção
  const dias = diasNoMes(mes), diaHoje = mes === mesHoje ? +D.hoje.slice(8, 10) : mes < mesHoje ? dias : 0;
  const pctMes = Math.round(diaHoje / dias * 100);
  const resta = entradas > 0 ? Math.max(0, Math.min(1, resultado / entradas)) : 0;
  const ult3 = [1, 2, 3].map((i) => addMes(mesHoje, -i));
  const despMes = (m) => L.filter((l) => l.tipo === 'desp' && mesDe(l.data) === m && naVisao(pessoaLanc(l))).reduce((a, l) => a + (l.valorBRL ?? l.valor), 0);
  const hist = ult3.map(despMes).filter((x) => x > 0);
  const mediaDesp = hist.length ? hist.reduce((a, x) => a + x, 0) / hist.length : (diaHoje > 0 ? despesas / diaHoje * dias : 0);
  const folego = mediaDesp > 0 ? r2(saldoTotal / mediaDesp) : null;
  let projecao = null;
  if (mes === mesHoje) {
    const pend = fixas.filter((f) => !f.pago).reduce((a, f) => a + (f.tipo === 'rec' ? 1 : -1) * (f.moeda === 'USD' ? f.valor * cot : f.valor), 0);
    const variavelDia = diaHoje > 0 ? despesas / diaHoje : 0;
    const fim = r2(saldoTotal + pend - variavelDia * (dias - diaHoje) * 0.6);
    projecao = { fim, min: r2(fim - Math.abs(fim - saldoTotal) * 0.5 - mediaDesp * 0.05), max: r2(fim + Math.abs(fim - saldoTotal) * 0.3 + mediaDesp * 0.05), diaHoje, dias };
  }
  // 6 meses
  const seis = [-5, -4, -3, -2, -1, 0].map((i) => { const m = addMes(mes, i); const doM = L.filter((l) => mesDe(l.data) === m && l.tipo !== 'transf' && naVisao(pessoaLanc(l)));
    return { m, rec: r2(doM.filter((l) => l.tipo === 'rec').reduce((a, l) => a + (l.valorBRL ?? l.valor), 0)), desp: r2(doM.filter((l) => l.tipo === 'desp').reduce((a, l) => a + (l.valorBRL ?? l.valor), 0)) }; });

  // Lançamentos do mês (visíveis na visão)
  const descLanc = (l) => {
    const nomeRef = (r) => r?.contaId ? contaPor[r.contaId]?.nome + ((contaPor[r.contaId]?.moedas || []).length > 1 ? (r.moeda === 'USD' ? ' · US$' : ' · R$') : '') : r?.caixinhaId ? '▣ ' + (caixaPor[r.caixinhaId]?.nome || 'caixinha') : r?.cartaoId ? 'fatura ' + (cartaoPor[r.cartaoId]?.nome || '') : '?';
    if (l.tipo === 'transf') return nomeRef(l.de) + ' → ' + nomeRef(l.para);
    const c = catPor[l.categoriaId], t = topo(l.categoriaId);
    return (t ? t.nome + (c && c.id !== t.id ? ' › ' + c.nome : '') : 'Sem categoria') + ' · ' + (l.cartaoId ? cartaoPor[l.cartaoId]?.nome : contaPor[l.contaId]?.nome) + (l.parcela ? ` · ${l.parcela.n}/${l.parcela.total}` : '');
  };
  const lancsMes = doMes.filter((l) => l.tipo === 'transf' ? (visao === 'tudo' || naVisao(pessoaDe(l.de)) || naVisao(pessoaDe(l.para))) : naVisao(pessoaLanc(l)))
    .sort((a, b) => b.data.localeCompare(a.data) || b.atualizadoEm.localeCompare(a.atualizadoEm))
    .map((l) => { const t = topo(l.categoriaId); return { ...l, sub: descLanc(l), cor: l.tipo === 'transf' ? '#C4B5FD' : t ? tom(t.hue, 0) : l.tipo === 'rec' ? '#3FD0A0' : '#94A3BF',
      mostra: l.tipo === 'transf' ? l.valorDe : (l.valorBRL ?? l.valor), moedaTxt: l.tipo !== 'transf' && l.moeda === 'USD' ? fmtU(l.valor) : (l.tipo === 'transf' && l.de?.moeda === 'USD' ? fmtU(l.valorDe) + ' → ' + fmtR(l.valorPara) : '') }; });

  // Metas (caixinhas com meta)
  const metas = caixinhas.filter((x) => naVisao(contaPor[x.contaId]?.pessoa)).map((x) => {
    const s = r2(saldoCx[x.id]); const dep = L.filter((l) => l.tipo === 'transf' && l.para?.caixinhaId === x.id && l.data >= somaDias(D.hoje, -90)).reduce((a, l) => a + l.valorPara, 0) / 3;
    return { ...x, saldo: s, conta: contaPor[x.contaId]?.nome, pct: x.meta > 0 ? Math.min(100, Math.round(s / x.meta * 100)) : null, mesesFalta: x.meta > s && dep > 0 ? Math.ceil((x.meta - s) / dep) : null };
  });

  // Frequentes: combinações mais usadas nos últimos 90 dias
  const cont = {};
  for (const l of L) if (l.tipo === 'desp' && l.data >= somaDias(D.hoje, -90) && (!l.parcela || l.parcela.n === 1)) { const k = [l.descricao, l.categoriaId, l.contaId || '', l.cartaoId || ''].join('|'); (cont[k] ||= { n: 0, l }).n++; }
  const frequentes = Object.values(cont).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 4).map((x) => x.l);

  return { contas: contasV, todasContas: contas, cartoes: cartoesV, todosCartoes: cartoes, caixinhas, categorias: cats, catPor, topo, saldoTotal, receitas: r2(receitas), retiradas: r2(retiradas), entradas: r2(entradas),
    despesas: r2(despesas), resultado, categoriasV, fixas, pctMes, resta, folego, mediaDesp: r2(mediaDesp), projecao, seis, lancsMes, metas, frequentes, cot, mes };
}

// Conta fixa anual só aparece no mês de renovação
export const noMes = (f, mes) => f.periodo !== 'anual' || +mes.slice(5, 7) === +(f.mesAnual || 1);
// Valor em R$ de uma conta fixa (US$ convertido pela cotação do dia)
export const valorBRLFixa = (f, cot) => f.moeda === 'USD' ? f.valor * (cot || 0) : f.valor;
// Assinaturas: próxima renovação, dias até lá, custo mensal equivalente e anual
export function assinaturas(fixas, lancs, cot, hoje = hojeStr()) {
  const lista = fixas.filter((f) => !f.excluido && f.assinatura).map((f) => {
    let prox;
    if (f.periodo === 'anual') {
      const mm = String(f.mesAnual || 1).padStart(2, '0');
      prox = diaSeguro(hoje.slice(0, 4) + '-' + mm, f.dia || 1);
      if (prox < hoje) prox = diaSeguro((+hoje.slice(0, 4) + 1) + '-' + mm, f.dia || 1);
    } else {
      prox = diaSeguro(mesDe(hoje), f.dia || 1);
      const pagoMes = lancs.some((l) => !l.excluido && l.fixaId === f.id && mesDe(l.data) === mesDe(hoje));
      if (prox < hoje || pagoMes) prox = diaSeguro(addMes(mesDe(hoje), 1), f.dia || 1);
    }
    const brl = valorBRLFixa(f, cot), mensal = f.periodo === 'anual' ? brl / 12 : brl;
    const dias = Math.round((pd(prox) - pd(hoje)) / 864e5);
    return { ...f, prox, dias, brl, mensal, anual: f.periodo === 'anual' ? brl : brl * 12, aviso: dias <= (f.periodo === 'anual' ? 30 : 7) };
  }).sort((a, b) => a.prox.localeCompare(b.prox));
  return { lista, mensal: lista.reduce((s, a) => s + a.mensal, 0), anual: lista.reduce((s, a) => s + a.anual, 0) };
}

// Contas fixas não pagas que vencem hoje (lembrete na Rotina; não entra nos percentuais)
export function fixasDeHoje(fixas, lancs, hoje = hojeStr()) {
  const m = mesDe(hoje);
  return fixas.filter((f) => !f.excluido && f.tipo !== 'rec' && noMes(f, m) && diaSeguro(m, f.dia || 1) === hoje && !lancs.some((l) => !l.excluido && l.fixaId === f.id && mesDe(l.data) === m));
}
export { pd, ds };
