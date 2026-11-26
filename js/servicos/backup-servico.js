// Backup manual: arquivo .json com todos os dados (fica no aparelho/onde você salvar). Lembrete mensal.
import { exportar, mesclar, substituirPorRemoto } from '../sync.js';
import { hojeStr, difDias } from './rotina-servico.js';

const LS = 'backupUlt';
export const ultimoBackup = () => { try { return localStorage.getItem(LS) || ''; } catch { return ''; } };
export const precisaBackup = () => { const u = ultimoBackup(); return !u || difDias(hojeStr(), u) >= 30; };

export async function baixarBackup() {
  const dados = await exportar();
  dados.app = 'organizador'; dados.versao = 1;
  const blob = new Blob([JSON.stringify(dados)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `organizador-backup-${hojeStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  try { localStorage.setItem(LS, hojeStr()); } catch { /* sem armazenamento */ }
  return Object.values(dados.tabelas).reduce((s, t) => s + t.length, 0);
}

export async function lerArquivo(arquivo) {
  const txt = await arquivo.text();
  let d; try { d = JSON.parse(txt); } catch { throw new Error('arquivo inválido'); }
  if (!d?.tabelas || typeof d.tabelas !== 'object') throw new Error('não é um backup do Organizador');
  const total = Object.values(d.tabelas).reduce((s, t) => s + (Array.isArray(t) ? t.length : 0), 0);
  return { dados: d, total, geradoEm: d.geradoEm || '' };
}
// juntar: só acrescenta/atualiza (vence o mais recente). substituir: apaga os dados atuais e põe os do arquivo.
export const restaurar = (dados, modo) => modo === 'substituir' ? substituirPorRemoto(dados) : mesclar(dados);
