// ---------- Ficha de gasto ----------
// Fila de la lista -> ficha de detalle (solo lectura, con jerarquía) -> edición campo por campo.
let fichaId = null;
let fichaEdit = null;   // 'cat' | 'tipo' | 'medio' | 'estado' | 'fecha' | 'etiquetas' | 'notas'
let IDX_COMP = null;
const TIPO_LABEL = { fijo: 'Fijo', fijo_acumulable: 'Fijo acumulable', flexible: 'Variable' };
const TIPO_AYUDA = {
  fijo: 'Fijo = un pago por mes que no depende de tu conducta (expensas, cochera).',
  fijo_acumulable: 'Acumulable = un fijo que se paga en partes durante el mes (mesadas, doméstico).',
  flexible: 'Variable = depende de lo que decidas gastar; cuenta para el ritmo del mes.'
};
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';
const CAMPO_DB = { fecha: 'fecha', hora: 'hora', categoria: 'categoria', subcategoria: 'subcategoria', tipo: 'tipo',
  modoPago: 'modo_pago', estado: 'estado', etiquetas: 'etiquetas', notas: 'notas', origen: 'origen' };

function esFijo(g) { return g.tipo === 'fijo' || g.tipo === 'fijo_acumulable'; }
function comercioLimpio(txt) { return String(txt || '').split(' — ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim(); }
function tituloGasto(g) {
  if (esFijo(g)) return g.subcategoria || comercioLimpio(g.notas) || g.categoria || 'Gasto';
  return comercioLimpio(g.notas) || g.subcategoria || g.categoria || 'Gasto';
}
function subtituloGasto(g) {
  if (esFijo(g)) { const c = comercioLimpio(g.notas); return c && c !== g.subcategoria ? c : g.categoria; }
  return g.subcategoria || g.categoria;
}
function claveComparable(g) {
  const base = esFijo(g) ? 'S|' + g.categoria + '›' + (g.subcategoria || '') : 'C|' + comercioLimpio(g.notas).toLowerCase();
  return base + '|' + (g.moneda || 'ARS');
}
function indiceComparables() {
  if (IDX_COMP) return IDX_COMP;
  IDX_COMP = {};
  DATA.gastos.forEach(g => {
    if (esProyectado(g) || g.estado === 'pendiente') return;
    const k = claveComparable(g);
    (IDX_COMP[k] = IDX_COMP[k] || []).push(g);
  });
  return IDX_COMP;
}
// Promedio por pago de los 3 meses anteriores (mismo comercio en variables, misma subcategoría en fijos)
function contextoGasto(g) {
  const lista = indiceComparables()[claveComparable(g)] || [];
  const ym = ymDe(g.fecha), desde = ymSumar(ym, -3);
  const previos = lista.filter(x => x.id !== g.id && ymDe(x.fecha) >= desde && ymDe(x.fecha) < ym);
  const prom = previos.length ? sumar(previos) / previos.length : null;
  const serie = [-3, -2, -1, 0].map(d => { const m = ymSumar(ym, d); return { ym: m, total: sumar(lista.filter(x => ymDe(x.fecha) === m)) }; });
  return { prom, n: previos.length, serie, delta: prom ? (g.monto - prom) / prom : null };
}
function deltaTexto(delta) {
  if (delta === null || delta === undefined || !isFinite(delta)) return null;
  const pct = Math.round(delta * 100);
  if (Math.abs(pct) < 1) return { cls: 'soft', txt: '= promedio' };
  return { cls: pct > 15 ? 'coral' : pct > 0 ? 'amber' : 'mint', txt: `${pct > 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('es-AR')}% vs prom.` };
}
function montoGrande(g) {
  if (esUSD(g)) return `US$ ${Math.trunc(g.monto).toLocaleString('es-AR')}<small>,${String(Math.round((g.monto % 1) * 100)).padStart(2, '0')}</small>`;
  const ent = Math.trunc(g.monto), dec = Math.round((g.monto - ent) * 100);
  return `$${ent.toLocaleString('es-AR')}${dec ? `<small>,${String(dec).padStart(2, '0')}</small>` : ''}`;
}
function fechaLarga(f) {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function tipoDeSub(cat, sub) {
  const s = buscarSub(cat, sub);
  if (!s || typeof s === 'string' || !s.tipo) return null;
  return s.tipo === 'variable' ? 'flexible' : s.tipo;
}

function abrirFicha(id) { fichaId = id; fichaEdit = null; abrirSheet('ficha'); }

function renderFicha() {
  const body = document.getElementById('ficha-body');
  const g = DATA.gastos.find(x => x.id === fichaId);
  if (!g) { body.innerHTML = '<div class="empty">Este gasto ya no está en la base.</div><div class="btn-row"><button class="pill pill-secondary" onclick="cerrarSheet()">Cerrar</button></div>'; return; }
  const proy = esProyectado(g), pend = proy || g.estado === 'pendiente';
  const ctx = contextoGasto(g);
  const d = proy ? null : deltaTexto(ctx.delta);

  // mini serie de los últimos 4 meses
  const serie = ctx.serie.map((s, i) => (i === 3 && pend) ? { ...s, total: s.total + g.monto, esp: true } : s);
  const max = Math.max(...serie.map(s => s.total), 1);
  const hayHistoria = serie.slice(0, 3).some(s => s.total > 0);
  const barras = serie.map((s, i) => `<div class="${i === 3 ? (s.esp ? 'esp' : 'act') : ''}" style="height:${Math.max(s.total / max * 100, 4)}%" title="${esc(mesSolo(s.ym))}: ${esc(moneyM(s.total, g.moneda))}"></div>`).join('');
  const etiquetasMes = serie.map(s => `<span>${esc(new Date(s.ym + '-15T00:00:00').toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''))}</span>`).join('');

  const cobro = esAutomatico(g.modoPago) ? 'Débito automático' : 'Manual';
  const estadoTxt = proy ? 'Proyectado' : pend ? 'Pendiente' : 'Realizado';
  const estadoCls = proy ? 'proy' : pend ? 'warn' : 'ok';
  const chip = (k, txt, cls = '') => `<button class="fi-chip ${cls} ${fichaEdit === k ? 'on' : ''}" data-fe="${k}" aria-expanded="${fichaEdit === k}">${esc(txt)}</button>`;

  const fila = (k, label, valor, cls = '') => `<div class="fi-row"><span class="k">${label}</span><span class="v ${cls}">${valor}</span>
      <button class="ed" data-fe="${k}" aria-label="Editar ${label.toLowerCase()}">${PENCIL_SVG}</button></div>${fichaEdit === k ? editorFicha(g, k) : ''}`;

  const etiquetas = (g.etiquetas || []).length ? g.etiquetas.map(t => `<span class="tag">#${esc(t)}</span>`).join(' ') : 'Agregar';

  body.innerHTML = `
    <div class="fi-head">
      <div class="fi-head-txt"><p class="fi-title">${esc(tituloGasto(g))}</p><p class="fi-sub">${esc(subtituloGasto(g) || '')}</p></div>
      <button class="fi-pay" data-fe="medio" aria-label="Cambiar medio de pago (${esc(g.modoPago || 'sin medio')})">${monograma(g.modoPago)}<span class="fi-pay-ed">${PENCIL_SVG}</span></button>
    </div>
    ${fichaEdit === 'medio' ? editorFicha(g, 'medio') : ''}
    <p class="fi-amt ${pend ? 'pend' : ''}">${montoGrande(g)}</p>
    <div class="fi-ctx">${ctx.prom
      ? `<span>Promedio 3 meses <b>${esc(moneyM(ctx.prom, g.moneda))}</b></span>${d ? `<span class="fi-d ${d.cls}">${d.txt}</span>` : ''}`
      : '<span>Sin pagos comparables en los 3 meses anteriores</span>'}</div>
    ${hayHistoria ? `<div class="fi-serie" role="img" aria-label="Total por mes de los últimos cuatro meses">${barras}</div><div class="fi-serie-lb">${etiquetasMes}</div>` : ''}

    <div class="fi-chips">
      ${chip('cat', `${g.categoria || 'Sin categoría'} › ${g.subcategoria || 'sin subcategoría'}`)}
      ${chip('tipo', TIPO_LABEL[g.tipo] || g.tipo || 'Sin tipo')}
      ${chip('medio-cobro', cobro)}
      ${chip('estado', estadoTxt, estadoCls)}
    </div>
    ${['cat', 'tipo', 'medio-cobro', 'estado'].includes(fichaEdit) ? editorFicha(g, fichaEdit) : ''}

    <div class="fi-rows">
      ${fila('fecha', 'Fecha', esc(fechaLarga(g.fecha)) + (g.hora ? ` · ${esc(g.hora.slice(0, 5))} h` : ''))}
      ${fila('etiquetas', 'Etiquetas', etiquetas, (g.etiquetas || []).length ? '' : 'muted')}
      ${fila('notas', 'Texto original', esc(g.notas || 'Sin texto'), 'orig')}
    </div>

    ${proy ? `<button class="pill pill-primary" style="margin-top:16px" data-fa="confirmar">Registrar pago de ${esc(moneyM(g.monto, g.moneda))}</button>` : ''}
    <div class="fi-actions">
      <button class="pill pill-secondary" data-fa="editar">Editar todo</button>
      <button class="pill pill-del" data-fa="borrar" aria-label="Eliminar gasto" title="Eliminar">${TRASH_SVG}</button>
    </div>
    ${!proy && !g.recurrenteId ? '<button class="fi-link" data-fa="recurrente">Repetir todos los meses</button>' : ''}`;

  const sel = body.querySelector('#fe-cat');
  if (sel) sel.onchange = () => {
    document.getElementById('fe-sub').innerHTML = subcatOptions(sel.value, null, false);
    sugerirTipoFicha();
  };
  const sub = body.querySelector('#fe-sub');
  if (sub) sub.onchange = sugerirTipoFicha;
  const foco = body.querySelector('.fi-ed input[type="text"], .fi-ed input[type="date"]');
  if (foco && ['fecha', 'etiquetas', 'notas'].includes(fichaEdit)) foco.focus();
}

function radiosAlcance(nombre, opciones) {
  return `<div class="fi-scope"><div class="fi-scope-lb">Aplicar a</div>${opciones.map(([v, t], i) =>
    `<label class="fi-radio"><input type="radio" name="${nombre}" value="${v}" ${i === 0 ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>`;
}
function botonesEditor(guardar = 'Guardar') {
  return `<div class="btn-row"><button class="pill pill-secondary" data-fa="cancelar">Cancelar</button><button class="pill pill-primary" data-fa="guardar">${guardar}</button></div>`;
}

function editorFicha(g, k) {
  if (k === 'cat') {
    const comercio = comercioLimpio(g.notas);
    const ops = [['uno', 'Solo este gasto']];
    if (g.notas) ops.push(['comercio', `Todos los de “${comercio}”, también los próximos`]);
    return `<div class="fi-ed">
      <label for="fe-cat">Categoría</label><select id="fe-cat">${catOptions(g.categoria, false)}</select>
      <label for="fe-sub">Subcategoría</label><select id="fe-sub">${subcatOptions(g.categoria, g.subcategoria, false)}</select>
      <div class="fi-hint" id="fe-sug"></div>
      ${ops.length > 1 ? radiosAlcance('fe-alc', ops) : ''}
      ${botonesEditor()}</div>`;
  }
  if (k === 'tipo') {
    const ops = [['uno', 'Solo este gasto']];
    if (g.subcategoria) ops.push(['sub', `Todos los de ${g.subcategoria}, también los próximos`]);
    return `<div class="fi-ed">
      <div class="fi-seg" role="radiogroup" aria-label="Tipo">${Object.entries(TIPO_LABEL).map(([v, t]) =>
        `<button role="radio" aria-checked="${g.tipo === v}" class="${g.tipo === v ? 'sel' : ''}" data-tipo="${v}">${t}</button>`).join('')}</div>
      <div class="fi-hint" id="fe-tipo-ayuda">${TIPO_AYUDA[g.tipo] || ''}</div>
      ${ops.length > 1 ? radiosAlcance('fe-alc', ops) : ''}
      ${botonesEditor()}</div>`;
  }
  if (k === 'medio' || k === 'medio-cobro') {
    return `<div class="fi-ed">
      <label for="fe-medio">Medio de pago</label><select id="fe-medio">${opcionesModo(g.modoPago)}</select>
      <div class="fi-hint">El cobro sale del medio: las tarjetas son débito automático y llegan con el resumen; Mercado Pago, efectivo y transferencias son manuales y aparecen en el checklist de fijos.</div>
      ${botonesEditor()}</div>`;
  }
  if (k === 'estado') {
    if (esProyectado(g)) return `<div class="fi-ed"><div class="fi-hint" style="margin-top:0">Es una proyección de un fijo. Cuando lo pagues, registralo con el botón de abajo; si este mes no corresponde, eliminalo.</div></div>`;
    return `<div class="fi-ed"><div class="fi-seg" role="radiogroup" aria-label="Estado">${[['realizado', 'Realizado'], ['pendiente', 'Pendiente']].map(([v, t]) =>
      `<button role="radio" aria-checked="${(g.estado || 'realizado') === v}" class="${(g.estado || 'realizado') === v ? 'sel' : ''}" data-estado="${v}">${t}</button>`).join('')}</div></div>`;
  }
  if (k === 'fecha') {
    return `<div class="fi-ed"><div class="row2"><div><label for="fe-fecha">Fecha</label><input type="date" id="fe-fecha" value="${esc(g.fecha)}"></div>
      <div><label for="fe-hora">Hora</label><input type="time" id="fe-hora" value="${esc(g.hora ? g.hora.slice(0, 5) : '')}"></div></div>${botonesEditor()}</div>`;
  }
  if (k === 'etiquetas') {
    return `<div class="fi-ed"><label for="fe-etq">Etiquetas, separadas por coma</label><input type="text" id="fe-etq" value="${esc((g.etiquetas || []).join(', '))}" placeholder="puntual, regalo">${botonesEditor()}</div>`;
  }
  if (k === 'notas') {
    return `<div class="fi-ed"><label for="fe-notas">Texto original</label><input type="text" id="fe-notas" value="${esc(g.notas || '')}">
      <div class="fi-hint">Es el texto del resumen o de la billetera. De acá sale el nombre del comercio que se usa como título.</div>${botonesEditor()}</div>`;
  }
  return '';
}

function sugerirTipoFicha() {
  const g = DATA.gastos.find(x => x.id === fichaId);
  const cat = document.getElementById('fe-cat').value, sub = document.getElementById('fe-sub').value;
  const t = tipoDeSub(cat, sub);
  const box = document.getElementById('fe-sug');
  box.textContent = t && g && t !== g.tipo ? `Al guardar, el tipo pasa a ${TIPO_LABEL[t]}, el de ${sub}.` : '';
}

async function guardarCambiosGasto(id, cambios) {
  const fila = {};
  Object.entries(cambios).forEach(([k, v]) => { fila[CAMPO_DB[k]] = v; });
  const { error } = await supa.from('gastos').update(fila).eq('id', id);
  if (error) { alert('No se pudo guardar: ' + error.message); return false; }
  Object.assign(DATA.gastos.find(x => x.id === id) || {}, cambios);
  return true;
}
function refrescarFicha(msg = 'Guardado') {
  fichaEdit = null;
  actualizarStatus(); renderTodo(); renderAlertas();
  if (fichaId) renderFicha();
  mostrarToast(msg);
}

async function guardarEditorFicha() {
  const g = DATA.gastos.find(x => x.id === fichaId);
  if (!g) return;
  const alc = (document.querySelector('input[name="fe-alc"]:checked') || {}).value || 'uno';

  if (fichaEdit === 'cat') {
    const categoria = document.getElementById('fe-cat').value;
    const subcategoria = document.getElementById('fe-sub').value || null;
    const cambios = { categoria, subcategoria };
    const t = tipoDeSub(categoria, subcategoria);
    if (t && t !== g.tipo) cambios.tipo = t;
    if (alc === 'comercio' && g.notas) {
      const fila = { categoria, subcategoria }; if (cambios.tipo) fila.tipo = cambios.tipo;
      const { error } = await supa.from('gastos').update(fila).eq('notas', g.notas);
      if (error) { alert('No se pudo guardar: ' + error.message); return; }
      DATA.gastos.filter(x => x.notas === g.notas).forEach(x => Object.assign(x, cambios));
      const clave = g.notas.trim().toLowerCase();
      const regla = { categoria, subcategoria, tipo: cambios.tipo || g.tipo, modoPago: g.modoPago };
      DATA.correcciones[clave] = regla;
      await supa.from('correcciones').upsert({ clave, categoria, subcategoria, tipo: regla.tipo, modo_pago: regla.modoPago }, { onConflict: 'user_id,clave' });
      return refrescarFicha('Guardado; la regla se aplica a las próximas cargas');
    }
    if (await guardarCambiosGasto(g.id, cambios)) refrescarFicha();
    return;
  }

  if (fichaEdit === 'tipo') {
    const b = document.querySelector('.fi-seg button.sel');
    const tipo = b ? b.dataset.tipo : g.tipo;
    if (alc === 'sub' && g.subcategoria) {
      const { error } = await supa.from('gastos').update({ tipo }).eq('categoria', g.categoria).eq('subcategoria', g.subcategoria);
      if (error) { alert('No se pudo guardar: ' + error.message); return; }
      DATA.gastos.filter(x => x.categoria === g.categoria && x.subcategoria === g.subcategoria).forEach(x => { x.tipo = tipo; });
      await supa.from('subcategorias').update({ tipo: tipo === 'flexible' ? 'variable' : tipo }).eq('categoria', g.categoria).eq('nombre', g.subcategoria);
      const s = buscarSub(g.categoria, g.subcategoria);
      if (s && typeof s === 'object') s.tipo = tipo === 'flexible' ? 'variable' : tipo;
      if (tipo !== 'flexible') {
        await supa.from('recurrentes').update({ tipo }).eq('categoria', g.categoria).eq('subcategoria', g.subcategoria);
        DATA.recurrentes.filter(r => r.categoria === g.categoria && r.subcategoria === g.subcategoria).forEach(r => { r.tipo = tipo; });
      }
      return refrescarFicha(`Todos los de ${g.subcategoria} quedaron como ${TIPO_LABEL[tipo]}`);
    }
    if (await guardarCambiosGasto(g.id, { tipo })) refrescarFicha();
    return;
  }

  if (fichaEdit === 'medio' || fichaEdit === 'medio-cobro') {
    if (await guardarCambiosGasto(g.id, { modoPago: document.getElementById('fe-medio').value })) refrescarFicha();
    return;
  }
  if (fichaEdit === 'fecha') {
    const fecha = document.getElementById('fe-fecha').value;
    if (!fecha) { alert('Elegí una fecha.'); return; }
    const hora = document.getElementById('fe-hora').value || null;
    if (await guardarCambiosGasto(g.id, { fecha, hora })) refrescarFicha();
    return;
  }
  if (fichaEdit === 'etiquetas') {
    if (await guardarCambiosGasto(g.id, { etiquetas: parseEtiquetas(document.getElementById('fe-etq').value) })) refrescarFicha();
    return;
  }
  if (fichaEdit === 'notas') {
    if (await guardarCambiosGasto(g.id, { notas: document.getElementById('fe-notas').value.trim() || null })) refrescarFicha();
  }
}

document.getElementById('ficha-body').addEventListener('click', async e => {
  const g = DATA.gastos.find(x => x.id === fichaId);
  if (!g) return;
  const fe = e.target.closest('[data-fe]');
  if (fe) { fichaEdit = fichaEdit === fe.dataset.fe ? null : fe.dataset.fe; renderFicha(); return; }
  const tb = e.target.closest('[data-tipo]');
  if (tb) {
    document.querySelectorAll('.fi-seg [data-tipo]').forEach(b => { b.classList.toggle('sel', b === tb); b.setAttribute('aria-checked', b === tb); });
    document.getElementById('fe-tipo-ayuda').textContent = TIPO_AYUDA[tb.dataset.tipo] || '';
    return;
  }
  const eb = e.target.closest('[data-estado]');
  if (eb) {
    if (eb.dataset.estado !== (g.estado || 'realizado') && await guardarCambiosGasto(g.id, { estado: eb.dataset.estado })) refrescarFicha();
    return;
  }
  const fa = e.target.closest('[data-fa]');
  if (!fa) return;
  const acc = fa.dataset.fa;
  if (acc === 'cancelar') { fichaEdit = null; renderFicha(); }
  else if (acc === 'guardar') guardarEditorFicha();
  else if (acc === 'confirmar') { await confirmarProyectado(g.id); renderFicha(); mostrarToast('Pago registrado'); }
  else if (acc === 'editar') editarGasto(g.id);
  else if (acc === 'recurrente') accionGasto('recurrente', g.id);
  else if (acc === 'borrar') {
    mostrarConfirmacion(`¿Eliminar “${esc(tituloGasto(g))}” de ${esc(moneyM(g.monto, g.moneda))}? No se puede deshacer.`, async () => {
      await borrarGasto(g.id);
      cerrarSheet();
      mostrarToast('Gasto eliminado');
    }, 'Sí, eliminar');
  }
});
document.getElementById('ficha-body').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.fi-ed input[type="text"], .fi-ed input[type="date"], .fi-ed input[type="time"]')) { e.preventDefault(); guardarEditorFicha(); }
  if (e.key === 'Escape' && fichaEdit) { e.preventDefault(); fichaEdit = null; renderFicha(); }
});
// Las filas de gastos se abren también con el teclado
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.tx[data-acc="ficha"]')) { e.preventDefault(); e.target.click(); }
});
