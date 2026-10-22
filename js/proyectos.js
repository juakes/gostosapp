// ---------- Proyectos y fuentes ----------
let EXISTENCIAS = [];   // vista v_existencias_stock
let FLUJO = [];         // vista v_flujo_disponible (un registro por mes)
let PLAN = [];          // vista v_plan_reposicion (plan mes a mes)
let vistaActual = 'mes';
let proyectoAbierto = null;
const NOMBRE_TIPO_FUENTE = { flujo: 'Flujo', stock: 'Stock' };

function mapProyecto(p) {
  return {
    id: p.id, titulo: p.titulo, estado: p.estado || 'activo', fechaInicio: p.fecha_inicio, fechaFin: p.fecha_fin,
    presupuesto: p.presupuesto == null ? null : Number(p.presupuesto), monedaPresupuesto: p.moneda_presupuesto || 'USD',
    notas: p.notas, creado: p.created_at
  };
}
function mapFuente(f) {
  return { id: f.id, nombre: f.nombre, tipo: f.tipo, moneda: f.moneda || 'ARS', activa: f.activa !== false, notas: f.notas,
    montoMensual: f.monto_mensual == null ? null : Number(f.monto_mensual) };
}
function mapMovimiento(m) {
  return { id: m.id, fuenteId: m.fuente_id, fecha: m.fecha, tipo: m.tipo || 'deposito', monto: Number(m.monto),
    montoArs: m.monto_ars == null ? null : Number(m.monto_ars), descripcion: m.descripcion };
}
function mapCotizacion(c) { return { id: c.id, fecha: c.fecha, moneda: c.moneda || 'USD', valorArs: Number(c.valor_ars), fuente: c.fuente }; }
function mapAporte(a) {
  return { id: a.id, proyectoId: a.proyecto_id, fuenteId: a.fuente_id, fecha: a.fecha, monto: Number(a.monto), moneda: a.moneda || 'ARS',
    descripcion: a.descripcion, aReponer: a.a_reponer !== false };
}

async function refrescarVistasFinanzas() {
  const [ex, fl, pl] = await Promise.all([
    supa.from('v_existencias_stock').select('*'),
    supa.from('v_flujo_disponible').select('*'),
    supa.from('v_plan_reposicion').select('*').order('mes')
  ]);
  if (ex.error) console.error('v_existencias_stock', ex.error); else EXISTENCIAS = ex.data || [];
  if (fl.error) console.error('v_flujo_disponible', fl.error); else FLUJO = fl.data || [];
  if (pl.error) console.error('v_plan_reposicion', pl.error); else PLAN = pl.data || [];
}

function porMoneda(items) {
  const out = { ARS: 0, USD: 0 };
  items.forEach(x => { out[(x.moneda || 'ARS') === 'USD' ? 'USD' : 'ARS'] += x.monto; });
  return out;
}
function textoPorMoneda(m, vacio = '$0') {
  const partes = [];
  if (m.ARS) partes.push(moneyM(m.ARS, 'ARS'));
  if (m.USD) partes.push(moneyM(m.USD, 'USD'));
  return partes.join(' · ') || vacio;
}
function nombreProyecto(id) { const p = DATA.proyectos.find(x => x.id === id); return p ? p.titulo : '—'; }
function nombreFuente(id) { const f = DATA.fuentes.find(x => x.id === id); return f ? f.nombre : '—'; }
function gastosDeProyecto(id) { return DATA.gastos.filter(g => g.proyectoId === id); }
function aportesDeProyecto(id) { return DATA.aportes.filter(a => a.proyectoId === id); }

// Selector de proyecto en la carga de gastos
function hayProyectosElegibles(sel) { return DATA.proyectos.some(p => p.estado === 'activo' || p.id === sel); }
function opcionesProyecto(sel) {
  const ps = DATA.proyectos.filter(p => p.estado === 'activo' || p.id === sel).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  return `<option value="">Ninguno (cuenta en el gasto del mes)</option>` +
    ps.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.titulo)}${p.estado === 'cerrado' ? ' (cerrado)' : ''}</option>`).join('');
}
function prepararSelectProyecto(sel) {
  document.getElementById('g-proyecto').innerHTML = opcionesProyecto(sel);
  document.getElementById('g-proyecto-wrap').style.display = hayProyectosElegibles(sel) ? 'block' : 'none';
}

// ---- Vistas ----
function cambiarVista(v) {
  vistaActual = v;
  document.querySelectorAll('.vista-tab').forEach(t => t.classList.toggle('active', t.dataset.vista === v));
  ['mes', 'proyectos', 'fuentes'].forEach(n => { document.getElementById('vista-' + n).style.display = n === v ? 'block' : 'none'; });
  renderVistasFinanzas();
  if (v === 'fuentes') refrescarVistasFinanzas().then(renderFuentes);
}
document.querySelectorAll('.vista-tab').forEach(t => t.addEventListener('click', () => cambiarVista(t.dataset.vista)));

function renderVistasFinanzas() {
  if (vistaActual === 'proyectos') renderProyectos();
  if (vistaActual === 'fuentes') renderFuentes();
  if (proyectoAbierto && document.getElementById('sheet-proyecto').style.display === 'block') renderDetalleProyecto();
}

// ---- Barra de % financiado (aportes / gastado, por moneda, sin convertir) ----
function barrasFinanciado(gastado, aportado) {
  const html = ['ARS', 'USD'].filter(m => gastado[m] || aportado[m]).map(m => {
    const pct = gastado[m] > 0 ? aportado[m] / gastado[m] * 100 : null;
    const cls = pct === null ? 'neutral' : pct >= 100 ? 'mint' : pct >= 50 ? 'amber' : 'coral';
    const det = pct === null ? `${moneyM(aportado[m], m)} aportado, sin gastos` : `${Math.round(pct)}% · ${moneyM(aportado[m], m)} de ${moneyM(gastado[m], m)}`;
    return `<div class="fin-row">
      <div class="xp-top"><span class="xp-name">Financiado ${m === 'USD' ? 'en dólares' : 'en pesos'}</span><span>${det}</span></div>
      <div class="cat-bar"><div class="cat-bar-fill ${cls}" style="width:${Math.min(pct || 0, 100)}%"></div></div>
    </div>`;
  }).join('');
  return html || '<div class="hint">Sin gastos ni aportes todavía.</div>';
}

function resumenProyecto(p) {
  const gastos = gastosDeProyecto(p.id);
  // mismo criterio que v_proyectos_saldo (y el plan de reposición): suman todos los gastos del proyecto
  return {
    gastos, gastado: porMoneda(gastos), proyectado: porMoneda(gastos.filter(esProyectado)),
    aportado: porMoneda(aportesDeProyecto(p.id))
  };
}

function renderProyectos() {
  const cont = document.getElementById('lista-proyectos');
  if (!DATA.proyectos.length) {
    cont.innerHTML = '<div class="empty">Todavía no hay proyectos. Creá uno y después asignale gastos desde el formulario de carga.</div>';
    return;
  }
  const orden = DATA.proyectos.slice().sort((a, b) => (a.estado === 'activo' ? 0 : 1) - (b.estado === 'activo' ? 0 : 1) || String(b.creado || '').localeCompare(String(a.creado || '')));
  cont.innerHTML = orden.map(p => {
    const r = resumenProyecto(p);
    const meta = [`${r.gastos.length} gasto${r.gastos.length === 1 ? '' : 's'}`];
    if (r.proyectado.ARS || r.proyectado.USD) meta.push(`<span style="color:#C7BFFF">incluye ${textoPorMoneda(r.proyectado)} proyectado</span>`);
    if (p.presupuesto) meta.push(`presupuesto ${moneyM(p.presupuesto, p.monedaPresupuesto)}`);
    return `<div class="card clickable ${p.estado === 'cerrado' ? 'cerrado' : ''}" data-proy="${p.id}">
      <div class="card-top">
        <input class="titulo-inline" data-titulo="${p.id}" value="${esc(p.titulo)}" aria-label="Título del proyecto">
        ${p.estado === 'cerrado' ? '<span class="proy-estado">cerrado</span>' : ''}
      </div>
      <div class="proy-montos">${textoPorMoneda(r.gastado)}</div>
      <div class="cat-obj" style="margin:0;">${meta.join(' · ')}</div>
      ${barrasFinanciado(r.gastado, r.aportado)}
    </div>`;
  }).join('');
}
document.getElementById('lista-proyectos').addEventListener('click', e => {
  if (e.target.closest('.titulo-inline')) return;
  const c = e.target.closest('[data-proy]');
  if (c) abrirProyecto(c.dataset.proy);
});

// Título editable inline (tarjetas y detalle)
document.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('.titulo-inline') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  if (e.target.matches && e.target.matches('.titulo-inline') && e.key === 'Escape') {
    const p = DATA.proyectos.find(x => x.id === e.target.dataset.titulo);
    if (p) e.target.value = p.titulo;
    e.target.blur();
  }
});
document.addEventListener('change', e => {
  if (e.target.matches && e.target.matches('.titulo-inline')) guardarTituloProyecto(e.target.dataset.titulo, e.target);
});
async function guardarTituloProyecto(id, input) {
  const p = DATA.proyectos.find(x => x.id === id);
  if (!p) return;
  const titulo = input.value.trim();
  if (!titulo || titulo === p.titulo) { input.value = p.titulo; return; }
  const { error } = await supa.from('proyectos').update({ titulo }).eq('id', id);
  if (error) { alert('No se pudo renombrar: ' + error.message); input.value = p.titulo; return; }
  p.titulo = titulo;
  document.querySelectorAll(`.titulo-inline[data-titulo="${id}"]`).forEach(el => { if (el !== input) el.value = titulo; });
}

// ---- Detalle de un proyecto ----
function abrirProyecto(id) {
  abrirSheet('proyecto');
  proyectoAbierto = id;
  renderDetalleProyecto();
}
function renderDetalleProyecto() {
  const cont = document.getElementById('proyecto-body');
  const p = DATA.proyectos.find(x => x.id === proyectoAbierto);
  if (!p) { cont.innerHTML = ''; return; }
  const r = resumenProyecto(p);

  // Desglose por subcategoría
  const grupos = {};
  r.gastos.forEach(g => { const k = claveSub(g.categoria, g.subcategoria); (grupos[k] = grupos[k] || []).push(g); });
  const desglose = Object.entries(grupos)
    .map(([k, items]) => [k, porMoneda(items), items.length])
    .sort((a, b) => (b[1].ARS - a[1].ARS) || (b[1].USD - a[1].USD))
    .map(([k, m, n]) => {
      const [cat, sub] = k.split('›');
      return `<div class="linea"><div><div class="l-nombre">${esc(sub || 'Sin subcategoría')}</div><div class="l-sub">${esc(cat)} · ${n} mov.</div></div><div class="l-monto">${textoPorMoneda(m)}</div></div>`;
    }).join('');

  // Aportes por fuente
  const aportes = aportesDeProyecto(p.id);
  const porFuente = {};
  aportes.forEach(a => { (porFuente[a.fuenteId] = porFuente[a.fuenteId] || []).push(a); });
  const aportesFuente = Object.entries(porFuente).map(([fid, items]) => {
    const f = DATA.fuentes.find(x => x.id === fid);
    return `<div class="linea"><div><div class="l-nombre">${esc(nombreFuente(fid))}</div><div class="l-sub">${f ? NOMBRE_TIPO_FUENTE[f.tipo] || f.tipo : ''} · ${items.length} aporte${items.length === 1 ? '' : 's'}</div></div><div class="l-monto">${textoPorMoneda(porMoneda(items))}</div></div>`;
  }).join('');
  const listaAportes = aportes.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(a => `<div class="tx">
    <div class="tx-date">${fechaCorta(a.fecha)}</div>
    <div>${esc(nombreFuente(a.fuenteId))}${a.descripcion ? `<div class="tx-tags" style="color:var(--ink-soft)">${esc(a.descripcion)}</div>` : ''}</div>
    <div class="tx-amt">${moneyM(a.monto, a.moneda)}</div>
    <div class="tx-actions"><button class="tx-icon-btn tx-del" data-del-aporte="${a.id}" title="Borrar aporte">${X_SVG}</button></div>
  </div>`).join('');

  const filas = r.gastos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(filaTx).join('');
  const fechas = [p.fechaInicio ? 'desde ' + fechaCorta(p.fechaInicio) : '', p.fechaFin ? 'hasta ' + fechaCorta(p.fechaFin) : ''].filter(Boolean).join(' ');
  const meta = [p.estado === 'cerrado' ? 'Cerrado' : 'Activo', fechas, p.presupuesto ? 'presupuesto ' + moneyM(p.presupuesto, p.monedaPresupuesto) : ''].filter(Boolean).join(' · ');

  cont.innerHTML = `
    <input class="titulo-inline" data-titulo="${p.id}" value="${esc(p.titulo)}" style="font-size:18px;" aria-label="Título del proyecto">
    <div class="hint" style="margin-top:2px;">${esc(meta)}</div>
    ${p.notas ? `<div class="hint">${esc(p.notas)}</div>` : ''}
    <div class="card" style="margin-top:14px;">
      <div class="card-label">Total gastado</div>
      <div class="proy-montos">${textoPorMoneda(r.gastado)}</div>
      ${(r.proyectado.ARS || r.proyectado.USD) ? `<div class="hint" style="margin-top:0;color:#C7BFFF;">Incluye ${textoPorMoneda(r.proyectado)} proyectado (todavía sin pagar)</div>` : ''}
      ${barrasFinanciado(r.gastado, r.aportado)}
    </div>
    <div class="seccion-titulo">Por subcategoría</div>
    ${desglose || '<div class="empty">Sin gastos asignados. Al cargar o editar un gasto, elegí este proyecto.</div>'}
    <div class="seccion-titulo">Gastos</div>
    <div id="proyecto-gastos">${filas || '<div class="empty">—</div>'}</div>
    <div class="seccion-titulo">Aportes por fuente</div>
    ${aportesFuente || '<div class="empty">Todavía no hay aportes.</div>'}
    ${listaAportes ? `<div style="margin-top:8px;" id="proyecto-aportes">${listaAportes}</div>` : ''}
    <div class="btn-row">
      <button class="pill pill-primary" onclick="abrirEditorAporte('${p.id}')">+ Aporte</button>
      <button class="pill pill-secondary" onclick="abrirEditorProyecto('${p.id}')">Editar proyecto</button>
    </div>`;
}
document.getElementById('proyecto-body').addEventListener('click', e => {
  const del = e.target.closest('[data-del-aporte]');
  if (del) {
    const a = DATA.aportes.find(x => x.id === del.dataset.delAporte);
    if (a) mostrarConfirmacion(`¿Borrar el aporte de ${moneyM(a.monto, a.moneda)} de ${esc(nombreFuente(a.fuenteId))}?`, () => borrarAporte(a.id));
    return;
  }
  const b = e.target.closest('[data-acc]');
  if (b) { e.preventDefault(); accionGasto(b.dataset.acc, b.dataset.id); }
});

function abrirEditorProyecto(id) {
  const p = id ? DATA.proyectos.find(x => x.id === id) : null;
  const d = p || { titulo: '', estado: 'activo', fechaInicio: hoyISO(), fechaFin: null, presupuesto: null, monedaPresupuesto: 'USD', notas: '' };
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box editor" role="dialog" aria-label="Proyecto">
      <p style="font-weight:700;margin-bottom:4px;">${p ? 'Editar proyecto' : 'Nuevo proyecto'}</p>
      <label>Título</label><input type="text" id="p-titulo" value="${esc(d.titulo)}" placeholder="Ej: Remodelación cocina, Viaje Miami">
      <div class="row2">
        <div><label>Inicio</label><input type="date" id="p-inicio" value="${d.fechaInicio || ''}"></div>
        <div><label>Fin (opcional)</label><input type="date" id="p-fin" value="${d.fechaFin || ''}"></div>
      </div>
      <div class="row2">
        <div><label>Presupuesto (opcional)</label><input type="number" id="p-presupuesto" value="${d.presupuesto ?? ''}" step="0.01"></div>
        <div><label>Moneda</label><select id="p-moneda"><option value="USD" ${d.monedaPresupuesto !== 'ARS' ? 'selected' : ''}>Dólares</option><option value="ARS" ${d.monedaPresupuesto === 'ARS' ? 'selected' : ''}>Pesos</option></select></div>
      </div>
      ${p ? `<label>Estado</label><select id="p-estado"><option value="activo" ${d.estado === 'activo' ? 'selected' : ''}>Activo</option><option value="cerrado" ${d.estado === 'cerrado' ? 'selected' : ''}>Cerrado</option></select>` : ''}
      <label>Notas (opcional)</label><textarea id="p-notas">${esc(d.notas || '')}</textarea>
      <div id="p-warning"></div>
      <div class="btn-row">
        <button class="pill pill-primary" id="p-guardar">Guardar</button>
        <button class="pill pill-secondary" id="p-cancelar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = s => overlay.querySelector(s);
  $('#p-cancelar').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  $('#p-titulo').focus();
  $('#p-guardar').onclick = async () => {
    const titulo = $('#p-titulo').value.trim();
    const presupuesto = parseFloat($('#p-presupuesto').value);
    const inicio = $('#p-inicio').value || null, fin = $('#p-fin').value || null;
    if (!titulo) { $('#p-warning').innerHTML = '<div class="warning-box">Poné un título.</div>'; return; }
    if (inicio && fin && fin < inicio) { $('#p-warning').innerHTML = '<div class="warning-box">La fecha de fin es anterior a la de inicio.</div>'; return; }
    const fila = {
      titulo, fecha_inicio: inicio, fecha_fin: fin, presupuesto: isNaN(presupuesto) ? null : presupuesto,
      moneda_presupuesto: $('#p-moneda').value, notas: $('#p-notas').value.trim() || null
    };
    if (p) fila.estado = $('#p-estado').value;
    $('#p-guardar').disabled = true;
    const q = p ? supa.from('proyectos').update(fila).eq('id', p.id) : supa.from('proyectos').insert(fila);
    const { data, error } = await q.select().single();
    if (error) { $('#p-warning').innerHTML = `<div class="warning-box">${esc(error.message)}</div>`; $('#p-guardar').disabled = false; return; }
    const nuevo = mapProyecto(data);
    const idx = DATA.proyectos.findIndex(x => x.id === nuevo.id);
    if (idx >= 0) DATA.proyectos[idx] = nuevo; else DATA.proyectos.push(nuevo);
    overlay.remove();
    mostrarToast('Proyecto guardado');
    renderTodo();
  };
}

function abrirEditorAporte(proyectoId) {
  const fuentes = DATA.fuentes.filter(f => f.activa).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  if (!fuentes.length) {
    overlay.innerHTML = `<div class="confirm-box"><p>Para cargar un aporte primero creá una fuente (sueldo, ahorro en dólares, etc.) en la pestaña Fuentes.</p>
      <div class="btn-row"><button class="pill pill-secondary" id="a-cerrar">Entendido</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#a-cerrar').onclick = () => overlay.remove();
    return;
  }
  overlay.innerHTML = `
    <div class="confirm-box editor" role="dialog" aria-label="Nuevo aporte">
      <p style="font-weight:700;margin-bottom:4px;">Aporte a ${esc(nombreProyecto(proyectoId))}</p>
      <label>Fuente</label><select id="a-fuente">${fuentes.map(f => `<option value="${f.id}">${esc(f.nombre)} (${NOMBRE_TIPO_FUENTE[f.tipo] || f.tipo}, ${f.moneda})</option>`).join('')}</select>
      <div class="row2">
        <div><label>Monto</label><input type="number" id="a-monto" step="0.01" placeholder="0"></div>
        <div><label>Moneda</label><select id="a-moneda"><option value="ARS">Pesos</option><option value="USD">Dólares</option></select></div>
      </div>
      <label>Fecha</label><input type="date" id="a-fecha" value="${hoyISO()}">
      <label>Descripción (opcional)</label><input type="text" id="a-desc">
      <label class="check" id="a-reponer-wrap"><input type="checkbox" id="a-reponer" checked> Reponer este monto a la fuente con el flujo de los próximos meses</label>
      <div id="a-warning"></div>
      <div class="btn-row">
        <button class="pill pill-primary" id="a-guardar">Guardar</button>
        <button class="pill pill-secondary" id="a-cancelar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = s => overlay.querySelector(s);
  const sincMoneda = () => {
    const f = fuentes.find(x => x.id === $('#a-fuente').value);
    if (!f) return;
    $('#a-moneda').value = f.moneda === 'USD' ? 'USD' : 'ARS';
    $('#a-reponer-wrap').style.display = f.tipo === 'stock' ? 'flex' : 'none';
  };
  $('#a-fuente').addEventListener('change', sincMoneda);
  sincMoneda();
  $('#a-cancelar').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  $('#a-guardar').onclick = async () => {
    const monto = parseFloat($('#a-monto').value);
    if (isNaN(monto) || monto <= 0) { $('#a-warning').innerHTML = '<div class="warning-box">El monto tiene que ser mayor a 0.</div>'; return; }
    $('#a-guardar').disabled = true;
    const { data, error } = await supa.from('proyecto_aportes').insert({
      proyecto_id: proyectoId, fuente_id: $('#a-fuente').value, fecha: $('#a-fecha').value || hoyISO(),
      monto, moneda: $('#a-moneda').value, descripcion: $('#a-desc').value.trim() || null,
      a_reponer: fuentes.find(x => x.id === $('#a-fuente').value)?.tipo === 'stock' ? $('#a-reponer').checked : false
    }).select().single();
    if (error) { $('#a-warning').innerHTML = `<div class="warning-box">${esc(error.message)}</div>`; $('#a-guardar').disabled = false; return; }
    DATA.aportes.push(mapAporte(data));
    overlay.remove();
    mostrarToast('Aporte guardado');
    await refrescarVistasFinanzas();
    renderTodo();
  };
}
async function borrarAporte(id) {
  const { error } = await supa.from('proyecto_aportes').delete().eq('id', id);
  if (error) { alert('No se pudo borrar: ' + error.message); return; }
  DATA.aportes = DATA.aportes.filter(a => a.id !== id);
  await refrescarVistasFinanzas();
  renderTodo();
}
