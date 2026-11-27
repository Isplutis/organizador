// Dica dos gráficos: qualquer elemento com data-tip mostra o valor ao passar o mouse (PC) ou tocar (celular).
let bolha = null, alvo = null, desde = 0;
function mostrar(el) {
  const t = el.getAttribute('data-tip'); if (!t) return;
  if (!bolha) { bolha = document.createElement('div'); bolha.className = 'dica-graf'; bolha.setAttribute('role', 'tooltip'); document.body.appendChild(bolha); }
  bolha.textContent = t; bolha.style.display = 'block'; alvo = el; desde = Date.now();
  document.querySelectorAll('.tip-on').forEach((x) => x.classList.remove('tip-on')); el.classList.add('tip-on');
  const r = el.getBoundingClientRect(), b = bolha.getBoundingClientRect();
  let x = r.left + r.width / 2 - b.width / 2, y = r.top - b.height - 8;
  x = Math.max(6, Math.min(x, window.innerWidth - b.width - 6)); if (y < 6) y = r.bottom + 8;
  bolha.style.left = x + 'px'; bolha.style.top = y + 'px';
}
function esconder() { if (bolha) bolha.style.display = 'none'; if (alvo) alvo.classList.remove('tip-on'); alvo = null; }
export function instalarDicas() {
  document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const el = e.target.closest?.('[data-tip]'); if (el) mostrar(el); else if (alvo) esconder(); });
  document.addEventListener('click', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) { if (el === alvo && e.pointerType !== 'mouse') esconder(); else mostrar(el); } else esconder(); }, true);
  window.addEventListener('scroll', () => { if (Date.now() - desde > 400) esconder(); }, true);
}
