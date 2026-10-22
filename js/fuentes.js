// ---- Fuentes ----
const NOMBRE_MOV = { saldo_inicial: 'Saldo inicial', deposito: 'Depósito', retiro: 'Retiro', reposicion: 'Reposición', ajuste: 'Ajuste' };
function cotizacionActual() {
  return DATA.cotizaciones.filter(c => c.moneda === 'USD')
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || null;
}
// signo con el que el movimiento afecta la existencia (igual que v_existencias_stock)
function montoConSigno(m) { return m.tipo === 'retiro' ? -Math.abs(m.monto) : m.monto; }
function existenciaDe(id) { return EXISTENCIAS.find(x => x.fuente_id === id) || null; }

function renderFuentes() {
  // Flujo del mes en curso (v_flujo_disponible, en pesos)
  const ym = ymActual();
  const row = FLUJO.find(f => String(f.mes).slice(0, 7) === ym);
  let flujoHtml;
  if (!row) {
    flujoHtml = '<div class="empty">Sin datos de flujo para este mes. Creá una fuente de flujo con su monto mensual.</div>';
  } else {
    const n = k => Number(row[k]) || 0;
    const disp = n('flujo_disponible');
    flujoHtml = `
      <div class="card-num ${disp < 0 ? 'coral' : 'mint'}">${disp < 0 ? '−' : ''}${money(Math.abs(disp))}</div>
      <div style="margin-top:6px;">
        <div class="linea"><span>Ingreso esperado</span><span class="l-monto">${money(n('ingreso_esperado'))}</span></div>
        <div class="linea"><div><div>− Gasto esperado</div><div class="l-sub">Registrado ${money(n('gasto_registrado'))} · objetivo ${money(n('objetivo_total'))} (se toma el mayor)</div></div><span class="l-monto">${money(n('gasto_esperado'))}</span></div>
        <div class="linea"><span>− Aportes a proyectos</span><span class="l-monto">${money(n('aportes_proyectos'))}</span></div>
        <div class="linea"><span>− Reposiciones a stock</span><span class="l-monto">${money(n('reposiciones_stock'))}</span></div>
      </div>`;
  }
  const cot = cotizacionActual();
  document.getElementById('fuentes-flujo-mes').innerHTML = `<div class="card">
      <div class="card-label">Flujo disponible de ${esc(nombreMes(ym))}</div>
      ${flujoHtml}
    </div>
    <div class="card">
      <div class="card-top">
        <div><div class="card-label">Cotización del dólar</div>
          <div style="font-weight:700;font-size:16px;">${cot ? money(cot.valorArs) : 'sin cargar'}</div>
          ${cot ? `<div class="l-sub" style="font-size:11px;color:var(--ink-soft);">${fechaCorta(cot.fecha)}${cot.fuente ? ' · ' + esc(cot.fuente) : ''}</div>` : ''}</div>
        <button class="pill pill-secondary" style="width:auto;padding:9px 14px;font-size:12.5px;" onclick="abrirEditorCotizacion()">Actualizar</button>
      </div>
    </div>`;

  // Stock: existencia y a reponer
  const stock = EXISTENCIAS.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  document.getElementById('lista-fuentes-stock').innerHTML = stock.map(x => {
    const e = Number(x.existencia) || 0, rep = Number(x.a_reponer) || 0;
    return `<div class="card clickable" data-fuente="${x.fuente_id}">
      <div class="card-top"><span style="font-weight:700;">${esc(x.nombre)}</span><span class="card-num ${e < 0 ? 'coral' : ''}" style="font-size:18px;">${moneyM(e, x.moneda)}</span></div>
      <div class="cat-obj" style="margin:2px 0 0;">${rep > 0 ? `<span style="color:var(--amber)">A reponer: ${moneyM(rep, x.moneda)}</span>` : 'Nada para reponer'} · tocá para ver movimientos</div>
    </div>`;
  }).join('') || '<div class="empty">Sin fuentes de stock (ahorros, broker, dólares guardados...).</div>';

  // Plan de reposición (v_plan_reposicion)
  document.getElementById('plan-reposicion').innerHTML = renderPlanReposicion(cot);

  const flujo = DATA.fuentes.filter(f => f.tipo === 'flujo' && f.activa).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const desde = ym + '-01', hasta = finDeMes(ym);
  document.getElementById('lista-fuentes-flujo').innerHTML = flujo.length ? `<div class="card">${flujo.map(f => {
    const ap = porMoneda(DATA.aportes.filter(a => a.fuenteId === f.id && a.fecha >= desde && a.fecha <= hasta));
    return `<div class="linea"><div><div class="l-nombre">${esc(f.nombre)}</div><div class="l-sub">${f.montoMensual != null ? moneyM(f.montoMensual, f.moneda) + ' por mes' : 'sin monto mensual'}${f.notas ? ' · ' + esc(f.notas) : ''}</div></div>
      <div class="l-monto">${textoPorMoneda(ap, '—')}<div class="l-sub">aportado este mes</div></div></div>`;
  }).join('')}</div>` : '<div class="empty">Sin fuentes de flujo (sueldo, honorarios...).</div>';
}
function renderPlanReposicion(cot) {
  if (!cot) return '<div class="empty">Cargá la cotización del dólar para calcular el plan.</div>';
  if (!PLAN.length) return '<div class="empty">Sin plan: hace falta al menos una fuente cargada.</div>';
  // se muestran los meses hasta que el pendiente llega a cero
  const filas = [];
  for (const p of PLAN) { filas.push(p); if (!(Number(p.pendiente_restante_usd) > 0)) break; }
  const totalPend = Number(filas[0].pendiente_restante_usd) + Number(filas[0].asignar_usd);
  if (!(totalPend > 0)) return '<div class="empty">No hay nada pendiente de reponer.</div>';
  return `<div class="card" style="padding:10px 12px;">
    <table class="tabla">
      <thead><tr><th>Mes</th><th>Sugerido ARS</th><th>Sugerido USD</th><th>Pendiente</th></tr></thead>
      <tbody>${filas.map(p => `<tr>
        <td>${esc(mesCorto(String(p.mes).slice(0, 7)))}</td>
        <td>${money(Number(p.asignar_ars))}</td>
        <td>${moneyM(Number(p.asignar_usd), 'USD')}</td>
        <td>${moneyM(Number(p.pendiente_restante_usd), 'USD')}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="hint">Con el dólar a ${money(Number(filas[0].cotizacion_usada))}. Pendiente: gastos de proyectos activos sin aportes, más lo que hay que reponer a las fuentes de stock en dólares.${Number(filas[filas.length - 1].pendiente_restante_usd) > 0 ? ' El plan llega hasta 12 meses; con el flujo actual no alcanza a cubrir todo.' : ''}</div>
  </div>`;
}
document.getElementById('lista-fuentes-stock').addEventListener('click', e => {
  const c = e.target.closest('[data-fuente]');
  if (c) abrirFuente(c.dataset.fuente);
});

function abrirEditorCotizacion() {
  const cot = cotizacionActual();
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box editor" role="dialog" aria-label="Cotización del dólar">
      <p style="font-weight:700;margin-bottom:4px;">Cotización del dólar</p>
      <div class="row2">
        <div><label>Pesos por dólar</label><input type="number" id="c-valor" step="0.01" value="${cot ? cot.valorArs : ''}"></div>
        <div><label>Fecha</label><input type="date" id="c-fecha" value="${hoyISO()}"></div>
      </div>
      <label>Fuente (opcional)</label><input type="text" id="c-fuente" placeholder="Ej: Dólar MEP, Ámbito">
      <div class="hint">El plan de reposición usa la cotización más reciente.</div>
      <div id="c-warning"></div>
      <div class="btn-row">
        <button class="pill pill-primary" id="c-guardar">Guardar</button>
        <button class="pill pill-secondary" id="c-cancelar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = s => overlay.querySelector(s);
  $('#c-cancelar').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  $('#c-valor').focus();
  $('#c-guardar').onclick = async () => {
    const valor = parseFloat($('#c-valor').value);
    const fecha = $('#c-fecha').value || hoyISO();
    if (isNaN(valor) || valor <= 0) { $('#c-warning').innerHTML = '<div class="warning-box">Poné un valor mayor a 0.</div>'; return; }
    $('#c-guardar').disabled = true;
    // una cotización por día: si ya hay una con esa fecha, se actualiza
    const existente = DATA.cotizaciones.find(c => c.moneda === 'USD' && c.fecha === fecha);
    const fila = { fecha, moneda: 'USD', valor_ars: valor, fuente: $('#c-fuente').value.trim() || null };
    const q = existente ? supa.from('cotizaciones').update(fila).eq('id', existente.id) : supa.from('cotizaciones').insert(fila);
    const { data, error } = await q.select().single();
    if (error) { $('#c-warning').innerHTML = `<div class="warning-box">${esc(error.message)}</div>`; $('#c-guardar').disabled = false; return; }
    const nueva = mapCotizacion(data);
    DATA.cotizaciones = DATA.cotizaciones.filter(c => c.id !== nueva.id).concat(nueva);
    overlay.remove();
    mostrarToast('Cotización guardada');
    await refrescarVistasFinanzas();
    renderTodo();
  };
}

function abrirReposicion(fuenteIdInicial) {
  const stock = DATA.fuentes.filter(f => f.tipo === 'stock' && f.activa).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  if (!stock.length) {
    overlay.innerHTML = `<div class="confirm-box"><p>No hay fuentes de stock para reponer.</p>
      <div class="btn-row"><button class="pill pill-secondary" id="r2-cerrar">Entendido</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#r2-cerrar').onclick = () => overlay.remove();
    return;
  }
  const inicial = fuenteIdInicial || (stock.find(f => Number(existenciaDe(f.id)?.a_reponer) > 0) || stock[0]).id;
  overlay.innerHTML = `
    <div class="confirm-box editor" role="dialog" aria-label="Registrar reposición">
      <p style="font-weight:700;margin-bottom:4px;">Registrar reposición</p>
      <label>Fuente</label><select id="rp-fuente">${stock.map(f => `<option value="${f.id}" ${f.id === inicial ? 'selected' : ''}>${esc(f.nombre)} (${f.moneda})</option>`).join('')}</select>
      <div class="hint" id="rp-info"></div>
      <div class="row2">
        <div><label id="rp-monto-label">Monto</label><input type="number" id="rp-monto" step="0.01" placeholder="0"></div>
        <div id="rp-ars-wrap"><label>Equivale en pesos</label><input type="number" id="rp-ars" step="0.01" placeholder="0"></div>
      </div>
      <label>Fecha</label><input type="date" id="rp-fecha" value="${hoyISO()}">
      <label>Descripción (opcional)</label><input type="text" id="rp-desc">
      <div class="hint">La reposición suma a la fuente y descuenta su equivalente en pesos del flujo del mes.</div>
      <div id="rp-warning"></div>
      <div class="btn-row">
        <button class="pill pill-primary" id="rp-guardar">Guardar</button>
        <button class="pill pill-secondary" id="rp-cancelar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = s => overlay.querySelector(s);
  const cot = cotizacionActual();
  let arsTocado = false;
  const fuenteSel = () => stock.find(f => f.id === $('#rp-fuente').value);
  const recalcularArs = () => {
    const f = fuenteSel(), monto = parseFloat($('#rp-monto').value);
    if (f.moneda === 'ARS') return;
    if (!arsTocado && cot && !isNaN(monto)) $('#rp-ars').value = Math.round(monto * cot.valorArs * 100) / 100;
  };
  const sincFuente = () => {
    const f = fuenteSel();
    const rep = Number(existenciaDe(f.id)?.a_reponer) || 0;
    $('#rp-info').textContent = rep > 0 ? `A reponer: ${moneyM(rep, f.moneda)}` : 'Esta fuente no tiene nada pendiente de reponer.';
    $('#rp-monto-label').textContent = `Monto (${f.moneda})`;
    $('#rp-ars-wrap').style.display = f.moneda === 'ARS' ? 'none' : 'block';
    // sugerencia: lo que el plan asigna este mes (en dólares), sin pasarse de lo que falta reponer
    const plan = PLAN.find(p => String(p.mes).slice(0, 7) === ymActual());
    const sugerido = f.moneda === 'USD' && plan && Number(plan.asignar_usd) > 0 ? Number(plan.asignar_usd) : rep;
    const monto = rep > 0 ? Math.min(sugerido, rep) : sugerido;
    $('#rp-monto').value = monto > 0 ? Math.round(monto * 100) / 100 : '';
    arsTocado = false;
    recalcularArs();
  };
  $('#rp-fuente').addEventListener('change', sincFuente);
  $('#rp-monto').addEventListener('input', recalcularArs);
  $('#rp-ars').addEventListener('input', () => { arsTocado = true; });
  sincFuente();
  $('#rp-cancelar').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  $('#rp-guardar').onclick = async () => {
    const f = fuenteSel();
    const monto = parseFloat($('#rp-monto').value);
    const montoArs = f.moneda === 'ARS' ? monto : parseFloat($('#rp-ars').value);
    if (isNaN(monto) || monto <= 0) { $('#rp-warning').innerHTML = '<div class="warning-box">El monto tiene que ser mayor a 0.</div>'; return; }
    if (isNaN(montoArs) || montoArs <= 0) { $('#rp-warning').innerHTML = '<div class="warning-box">Poné el equivalente en pesos (o cargá la cotización).</div>'; return; }
    $('#rp-guardar').disabled = true;
    const { data, error } = await supa.from('fuente_movimientos').insert({
      fuente_id: f.id, fecha: $('#rp-fecha').value || hoyISO(), tipo: 'reposicion', monto, monto_ars: montoArs,
      descripcion: $('#rp-desc').value.trim() || null
    }).select().single();
    if (error) { $('#rp-warning').innerHTML = `<div class="warning-box">${esc(error.message)}</div>`; $('#rp-guardar').disabled = false; return; }
    DATA.movimientos.push(mapMovimiento(data));
    overlay.remove();
    mostrarToast('Reposición registrada');
    await refrescarVistasFinanzas();
    renderTodo();
  };
}

function abrirEditorFuente() {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box editor" role="dialog" aria-label="Nueva fuente">
      <p style="font-weight:700;margin-bottom:4px;">Nueva fuente</p>
      <label>Nombre</label><input type="text" id="f-nombre" placeholder="Ej: Ingresos mensuales, Broker USD">
      <div class="row2">
        <div><label>Tipo</label><select id="f-tipo"><option value="flujo">Flujo (ingreso mensual)</option><option value="stock">Stock (ahorro acumulado)</option></select></div>
        <div><label>Moneda</label><select id="f-moneda"><option value="ARS">Pesos</option><option value="USD">Dólares</option></select></div>
      </div>
      <div id="f-mensual-wrap"><label>Monto mensual esperado</label><input type="number" id="f-mensual" step="0.01" placeholder="0"></div>
      <label>Notas (opcional)</label><input type="text" id="f-notas">
      <div class="hint">Flujo: lo que entra cada mes; su monto mensual es el ingreso esperado del flujo disponible. Stock: un ahorro con saldo propio; cargale el saldo inicial desde su detalle.</div>
      <div id="f-warning"></div>
      <div class="btn-row">
        <button class="pill pill-primary" id="f-guardar">Guardar</button>
        <button class="pill pill-secondary" id="f-cancelar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = s => overlay.querySelector(s);
  $('#f-tipo').addEventListener('change', () => { $('#f-mensual-wrap').style.display = $('#f-tipo').value === 'flujo' ? 'block' : 'none'; });
  $('#f-cancelar').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  $('#f-nombre').focus();
  $('#f-guardar').onclick = async () => {
    const nombre = $('#f-nombre').value.trim();
    const tipo = $('#f-tipo').value;
    const mensual = parseFloat($('#f-mensual').value);
    if (!nombre) { $('#f-warning').innerHTML = '<div class="warning-box">Poné un nombre.</div>'; return; }
    $('#f-guardar').disabled = true;
    const { data, error } = await supa.from('fuentes').insert({
      nombre, tipo, moneda: $('#f-moneda').value, notas: $('#f-notas').value.trim() || null,
      monto_mensual: tipo === 'flujo' && !isNaN(mensual) ? mensual : null
    }).select().single();
    if (error) { $('#f-warning').innerHTML = `<div class="warning-box">${esc(error.message)}</div>`; $('#f-guardar').disabled = false; return; }
    DATA.fuentes.push(mapFuente(data));
    overlay.remove();
    mostrarToast('Fuente guardada');
    await refrescarVistasFinanzas();
    renderTodo();
  };
}

function abrirFuente(id) {
  const f = DATA.fuentes.find(x => x.id === id);
  if (!f) return;
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  document.body.appendChild(overlay);
  const pintar = () => {
    const ex = existenciaDe(id);
    const rep = ex ? Number(ex.a_reponer) || 0 : 0;
    const movs = DATA.movimientos.filter(m => m.fuenteId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const aps = DATA.aportes.filter(a => a.fuenteId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const usd = f.moneda !== 'ARS';
    overlay.innerHTML = `
      <div class="confirm-box editor" role="dialog" aria-label="${esc(f.nombre)}">
        <p style="font-weight:700;margin-bottom:0;">${esc(f.nombre)}</p>
        <div class="card-num" style="margin:4px 0 2px;">${moneyM(ex ? Number(ex.existencia) : 0, f.moneda)}</div>
        <div class="hint" style="margin-top:0;">${rep > 0 ? `<span style="color:var(--amber)">A reponer: ${moneyM(rep, f.moneda)}</span>` : 'Nada pendiente de reponer'}</div>
        ${rep > 0 ? `<div class="btn-row" style="margin-top:10px;"><button class="pill pill-secondary" id="m-reponer">Registrar reposición</button></div>` : ''}
        <div class="seccion-titulo">Nuevo movimiento</div>
        <div class="row2">
          <div><label style="margin-top:0;">Tipo</label><select id="m-tipo">${Object.entries(NOMBRE_MOV).map(([v, t]) => `<option value="${v}" ${v === 'deposito' ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div><label style="margin-top:0;">Monto (${esc(f.moneda)})</label><input type="number" id="m-monto" step="0.01" placeholder="0"></div>
        </div>
        <div id="m-ars-wrap" style="display:none;"><label>Equivale en pesos</label><input type="number" id="m-ars" step="0.01" placeholder="0"></div>
        <div class="row2">
          <div><label>Fecha</label><input type="date" id="m-fecha" value="${hoyISO()}"></div>
          <div><label>Descripción</label><input type="text" id="m-desc" placeholder="Opcional"></div>
        </div>
        <div class="hint" id="m-hint"></div>
        <div id="m-warning"></div>
        <div class="btn-row"><button class="pill pill-primary" id="m-guardar">Cargar movimiento</button></div>
        <div class="seccion-titulo">Movimientos</div>
        ${movs.map(m => {
          const v = montoConSigno(m);
          return `<div class="tx"><div class="tx-date">${fechaCorta(m.fecha)}</div>
            <div>${esc(NOMBRE_MOV[m.tipo] || m.tipo)}${m.descripcion ? `<div class="tx-tags" style="color:var(--ink-soft)">${esc(m.descripcion)}</div>` : ''}${m.tipo === 'reposicion' && m.montoArs != null && usd ? `<div class="tx-tags" style="color:var(--ink-soft)">= ${money(m.montoArs)}</div>` : ''}</div>
            <div class="tx-amt" style="color:${v < 0 ? 'var(--coral)' : 'var(--mint)'}">${v < 0 ? '−' : '+'}${moneyM(Math.abs(v), f.moneda)}</div>
            <div class="tx-actions"><button class="tx-icon-btn tx-del" data-del-mov="${m.id}" title="Borrar">${X_SVG}</button></div></div>`;
        }).join('') || '<div class="empty">Sin movimientos.</div>'}
        ${aps.length ? `<div class="seccion-titulo">Aportes a proyectos</div>${aps.map(a => `<div class="tx"><div class="tx-date">${fechaCorta(a.fecha)}</div>
          <div>${esc(nombreProyecto(a.proyectoId))}${a.aReponer ? '<span class="tx-badge">a reponer</span>' : ''}</div>
          <div class="tx-amt" style="color:var(--coral)">−${moneyM(a.monto, a.moneda)}</div><div></div></div>`).join('')}` : ''}
        <div class="btn-row"><button class="pill pill-secondary" id="m-cerrar">Cerrar</button></div>
      </div>`;
    const $ = s => overlay.querySelector(s);
    const cot = cotizacionActual();
    let arsTocado = false;
    const sincTipo = () => {
      const t = $('#m-tipo').value;
      $('#m-ars-wrap').style.display = t === 'reposicion' && usd ? 'block' : 'none';
      $('#m-hint').textContent = t === 'ajuste' ? 'El ajuste puede ser negativo para corregir el saldo.'
        : t === 'retiro' ? 'El retiro resta de la existencia.'
        : t === 'reposicion' ? 'La reposición suma a la fuente y descuenta su equivalente en pesos del flujo del mes.' : '';
    };
    $('#m-tipo').addEventListener('change', sincTipo);
    $('#m-monto').addEventListener('input', () => {
      const monto = parseFloat($('#m-monto').value);
      if (!arsTocado && cot && !isNaN(monto)) $('#m-ars').value = Math.round(monto * cot.valorArs * 100) / 100;
    });
    $('#m-ars').addEventListener('input', () => { arsTocado = true; });
    sincTipo();
    $('#m-cerrar').onclick = () => overlay.remove();
    if (rep > 0) $('#m-reponer').onclick = () => { overlay.remove(); abrirReposicion(id); };
    $('#m-guardar').onclick = async () => {
      const tipo = $('#m-tipo').value;
      const monto = parseFloat($('#m-monto').value);
      if (isNaN(monto) || monto === 0 || (tipo !== 'ajuste' && monto < 0)) {
        $('#m-warning').innerHTML = `<div class="warning-box">${tipo === 'ajuste' ? 'Poné un monto distinto de 0.' : 'Poné un monto mayor a 0.'}</div>`; return;
      }
      let montoArs = null;
      if (tipo === 'reposicion') {
        montoArs = usd ? parseFloat($('#m-ars').value) : monto;
        if (isNaN(montoArs) || montoArs <= 0) { $('#m-warning').innerHTML = '<div class="warning-box">Poné el equivalente en pesos.</div>'; return; }
      }
      $('#m-guardar').disabled = true;
      const { data, error } = await supa.from('fuente_movimientos').insert({
        fuente_id: id, fecha: $('#m-fecha').value || hoyISO(), tipo, monto, monto_ars: montoArs, descripcion: $('#m-desc').value.trim() || null
      }).select().single();
      if (error) { $('#m-warning').innerHTML = `<div class="warning-box">${esc(error.message)}</div>`; $('#m-guardar').disabled = false; return; }
      DATA.movimientos.push(mapMovimiento(data));
      await refrescarVistasFinanzas();
      renderTodo(); pintar();
    };
    overlay.querySelectorAll('[data-del-mov]').forEach(b => b.onclick = () => {
      mostrarConfirmacion('¿Borrar este movimiento?', async () => {
        const { error } = await supa.from('fuente_movimientos').delete().eq('id', b.dataset.delMov);
        if (error) { alert('No se pudo borrar: ' + error.message); return; }
        DATA.movimientos = DATA.movimientos.filter(m => m.id !== b.dataset.delMov);
        await refrescarVistasFinanzas();
        renderTodo(); pintar();
      });
    });
  };
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  pintar();
}
