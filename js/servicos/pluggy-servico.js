// Open Finance (Meu Pluggy via servidor Cloudflare): importa movimentações do Nubank e Mercado Pago.
// Nada entra em Finanças sem confirmação: os últimos 30 dias (a partir do início dos registros) vão para a caixa de entrada;
// o restante (até 6 meses) fica como histórico só para análise (categoria editável).
import { db, agora } from '../db.js';
import { hojeStr, somaDias, difDias } from './rotina-servico.js';
import { lerCfg } from './online-servico.js';
import * as F from './fin-servico.js';

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// padrão para regras: texto sem números/símbolos (ex.: "IFOOD *REST 123" → "ifood rest")
export const padraoDe = (s) => norm(s).replace(/parcela\s*\d+\s*\/\s*\d+/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28).trim();
const titulo = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const CATS = [
  [/tarifa|juros|multa|\biof\b|anuidade|encargo|imposto|bank fee|interest|late payment/, 'taxas'],
  [/netflix|spotify|disney|hbo|max\b|prime video|amazon prime|youtube|apple\.com|icloud|google one|claude|anthropic|openai|chatgpt|streaming|assinatura|subscription|digital service/, 'assinaturas'],
  [/supermercad|mercado(?! ?livre| ?pago)|grocer|atacad|hortifrut|padaria|bakery|assai|carrefour|pao de acucar|sacolao|acougue/, 'mercado'],
  [/restaur|ifood|food|lanche|delivery|lanchonete|cafeteria|pizza|burger|mcdonald|bk |sushi|churrasc|bar e /, 'alimentacao'],
  [/uber|\b99\b|99app|taxi|transport|combust|posto|gas station|estaciona|pedagio|sem parar|metro|onibus|ride/, 'transporte'],
  [/farmac|drogaria|droga raia|pague menos|pharma|health|medic|hospital|clinic|laborat|odonto|saude/, 'saude'],
  [/aluguel|condomin|energia|enel|cemig|copel|light|sabesp|saneamento|internet|vivo|claro|\btim\b|housing|rent|utilities|electric/, 'moradia'],
  [/petz|cobasi|petshop|pet shop|veterin|racao|\bpet\b/, 'lua'],
  [/curso|escola|faculd|educa|udemy|alura|coursera|livraria|puc\b/, 'educacao'],
  [/cinema|ingresso|sympla|show|lazer|entertain|leisure|game|steam|playstation|xbox|hotel|airbnb|booking|travel|viagem/, 'lazer'],
  [/shopping|loja|magazine|amazon|mercado ?livre|shopee|aliexpress|americanas|shein|online shopping|clothing|vestu|renner|riachuelo/, 'compras']
];

export async function lerCfgPluggy() { return (await db.meta.get('pluggyCfg')) || { chave: 'pluggyCfg', mapa: {}, regras: [], contas: [] }; }
async function gravarCfg(c) { await db.meta.put({ ...c, chave: 'pluggyCfg', atualizadoEm: agora() }); }

async function chamar(caminho, corpo) {
  const cfg = await lerCfg();
  if (!cfg?.url || !cfg?.segredo) throw new Error('Configure o servidor em Compras › Online › Servidor');
  const r = await fetch(cfg.url + caminho, { method: 'POST', headers: { 'X-Chave': cfg.segredo, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.erro) throw new Error(j.erro || 'servidor respondeu ' + r.status);
  return j;
}

// vínculo automático: conta do banco → conta/cartão do app pelo nome do banco
function sugerirVinculo(item, conta, contas, cartoes) {
  const banco = norm(item.banco + ' ' + conta.nome), achaNome = (lista) => lista.find((x) => !x.excluido && norm(x.nome).split(' ').some((p) => p.length > 2 && banco.includes(p)));
  if (conta.tipo === 'CREDIT') { const k = achaNome(cartoes); return k ? 'k:' + k.id : ''; }
  const c = achaNome(contas.filter((x) => x.pessoa !== 'PJ')); return c ? 'c:' + c.id : '';
}

export const estadoPluggy = { ocupado: false, erro: '', ultima: (() => { try { return localStorage.getItem('pluggyUlt') || ''; } catch { return ''; } })() };

export async function atualizarPluggy() {
  estadoPluggy.ocupado = true; estadoPluggy.erro = '';
  try {
    const cfg = await lerCfgPluggy();
    const r = await chamar('/pluggy/contas');
    const [contas, cartoes] = await Promise.all([db.fContas.toArray(), db.fCartoes.toArray()]);
    const mapa = { ...(cfg.mapa || {}) };
    for (const it of r.itens || []) for (const c of it.contas || []) if (!(c.id in mapa)) mapa[c.id] = sugerirVinculo(it, c, contas, cartoes);
    const info = (r.itens || []).map((it) => ({ ...it, contas: (it.contas || []).map((c) => ({ ...c, banco: it.banco })) }));
    await gravarCfg({ ...cfg, mapa, contas: info });
    const ids = info.flatMap((it) => (it.contas || []).map((c) => c.id));
    const hoje = hojeStr();
    const t = ids.length ? await chamar('/pluggy/transacoes', { desde: somaDias(hoje, -183), contas: ids }) : { transacoes: [] };
    const n = await importar(t.transacoes || [], info, hoje);
    estadoPluggy.ultima = agora(); try { localStorage.setItem('pluggyUlt', estadoPluggy.ultima); } catch { /* */ }
    const erros = info.filter((x) => x.erro).map((x) => x.erro);
    if (erros.length) estadoPluggy.erro = erros.join(' · ');
    return { novas: n, itens: info };
  } catch (e) { estadoPluggy.erro = e.message; throw e; } finally { estadoPluggy.ocupado = false; }
}

async function importar(lista, info, hoje) {
  const inicio = (await db.meta.get('finInicio'))?.data || F.INICIO_PADRAO;
  const limite = [inicio, somaDias(hoje, -30)].sort()[1]; // o mais recente dos dois
  const tipoConta = Object.fromEntries(info.flatMap((it) => (it.contas || []).map((c) => [c.id, { tipo: c.tipo, banco: it.banco, itemId: it.itemId }])));
  const existentes = new Set(await db.fImport.toCollection().primaryKeys());
  const novos = [];
  for (const t of lista) {
    if (!t.id || existentes.has(t.id) || t.status === 'PENDING') continue; // pendentes no banco mudam de id ao compensar
    const tc = tipoConta[t.conta] || {};
    const credito = tc.tipo === 'CREDIT';
    // saída de dinheiro: na conta, débito; no cartão, compra (DEBIT). Se o tipo não vier, usa o sinal.
    const saida = t.tipo ? t.tipo === 'DEBIT' : (credito ? t.valor > 0 : t.valor < 0);
    novos.push({ id: t.id, conta: t.conta, banco: tc.banco || '', tipoConta: tc.tipo || '', data: t.data, descricao: t.descricao || t.descricaoBruta || '', valor: Math.abs(t.valor || 0), moeda: t.moeda || 'BRL',
      saida, categoriaBanco: t.categoria, metodo: t.metodo, contraparte: t.contraparte, parcela: t.parcela, status: t.data >= limite ? 'pendente' : 'historico', categoriaApp: null, lancId: null, criadoEm: agora(), atualizadoEm: agora() });
  }
  if (novos.length) await db.fImport.bulkPut(novos);
  return novos.filter((x) => x.status === 'pendente').length;
}

// ---------- Sugestões para a caixa de entrada ----------
function categoriaPor(texto, saida, categorias) {
  const t = norm(texto), existe = (id) => categorias.find((c) => c.id === id && !c.excluido);
  const comSub = (id) => existe(id + '--0') ? id + '--0' : existe(id) ? id : null;
  if (!saida) return comSub(/rendiment|yield|juros recebid/.test(t) ? 'rendimentos' : /salario|salary|wise|consultoria/.test(t) ? 'consultoria' : 'outros-r');
  for (const [re, id] of CATS) if (re.test(t)) { const c = comSub(id); if (c) return c; }
  return comSub('outros-d');
}
export function aplicaRegra(regras, descricao) { const p = padraoDe(descricao); return (regras || []).find((r) => r.padrao && p.includes(r.padrao)); }

export function sugerir(x, ctx) {
  const { mapa, regras, categorias, cartoes, contas, lancs, importados } = ctx;
  const ref = mapa[x.conta] || '';
  const [t, id] = ref.split(':');
  const regra = aplicaRegra(regras, x.descricao);
  const texto = `${x.categoriaBanco} ${x.descricao} ${x.contraparte}`;
  const s = { tipo: x.saida ? 'desp' : 'rec', origem: ref, categoriaId: regra?.categoriaId || categoriaPor(texto, x.saida, categorias), nome: regra?.nome || titulo(x.contraparte || x.descricao).slice(0, 60),
    parcelas: x.parcela?.n === 1 ? x.parcela.total : 1, valorTotal: x.parcela?.n === 1 && x.parcela.totalValor ? x.parcela.totalValor : x.valor, motivo: regra ? 'regra: ' + regra.padrao : '', transf: null, juntar: null, ignorar: false };
  const d = norm(texto);
  if (t === 'k' && !x.saida && /pagamento|pagto|payment/.test(d)) { s.ignorar = true; s.motivo = 'pagamento recebido na fatura — o lado da conta registra a transferência'; return s; }
  if (t === 'c' && x.saida && /fatura|pagamento.*cart|pgto.*cart|credit card|nu pagamento|cartao de credito/.test(d)) {
    const k = cartoes.find((k) => !k.excluido && (k.contaId === id || norm(k.nome).split(' ')[0] === norm(x.banco).split(' ')[0]));
    if (k) { s.tipo = 'transf'; s.transf = { para: 'f:' + k.id + ':' + F.addMes(F.faturaDe(k, x.data), -1) }; s.motivo = 'parece pagamento da fatura ' + k.nome; return s; }
  }
  const perto = (a, b) => Math.abs(difDias(a, b)) <= 2, mesmo = (v) => Math.abs(v - x.valor) < 0.01;
  // outra conta conectada com o movimento contrário (Pix entre suas contas)
  const par = importados.find((o) => o.id !== x.id && o.conta !== x.conta && o.saida !== x.saida && mesmo(o.valor) && perto(o.data, x.data) && o.status !== 'ignorado');
  if (par && mapa[par.conta]?.startsWith('c:') && t === 'c') {
    s.tipo = 'transf'; s.transf = x.saida ? { para: mapa[par.conta] + ':BRL' } : { de: mapa[par.conta] + ':BRL' }; s.parId = par.id;
    s.motivo = 'Pix entre suas contas (' + par.banco + ')'; return s;
  }
  // lançamento que você já fez à mão (inclusive transferências vindas de C6/Wise)
  const alvo = t === 'c' ? id : null, alvoK = t === 'k' ? id : null;
  const ja = lancs.find((l) => !l.excluido && perto(l.data, x.data) && !importados.some((o) => o.lancId === l.id) && (
    (l.tipo === 'transf' && ((x.saida && l.de?.contaId === alvo && mesmo(l.valorDe)) || (!x.saida && l.para?.contaId === alvo && mesmo(l.valorPara)))) ||
    (l.tipo !== 'transf' && (x.saida ? l.tipo === 'desp' : l.tipo === 'rec') && mesmo(l.valorBRL ?? l.valor) && ((alvo && l.contaId === alvo) || (alvoK && l.cartaoId === alvoK)))));
  if (ja) { s.juntar = ja.id; s.motivo = 'já existe um lançamento igual: ' + (ja.descricao || 'lançamento') + ' (' + ja.data.split('-').reverse().join('/') + ')'; }
  return s;
}

// confirma com o que o usuário editou. e: { tipo, nome, valor, data, origem, destino, categoriaId, parcelas, juntar, criarRegra, padrao }
export async function confirmar(x, e) {
  let lancId = null;
  if (e.juntar) lancId = e.juntar;
  else if (e.tipo === 'transf') {
    const ref = (v) => { const [t, id, m] = String(v || '').split(':'); return t === 'c' ? { contaId: id, moeda: m || 'BRL' } : t === 'x' ? { caixinhaId: id } : t === 'f' ? { cartaoId: id, fatura: m } : null; };
    const de = ref(e.de), para = ref(e.para);
    if (!de || !para) throw new Error('Escolha origem e destino da transferência');
    lancId = await F.transferir({ data: e.data, descricao: e.nome, de, para, valorDe: e.valor, valorPara: e.valor });
  } else {
    const [t, id] = String(e.origem || '').split(':');
    if (!id) throw new Error('Escolha a conta ou o cartão');
    lancId = await F.lancar({ tipo: e.tipo, data: e.data, descricao: e.nome, valor: t === 'k' && e.parcelas > 1 ? e.valorTotal : e.valor, moeda: 'BRL', categoriaId: e.categoriaId,
      contaId: t === 'c' ? id : null, cartaoId: t === 'k' ? id : null, parcelas: t === 'k' ? e.parcelas : 1 });
  }
  await db.fImport.update(x.id, { status: 'confirmado', lancId, grupoChave: x.parcela && e.parcelas > 1 ? chaveParcela(x) : null, atualizadoEm: agora() });
  if (e.parId) await db.fImport.update(e.parId, { status: 'confirmado', lancId, atualizadoEm: agora() });
  if (e.criarRegra && e.padrao && e.categoriaId) await salvarRegra({ padrao: padraoDe(e.padrao), categoriaId: e.categoriaId, nome: e.nome });
  return lancId;
}
export const ignorar = (x) => db.fImport.update(x.id, { status: 'ignorado', atualizadoEm: agora() });
export const desfazer = (x) => db.fImport.update(x.id, { status: 'pendente', lancId: null, atualizadoEm: agora() });

// parcelas seguintes de uma compra já confirmada em grupo não voltam para a caixa
const chaveParcela = (x) => padraoDe(x.descricao) + '|' + x.parcela.total + '|' + (x.parcela.totalValor ?? '') + '|' + (x.parcela.compra || '');
export async function absorverParcelas() {
  const todos = await db.fImport.toArray(), grupos = new Map(todos.filter((x) => x.grupoChave).map((x) => [x.grupoChave, x.lancId]));
  for (const x of todos) if (x.status === 'pendente' && x.parcela?.n > 1 && grupos.has(chaveParcela(x))) await db.fImport.update(x.id, { status: 'confirmado', lancId: grupos.get(chaveParcela(x)), auto: true, atualizadoEm: agora() });
}

export async function salvarRegra(r) {
  const cfg = await lerCfgPluggy();
  const regras = (cfg.regras || []).filter((x) => x.padrao !== r.padrao).concat([{ padrao: r.padrao, categoriaId: r.categoriaId, nome: r.nome || '' }]);
  await gravarCfg({ ...cfg, regras });
  // a regra também corrige o histórico ainda sem categoria escolhida à mão
  const hist = await db.fImport.filter((x) => x.status === 'historico' && !x.categoriaManual && padraoDe(x.descricao).includes(r.padrao)).toArray();
  for (const x of hist) await db.fImport.update(x.id, { categoriaApp: r.categoriaId, atualizadoEm: agora() });
}
export async function excluirRegra(padrao) { const cfg = await lerCfgPluggy(); await gravarCfg({ ...cfg, regras: (cfg.regras || []).filter((x) => x.padrao !== padrao) }); }
export async function categorizarHistorico(x, categoriaId) { await db.fImport.update(x.id, { categoriaApp: categoriaId, categoriaManual: true, atualizadoEm: agora() }); }
export async function salvarVinculo(contaPluggy, ref) { const cfg = await lerCfgPluggy(); await gravarCfg({ ...cfg, mapa: { ...(cfg.mapa || {}), [contaPluggy]: ref } }); }

// ---------- Alertas (histórico + lançamentos confirmados) ----------
export function alertas({ importados, lancs, categorias, fixas, regras, hoje = hojeStr() }) {
  const catPor = Object.fromEntries(categorias.map((c) => [c.id, c]));
  const topo = (id) => { let c = catPor[id]; while (c?.paiId && catPor[c.paiId]) c = catPor[c.paiId]; return c; };
  const lancIds = new Set(importados.map((x) => x.lancId).filter(Boolean));
  // gastos: lançamentos confirmados + histórico (categoria escolhida, regra ou sugestão)
  const gastos = [
    ...lancs.filter((l) => !l.excluido && l.tipo === 'desp').map((l) => ({ data: l.data, valor: l.valorBRL ?? l.valor, cat: topo(l.categoriaId)?.id || 'sem', desc: l.descricao || '' })),
    ...importados.filter((x) => x.status === 'historico' && x.saida && !lancIds.has(x.lancId)).map((x) => ({ data: x.data, valor: x.valor, cat: topo(x.categoriaApp || aplicaRegra(regras, x.descricao)?.categoriaId || categoriaPor(`${x.categoriaBanco} ${x.descricao}`, true, categorias))?.id || 'sem', desc: x.descricao }))
  ];
  const out = [], mes = hoje.slice(0, 7), meses = [1, 2, 3, 4, 5, 6].map((i) => F.addMes(mes, -i));
  const totalCat = (m) => { const t = {}; for (const g of gastos) if (g.data.slice(0, 7) === m) t[g.cat] = (t[g.cat] || 0) + g.valor; return t; };
  const atual = totalCat(mes), ant = meses.map(totalCat);
  const diaMes = +hoje.slice(8, 10), diasMes = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate();
  for (const [cat, v] of Object.entries(atual)) {
    const vs = ant.map((a) => a[cat] || 0).filter((x) => x > 0); if (vs.length < 2) continue;
    const media = vs.reduce((a, b) => a + b, 0) / vs.length, proj = v / diaMes * diasMes;
    if (v > media * 1.3 && v - media > 50) out.push({ chave: `cat|${cat}|${mes}|${Math.round(v / 50)}`, nivel: 'alto', texto: `${catPor[cat]?.nome || 'Sem categoria'}: ${F.fmtR(v)} este mês, ${Math.round((v / media - 1) * 100)}% acima da média de 6 meses (${F.fmtR(media)})` });
    else if (diaMes >= 10 && proj > media * 1.3 && proj - media > 80) out.push({ chave: `proj|${cat}|${mes}`, nivel: 'medio', texto: `${catPor[cat]?.nome || 'Sem categoria'}: no ritmo atual vai fechar o mês em ~${F.fmtR(proj)} (média ${F.fmtR(media)})` });
  }
  const recentes = gastos.filter((g) => difDias(hoje, g.data) <= 30);
  for (const g of recentes) {
    const vs = gastos.filter((o) => o.cat === g.cat && o !== g).map((o) => o.valor).sort((a, b) => a - b);
    if (vs.length < 5) continue;
    const med = vs[Math.floor(vs.length / 2)];
    if (g.valor > med * 3 && g.valor > 100) out.push({ chave: `fora|${g.data}|${g.valor}|${padraoDe(g.desc)}`, nivel: 'medio', texto: `Gasto fora do padrão: ${titulo(g.desc) || 'lançamento'} ${F.fmtR(g.valor)} em ${g.data.split('-').reverse().join('/')} (normal em ${catPor[g.cat]?.nome || 'categoria'}: ~${F.fmtR(med)})` });
  }
  const saidas = importados.filter((x) => x.saida && x.status !== 'ignorado');
  for (const x of saidas.filter((x) => difDias(hoje, x.data) <= 30)) {
    const dup = saidas.find((o) => o.id < x.id && o.conta === x.conta && Math.abs(o.valor - x.valor) < 0.01 && padraoDe(o.descricao) === padraoDe(x.descricao) && Math.abs(difDias(o.data, x.data)) <= 2 && !(x.parcela || o.parcela));
    if (dup) out.push({ chave: `dup|${dup.id}|${x.id}`, nivel: 'alto', texto: `Possível cobrança duplicada: ${titulo(x.descricao)} ${F.fmtR(x.valor)} (${dup.data.split('-').reverse().join('/')} e ${x.data.split('-').reverse().join('/')})` });
    if (/tarifa|juros|multa|\biof\b|anuidade|encargo/.test(norm(x.descricao))) out.push({ chave: `taxa|${x.id}`, nivel: 'medio', texto: `Cobrança do banco: ${titulo(x.descricao)} ${F.fmtR(x.valor)} (${x.data.split('-').reverse().join('/')})` });
  }
  // recorrências mensais que ainda não estão em Assinaturas/contas fixas
  const porPadrao = {};
  for (const x of saidas) { const p = padraoDe(x.descricao); if (p.length >= 4 && !x.parcela) (porPadrao[p] ||= []).push(x); }
  const nomesFixas = fixas.filter((f) => !f.excluido).map((f) => ({ f, p: padraoDe(f.nome) }));
  for (const [p, xs] of Object.entries(porPadrao)) {
    const ms = [...new Set(xs.map((x) => x.data.slice(0, 7)))];
    if (ms.length < 3) continue;
    const vals = xs.map((x) => x.valor), med = vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)];
    if (vals.some((v) => Math.abs(v - med) > med * 0.15)) continue;
    const fx = nomesFixas.find((n) => n.p && (p.includes(n.p) || n.p.includes(p.split(' ')[0])));
    const ult = xs.sort((a, b) => b.data.localeCompare(a.data))[0];
    if (!fx) out.push({ chave: `rec|${p}`, nivel: 'info', texto: `Parece assinatura não cadastrada: ${titulo(ult.descricao)} (~${F.fmtR(med)}/mês, ${ms.length} meses)`, acao: 'assinatura', nome: titulo(ult.descricao), valor: med });
    else if (fx.f.assinatura && ult.valor > (fx.f.moeda === 'USD' ? Infinity : fx.f.valor * 1.05)) out.push({ chave: `caro|${fx.f.id}|${ult.valor}`, nivel: 'medio', texto: `${fx.f.nome} ficou mais cara: ${F.fmtR(ult.valor)} (cadastrada: ${F.fmtR(fx.f.valor)})` });
  }
  return out;
}
