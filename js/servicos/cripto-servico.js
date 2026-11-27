// Senha de Finanças, chave de recuperação, digital (passkey com PRF), bloqueio após 15 min e migração.
import { reactive } from '../../lib/vue.esm-browser.prod.js';
import { db, dbCru, agora } from '../db.js';
import { CLAROS, META_CIFRADA, definirAtivo, definirChave, limparChave, temChave, b64, deB64, versao } from '../cripto-nucleo.js';

const ITER = 400000, ITER_REC = 150000, MIN_FORA = 15;
const te = new TextEncoder();
export const estado = reactive({ ativo: false, aberto: false, carregado: false, digitalAqui: false });
const sincEstado = () => { estado.aberto = temChave(); };

// ---------- regras da senha ----------
export function forcaSenha(s) {
  const r = { tam: s.length >= 10, letra: /\p{L}/u.test(s), num: /\d/.test(s), simb: /[^\p{L}\d\s]/u.test(s) };
  return { ...r, ok: r.tam && r.letra && r.num && r.simb };
}
// ---------- chave de recuperação: 20 bytes em base32 (sem I, L, O, U) ----------
const ALF = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function base32(u8) { let bits = 0, val = 0, out = ''; for (const b of u8) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += ALF[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += ALF[(val << (5 - bits)) & 31]; return out; }
export const normRec = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
const fmtRec = (s) => s.match(/.{1,4}/g).join('-');

async function kekSenha(senha, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(senha.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function envolver(kek, dek) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, dek)); return { iv: b64(iv), ct: b64(ct) }; }
async function desenvolver(kek, e) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(e.iv) }, kek, deB64(e.ct))); }
async function lerCfg() { return dbCru.meta.get('cripto'); }
async function gravarCfg(c) { await dbCru.meta.put({ ...c, chave: 'cripto', atualizadoEm: agora() }); }

// ---------- início e estado ----------
export async function iniciarCripto() {
  const c = await lerCfg();
  estado.ativo = !!c; definirAtivo(!!c); estado.carregado = true; estado.digitalAqui = !!lerDigital(); sincEstado();
}
export const finAberta = () => estado.aberto || !estado.ativo;

// ---------- primeira configuração (migração) ----------
export async function configurar(senha) {
  if (!forcaSenha(senha).ok) throw new Error('Senha fraca');
  if (await lerCfg()) throw new Error('A criptografia já está configurada (talvez em outro aparelho). Atualize e digite a senha.');
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const recBytes = crypto.getRandomValues(new Uint8Array(20)); const rec = base32(recBytes);
  const salt = crypto.getRandomValues(new Uint8Array(16)), saltRec = crypto.getRandomValues(new Uint8Array(16));
  const cfg = { v: 1, algo: 'xchacha20poly1305', iter: ITER, salt: b64(salt), senha: await envolver(await kekSenha(senha, salt, ITER), dek),
    rec: { salt: b64(saltRec), iter: ITER_REC, ...(await envolver(await kekSenha(rec, saltRec, ITER_REC), dek)) }, criadoEm: agora() };
  return { cfg, dek, recuperacao: fmtRec(rec) };
}
// depois que o usuário confirma que guardou a chave de recuperação
export async function ativar({ cfg, dek }) {
  cfg = JSON.parse(JSON.stringify(cfg)); dek = new Uint8Array(dek);
  await gravarCfg(cfg); definirChave(dek); definirAtivo(true); estado.ativo = true; sincEstado();
  const n = await varredura();
  try { localStorage.removeItem('finPin'); sessionStorage.removeItem('finDesbloq'); } catch { /* */ }
  return n;
}
// cifra tudo que ainda estiver legível (dados antigos ou vindos de um aparelho desatualizado)
export async function varredura() {
  if (!temChave()) return 0;
  let n = 0;
  for (const t of Object.keys(CLAROS)) {
    const crus = await dbCru.table(t).filter((r) => !r._c).toArray();
    if (crus.length) { await db.table(t).bulkPut(crus); n += crus.length; }
  }
  for (const k of META_CIFRADA) { const m = await dbCru.meta.get(k); if (m && !m._c) { await db.meta.put(m); n++; } }
  return n;
}

// ---------- abrir / fechar ----------
export async function desbloquear(senha) {
  const c = await lerCfg(); if (!c) throw new Error('Criptografia não configurada');
  let dek; try { dek = await desenvolver(await kekSenha(senha, deB64(c.salt), c.iter), c.senha); } catch { throw new Error('Senha incorreta'); }
  definirChave(dek); sincEstado(); await varredura(); return true;
}
export async function desbloquearComRecuperacao(rec, novaSenha) {
  const c = await lerCfg(); if (!c) throw new Error('Criptografia não configurada');
  if (!forcaSenha(novaSenha).ok) throw new Error('A nova senha não atende às regras');
  let dek; try { dek = await desenvolver(await kekSenha(normRec(rec), deB64(c.rec.salt), c.rec.iter), c.rec); } catch { throw new Error('Chave de recuperação incorreta'); }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await gravarCfg({ ...c, salt: b64(salt), iter: ITER, senha: await envolver(await kekSenha(novaSenha, salt, ITER), dek) });
  definirChave(dek); sincEstado(); await varredura(); return true;
}
export function bloquear() { limparChave(); sincEstado(); }
export async function trocarSenha(atual, nova) {
  const c = await lerCfg(); if (!forcaSenha(nova).ok) throw new Error('A nova senha não atende às regras');
  let dek; try { dek = await desenvolver(await kekSenha(atual, deB64(c.salt), c.iter), c.senha); } catch { throw new Error('Senha atual incorreta'); }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await gravarCfg({ ...c, salt: b64(salt), iter: ITER, senha: await envolver(await kekSenha(nova, salt, ITER), dek) });
}
export async function novaRecuperacao(senha) {
  const c = await lerCfg();
  let dek; try { dek = await desenvolver(await kekSenha(senha, deB64(c.salt), c.iter), c.senha); } catch { throw new Error('Senha incorreta'); }
  const recBytes = crypto.getRandomValues(new Uint8Array(20)); const rec = base32(recBytes); const saltRec = crypto.getRandomValues(new Uint8Array(16));
  const novo = { ...c, rec: { salt: b64(saltRec), iter: ITER_REC, ...(await envolver(await kekSenha(rec, saltRec, ITER_REC), dek)) } };
  return { recuperacao: fmtRec(rec), confirmar: () => gravarCfg(novo) };
}
export function baixarRecuperacao(rec) {
  const txt = `Organizador — chave de recuperação de Finanças\r\n\r\n${rec}\r\n\r\nGerada em ${new Date().toLocaleString('pt-BR')}.\r\nUse se esquecer a senha (Finanças › Esqueci a senha).\r\nGuarde FORA do celular: gerenciador de senhas, pendrive ou papel. Quem tiver esta chave consegue abrir suas Finanças.\r\n`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' })); a.download = 'organizador-chave-recuperacao.txt';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// ---------- bloqueio automático: 15 min fora do app ----------
let saiuEm = 0;
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.hidden) saiuEm = Date.now();
  else if (saiuEm && Date.now() - saiuEm > MIN_FORA * 60000 && temChave()) bloquear();
});

// ---------- digital (passkey com extensão PRF; a chave fica só neste aparelho) ----------
const LS_DIG = 'finDigital';
function lerDigital() { try { return JSON.parse(localStorage.getItem(LS_DIG) || 'null'); } catch { return null; } }
export const temDigital = () => !!lerDigital();
export const suportaPasskey = () => !!(window.PublicKeyCredential && navigator.credentials?.create);
async function kekPRF(prf) { const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('organizador'), info: te.encode('digital-financas') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
async function prfDe(credId, salt) {
  const a = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: credId }], userVerification: 'required', timeout: 60000, extensions: { prf: { eval: { first: salt } } } } });
  const r = a?.getClientExtensionResults?.()?.prf?.results?.first;
  if (!r) throw new Error('Este aparelho não oferece a digital para este uso (PRF). Continue usando a senha.');
  return new Uint8Array(r);
}
export async function ativarDigital() {
  if (!temChave()) throw new Error('Abra Finanças com a senha primeiro');
  if (!suportaPasskey()) throw new Error('Este navegador não suporta passkeys');
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Organizador', id: location.hostname },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'financas-' + location.hostname, displayName: 'Finanças · Organizador' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, timeout: 60000,
    extensions: { prf: { eval: { first: salt } } } } });
  const ext = cred.getClientExtensionResults?.() || {};
  if (ext.prf?.enabled === false) throw new Error('Este aparelho criou a passkey, mas não oferece PRF. A digital não pode proteger a chave aqui.');
  const credId = new Uint8Array(cred.rawId);
  const prf = ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : await prfDe(credId, salt);
  const { dek } = await exportarChaveAtual();
  const env = await envolver(await kekPRF(prf), dek);
  localStorage.setItem(LS_DIG, JSON.stringify({ id: b64(credId), salt: b64(salt), ...env }));
  estado.digitalAqui = true;
}
export async function desbloquearDigital() {
  const d = lerDigital(); if (!d) throw new Error('Digital não ativada neste aparelho');
  const prf = await prfDe(deB64(d.id), deB64(d.salt));
  let dek; try { dek = await desenvolver(await kekPRF(prf), d); } catch { throw new Error('Não foi possível abrir com a digital. Use a senha.'); }
  definirChave(dek); sincEstado(); await varredura();
}
export function desativarDigital() { try { localStorage.removeItem(LS_DIG); } catch { /* */ } estado.digitalAqui = false; }
// a chave em uso (para envolver com a digital) — lida da memória via um registro de teste
import { exportarChave } from '../cripto-nucleo.js';
async function exportarChaveAtual() { return { dek: exportarChave() }; }

// mantém "aberto" em dia quando o núcleo muda (bloqueio automático, etc.)
import { watch } from '../../lib/vue.esm-browser.prod.js';
watch(versao, sincEstado);
