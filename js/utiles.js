// ---------- Utilidades ----------
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function pad(n) { return String(n).padStart(2, '0'); }
function hoyISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function ymDe(fecha) { return String(fecha).slice(0, 7); }
function ymActual() { return hoyISO().slice(0, 7); }
function ymSumar(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
function fechaEnMes(ym, dia) { const [y, m] = ym.split('-').map(Number); const dim = new Date(y, m, 0).getDate(); return `${ym}-${pad(Math.min(dia, dim))}`; }
function finDeMes(ym) { return fechaEnMes(ym, 31); }
function diasEntre(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
function sumarDias(fecha, n) { const d = new Date(fecha + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function nombreMes(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m-1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); }
function mesCorto(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m-1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') + ' ' + String(y).slice(2); }
function fechaCorta(fechaStr) { return `${fechaStr.slice(8,10)}/${fechaStr.slice(5,7)}`; }
function nombreDiaSemana(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00');
  const nombre = d.toLocaleDateString('es-AR', { weekday: 'short' });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1).replace('.', '');
}
function money(v) { return '$' + Math.round(Math.round((v || 0) * 100) / 100).toLocaleString('es-AR'); }
function moneyM(v, moneda) { return moneda === 'USD' ? 'US$ ' + (Math.round((v || 0) * 100) / 100).toLocaleString('es-AR') : money(v); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function sumar(arr) { return arr.reduce((s, g) => s + g.monto, 0); }
function esProyectado(g) { return g.origen === 'proyectado'; }
function esUSD(g) { return (g.moneda || 'ARS') === 'USD'; }
function sumaAlTotal(cat) { return DATA.sumaAlTotal[cat] !== false; }
function claveSub(cat, sub) { return cat + '›' + (sub || ''); }
function parseEtiquetas(str) { return [...new Set(String(str || '').split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean))]; }
function todasLasEtiquetas() {
  const s = new Set();
  DATA.gastos.forEach(g => (g.etiquetas || []).forEach(t => s.add(t)));
  DATA.recurrentes.forEach(r => (r.etiquetas || []).forEach(t => s.add(t)));
  return [...s].sort((a, b) => a.localeCompare(b, 'es'));
}
function modosDePago() {
  const s = new Set(MODOS_BASE);
  DATA.gastos.forEach(g => g.modoPago && s.add(g.modoPago));
  DATA.recurrentes.forEach(r => r.modoPago && s.add(r.modoPago));
  return [...s];
}
function opcionesModo(sel) { return modosDePago().map(m => `<option ${m === sel ? 'selected' : ''}>${esc(m)}</option>`).join(''); }
function opcionesTipo(sel) { return TIPOS.map(([v, t]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${t}</option>`).join(''); }
