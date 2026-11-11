// ---------- Mapeo con la base ----------
function mapGasto(g) {
  return {
    id: g.id, fecha: g.fecha, hora: g.hora, categoria: g.categoria,
    subcategoria: g.subcategoria, tipo: g.tipo, modoPago: g.modo_pago,
    monto: Number(g.monto), moneda: g.moneda || 'ARS', estado: g.estado, vencimiento: g.vencimiento,
    notas: g.notas, origen: g.origen, etiquetas: g.etiquetas || [], recurrenteId: g.recurrente_id || null,
    proyectoId: g.proyecto_id || null
  };
}
function filaDB(n) {
  return {
    fecha: n.fecha, hora: n.hora || null, categoria: n.categoria,
    subcategoria: n.subcategoria || null, tipo: n.tipo, modo_pago: n.modoPago,
    monto: n.monto, moneda: n.moneda || 'ARS', estado: n.estado || 'realizado', vencimiento: n.vencimiento || null,
    notas: n.notas || null, origen: n.origen, etiquetas: n.etiquetas || [], recurrente_id: n.recurrenteId || null,
    proyecto_id: n.proyectoId || null
  };
}
function mapRecurrente(r) {
  return {
    id: r.id, nombre: r.nombre, categoria: r.categoria, subcategoria: r.subcategoria, tipo: r.tipo,
    modoPago: r.modo_pago, monto: Number(r.monto), moneda: r.moneda || 'ARS', dia: r.dia || 1,
    desde: r.desde, hasta: r.hasta, etiquetas: r.etiquetas || [], mesesOmitidos: r.meses_omitidos || [], activo: r.activo !== false
  };
}

async function traerTodos(tabla) {
  let out = [], from = 0;
  while (true) {
    const { data, error } = await supa.from(tabla).select('*').range(from, from + 999);
    if (error) { console.error(tabla, error); break; }
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

// Mes de objetivos a usar para ym: el propio si tiene filas; si no, el último anterior con filas (o el primero que haya).
function mesBaseObjetivos(mapa, ym) {
  const meses = Object.keys(mapa).sort();
  if (mapa[ym] || !meses.length) return ym;
  return meses.filter(m => m < ym).pop() || meses[0];
}
// Deja en DATA los objetivos del mes ym. Un mes sin filas arranca con una copia del mes base (solo en memoria
// hasta que se guarde), así editar un mes nuevo no toca los objetivos de otro.
function aplicarObjetivosDelMes(ym) {
  if (!DATA.objetivosMes[ym]) {
    const base = DATA.objetivosMes[mesBaseObjetivos(DATA.objetivosMes, ym)];
    DATA.objetivosMes[ym] = base ? JSON.parse(JSON.stringify(base)) : { objetivos: {}, sumaAlTotal: {} };
  }
  if (!DATA.objSubMes[ym]) {
    const base = DATA.objSubMes[mesBaseObjetivos(DATA.objSubMes, ym)];
    DATA.objSubMes[ym] = base ? JSON.parse(JSON.stringify(base)) : {};
  }
  DATA.objetivos = DATA.objetivosMes[ym].objetivos;
  DATA.sumaAlTotal = DATA.objetivosMes[ym].sumaAlTotal;
  DATA.objSub = DATA.objSubMes[ym];
}

async function cargarTodo() {
  DATA.gastos = (await traerTodos('gastos')).map(mapGasto);
  DATA.ingresos = (await traerTodos('ingresos')).map(i => ({ id: i.id, fecha: i.fecha, monto: Number(i.monto), descripcion: i.descripcion }));
  DATA.recurrentes = (await traerTodos('recurrentes')).map(mapRecurrente);
  DATA.proyectos = (await traerTodos('proyectos')).map(mapProyecto);
  DATA.fuentes = (await traerTodos('fuentes')).map(mapFuente);
  DATA.movimientos = (await traerTodos('fuente_movimientos')).map(mapMovimiento);
  DATA.aportes = (await traerTodos('proyecto_aportes')).map(mapAporte);
  DATA.cotizaciones = (await traerTodos('cotizaciones')).map(mapCotizacion);

  // Los objetivos son por mes (columna mes = primer día del mes). Se guardan agrupados por 'YYYY-MM' y
  // aplicarObjetivosDelMes() deja en DATA.objetivos / sumaAlTotal / objSub solo los del mes que se está viendo.
  const objetivosRows = await traerTodos('objetivos');
  DATA.objetivosMes = {};
  if (objetivosRows.length) {
    objetivosRows.forEach(o => {
      const m = DATA.objetivosMes[ymDe(o.mes)] = DATA.objetivosMes[ymDe(o.mes)] || { objetivos: {}, sumaAlTotal: {} };
      m.objetivos[o.categoria] = Number(o.monto) || 0; m.sumaAlTotal[o.categoria] = o.suma_al_total !== false;
    });
  } else {
    const ym = ymActual();
    DATA.objetivosMes[ym] = { objetivos: { ...OBJETIVOS_DEFAULT }, sumaAlTotal: {} };
    await supa.from('objetivos').insert(Object.entries(OBJETIVOS_DEFAULT).map(([categoria, monto]) => ({ categoria, monto, mes: mesDB(ym) })));
  }

  // objetivo por subcategoría ('' = la categoría entera, para categorías sin subcategorías), también por mes
  DATA.objSubMes = {};
  (await traerTodos('objetivos_subcategoria')).forEach(o => {
    const m = DATA.objSubMes[ymDe(o.mes)] = DATA.objSubMes[ymDe(o.mes)] || {};
    (m[o.categoria] = m[o.categoria] || {})[o.subcategoria] = { monto: Number(o.monto) || 0, activa: o.activa !== false };
  });
  aplicarObjetivosDelMes(mesSeleccionado);

  const subRows = await traerTodos('subcategorias');
  DATA.categorias = {};
  Object.values(DATA.objetivosMes).forEach(m => Object.keys(m.objetivos).forEach(cat => { DATA.categorias[cat] = []; }));
  if (subRows.length) {
    subRows.forEach(s => {
      if (!DATA.categorias[s.categoria]) DATA.categorias[s.categoria] = [];
      DATA.categorias[s.categoria].push({ nombre: s.nombre, tipo: s.tipo, diaVencimiento: s.dia_vencimiento });
    });
  } else {
    const filas = [];
    Object.entries(CATEGORIAS_DEFAULT).forEach(([cat, subs]) => subs.forEach(nombre => filas.push({ categoria: cat, nombre, tipo: 'variable', dia_vencimiento: null })));
    if (filas.length) await supa.from('subcategorias').insert(filas);
    DATA.categorias = normalizarCategorias(JSON.parse(JSON.stringify(CATEGORIAS_DEFAULT)));
  }
  // categorías que aparecen en gastos pero no están en la taxonomía
  DATA.gastos.forEach(g => { if (g.categoria && !DATA.categorias[g.categoria]) DATA.categorias[g.categoria] = []; });

  const correccionesRows = await traerTodos('correcciones');
  DATA.correcciones = {};
  correccionesRows.forEach(c => { DATA.correcciones[c.clave] = { categoria: c.categoria, subcategoria: c.subcategoria, tipo: c.tipo, modoPago: c.modo_pago }; });

  actualizarStatus();
}
function actualizarStatus() {
  const reales = DATA.gastos.filter(g => !esProyectado(g)).length;
  document.getElementById('status-line').textContent = `${reales} gastos registrados`;
  programarRefrescoCargas();
}
