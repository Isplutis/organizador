// Núcleo da criptografia de Finanças (camada do Dexie). Cifra/decifra registro a registro, de forma síncrona,
// com XChaCha20-Poly1305 (@noble/ciphers, MIT). A chave só existe na memória enquanto Finanças está aberta.
import { ref } from '../lib/vue.esm-browser.prod.js';
import { xchacha20poly1305 } from '../lib/noble/chacha.js';

// campos que ficam legíveis (necessários para índices, sincronização e lembretes discretos)
const BASE = ['id', 'atualizadoEm', 'excluido', 'criadoEm'];
export const CLAROS = {
  fContas: ['ordem'],
  fCartoes: ['fechamento', 'vencimento', 'contaId'],
  fCategorias: ['paiId', 'tipo', 'hue', 'ordem', 'pj'],
  fLanc: ['data', 'grupoId', 'fixaId'],
  fCaixinhas: ['contaId'],
  fFixas: ['dia', 'tipo', 'assinatura', 'periodo', 'mesAnual'],
  fImport: ['status', 'conta', 'data']
};
export const META_CIFRADA = new Set(['pluggyCfg']);
const VAZIOS = { nome: '', descricao: '', valor: 0, moeda: 'BRL' };

let chave = null;          // Uint8Array(32) — só na memória
let ativo = false;         // existe configuração de criptografia (meta "cripto")
export const versao = ref(0); // muda quando abre/fecha (as telas releem os dados)
export const temChave = () => !!chave;
export const exportarChave = () => chave ? new Uint8Array(chave) : null;
export const criptoAtivo = () => ativo;
export function definirAtivo(v) { if (ativo !== !!v) { ativo = !!v; versao.value++; } }
export function definirChave(k) { chave = k; versao.value++; }
export function limparChave() { if (chave) chave.fill(0); chave = null; versao.value++; }

const te = new TextEncoder(), td = new TextDecoder();
export const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
export const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function selar(obj) { const n = crypto.getRandomValues(new Uint8Array(24)); const ct = xchacha20poly1305(chave, n).encrypt(te.encode(JSON.stringify(obj))); const out = new Uint8Array(24 + ct.length); out.set(n); out.set(ct, 24); return b64(out); }
function abrir(txt) { const u = deB64(txt); return JSON.parse(td.decode(xchacha20poly1305(chave, u.subarray(0, 24)).decrypt(u.subarray(24)))); }

const alvo = (tabela, v) => tabela === 'meta' ? !!v && META_CIFRADA.has(v.chave) : !!CLAROS[tabela];
const claros = (tabela) => tabela === 'meta' ? ['chave', 'atualizadoEm'] : [...BASE, ...CLAROS[tabela]];
export class FinancasBloqueada extends Error { constructor() { super('Finanças bloqueada: digite a senha para alterar'); } }

export function cifrar(tabela, v) {
  if (!v || typeof v !== 'object' || !alvo(tabela, v)) return v;
  if (!chave) { if (ativo) throw new FinancasBloqueada(); return v; }
  if (v._c && Object.keys(v).every((k) => claros(tabela).includes(k) || k === '_c')) return v; // já cifrado
  const c = claros(tabela), aberto = {}, resto = {};
  for (const [k, x] of Object.entries(v)) { if (k === '_c' || k === '_bloq') continue; (c.includes(k) ? aberto : resto)[k] = x; }
  return { ...aberto, _c: selar(resto) };
}
export function decifrar(tabela, v) {
  if (!v || typeof v !== 'object' || !v._c) return v;
  const { _c, ...resto } = v;
  if (chave) { try { return { ...resto, ...abrir(_c) }; } catch { /* chave errada ou dado corrompido */ } }
  return tabela === 'meta' ? { ...resto, _bloq: true } : { ...VAZIOS, ...resto, _bloq: true };
}

// Middleware do Dexie (DBCore): tudo que passa por "db" é cifrado ao gravar e decifrado ao ler
export const middlewareCripto = {
  stack: 'dbcore', name: 'criptoFinancas',
  create(down) {
    return {
      ...down,
      table(nome) {
        const t = down.table(nome);
        if (!CLAROS[nome] && nome !== 'meta') return t;
        const dec = (v) => decifrar(nome, v);
        return {
          ...t,
          mutate(req) { if ((req.type === 'add' || req.type === 'put') && req.values) req = { ...req, values: req.values.map((v) => cifrar(nome, v)) }; return t.mutate(req); },
          get(req) { return t.get(req).then(dec); },
          getMany(req) { return t.getMany(req).then((vs) => vs.map(dec)); },
          query(req) { return t.query(req).then((r) => (req.values ? { ...r, result: r.result.map(dec) } : r)); },
          openCursor(req) {
            return t.openCursor(req).then((c) => c && (req.values === false ? c : new Proxy(c, { get(alvoC, p) { if (p === 'value') return dec(alvoC.value); const x = alvoC[p]; return typeof x === 'function' ? x.bind(alvoC) : x; } })));
          }
        };
      }
    };
  }
};
