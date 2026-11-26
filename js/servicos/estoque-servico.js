// Regras de negócio do Estoque + Lista de compras (sem interface).
import { db, uid, agora, r3 } from '../db.js';

const TABELAS = ['categorias', 'itens', 'movimentos', 'lista'];

export async function saldoDe(itemId) {
  const movs = await db.movimentos.where('itemId').equals(itemId).toArray();
  return r3(movs.reduce((s, m) => s + m.delta, 0));
}

export async function mapaSaldos() {
  const mapa = {};
  await db.movimentos.each((m) => { mapa[m.itemId] = (mapa[m.itemId] || 0) + m.delta; });
  for (const k in mapa) mapa[k] = r3(mapa[k]);
  return mapa;
}

async function pendenteDoItem(itemId) {
  return db.lista.where('itemId').equals(itemId)
    .filter((l) => l.status === 'pendente' && !l.excluido).first();
}

async function addMov(itemId, delta, tipo) {
  await db.movimentos.add({ id: uid(), itemId, delta: r3(delta), tipo, data: agora() });
}

// Se saldo = 0 e não está na lista -> cria entrada automática. Retorna true se criou.
async function verificarZerado(item) {
  const saldo = await saldoDe(item.id);
  if (saldo > 0 || await pendenteDoItem(item.id)) return false;
  await db.lista.add({
    id: uid(), itemId: item.id, nome: item.nome, qtd: item.qtdReposicaoPadrao || 1,
    unidade: item.unidade, origem: 'auto', status: 'pendente', atualizadoEm: agora(), excluido: false
  });
  return true;
}

async function tirarDaLista(itemId) {
  const pend = await db.lista.where('itemId').equals(itemId)
    .filter((l) => l.status === 'pendente' && !l.excluido).toArray();
  for (const l of pend) await db.lista.update(l.id, { excluido: true, atualizadoEm: agora() });
  return pend.length > 0;
}

// Baixa manual. Retorna { baixado, zerou }
export async function darBaixa(itemId, qtd) {
  return db.transaction('rw', TABELAS, async () => {
    const item = await db.itens.get(itemId);
    const saldo = await saldoDe(itemId);
    if (!item || saldo <= 0 || !(qtd > 0)) return { baixado: 0, zerou: false };
    const q = Math.min(qtd, saldo);
    await addMov(itemId, -q, 'baixa');
    const zerou = await verificarZerado(item);
    return { baixado: r3(q), zerou };
  });
}

// Reposição feita direto no estoque -> sai da lista. Retorna { saiuDaLista }
export async function repor(itemId, qtd) {
  return db.transaction('rw', TABELAS, async () => {
    if (!(qtd > 0)) return { saiuDaLista: false };
    await addMov(itemId, qtd, 'reposicao');
    return { saiuDaLista: await tirarDaLista(itemId) };
  });
}

// Marca item da lista como comprado. Retorna { precisaCadastro } para item manual.
export async function comprar(entradaId) {
  return db.transaction('rw', TABELAS, async () => {
    const l = await db.lista.get(entradaId);
    if (!l || l.status !== 'pendente') return { precisaCadastro: false };
    if (!l.itemId || !(await db.itens.get(l.itemId))) return { precisaCadastro: true, entrada: l };
    await addMov(l.itemId, l.qtd, 'reposicao');
    await db.lista.update(l.id, { status: 'comprado', atualizadoEm: agora() });
    return { precisaCadastro: false };
  });
}

// Item manual comprado: cadastrar no estoque (sim) ou só tirar da lista (não).
export async function resolverManual(entradaId, cadastrar, { categoriaId = null, unidade } = {}) {
  return db.transaction('rw', TABELAS, async () => {
    const l = await db.lista.get(entradaId);
    if (!l) return;
    if (cadastrar) {
      const id = uid();
      await db.itens.add({
        id, nome: l.nome, categoriaId, unidade: unidade || l.unidade, qtdReposicaoPadrao: l.qtd,
        passoBaixa: 1, atualizadoEm: agora(), excluido: false
      });
      await addMov(id, l.qtd, 'reposicao');
      await db.lista.update(l.id, { status: 'comprado', itemId: id, atualizadoEm: agora() });
    } else {
      await db.lista.update(l.id, { excluido: true, atualizadoEm: agora() });
    }
  });
}

// Adiciona item manual. Se o nome bater com um item do estoque, vincula a ele.
export async function addManual(nome, qtd, unidade, precoEst = null) {
  nome = nome.trim();
  const existente = await db.itens.filter((i) => !i.excluido && i.nome.toLowerCase() === nome.toLowerCase()).first();
  if (existente && await pendenteDoItem(existente.id)) return { duplicado: true };
  await db.lista.add({
    id: uid(), itemId: existente?.id || null, nome: existente?.nome || nome, qtd,
    unidade: existente?.unidade || unidade || 'un', origem: 'manual', status: 'pendente', precoEst,
    atualizadoEm: agora(), excluido: false
  });
  return { vinculado: !!existente };
}

export async function editarEntrada(id, campos) {
  await db.lista.update(id, { ...campos, atualizadoEm: agora() });
}

// Cria ou edita item. "saldo" informado gera movimento de ajuste pela diferença.
export async function salvarItem(dados) {
  return db.transaction('rw', TABELAS, async () => {
    const base = {
      nome: dados.nome.trim(), categoriaId: dados.categoriaId || null, unidade: dados.unidade.trim(),
      qtdReposicaoPadrao: dados.qtdReposicaoPadrao, passoBaixa: dados.passoBaixa,
      atualizadoEm: agora(), excluido: false
    };
    let id = dados.id;
    if (id) await db.itens.update(id, base);
    else { id = uid(); await db.itens.add({ id, ...base }); }
    const atual = await saldoDe(id);
    const dif = r3(dados.saldo - atual);
    if (dif !== 0) await addMov(id, dif, 'ajuste');
    const item = await db.itens.get(id);
    if (dados.saldo > 0) await tirarDaLista(id);
    else await verificarZerado(item);
    // mantém nome/unidade da lista em dia
    const pend = await pendenteDoItem(id);
    if (pend) await db.lista.update(pend.id, { nome: item.nome, unidade: item.unidade, atualizadoEm: agora() });
    return id;
  });
}

export async function excluirItem(id) {
  return db.transaction('rw', TABELAS, async () => {
    await db.itens.update(id, { excluido: true, atualizadoEm: agora() });
    await tirarDaLista(id);
  });
}

export async function salvarCategoria(id, nome) {
  nome = nome.trim();
  if (id) await db.categorias.update(id, { nome, atualizadoEm: agora() });
  else await db.categorias.add({ id: uid(), nome, atualizadoEm: agora(), excluido: false });
}

// Só exclui se não houver itens ativos na categoria.
export async function excluirCategoria(id) {
  const emUso = await db.itens.where('categoriaId').equals(id).filter((i) => !i.excluido).count();
  if (emUso) return { emUso };
  await db.categorias.update(id, { excluido: true, atualizadoEm: agora() });
  return { emUso: 0 };
}

// Previsão de consumo (automática, pelas baixas já feitas): consumo médio por dia nos últimos 60 dias.
// Só mostra com 3+ baixas espalhadas por 3+ dias. Retorna { [itemId]: { porDia, dias } }.
export function previsoes(movs, saldos, agoraMs = Date.now()) {
  const desde = agoraMs - 60 * 864e5, por = {};
  for (const m of movs) {
    if (m.tipo !== 'baixa' || !(m.delta < 0)) continue;
    const t = Date.parse(m.data); if (!(t >= desde)) continue;
    const p = (por[m.itemId] ||= { soma: 0, n: 0, ini: t });
    p.soma += -m.delta; p.n++; if (t < p.ini) p.ini = t;
  }
  const out = {};
  for (const [id, p] of Object.entries(por)) {
    const dias = (agoraMs - p.ini) / 864e5;
    if (p.n < 3 || dias < 3) continue;
    const porDia = p.soma / dias, saldo = saldos[id] || 0;
    out[id] = { porDia, dias: saldo > 0 ? Math.floor(saldo / porDia) : 0 };
  }
  return out;
}
export const textoPrevisao = (p) => !p ? '' : p.dias <= 0 ? 'acaba hoje' : p.dias === 1 ? 'acaba em ~1 dia' : `acaba em ~${p.dias} dias`;
