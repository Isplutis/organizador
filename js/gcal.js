// Google Calendar: envia lembretes do app para a agenda "Organizador" (criada pelo app) e lê os eventos das demais agendas.
// Cada evento tem id fixo (derivado do que ele representa): os dois aparelhos atualizam o mesmo evento, sem duplicar.
import { reactive } from '../lib/vue.esm-browser.prod.js';
import { db, agora } from './db.js';
import { tokenGoogle, tokenExpirou } from './sync.js';
import { hojeStr, somaDias, versaoEm } from './servicos/rotina-servico.js';
import { noMes } from './servicos/fin-servico.js';

const API = 'https://www.googleapis.com/calendar/v3';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
const JANELA = 90; // dias à frente para eventos avulsos
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* */ } }
};
export const gcal = reactive({ ativo: ls.get('cal.ativo') === '1', estado: '', msg: '', ultimo: ls.get('cal.ultimo') || '', google: JSON.parse(ls.get('cal.cache') || '[]') });

class ErroAcesso extends Error {}
async function api(token, caminho, opcoes = {}) {
  const r = await fetch(API + caminho, { ...opcoes, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
  if (r.status === 401) throw new ErroAcesso('Acesso ao Google expirou');
  if (r.status === 403) { const j = await r.json().catch(() => ({})); throw new ErroAcesso(j.error?.message || 'Sem permissão na agenda'); }
  if (r.status === 404 || r.status === 410) return null;
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error('Google Agenda: ' + (j.error?.message || r.status)); }
  return r.status === 204 ? {} : r.json();
}

// id aceito pelo Google: letras a-v e dígitos
function idEvento(chave) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < chave.length; i++) { const c = chave.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2654435761) >>> 0; }
  return 'org' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
const hashTxt = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const fimHora = (h, min = 15) => { const [a, b] = h.split(':').map(Number), t = a * 60 + b + min; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const lembretes = (mins) => ({ useDefault: false, overrides: mins.map((m) => ({ method: 'popup', minutes: m })) });
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const diaSeg = (m, d) => { const [a, mm] = m.split('-').map(Number), ult = new Date(a, mm, 0).getDate(); return `${m}-${String(Math.min(d, ult)).padStart(2, '0')}`; };

// evento às 9h (avisa na véspera às 9h e no dia às 9h)
const ev9 = (data, titulo, desc = '') => ({ summary: titulo, description: desc, start: { dateTime: `${data}T09:00:00`, timeZone: TZ }, end: { dateTime: `${data}T09:15:00`, timeZone: TZ }, reminders: lembretes([1440, 0]) });

// Monta o conjunto de eventos desejado a partir dos dados do app
export async function eventosDesejados(hoje = hojeStr()) {
  const [comps, fixas, lancs, cartoes, pedidos, cursos, disciplinas, atividades] = await Promise.all([
    db.aCompromissos.toArray(), db.fFixas.toArray(), db.fLanc.toArray(), db.fCartoes.toArray(), db.oPedidos.toArray(), db.cursos.toArray(), db.disciplinas.toArray(), db.atividades.toArray()]);
  const fim = somaDias(hoje, JANELA), out = {};
  // Finanças bloqueada: não mexe nos lembretes de Finanças já enviados (ficam com o último nome)
  const finBloq = fixas.some((f) => f._bloq) || cartoes.some((k) => k._bloq);
  Object.defineProperty(out, '_finBloq', { value: finBloq, enumerable: false });
  const por = (chave, ev, data = null) => { out[idEvento(chave)] = { ev: { ...ev, extendedProperties: { private: { org: '1' } } }, data }; };
  // Compromissos e aniversários (recorrência pelo próprio Google)
  for (const c of comps) {
    if (c.excluido) continue;
    if (c.tipo === 'aniv') {
      por('aniv|' + c.id, { summary: '🎂 Aniversário: ' + c.titulo, description: c.obs || '', start: { date: c.data }, end: { date: somaDias(c.data, 1) }, recurrence: ['RRULE:FREQ=YEARLY'], reminders: lembretes([900]) });
      continue;
    }
    const rr = { semanal: 'RRULE:FREQ=WEEKLY', mensal: 'RRULE:FREQ=MONTHLY', anual: 'RRULE:FREQ=YEARLY' }[c.repete];
    const base = { summary: c.titulo, location: c.local || '', description: c.obs || '', ...(rr ? { recurrence: [rr] } : {}) };
    if (c.hora) por('comp|' + c.id, { ...base, start: { dateTime: `${c.data}T${c.hora}:00`, timeZone: TZ }, end: { dateTime: `${c.data}T${fimHora(c.hora, 60)}:00`, timeZone: TZ }, reminders: lembretes([1440, 60]) }, rr ? null : c.data);
    else por('comp|' + c.id, { ...base, start: { date: c.data }, end: { date: somaDias(c.data, 1) }, reminders: lembretes([900]) }, rr ? null : c.data);
  }
  // Finanças: contas fixas/assinaturas não pagas e faturas (só nomes, sem valores) nos próximos meses
  const meses = []; for (let i = 0; i <= 3; i++) { const d = new Date(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 + i, 1); meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  for (const m of finBloq ? [] : meses) {
    for (const f of fixas) {
      if (f.excluido || !noMes(f, m)) continue;
      const data = diaSeg(m, f.dia || 1);
      if (data < hoje || data > fim) continue;
      if (lancs.some((l) => !l.excluido && l.fixaId === f.id && l.data.slice(0, 7) === m)) continue; // já pago
      por(`fixa|${f.id}|${m}`, ev9(data, (f.tipo === 'rec' ? '💵 Receber: ' : f.assinatura ? '🔁 Assinatura: ' : '💰 Vence: ') + f.nome, 'Organizador · Finanças'), data);
    }
    for (const k of cartoes) {
      if (k.excluido || !k.vencimento || !k.fechamento) continue;
      const data = diaSeg(m, k.vencimento);
      if (data >= hoje && data <= fim) por(`fatura|${k.id}|${m}`, ev9(data, '💳 Fatura: ' + k.nome, 'Organizador · Finanças'), data);
    }
  }
  // Compras online
  for (const p of pedidos) {
    if (p.excluido) continue;
    if (['aguardando', 'enviado', 'transito'].includes(p.status) && p.prazo && p.prazo >= hoje && p.prazo <= fim) por('entrega|' + p.id, ev9(p.prazo, '📦 Entrega prevista: ' + p.nome, 'Organizador · Compras'), p.prazo);
    if (p.status === 'entregue' && p.devolveAte && p.devolveAte >= hoje) por('devol|' + p.id, ev9(p.devolveAte, '↩ Último dia p/ devolver: ' + p.nome, 'Organizador · Compras'), p.devolveAte);
    if (p.garantiaAte && p.garantiaAte >= hoje) por('garantia|' + p.id, { ...ev9(p.garantiaAte, '🛡 Fim da garantia: ' + p.nome, 'Organizador · Compras'), reminders: lembretes([30 * 1440, 1440]) }, p.garantiaAte);
  }
  // Estudos
  for (const c of cursos) {
    if (c.excluido) continue;
    if (c.prazoConteudo && c.prazoConteudo >= hoje) por('prazoC|' + c.id, { ...ev9(c.prazoConteudo, '🎓 Prazo do conteúdo: ' + c.nome), reminders: lembretes([30 * 1440, 7 * 1440, 0]) }, c.prazoConteudo);
    if (c.prazoFinal && c.prazoFinal >= hoje) por('prazoF|' + c.id, { ...ev9(c.prazoFinal, '🎓 Prazo final: ' + c.nome), reminders: lembretes([30 * 1440, 7 * 1440, 0]) }, c.prazoFinal);
  }
  for (const d of disciplinas) if (!d.excluido && d.dataProva && d.dataProva >= hoje) por('prova|' + d.id, { ...ev9(d.dataProva, '📝 Prova: ' + d.nome), reminders: lembretes([7 * 1440, 1440, 0]) }, d.dataProva);
  return out;
}

async function agendaOrganizador(token) {
  const meta = await db.meta.get('calCfg');
  if (meta?.calendarId && await api(token, `/calendars/${encodeURIComponent(meta.calendarId)}`)) return meta.calendarId;
  // procura uma "Organizador" criada por outro aparelho antes de criar outra
  const lista = await api(token, '/users/me/calendarList?minAccessRole=owner');
  const achou = (lista?.items || []).find((c) => c.summary === 'Organizador' && (c.description || '').startsWith('Criada pelo Organizador'));
  const id = achou?.id || (await api(token, '/calendars', { method: 'POST', body: JSON.stringify({ summary: 'Organizador', description: 'Criada pelo Organizador (lembretes do app). Pode apagar para remover tudo.', timeZone: TZ }) })).id;
  await db.meta.put({ chave: 'calCfg', calendarId: id, atualizadoEm: agora() });
  return id;
}

async function enviar(token, calId, hoje) {
  const desejados = await eventosDesejados(hoje);
  const enviados = JSON.parse(ls.get('cal.enviados') || '{}'); // id -> { h: hash, d: data }
  let n = 0;
  const base = `/calendars/${encodeURIComponent(calId)}/events`;
  for (const [id, { ev, data }] of Object.entries(desejados)) {
    const h = hashTxt(JSON.stringify(ev));
    if (enviados[id]?.h === h) continue;
    const ok = await api(token, `${base}/${id}`, { method: 'PUT', body: JSON.stringify(ev) });
    if (!ok) await api(token, base, { method: 'POST', body: JSON.stringify({ id, ...ev }) });
    enviados[id] = { h, d: data }; n++;
  }
  // remove o que deixou de existir (só eventos futuros ou recorrentes; o passado fica como histórico)
  // com Finanças bloqueada não apaga nada (os lembretes de Finanças não foram recalculados)
  for (const [id, info] of desejados._finBloq ? [] : Object.entries(enviados)) {
    if (desejados[id]) continue;
    if (info.d && info.d < hoje) { delete enviados[id]; continue; }
    await api(token, `${base}/${id}`, { method: 'DELETE' }).catch(() => null);
    delete enviados[id]; n++;
  }
  ls.set('cal.enviados', JSON.stringify(enviados));
  return n;
}

async function ler(token, calId, hoje) {
  const lista = await api(token, '/users/me/calendarList');
  const ini = somaDias(hoje, -35), fim = somaDias(hoje, 100), out = [];
  for (const c of (lista?.items || []).filter((x) => x.id !== calId && x.selected !== false)) {
    const r = await api(token, `/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${ini}T00:00:00Z&timeMax=${fim}T23:59:59Z`);
    for (const e of r?.items || []) {
      if (e.status === 'cancelled') continue;
      const dia = e.start?.date || (e.start?.dateTime ? new Date(e.start.dateTime).toLocaleDateString('sv-SE') : null);
      if (!dia) continue;
      const hora = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      out.push({ id: e.id, titulo: e.summary || '(sem título)', data: dia, fim: e.end?.date ? somaDias(e.end.date, -1) : dia, hora, agenda: c.summaryOverride || c.summary, link: e.htmlLink || '', aniversario: e.eventType === 'birthday' || /birthday|anivers/i.test(c.id + ' ' + (c.summary || '')) });
    }
  }
  gcal.google = out; ls.set('cal.cache', JSON.stringify(out));
}

let rodando = null;
export function sincronizarCalendar({ interativo = false, forcar = false } = {}) {
  if (!gcal.ativo) return Promise.resolve();
  if (rodando) return rodando;
  if (!forcar && !interativo && gcal.ultimo && Date.now() - Date.parse(gcal.ultimo) < 10 * 60e3) return Promise.resolve();
  rodando = (async () => {
    try {
      if (!navigator.onLine) { gcal.estado = 'offline'; return; }
      const token = await tokenGoogle({ interativo });
      if (!token) { gcal.estado = 'reconectar'; gcal.msg = 'Toque em “Sincronizar agenda agora” para reconectar ao Google'; return; }
      gcal.estado = 'sincronizando';
      const hoje = hojeStr(), calId = await agendaOrganizador(token);
      const n = await enviar(token, calId, hoje);
      await ler(token, calId, hoje);
      gcal.ultimo = agora(); ls.set('cal.ultimo', gcal.ultimo);
      gcal.estado = 'ok'; gcal.msg = n ? `${n} lembrete(s) atualizados` : 'Tudo em dia';
    } catch (e) {
      if (e instanceof ErroAcesso) { tokenExpirou(); gcal.estado = 'reconectar'; gcal.msg = e.message; }
      else { gcal.estado = 'erro'; gcal.msg = e.message; }
      console.warn('[gcal]', e);
    } finally { rodando = null; }
  })();
  return rodando;
}
export async function ativarCalendar() {
  ls.set('cal.ativo', '1'); gcal.ativo = true;
  await sincronizarCalendar({ interativo: true, forcar: true });
  if (gcal.estado !== 'ok') { /* mantém ativo; o usuário pode tentar de novo */ }
}
export function desativarCalendar() {
  ls.set('cal.ativo', null); gcal.ativo = false; gcal.estado = ''; gcal.google = []; ls.set('cal.cache', null); ls.set('cal.enviados', null);
}
export function iniciarCalendar() {
  if (!gcal.ativo) return;
  setTimeout(() => sincronizarCalendar(), 6000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizarCalendar(); });
  setInterval(() => { if (document.visibilityState === 'visible') sincronizarCalendar(); }, 30 * 60e3);
}
