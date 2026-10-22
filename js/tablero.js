// ---------- Tablero del mes (Variables / Fijos / Proyección) ----------
// Ignora los filtros: solo pesos, solo categorías que suman al total y sin gastos asignados a proyectos.
let tileSel = 'variables';
let TB_ITEMS = {};
const MONOGRAMAS = {
  'Mercado Pago': ['MP', '#1E8FD6'], 'Visa BBVA': ['VB', '#1D5FB0'], 'Visa Ciudad': ['VC', '#D9752E'],
  'Mastercard Ciudad': ['MC', '#D2434F'], 'Visa Provincia': ['VP', '#2F8F57'], 'Brubank': ['BB', '#7A55E8'],
  'Efectivo': ['$', '#3D9A6E'], 'Transferencia': ['TR', '#5B6573']
};
function monograma(modo) {
  const m = MONOGRAMAS[modo];
  const ini = m ? m[0] : (String(modo || '').split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?');
  return `<span class="mono" style="background:${m ? m[1] : '#5B6573'}" title="${esc(modo || 'Sin forma de pago')}">${esc(ini)}</span>`;
}
function esAutomatico(modo) { return /visa|mastercard/i.test(modo || ''); }
function esPagado(g) { return g.origen !== 'proyectado' && g.estado !== 'pendiente'; }
function cuentaEnTablero(g) { return !g.proyectoId && !esUSD(g) && sumaAlTotal(g.categoria); }
function diaMes(f) { return `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`; }
function diasDelMes(ym) { return Number(finDeMes(ym).slice(8)); }
function mesSolo(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long' }); }
function recurrenteVigente(r, ym) {
  return r.activo && ymDe(r.desde) <= ym && (!r.hasta || ymDe(r.hasta) >= ym) && !r.mesesOmitidos.includes(ym);
}
function recurrentesTablero() { return DATA.recurrentes.filter(r => (r.moneda || 'ARS') === 'ARS' && sumaAlTotal(r.categoria)); }
// Un gasto pertenece a un recurrente si tiene su recurrente_id, o si coincide categoría + subcategoría (con un recurrente activo)
function recurrenteDeGasto(g, recs) {
  return (g.recurrenteId && recs.find(r => r.id === g.recurrenteId)) ||
    recs.find(r => r.activo && r.subcategoria && r.categoria === g.categoria && r.subcategoria === g.subcategoria) || null;
}

function calcularTablero(ym) {
  const recs = recurrentesTablero();
  const gastosMes = DATA.gastos.filter(g => ymDe(g.fecha) === ym && cuentaEnTablero(g));
  const porRec = {}, sueltos = [], variables = [];
  gastosMes.forEach(g => {
    const r = recurrenteDeGasto(g, recs);
    if (r) (porRec[r.id] = porRec[r.id] || []).push(g);
    else if (g.tipo === 'flexible') { if (esPagado(g)) variables.push(g); }
    else sueltos.push(g);
  });

  const items = [];
  recs.forEach(r => {
    const vigente = recurrenteVigente(r, ym);
    const gs = porRec[r.id] || [];
    if (!vigente && !gs.length) return;
    const pagos = gs.filter(esPagado), noPagados = gs.filter(g => !esPagado(g));
    const pagado = sumar(pagos);
    const acumulable = r.tipo === 'fijo_acumulable';
    let pendiente = 0, modo = r.modoPago;
    if (vigente) {
      if (acumulable) {
        pendiente = Math.max(0, r.monto - pagado);
        if (pendiente < r.monto * 0.03) pendiente = 0;
      } else if (!pagado) {
        // si ya hay un gasto pendiente cargado (manual o proyectado), manda su monto
        const pend = noPagados.find(g => !esProyectado(g)) || noPagados[0];
        pendiente = pend ? pend.monto : r.monto;
        if (pend && pend.modoPago) modo = pend.modoPago;
      }
    }
    if (!pagado && !pendiente) return;
    items.push({ id: 'r:' + r.id, nombre: r.nombre, modo, pagado, pendiente, monto: r.monto, acumulable, rec: r, gasto: null,
      pagos, noPagados, vence: fechaEnMes(ym, r.dia) });
  });
  sueltos.forEach(g => {
    const pagado = esPagado(g);
    items.push({ id: 'g:' + g.id, nombre: g.notas || g.subcategoria || g.categoria, modo: g.modoPago,
      pagado: pagado ? g.monto : 0, pendiente: pagado ? 0 : g.monto, monto: g.monto, acumulable: false, rec: null, gasto: g,
      pagos: pagado ? [g] : [], noPagados: pagado ? [] : [g], vence: g.vencimiento || g.fecha });
  });

  const todosPagos = items.flatMap(it => it.pagos);
  const pendientes = items.filter(it => it.pendiente > 0).sort((a, b) => a.vence.localeCompare(b.vence));
  const T = {
    ym, items, variables,
    variablesTotal: sumar(variables),
    fijosPagados: sumar(todosPagos),
    fijosPend: items.reduce((s, it) => s + it.pendiente, 0),
    manualPagado: sumar(todosPagos.filter(g => !esAutomatico(g.modoPago))),
    debitoPagado: sumar(todosPagos.filter(g => esAutomatico(g.modoPago))),
    pendManual: pendientes.filter(it => !esAutomatico(it.modo)),
    pendAuto: pendientes.filter(it => esAutomatico(it.modo)),
    pagados: items.filter(it => it.pagado > 0).sort((a, b) => b.pagado - a.pagado),
    objetivo: Object.keys(DATA.objetivos).filter(sumaAlTotal).reduce((s, c) => s + (DATA.objetivos[c] || 0), 0)
  };
  T.manualPend = T.pendManual.reduce((s, it) => s + it.pendiente, 0);
  T.debitoPend = T.pendAuto.reduce((s, it) => s + it.pendiente, 0);
  T.margen = T.objetivo - (T.fijosPagados + T.fijosPend);
  return T;
}

// Variables esperables hasta fin de mes: promedio diario de los 2 meses calendario anteriores
// (flexibles pagados, sin tarjeta, sin #puntual, sin subcategorías con recurrente) × días que faltan
function calcularEsperables(ym) {
  const meses = [ymSumar(ym, -2), ymSumar(ym, -1)];
  const conRec = new Set(recurrentesTablero().filter(r => r.activo && r.subcategoria).map(r => claveSub(r.categoria, r.subcategoria)));
  const base = DATA.gastos.filter(g => meses.includes(ymDe(g.fecha)) && cuentaEnTablero(g) && g.tipo === 'flexible' && esPagado(g) &&
    !esAutomatico(g.modoPago) && !(g.etiquetas || []).some(t => t.toLowerCase() === 'puntual') &&
    !g.recurrenteId && !(g.subcategoria && conRec.has(claveSub(g.categoria, g.subcategoria))));
  const dias = meses.reduce((s, m) => s + diasDelMes(m), 0);
  const faltan = diasDelMes(ym) - Number(hoyISO().slice(8));
  const porCat = {};
  base.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto; });
  const cats = Object.entries(porCat).map(([categoria, suma]) => ({ categoria, diario: suma / dias, esperado: suma / dias * faltan }))
    .filter(c => c.esperado >= 1).sort((a, b) => b.esperado - a.esperado);
  return { meses, faltan, cats, total: cats.reduce((s, c) => s + c.esperado, 0) };
}

function segmentos(partes) {
  const total = partes.reduce((s, p) => s + p.v, 0);
  if (total <= 0) return '';
  return partes.filter(p => p.v > 0).map(p => `<div class="tb-seg ${p.c}" style="width:${p.v / total * 100}%" title="${esc(p.t)}: ${money(p.v)}"></div>`).join('');
}
function leyenda(partes) {
  return `<div class="tb-legend">${partes.map(p => `<span><i class="${p.c}"></i>${esc(p.t)} ${money(p.v)}</span>`).join('')}</div>`;
}

function filaTablero(it, conX) {
  TB_ITEMS[it.id] = it;
  let sub, monto;
  if (it.pendiente > 0) {
    monto = it.pendiente;
    if (it.acumulable && it.pagado > 0) {
      sub = `<div class="tb-prog"><div style="width:${Math.min(it.pagado / it.monto * 100, 100)}%"></div></div><div class="tb-s amber">falta ${money(it.pendiente)} de ${money(it.monto)}</div>`;
    } else {
      const vencido = !esAutomatico(it.modo) && it.vence && it.vence < hoyISO();
      sub = `<div class="tb-s ${vencido ? 'coral' : ''}">${it.vence ? `${vencido ? 'venció' : 'vence'} el ${diaMes(it.vence)}` : ''}${it.rec ? '' : ' · suelto'}</div>`;
    }
  } else {
    monto = it.pagado;
    const fechas = [...new Set(it.pagos.map(g => diaMes(g.fecha)))].join(', ');
    sub = `<div class="tb-s">${it.pagos.length > 1 ? it.pagos.length + ' pagos: ' : 'pagado el '}${fechas}</div>`;
  }
  return `<div class="tb-row ${conX ? '' : 'sin-x'}" data-tb-row="${esc(it.id)}">
    ${monograma(it.modo)}
    <div style="min-width:0;"><div class="tb-n">${esc(it.nombre)}</div>${sub}</div>
    <div class="tb-m">${money(monto)}</div>
    ${conX ? `<button class="tb-x" data-tb-x="${esc(it.id)}" aria-label="Quitar ${esc(it.nombre)} de este mes" title="Quitar de este mes">${X_SVG}</button>` : ''}
  </div>`;
}
function seccion(titulo, monto, extra = '') {
  return `<div class="tb-sec"><span>${titulo}</span><span style="display:flex;align-items:center;gap:8px;"><span class="tb-sec-amt">${money(monto)}</span>${extra}</span></div>`;
}

function graficoVariables(T, dim, diaFin) {
  const W = 320, H = 150, pl = 6, pr = 6, pt = 16, pb = 18;
  const acum = new Array(dim + 1).fill(0);
  T.variables.forEach(g => { const d = Number(g.fecha.slice(8)); for (let i = d; i <= dim; i++) acum[i] += g.monto; });
  const margen = Math.max(T.margen, 0);
  const yMax = Math.max(margen, acum[diaFin] || 0, 1) * 1.12;
  const x = d => pl + d / dim * (W - pl - pr);
  const y = v => pt + (1 - v / yMax) * (H - pt - pb);
  const base = y(0);
  let real = '', area = '';
  if (diaFin > 0) {
    const pts = []; for (let d = 0; d <= diaFin; d++) pts.push(`${x(d).toFixed(1)},${y(acum[d]).toFixed(1)}`);
    real = `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--mint)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    area = `<polygon points="${x(0)},${base} ${pts.join(' ')} ${x(diaFin).toFixed(1)},${base}" fill="var(--mint)" opacity="0.12"/>`;
  }
  const finX = x(diaFin), finY = y(acum[diaFin] || 0);
  const etiquetaFin = diaFin > 0 ? `<circle cx="${finX}" cy="${finY}" r="4" fill="var(--mint)" stroke="#1D2329" stroke-width="2"/>
    <text x="${Math.min(Math.max(finX, 40), W - 40)}" y="${Math.max(finY - 8, 10)}" text-anchor="middle" style="fill:var(--ink);font-weight:700;">${money(acum[diaFin])}</text>` : '';
  const ticks = [1, Math.round(dim / 2), dim].map(d => `<text x="${x(d)}" y="${H - 4}" text-anchor="${d === 1 ? 'start' : d === dim ? 'end' : 'middle'}">${d}</text>`).join('');
  TB_CHART = { acum, dim, diaFin, margen, x, y, W, pl, pr, H, pt, pb };
  return `<svg class="tb-chart" id="tb-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Variables acumulados por día contra el ritmo ideal">
    <line x1="${pl}" y1="${base}" x2="${W - pr}" y2="${base}" stroke="var(--line)" stroke-width="1"/>
    ${area}
    <line x1="${x(0)}" y1="${base}" x2="${x(dim)}" y2="${y(margen)}" stroke="var(--ink-soft)" stroke-width="1.5" stroke-dasharray="4 4"/>
    <text x="${x(dim)}" y="${y(margen) - 6}" text-anchor="end">ideal ${money(margen)}</text>
    ${real}${etiquetaFin}${ticks}
    <line id="tb-guia" x1="0" y1="${pt}" x2="0" y2="${base}" stroke="var(--ink-soft)" stroke-width="1" opacity="0" />
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" id="tb-hit"/>
  </svg><div class="tb-tip" id="tb-tip"></div>`;
}
let TB_CHART = null;
function engancharGrafico() {
  const svg = document.getElementById('tb-chart');
  if (!svg || !TB_CHART) return;
  const C = TB_CHART, guia = svg.querySelector('#tb-guia'), tip = document.getElementById('tb-tip');
  const mover = e => {
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width * C.W;
    const d = Math.min(Math.max(Math.round((px - C.pl) / (C.W - C.pl - C.pr) * C.dim), 1), C.dim);
    guia.setAttribute('x1', C.x(d)); guia.setAttribute('x2', C.x(d)); guia.setAttribute('opacity', '0.6');
    const ideal = C.margen * d / C.dim;
    tip.innerHTML = `Día ${d}: ${d <= C.diaFin ? `<b>${money(C.acum[d])}</b> acumulado · ` : ''}ideal ${money(ideal)}`;
  };
  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerdown', mover);
  svg.addEventListener('pointerleave', () => { guia.setAttribute('opacity', '0'); tip.innerHTML = ''; });
}

function renderTablero(R) {
  const cont = document.getElementById('tablero');
  if (R.esRango) { cont.hidden = true; cont.innerHTML = ''; return; }
  cont.hidden = false;
  TB_ITEMS = {};
  TB_CHART = null;
  const ym = mesSeleccionado, actual = ym === ymActual();
  const T = calcularTablero(ym);
  const E = actual ? calcularEsperables(ym) : null;
  if (tileSel === 'proyeccion' && !actual) tileSel = 'variables';

  const dim = diasDelMes(ym);
  const diaFin = R.tipo === 'actual' ? Number(hoyISO().slice(8)) : (R.tipo === 'pasado' ? dim : 0);
  const pctDias = diaFin / dim * 100;
  const pctVar = T.margen > 0 ? T.variablesTotal / T.margen * 100 : (T.variablesTotal > 0 ? 100 : 0);
  const efectivo = E ? T.manualPend + E.total : 0;

  // Tiles
  const tile = (id, titulo, valor, contexto, clase = '') => `<button class="tb-tile ${tileSel === id ? 'sel' : ''}" data-tile="${id}" aria-pressed="${tileSel === id}">
    <div class="tb-t">${titulo}</div><div class="tb-v">${valor}</div><div class="tb-c ${clase}">${contexto}</div></button>`;
  const nMano = T.pendManual.length;
  let tiles = tile('variables', 'Variables', money(T.variablesTotal), T.margen > 0 ? `${Math.round(pctVar)}% de ${money(T.margen)}` : 'sin margen') +
    tile('fijos', 'Fijos', money(T.fijosPagados),
      nMano ? `${nMano} por pagar a mano` : (T.pendAuto.length ? `${T.pendAuto.length} por débito` : 'todo pagado'), nMano ? 'amber' : '');
  if (actual) tiles += tile('proyeccion', 'Proyección', money(efectivo), 'efectivo a fin de mes');

  // Barra de arriba + contenido de abajo, según el tile elegido
  let barra = '', panel = '';
  if (tileSel === 'variables') {
    const cls = pctVar > 100 ? 'coral' : pctVar > pctDias ? 'amber' : 'mint';
    const derecha = R.tipo === 'actual' ? `${Math.round(pctVar)}% · día ${diaFin} de ${dim}` : `${Math.round(pctVar)}%`;
    barra = `<div class="xp-top"><span class="xp-name">Variables vs. margen</span><span>${derecha}</span></div>
      <div class="xp-track"><div class="xp-fill ${cls}" style="width:${Math.min(pctVar, 100)}%"></div>
      ${R.tipo === 'actual' ? `<div class="tb-marker" style="left:calc(${pctDias}% - 1px)" title="Días transcurridos: ${Math.round(pctDias)}%"></div>` : ''}</div>`;
    let frase;
    const resto = T.margen - T.variablesTotal;
    if (T.margen <= 0) {
      frase = `Los fijos del mes (pagados y pendientes) ya cubren todo el objetivo de <b>${money(T.objetivo)}</b>: no queda margen para variables.`;
    } else if (R.tipo === 'futuro') {
      frase = `El mes todavía no empezó. Margen para variables: <b>${money(T.margen)}</b> (objetivo ${money(T.objetivo)} menos ${money(T.fijosPagados + T.fijosPend)} de fijos).`;
    } else if (R.tipo === 'pasado') {
      frase = resto >= 0 ? `Cerraste <b class="mint">${money(resto)}</b> por debajo del margen de variables.` : `Cerraste <b class="coral">${money(-resto)}</b> por encima del margen de variables.`;
    } else {
      const diff = T.variablesTotal - T.margen * diaFin / dim;
      const faltan = dim - diaFin;
      frase = diff <= 0 ? `Vas <b class="mint">${money(-diff)}</b> por debajo del ritmo ideal. ` : `Vas <b class="coral">${money(diff)}</b> por encima del ritmo ideal. `;
      if (resto <= 0) frase += `Ya usaste todo el margen de variables del mes.`;
      else if (faltan <= 0) frase += `Es el último día: te quedan <b>${money(resto)}</b>.`;
      else frase += `Te quedan <b>${money(resto / faltan)}</b> por día.`;
    }
    panel = graficoVariables(T, dim, diaFin) + `<div class="tb-frase">${frase}</div>`;
  } else if (tileSel === 'fijos') {
    const partes = [
      { c: 'mint', t: 'Pagado a mano', v: T.manualPagado }, { c: 'amber', t: 'Por pagar a mano', v: T.manualPend },
      { c: 'violet', t: 'Débito pagado', v: T.debitoPagado }, { c: 'rayado', t: 'Débito por llegar', v: T.debitoPend }
    ];
    barra = `<div class="xp-top"><span class="xp-name">Fijos del mes</span><span>${money(T.fijosPagados)} de ${money(T.fijosPagados + T.fijosPend)}</span></div>
      <div class="xp-track tb-track">${segmentos(partes)}</div>${leyenda(partes)}`;
    panel = seccion('A pagar a mano', T.manualPend, `<button class="tb-add" data-tb-add="1" aria-label="Agregar pendiente" title="Agregar pendiente">+</button>`) +
      (T.pendManual.map(it => filaTablero(it, true)).join('') || '<div class="tb-vacio">Nada por pagar a mano este mes.</div>');
    if (T.pendAuto.length) panel += seccion('Débitos por llegar con el resumen', T.debitoPend) + T.pendAuto.map(it => filaTablero(it, true)).join('');
    if (T.pagados.length) panel += `<details class="tb-pagados"><summary>${seccion(`Pagados · ${T.pagados.length}<span class="tb-chev">▸</span>`, T.fijosPagados)}</summary>
      ${T.pagados.map(it => filaTablero({ ...it, pendiente: 0, modo: (it.pagos[0] && it.pagos[0].modoPago) || it.modo }, false)).join('')}</details>`;
  } else {
    const partes = [{ c: 'amber', t: 'Fijos a mano', v: T.manualPend }, { c: 'violet', t: 'Variables esperables', v: E.total }];
    barra = `<div class="xp-top"><span class="xp-name">Efectivo hasta fin de mes</span><span>${money(efectivo)}</span></div>
      <div class="xp-track tb-track">${segmentos(partes)}</div>${leyenda(partes)}`;
    panel = seccion('Fijos a pagar a mano', T.manualPend, `<button class="tb-add" data-tb-add="1" aria-label="Agregar pendiente" title="Agregar pendiente">+</button>`) +
      (T.pendManual.map(it => filaTablero(it, true)).join('') || '<div class="tb-vacio">Nada por pagar a mano este mes.</div>');
    panel += seccion(`Variables esperables · ${E.faltan} día${E.faltan === 1 ? '' : 's'}`, E.total) +
      (E.cats.map(c => `<div class="tb-row sin-x" style="cursor:default;">
        <span class="mono" style="background:var(--bg-card-2);color:var(--ink-soft);">${esc(c.categoria.slice(0, 2).toUpperCase())}</span>
        <div style="min-width:0;"><div class="tb-n">${esc(c.categoria)}</div><div class="tb-s">${money(c.diario)} por día</div></div>
        <div class="tb-m">${money(c.esperado)}</div></div>`).join('') || '<div class="tb-vacio">Sin variables esperables.</div>');
    panel += `<div class="hint">Promedio diario de ${mesSolo(E.meses[0])} y ${mesSolo(E.meses[1])}, sin tarjetas, sin #puntual y sin subcategorías que tengan recurrente.</div>`;
    panel += `<div class="tb-total"><span>Total a tener disponible</span><span>${money(efectivo)}</span></div>`;
  }

  cont.innerHTML = `<div class="tb-bar">${barra}</div>
    <div class="tb-tiles ${actual ? '' : 'dos'}" role="tablist">${tiles}</div>
    <div class="tb-panel">${panel}</div>`;
  if (tileSel === 'variables') engancharGrafico();
}

document.getElementById('tablero').addEventListener('click', e => {
  const t = e.target.closest('[data-tile]');
  if (t) { tileSel = t.dataset.tile; renderTablero(rangoVisible()); return; }
  if (e.target.closest('[data-tb-add]')) { e.preventDefault(); abrirNuevoPendiente(); return; }
  const x = e.target.closest('[data-tb-x]');
  if (x) { quitarPendiente(TB_ITEMS[x.dataset.tbX]); return; }
  const row = e.target.closest('[data-tb-row]');
  if (row) {
    const it = TB_ITEMS[row.dataset.tbRow];
    if (!it) return;
    const unico = it.gasto || ((it.pagos || []).length === 1 ? it.pagos[0] : null) || ((it.noPagados || []).length === 1 && !(it.pagos || []).length ? it.noPagados[0] : null);
    if (unico) abrirFicha(unico.id);
    else if (it.rec) abrirEditorRecurrente(it.rec.id);
  }
});

function quitarPendiente(it) {
  if (!it) return;
  const ym = mesSeleccionado;
  const msg = it.rec
    ? `¿Quitar "${esc(it.nombre)}" de ${mesSolo(ym)}? El mes que viene vuelve a aparecer.`
    : `¿Quitar "${esc(it.nombre)}" de ${mesSolo(ym)}?`;
  mostrarConfirmacion(msg, async () => {
    if (it.rec) {
      const r = it.rec;
      if (!r.mesesOmitidos.includes(ym)) {
        const nuevos = [...r.mesesOmitidos, ym];
        const { error } = await supa.from('recurrentes').update({ meses_omitidos: nuevos }).eq('id', r.id);
        if (error) { alert('No se pudo quitar: ' + error.message); return; }
        r.mesesOmitidos = nuevos;
      }
    }
    const ids = it.noPagados.map(g => g.id);
    if (ids.length) {
      const { error } = await supa.from('gastos').delete().in('id', ids);
      if (error) { alert('No se pudo borrar: ' + error.message); return; }
      DATA.gastos = DATA.gastos.filter(g => !ids.includes(g.id));
    }
    actualizarStatus(); renderTodo(); renderAlertas();
  }, 'Sí, quitar');
}

function abrirNuevoPendiente() {
  const ym = mesSeleccionado;
  const catInicial = Object.keys(DATA.categorias).find(sumaAlTotal) || Object.keys(DATA.categorias)[0];
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box editor" role="dialog" aria-label="Nuevo pendiente">
      <p style="font-weight:700;margin-bottom:4px;">Nuevo pendiente de ${esc(mesSolo(ym))}</p>
      <label>Concepto</label><input type="text" id="np-concepto" placeholder="Ej: Cuota crédito auto, Plomero">
      <div class="row2">
        <div><label>Monto</label><input type="number" id="np-monto" step="0.01" placeholder="0"></div>
        <div><label>Forma de pago</label><select id="np-modo">${opcionesModo('Mercado Pago')}</select></div>
      </div>
      <div class="row2">
        <div><label>Categoría</label><select id="np-categoria">${catOptions(catInicial, false)}</select></div>
        <div><label>Subcategoría</label><select id="np-subcategoria">${subcatOptions(catInicial, null, false)}</select></div>
      </div>
      <label>Tipo</label><select id="np-tipo"><option value="fijo">Fijo único</option><option value="fijo_acumulable">Fijo acumulable</option></select>
      <label class="check"><input type="checkbox" id="np-repite"> Se repite todos los meses</label>
      <div id="np-warning"></div>
      <div class="btn-row">
        <button class="pill pill-primary" id="np-guardar">Guardar</button>
        <button class="pill pill-secondary" id="np-cancelar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = s => overlay.querySelector(s);
  $('#np-concepto').focus();
  $('#np-categoria').addEventListener('change', e => { $('#np-subcategoria').innerHTML = subcatOptions(e.target.value, null, false); });
  $('#np-cancelar').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  $('#np-guardar').onclick = async () => {
    const concepto = $('#np-concepto').value.trim();
    const monto = parseFloat($('#np-monto').value);
    const warn = $('#np-warning');
    if (!concepto || isNaN(monto) || monto <= 0) {
      warn.innerHTML = '<div class="warning-box">Completá el concepto y un monto mayor a 0.</div>'; return;
    }
    const datos = {
      categoria: $('#np-categoria').value, subcategoria: $('#np-subcategoria').value || null,
      tipo: $('#np-tipo').value, modoPago: $('#np-modo').value
    };
    const actual = ym === ymActual();
    const fecha = actual ? hoyISO() : ym + '-01';
    $('#np-guardar').disabled = true;
    if ($('#np-repite').checked) {
      const ok = await guardarRecurrente({
        ...datos, nombre: concepto, monto, moneda: 'ARS', dia: Number(fecha.slice(8)),
        desde: ym + '-01', hasta: null, etiquetas: [], activo: true
      }, null, null);
      if (!ok) { $('#np-guardar').disabled = false; return; }
    } else {
      const fila = filaDB({ ...datos, fecha, monto, moneda: 'ARS', estado: 'pendiente', vencimiento: fecha,
        notas: concepto, origen: 'proyectado', etiquetas: [] });
      const { data, error } = await supa.from('gastos').insert(fila).select().single();
      if (error) { warn.innerHTML = `<div class="warning-box">No se pudo guardar: ${esc(error.message)}</div>`; $('#np-guardar').disabled = false; return; }
      DATA.gastos.push(mapGasto(data));
    }
    overlay.remove();
    mostrarToast('Pendiente agregado');
    actualizarStatus(); renderTodo(); renderAlertas();
  };
}
