// ---------- Proyecciones de recurrentes ----------
let mesSeleccionado = ymActual();

function horizonteActual() {
  const base = ymSumar(ymActual(), HORIZONTE_MESES);
  return mesSeleccionado > base ? mesSeleccionado : base;
}
function filaProyectada(r, ym) {
  const f = fechaEnMes(ym, r.dia);
  return {
    fecha: f, hora: null, categoria: r.categoria, subcategoria: r.subcategoria || null, tipo: r.tipo,
    modo_pago: r.modoPago, monto: r.monto, moneda: r.moneda, estado: 'pendiente', vencimiento: f,
    notas: r.nombre, origen: 'proyectado', etiquetas: r.etiquetas || [], recurrente_id: r.id
  };
}
function mesCubierto(r, ym) {
  if (r.mesesOmitidos.includes(ym)) return true;
  if (DATA.gastos.some(g => g.recurrenteId === r.id && ymDe(g.fecha) === ym)) return true;
  // Si ya hay un pago real de la misma subcategoría ese mes (cargado antes de crear el recurrente), no proyectar encima
  if (r.subcategoria && DATA.gastos.some(g => !esProyectado(g) && ymDe(g.fecha) === ym && g.categoria === r.categoria && g.subcategoria === r.subcategoria && (g.moneda || 'ARS') === r.moneda)) return true;
  return false;
}
async function asegurarProyecciones(hastaYM) {
  const minimo = ymSumar(ymActual(), HORIZONTE_MESES);
  if (!hastaYM || hastaYM < minimo) hastaYM = minimo;
  const nuevas = [];
  DATA.recurrentes.filter(r => r.activo).forEach(r => {
    let ym = ymDe(r.desde);
    if (ym < ymActual()) ym = ymActual();
    let fin = hastaYM;
    if (r.hasta && ymDe(r.hasta) < fin) fin = ymDe(r.hasta);
    let guard = 0;
    while (ym <= fin && guard++ < 60) {
      if (!mesCubierto(r, ym)) nuevas.push(filaProyectada(r, ym));
      ym = ymSumar(ym, 1);
    }
  });
  if (!nuevas.length) return;
  const { data, error } = await supa.from('gastos').insert(nuevas).select();
  if (error) { console.error('proyecciones', error); return; }
  DATA.gastos.push(...(data || []).map(mapGasto));
}

async function confirmarProyectado(id) {
  const g = DATA.gastos.find(x => x.id === id);
  if (!g) return;
  const { error } = await supa.from('gastos').update({ origen: 'confirmado', estado: 'realizado' }).eq('id', id);
  if (error) { alert('No se pudo confirmar: ' + error.message); return; }
  g.origen = 'confirmado'; g.estado = 'realizado';
  actualizarStatus(); renderTodo(); renderAlertas();
}

async function guardarRecurrente(datos, id, gastoOrigenId) {
  const fila = {
    nombre: datos.nombre, categoria: datos.categoria, subcategoria: datos.subcategoria || null, tipo: datos.tipo,
    modo_pago: datos.modoPago, monto: datos.monto, moneda: datos.moneda, dia: datos.dia,
    desde: datos.desde, hasta: datos.hasta || null, etiquetas: datos.etiquetas, activo: datos.activo
  };
  let r;
  if (id) {
    const { error } = await supa.from('recurrentes').update(fila).eq('id', id);
    if (error) { alert('No se pudo guardar: ' + error.message); return false; }
    r = DATA.recurrentes.find(x => x.id === id);
    Object.assign(r, { ...datos, hasta: datos.hasta || null });
  } else {
    const { data, error } = await supa.from('recurrentes').insert(fila).select().single();
    if (error) { alert('No se pudo guardar: ' + error.message); return false; }
    r = mapRecurrente(data);
    DATA.recurrentes.push(r);
  }
  if (gastoOrigenId) {
    await supa.from('gastos').update({ recurrente_id: r.id }).eq('id', gastoOrigenId);
    const g = DATA.gastos.find(x => x.id === gastoOrigenId);
    if (g) g.recurrenteId = r.id;
  }
  // Regenerar las proyecciones desde este mes en adelante con los datos nuevos
  const desdeMes = ymActual() + '-01';
  const aBorrar = DATA.gastos.filter(g => g.recurrenteId === r.id && esProyectado(g) && g.fecha >= desdeMes).map(g => g.id);
  if (aBorrar.length) {
    await supa.from('gastos').delete().in('id', aBorrar);
    DATA.gastos = DATA.gastos.filter(g => !aBorrar.includes(g.id));
  }
  await asegurarProyecciones(horizonteActual());
  return true;
}
async function eliminarRecurrente(id) {
  const aBorrar = DATA.gastos.filter(g => g.recurrenteId === id && esProyectado(g)).map(g => g.id);
  if (aBorrar.length) await supa.from('gastos').delete().in('id', aBorrar);
  DATA.gastos = DATA.gastos.filter(g => !aBorrar.includes(g.id));
  await supa.from('recurrentes').delete().eq('id', id);
  DATA.recurrentes = DATA.recurrentes.filter(r => r.id !== id);
  DATA.gastos.forEach(g => { if (g.recurrenteId === id) g.recurrenteId = null; });
}
async function omitirMesDeRecurrente(g) {
  const r = DATA.recurrentes.find(x => x.id === g.recurrenteId);
  if (!r) return;
  const ym = ymDe(g.fecha);
  if (!r.mesesOmitidos.includes(ym)) {
    r.mesesOmitidos.push(ym);
    await supa.from('recurrentes').update({ meses_omitidos: r.mesesOmitidos }).eq('id', r.id);
  }
}
function buscarProyectadoCoincidente(n) {
  if (!n.fecha || !n.categoria) return null;
  return DATA.gastos.find(g => esProyectado(g) && g.recurrenteId && g.id !== n.id &&
    ymDe(g.fecha) === ymDe(n.fecha) && g.categoria === n.categoria &&
    (g.subcategoria || '') === (n.subcategoria || '') && (g.moneda || 'ARS') === (n.moneda || 'ARS')) || null;
}
function htmlReemplazo(proy, monto, idCheck) {
  if (!proy) return '';
  const cerca = monto > 0 && Math.abs(monto - proy.monto) / proy.monto < 0.2;
  return `<div class="reemplazo-box"><label class="check"><input type="checkbox" id="${idCheck}" ${cerca ? 'checked' : ''}>
    Es el pago de "${esc(proy.notas || proy.subcategoria || proy.categoria)}" proyectado en ${moneyM(proy.monto, proy.moneda)} para este mes: reemplazar la proyección</label></div>`;
}
