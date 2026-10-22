// ---------- Alertas ----------
function calcularVencimientoEsteMes(diaVencimiento) { return fechaEnMes(ymActual(), diaVencimiento); }
function estaCargadoEsteMes(cat, sub) {
  const ym = ymActual();
  return DATA.gastos.some(g => g.categoria === cat && g.subcategoria === sub && ymDe(g.fecha) === ym);
}
function alertasAutomaticasFijo() {
  const hoy = hoyISO();
  const alertas = [];
  Object.entries(DATA.categorias).forEach(([cat, subs]) => {
    subs.forEach(s => {
      if (s.tipo !== 'fijo' || !s.diaVencimiento) return;
      const nombre = nombreSub(s);
      if (estaCargadoEsteMes(cat, nombre)) return;
      const venc = calcularVencimientoEsteMes(s.diaVencimiento);
      const diff = diasEntre(hoy, venc);
      if (diff <= 3) alertas.push({ categoria: cat, subcategoria: nombre, vencimiento: venc, vencido: diff < 0, diff });
    });
  });
  return alertas;
}
function proyectadosPorConfirmar() {
  const limite = sumarDias(hoyISO(), 3);
  return DATA.gastos.filter(g => esProyectado(g) && g.recurrenteId && g.fecha <= limite).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
function renderAlertas() {
  const hoy = hoyISO();
  const cont = document.getElementById('lista-alertas');
  const proys = proyectadosPorConfirmar();
  const pendientesManual = DATA.gastos.filter(g => g.tipo === 'fijo' && g.estado === 'pendiente' && !esProyectado(g));
  const autoAlertas = alertasAutomaticasFijo();

  const badge = document.getElementById('badge-alertas');
  const total = proys.filter(g => g.fecha <= hoy).length + pendientesManual.filter(g => g.vencimiento && g.vencimiento < hoy).length + autoAlertas.length;
  badge.style.display = total > 0 ? 'block' : 'none';
  badge.textContent = total;

  let html = '';
  if (proys.length) {
    html += '<div class="alert-group">Recurrentes para confirmar</div>';
    html += proys.map(g => `<div class="alert-item ${g.fecha < hoy ? 'vencido' : ''}">
      <div class="alert-title">${esc(g.notas || g.subcategoria || g.categoria)}: ${moneyM(g.monto, g.moneda)}</div>
      ${g.fecha < hoy ? `Proyectado para el ${fechaCorta(g.fecha)}, sin confirmar` : `Vence el ${fechaCorta(g.fecha)}`}
      <div class="alert-actions">
        <button class="pill pill-primary" data-acc="confirmar" data-id="${g.id}">Ya lo pagué</button>
        <button class="pill pill-secondary" data-acc="editar" data-id="${g.id}">Ajustar monto</button>
        <button class="pill pill-secondary" data-acc="omitir" data-id="${g.id}">No va este mes</button>
      </div>
    </div>`).join('');
  }
  if (autoAlertas.length) {
    html += '<div class="alert-group">Fijos sin cargar</div>';
    html += autoAlertas.map(a => `<div class="alert-item ${a.vencido ? 'vencido' : ''}">
      <div class="alert-title">${esc(a.categoria)} / ${esc(a.subcategoria)}</div>
      ${a.vencido ? `Venció el ${fechaCorta(a.vencimiento)} y no se cargó` : `Vence el ${fechaCorta(a.vencimiento)}, en ${a.diff} día(s)`}
    </div>`).join('');
  }
  if (pendientesManual.length) {
    html += '<div class="alert-group">Marcados como pendientes</div>';
    html += pendientesManual.map(g => {
      const vencido = g.vencimiento && g.vencimiento < hoy;
      return `<div class="alert-item ${vencido ? 'vencido' : ''}">
        <div class="alert-title">${esc(g.categoria)}${g.subcategoria ? ' / ' + esc(g.subcategoria) : ''}: ${moneyM(g.monto, g.moneda)}</div>
        ${g.vencimiento ? `Vence el ${fechaCorta(g.vencimiento)}${vencido ? ' (vencido)' : ''}` : 'Sin fecha de vencimiento'}
      </div>`;
    }).join('');
  }
  cont.innerHTML = html || '<div class="empty">No hay nada pendiente.</div>';
}
document.getElementById('lista-alertas').addEventListener('click', async e => {
  const b = e.target.closest('[data-acc]');
  if (!b) return;
  await accionGasto(b.dataset.acc, b.dataset.id);
  if (b.dataset.acc !== 'editar') renderAlertas();
});
