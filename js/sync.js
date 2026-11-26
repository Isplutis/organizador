// Sincronização com o Google Drive (pasta oculta do app: appDataFolder).
// Como funciona:
// 1) baixa o arquivo "organizador.json" do Drive; 2) mescla com os dados locais; 3) envia o resultado.
// Regras de mescla: cada registro tem id + atualizadoEm -> vence o mais recente.
// Movimentos do estoque nunca são editados: os dois lados são somados (nenhuma baixa se perde).
import { reactive } from '../lib/vue.esm-browser.prod.js';
import { db, agora } from './db.js';

// Cole aqui o ID do cliente para não precisar digitar em cada aparelho (opcional).
const CLIENT_ID_PADRAO = '910016391965-7obnvg7qcv9ch7735ki8ccs9373v0nom.apps.googleusercontent.com';
const ESCOPO = 'https://www.googleapis.com/auth/drive.appdata';
const ARQUIVO = 'organizador.json';
const TABELAS = ['categorias', 'itens', 'lista', 'atividades', 'marcacoes', 'agua', 'viagens',
  'cursos', 'disciplinas', 'unidades', 'secoes', 'aulas', 'sessoes', 'duoRating',
  'fContas', 'fCartoes', 'fCategorias', 'fLanc', 'fCaixinhas', 'fFixas', 'oDesejos', 'oPrecos', 'oPedidos']; // vence o mais recente
// configurações que sincronizam (as demais, como 'mig-…', são do aparelho)
const sincMeta = (k) => k === 'agua' || k === 'duoBase' || k === 'inicioContagem' || k === 'finInicio' || k === 'onlineCfg' || k.startsWith('estudoMeta-');

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sem armazenamento */ } }
};

// estado: desconectado | ok | sincronizando | reconectar | offline | erro
export const sync = reactive({
  estado: 'desconectado', ultimo: ls.get('sync.ultimo'), msg: '',
  clientId: CLIENT_ID_PADRAO || ls.get('sync.clientId'), conectado: ls.get('sync.conectado') === '1'
});

// ---------- Exportar / mesclar ----------
export async function exportar() {
  const tabelas = {};
  for (const t of TABELAS) tabelas[t] = await db.table(t).toArray();
  tabelas.movimentos = await db.movimentos.toArray();
  tabelas.meta = (await db.meta.toArray()).filter((m) => sincMeta(m.chave));
  return { formato: 1, geradoEm: agora(), tabelas };
}

let aplicando = false; // evita que a própria sincronização dispare outra
export async function mesclar(remoto) {
  const T = remoto?.tabelas || {};
  let mudou = 0;
  aplicando = true;
  try {
    await db.transaction('rw', [...TABELAS, 'movimentos', 'meta'], async () => {
      for (const t of TABELAS) {
        const locais = new Map((await db.table(t).toArray()).map((r) => [r.id, r]));
        const novos = (T[t] || []).filter((r) => { const l = locais.get(r.id); return !l || (r.atualizadoEm || '') > (l.atualizadoEm || ''); });
        if (novos.length) { await db.table(t).bulkPut(novos); mudou += novos.length; }
      }
      const ids = new Set(await db.movimentos.toCollection().primaryKeys());
      const movs = (T.movimentos || []).filter((m) => !ids.has(m.id));
      if (movs.length) { await db.movimentos.bulkAdd(movs); mudou += movs.length; }
      for (const m of T.meta || []) {
        if (!sincMeta(m.chave)) continue;
        const l = await db.meta.get(m.chave);
        if (!l || (m.atualizadoEm || '') > (l.atualizadoEm || '')) { await db.meta.put(m); mudou++; }
      }
      // Cada aparelho cria sua própria "Beber água": mantém só a mais antiga
      const aguas = (await db.atividades.filter((a) => a.agua && !a.excluido).toArray()).sort((a, b) => (a.criadoEm + a.id).localeCompare(b.criadoEm + b.id));
      for (const a of aguas.slice(1)) await db.atividades.update(a.id, { excluido: true, atualizadoEm: agora() });
    });
  } finally { aplicando = false; }
  return mudou;
}

export async function substituirPorRemoto(remoto) {
  const T = remoto?.tabelas || {};
  aplicando = true;
  try {
    await db.transaction('rw', [...TABELAS, 'movimentos', 'meta'], async () => {
      for (const t of [...TABELAS, 'movimentos']) { await db.table(t).clear(); if (T[t]?.length) await db.table(t).bulkAdd(T[t]); }
      for (const m of await db.meta.toArray()) if (sincMeta(m.chave)) await db.meta.delete(m.chave);
      for (const m of T.meta || []) if (sincMeta(m.chave)) await db.meta.put(m);
    });
  } finally { aplicando = false; }
}

// Dados criados pelo usuário neste aparelho (a "Beber água" automática não conta)
export async function temDadosLocais() {
  const n = (await db.itens.count()) + (await db.movimentos.count()) + (await db.lista.count()) + (await db.marcacoes.count()) +
    (await db.agua.count()) + (await db.atividades.filter((a) => !a.agua).count()) + (await db.categorias.count());
  return n > 0;
}

// ---------- Google Drive ----------
class ErroToken extends Error {}
async function api(token, url, opcoes = {}) {
  const r = await fetch(url, { ...opcoes, headers: { Authorization: 'Bearer ' + token, ...(opcoes.headers || {}) } });
  if (r.status === 401 || r.status === 403) throw new ErroToken('Acesso ao Google expirou');
  if (!r.ok) throw new Error('Google Drive respondeu ' + r.status);
  return r;
}
const drive = {
  async baixar(token) {
    const q = encodeURIComponent(`name='${ARQUIVO}'`);
    const lista = await (await api(token, `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`)).json();
    const f = lista.files?.[0];
    if (!f) return null;
    const dados = await (await api(token, `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
    return { id: f.id, dados };
  },
  async enviar(token, id, dados) {
    const corpo = JSON.stringify(dados);
    if (id) {
      await api(token, `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: corpo });
      return id;
    }
    const b = 'org' + Date.now();
    const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: ARQUIVO, parents: ['appDataFolder'] })}\r\n` +
      `--${b}\r\nContent-Type: application/json\r\n\r\n${corpo}\r\n--${b}--`;
    const r = await api(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multipart });
    return (await r.json()).id;
  }
};

// ---------- Login Google (token de ~1 hora, sem senha no app) ----------
function carregarGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar o login do Google'));
    document.head.appendChild(s);
  });
}
function tokenSalvo() {
  try { const t = JSON.parse(ls.get('sync.token') || 'null'); return t && t.expira > Date.now() + 60000 ? t.valor : null; } catch { return null; }
}
// Precisa ser chamado a partir de um toque do usuário (o navegador bloqueia janelas automáticas)
function pedirToken() {
  return new Promise((ok, erro) => {
    if (!window.google?.accounts?.oauth2) return erro(new Error('Login do Google ainda carregando. Tente de novo em instantes.'));
    if (!sync.clientId) return erro(new Error('Informe o ID do cliente Google'));
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: sync.clientId, scope: ESCOPO,
      callback: (r) => {
        if (r.error) return erro(new Error(r.error_description || r.error));
        ls.set('sync.token', JSON.stringify({ valor: r.access_token, expira: Date.now() + (Number(r.expires_in) || 3600) * 1000 }));
        ok(r.access_token);
      },
      error_callback: (e) => erro(new Error(e?.type === 'popup_closed' ? 'Janela do Google fechada' : 'Login do Google não concluído'))
    });
    cliente.requestAccessToken({ prompt: '' });
  });
}

// ---------- Sincronizar ----------
let rodando = null, pendente = false;
export async function sincronizar({ interativo = false } = {}) {
  if (rodando) { pendente = true; return rodando; }
  rodando = (async () => {
    try {
      if (!sync.conectado || !sync.clientId) { sync.estado = 'desconectado'; return; }
      if (!navigator.onLine) { sync.estado = 'offline'; return; }
      let token = tokenSalvo();
      if (!token && interativo) token = await pedirToken();
      if (!token) { sync.estado = 'reconectar'; return; }
      sync.estado = 'sincronizando';
      const remoto = await drive.baixar(token);
      if (remoto) await mesclar(remoto.dados);
      const id = await drive.enviar(token, remoto?.id, await exportar());
      ls.set('sync.arquivoId', id);
      sync.ultimo = agora(); ls.set('sync.ultimo', sync.ultimo);
      sync.estado = 'ok'; sync.msg = '';
    } catch (e) {
      if (e instanceof ErroToken) { ls.set('sync.token', null); sync.estado = 'reconectar'; }
      else { sync.estado = navigator.onLine ? 'erro' : 'offline'; sync.msg = e.message; }
      console.warn('[sync]', e);
    }
  })();
  try { await rodando; } finally {
    rodando = null;
    if (pendente) { pendente = false; setTimeout(() => sincronizar(), 500); }
  }
}

// Primeira conexão deste aparelho. Retorna { perguntar: true } se houver dados aqui E na nuvem.
let remotoPendente = null;
export async function conectar(clientId) {
  sync.clientId = clientId.trim(); ls.set('sync.clientId', sync.clientId);
  const token = tokenSalvo() || await pedirToken();
  sync.conectado = true; ls.set('sync.conectado', '1');
  sync.estado = 'sincronizando';
  const remoto = await drive.baixar(token);
  if (remoto && await temDadosLocais()) { remotoPendente = remoto; sync.estado = 'ok'; return { perguntar: true }; }
  await sincronizar();
  return { perguntar: false };
}
// escolha: 'juntar' (soma os dois lados) | 'nuvem' (apaga os dados deste aparelho e usa os da nuvem)
export async function resolverPrimeira(escolha) {
  if (!remotoPendente) return sincronizar();
  if (escolha === 'nuvem') await substituirPorRemoto(remotoPendente.dados);
  remotoPendente = null;
  await sincronizar();
}
export function desconectar() {
  const t = tokenSalvo();
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => {});
  ls.set('sync.token', null); ls.set('sync.conectado', null);
  sync.conectado = false; sync.estado = 'desconectado';
}

// ---------- Gatilhos automáticos ----------
let timer = null;
function agendar(ms = 4000) {
  if (aplicando || !sync.conectado) return;
  clearTimeout(timer); timer = setTimeout(() => sincronizar(), ms);
}
export function iniciarSync() {
  for (const t of [...TABELAS, 'movimentos', 'meta']) {
    const tab = db.table(t);
    tab.hook('creating', () => { agendar(); });
    tab.hook('updating', () => { agendar(); });
    tab.hook('deleting', () => { agendar(); });
  }
  const preparar = () => { if (navigator.onLine && sync.clientId) carregarGIS().catch(() => {}); };
  preparar();
  addEventListener('online', () => { preparar(); agendar(500); });
  addEventListener('offline', () => { if (sync.conectado) sync.estado = 'offline'; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') agendar(300); });
  setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 5 * 60000);
  if (sync.conectado) sincronizar();
}
export const carregarLogin = () => carregarGIS();
export const ID_FIXO = !!CLIENT_ID_PADRAO;
