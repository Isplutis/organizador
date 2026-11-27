// Sono: noites (deitei/levantei, qualidade, despertares) e cochilos (separados, não somam nas horas de sono).
import { db, uid, agora } from '../db.js';
import { hojeStr, somaDias, pd } from './rotina-servico.js';

export const META_PADRAO = 480; // 8 h
const z = (n) => String(n).padStart(2, '0');
export const agoraLocal = () => { const d = new Date(); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
export const minutosEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
export const fmtDur = (m) => m == null || isNaN(m) ? '—' : `${Math.floor(m / 60)}h${z(Math.round(m % 60))}`;
// horário como minutos a partir do meio-dia (evita a virada da meia-noite nas médias)
const desdeMeioDia = (iso) => { const d = new Date(iso); return ((d.getHours() * 60 + d.getMinutes()) - 720 + 1440) % 1440; };
const hora = (mmd) => { const t = (Math.round(mmd) + 720) % 1440; return `${z(Math.floor(t / 60))}:${z(t % 60)}`; };

export async function lerMeta() { return (await db.meta.get('sonoMeta'))?.minutos || META_PADRAO; }
export async function salvarMeta(minutos) { await db.meta.put({ chave: 'sonoMeta', minutos, atualizadoEm: agora() }); }

export async function dormirAgora() { const id = uid(); await db.sSono.add({ id, deitou: agoraLocal(), levantou: null, data: null, qualidade: null, despertares: null, obs: '', criadoEm: agora(), atualizadoEm: agora(), excluido: false }); return id; }
export async function salvarNoite(n) {
  const base = { deitou: n.deitou, levantou: n.levantou || null, data: n.levantou ? n.levantou.slice(0, 10) : null, qualidade: n.qualidade || null, despertares: n.despertares ?? null, obs: (n.obs || '').trim(), atualizadoEm: agora(), excluido: false };
  if (n.id) { await db.sSono.update(n.id, base); return n.id; }
  const id = uid(); await db.sSono.add({ id, criadoEm: agora(), ...base }); return id;
}
export const excluirNoite = (id) => db.sSono.update(id, { excluido: true, atualizadoEm: agora() });
export async function salvarCochilo(c) {
  const base = { data: c.data, inicio: c.inicio, fim: c.fim, atualizadoEm: agora(), excluido: false };
  if (c.id) { await db.sCochilos.update(c.id, base); return c.id; }
  const id = uid(); await db.sCochilos.add({ id, criadoEm: agora(), ...base }); return id;
}
export const excluirCochilo = (id) => db.sCochilos.update(id, { excluido: true, atualizadoEm: agora() });

const media = (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const desvio = (v) => { if (v.length < 2) return null; const m = media(v); return Math.sqrt(media(v.map((x) => (x - m) ** 2))); };

export function analisar(noites, cochilos, meta, hoje = hojeStr()) {
  const vivas = noites.filter((n) => !n.excluido);
  const aberta = vivas.filter((n) => !n.levantou).sort((a, b) => b.deitou.localeCompare(a.deitou))[0] || null;
  const fechadas = vivas.filter((n) => n.levantou && minutosEntre(n.deitou, n.levantou) > 0).map((n) => ({ ...n, dur: minutosEntre(n.deitou, n.levantou), dow: pd(n.data).getDay() }))
    .sort((a, b) => b.levantou.localeCompare(a.levantou));
  const ult = (dias) => fechadas.filter((n) => n.data > somaDias(hoje, -dias));
  const s7 = ult(7), s30 = ult(30);
  const deficit7 = s7.reduce((a, n) => a + (meta - n.dur), 0);
  const deitar = s7.map((n) => desdeMeioDia(n.deitou)), acordar = s7.map((n) => desdeMeioDia(n.levantou));
  const reg = desvio(s30.map((n) => desdeMeioDia(n.deitou)));
  const uteis = s30.filter((n) => n.dow >= 1 && n.dow <= 5), fds = s30.filter((n) => n.dow === 0 || n.dow === 6);
  const jet = uteis.length && fds.length ? media(fds.map((n) => desdeMeioDia(n.levantou))) - media(uteis.map((n) => desdeMeioDia(n.levantou))) : null;
  const comQ = s30.filter((n) => n.qualidade);
  const boas = comQ.filter((n) => n.dur >= meta - 30), curtas = comQ.filter((n) => n.dur < meta - 30);
  const coch = cochilos.filter((c) => !c.excluido && c.data > somaDias(hoje, -7)).map((c) => ({ ...c, dur: Math.max(0, minutosEntre(`2000-01-01T${c.inicio}`, `2000-01-01T${c.fim}`)) }));
  const insights = [];
  if (boas.length >= 3 && curtas.length >= 3) { const qb = media(boas.map((n) => n.qualidade)), qc = media(curtas.map((n) => n.qualidade)); if (qb - qc >= 0.5) insights.push(`Quando você dorme perto da meta, a qualidade média é ${qb.toFixed(1)}; nas noites curtas, ${qc.toFixed(1)}.`); }
  if (reg != null && reg > 45) insights.push(`Seu horário de dormir varia bastante (±${Math.round(reg)} min). Horários regulares costumam melhorar o sono.`);
  if (jet != null && Math.abs(jet) >= 90) insights.push(`No fim de semana você acorda ${fmtDur(Math.abs(jet))} ${jet > 0 ? 'mais tarde' : 'mais cedo'} que nos dias úteis ("jet lag social").`);
  if (s7.length >= 3 && deficit7 > 120) insights.push(`Débito de sono na semana: ${fmtDur(deficit7)} abaixo da meta.`);
  const despert = s30.filter((n) => n.despertares != null);
  return {
    aberta, fechadas, ultima: fechadas[0] || null,
    media7: media(s7.map((n) => n.dur)), media30: media(s30.map((n) => n.dur)), n7: s7.length, n30: s30.length,
    deficit7, deitarMedio: deitar.length ? hora(media(deitar)) : null, acordarMedio: acordar.length ? hora(media(acordar)) : null,
    regularidade: reg, jetLag: jet, qualidade: comQ.length ? media(comQ.map((n) => n.qualidade)) : null, despertares: despert.length ? media(despert.map((n) => n.despertares)) : null,
    noMeta: s30.length ? Math.round(s30.filter((n) => n.dur >= meta).length / s30.length * 100) : null,
    melhor: s30.slice().sort((a, b) => (b.qualidade || 0) - (a.qualidade || 0) || b.dur - a.dur)[0] || null,
    pior: s30.slice().sort((a, b) => a.dur - b.dur)[0] || null,
    cochilos: { n: coch.length, total: coch.reduce((a, c) => a + c.dur, 0), media: media(coch.map((c) => c.dur)) },
    grafico: Array.from({ length: 14 }, (_, i) => somaDias(hoje, -13 + i)).map((d) => { const n = fechadas.find((x) => x.data === d); return { d, dur: n?.dur || 0, q: n?.qualidade || null }; }),
    insights
  };
}
