// ---------- Log de cargas (tabla cargas_log, la llena un trigger en la base) ----------
let LOG_CARGAS = null;
let logFiltro = 'todas';
let refrescoCargasTimer = null;
const TZ_AR = 'America/Argentina/Buenos_Aires';

function programarRefrescoCargas() {
  clearTimeout(refrescoCargasTimer);
  // pequeña espera: el trigger escribe el log en la misma transacción, pero así agrupamos varios guardados seguidos
  refrescoCargasTimer = setTimeout(async () => { await traerCargas(); renderUltimaCarga(); }, 600);
}
async function traerCargas() {
  const { data, error } = await supa.from('cargas_log').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) { console.error('cargas_log', error); return; }
  LOG_CARGAS = data || [];
}
function esCargaReal(c) {
  // una tanda compuesta solo por proyecciones automáticas no cuenta como "carga de datos"
  return c.accion !== 'baja' && c.cantidad > c.proyectadas;
}
function fechaHoraAR(ts, conAnio) {
  const d = new Date(ts);
  const f = d.toLocaleDateString('es-AR', { timeZone: TZ_AR, day: '2-digit', month: '2-digit', ...(conAnio ? { year: '2-digit' } : {}) });
  const h = d.toLocaleTimeString('es-AR', { timeZone: TZ_AR, hour: '2-digit', minute: '2-digit', hour12: false });
  return { f, h };
}
function diaKeyAR(ts) { return new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ_AR }); }
function hace(ts) {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hs = Math.round(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const d = Math.round(hs / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}
function renderUltimaCarga() {
  const txt = document.getElementById('ultima-carga-txt');
  const dot = document.getElementById('ultima-carga-dot');
  if (!LOG_CARGAS) return;
  const reales = LOG_CARGAS.filter(esCargaReal);
  if (!reales.length) { txt.textContent = 'Última carga: sin registros'; dot.className = 'dot coral'; return; }
  const ult = reales[0];
  // todas las filas de la misma tanda (mismo instante) — puede haber más de un medio de pago
  const misma = reales.filter(c => Math.abs(new Date(c.created_at) - new Date(ult.created_at)) < 2000);
  const medios = [...new Set(misma.map(c => c.modo_pago || 'Sin medio'))].join(' + ');
  const { f, h } = fechaHoraAR(ult.created_at);
  txt.innerHTML = `Última carga: <b>${esc(f)} ${esc(h)}</b> / <u>${esc(medios)}</u>`;
  const dias = (Date.now() - new Date(ult.created_at).getTime()) / 86400000;
  dot.className = 'dot' + (dias > 7 ? ' coral' : dias > 3 ? ' amber' : '');
  document.getElementById('ultima-carga').title = hace(ult.created_at) + ' — tocá para ver el historial';
}
// si la app quedó abierta y cargué datos por chat, refrescar al volver a la pestaña
document.addEventListener('visibilitychange', () => { if (!document.hidden && LOG_CARGAS) programarRefrescoCargas(); });
function filtrarLog(f) {
  logFiltro = f;
  document.querySelectorAll('#log-filtros .fchip').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  renderCargas();
}
function montoLog(c) {
  const partes = [];
  if (Number(c.monto_ars)) partes.push(money(Number(c.monto_ars)));
  if (Number(c.monto_usd)) partes.push(moneyM(Number(c.monto_usd), 'USD'));
  return partes.join(' + ') || '—';
}
function fechaCorta(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`; }
function renderCargas() {
  const lista = document.getElementById('log-lista');
  const resumen = document.getElementById('log-resumen');
  if (!LOG_CARGAS) { lista.innerHTML = '<div class="empty">Cargando...</div>'; return; }

  // Resumen: último dato real por medio de pago
  const porMedio = {};
  LOG_CARGAS.filter(esCargaReal).forEach(c => { const k = c.modo_pago || 'Sin medio'; if (!porMedio[k]) porMedio[k] = c; });
  resumen.innerHTML = Object.entries(porMedio)
    .sort((a, b) => new Date(b[1].created_at) - new Date(a[1].created_at))
    .map(([m, c]) => {
      const { f, h } = fechaHoraAR(c.created_at);
      const viejo = (Date.now() - new Date(c.created_at)) / 86400000 > 7;
      return `<div class="log-medio-card"><div class="n">${esc(m)}</div><div class="f${viejo ? ' viejo' : ''}">${esc(f)} ${esc(h)} · ${esc(hace(c.created_at))}</div></div>`;
    }).join('') || '<div class="empty">Sin cargas registradas.</div>';

  const verAuto = document.getElementById('log-auto').checked;
  const items = LOG_CARGAS.filter(c => {
    if (logFiltro !== 'todas' && c.accion !== logFiltro) return false;
    if (!verAuto && c.accion === 'alta' && c.cantidad === c.proyectadas) return false;
    return true;
  });
  if (!items.length) { lista.innerHTML = '<div class="empty">No hay movimientos con este filtro.</div>'; return; }

  const NOMBRE_ACCION = { alta: 'Alta', modificacion: 'Cambio', baja: 'Baja' };
  let html = '', diaActual = null;
  items.forEach(c => {
    const dk = diaKeyAR(c.created_at);
    if (dk !== diaActual) {
      diaActual = dk;
      const d = new Date(c.created_at).toLocaleDateString('es-AR', { timeZone: TZ_AR, weekday: 'long', day: 'numeric', month: 'long' });
      html += `<div class="log-dia">${esc(d)}</div>`;
    }
    const { h } = fechaHoraAR(c.created_at);
    const soloProy = c.cantidad === c.proyectadas;
    const nReal = c.cantidad - c.proyectadas;
    let cant = `${c.cantidad} ${c.cantidad === 1 ? 'gasto' : 'gastos'}`;
    if (c.proyectadas && !soloProy) cant = `${nReal} ${nReal === 1 ? 'gasto' : 'gastos'} + ${c.proyectadas} cuotas proyectadas`;
    if (soloProy) cant = `${c.cantidad} ${c.cantidad === 1 ? 'proyección' : 'proyecciones'}`;
    const periodo = c.fecha_desde ? (c.fecha_desde === c.fecha_hasta ? fechaCorta(c.fecha_desde) : `${fechaCorta(c.fecha_desde)} → ${fechaCorta(c.fecha_hasta)}`) : '';
    const canal = c.canal === 'chat' ? 'vía chat' : c.canal === 'app' ? 'desde la app' : '';
    html += `<div class="log-item${soloProy ? ' auto' : ''}">
      <div class="log-top"><span class="log-medio">${esc(c.modo_pago || 'Sin medio')}</span><span class="log-monto">${esc(montoLog(c))}</span></div>
      <div class="log-sub">
        <span class="log-tag ${c.accion}">${NOMBRE_ACCION[c.accion] || c.accion}</span>
        <span>${esc(h)}</span><span>${esc(cant)}</span>
        ${periodo ? `<span>fechas ${esc(periodo)}</span>` : ''}
        ${canal ? `<span>${esc(canal)}</span>` : ''}
      </div>
    </div>`;
  });
  lista.innerHTML = html;
}
