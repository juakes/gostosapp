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

async function cargarTodo() {
  DATA.gastos = (await traerTodos('gastos')).map(mapGasto);
  DATA.ingresos = (await traerTodos('ingresos')).map(i => ({ id: i.id, fecha: i.fecha, monto: Number(i.monto), descripcion: i.descripcion }));
  DATA.recurrentes = (await traerTodos('recurrentes')).map(mapRecurrente);
  DATA.proyectos = (await traerTodos('proyectos')).map(mapProyecto);
  DATA.fuentes = (await traerTodos('fuentes')).map(mapFuente);
  DATA.movimientos = (await traerTodos('fuente_movimientos')).map(mapMovimiento);
  DATA.aportes = (await traerTodos('proyecto_aportes')).map(mapAporte);
  DATA.cotizaciones = (await traerTodos('cotizaciones')).map(mapCotizacion);

  const objetivosRows = await traerTodos('objetivos');
  DATA.objetivos = {}; DATA.sumaAlTotal = {};
  if (objetivosRows.length) {
    objetivosRows.forEach(o => { DATA.objetivos[o.categoria] = Number(o.monto) || 0; DATA.sumaAlTotal[o.categoria] = o.suma_al_total !== false; });
  } else {
    DATA.objetivos = { ...OBJETIVOS_DEFAULT };
    await supa.from('objetivos').insert(Object.entries(OBJETIVOS_DEFAULT).map(([categoria, monto]) => ({ categoria, monto })));
  }

  // objetivo por subcategoría ('' = la categoría entera, para categorías sin subcategorías)
  DATA.objSub = {};
  (await traerTodos('objetivos_subcategoria')).forEach(o => {
    (DATA.objSub[o.categoria] = DATA.objSub[o.categoria] || {})[o.subcategoria] = { monto: Number(o.monto) || 0, activa: o.activa !== false };
  });

  const subRows = await traerTodos('subcategorias');
  DATA.categorias = {};
  Object.keys(DATA.objetivos).forEach(cat => { DATA.categorias[cat] = []; });
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
