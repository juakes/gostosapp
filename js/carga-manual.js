// ---------- Formulario manual ----------
let editandoId = null;
let proyeccionTocada = false;

function prepararCarga() {
  document.getElementById('g-categoria').innerHTML = catOptions(Object.keys(DATA.categorias)[0]);
  actualizarSubcategorias();
  document.getElementById('g-modo').innerHTML = opcionesModo('Efectivo');
  document.getElementById('g-fecha').value = hoyISO();
  document.getElementById('g-hora').value = '';
  document.getElementById('g-monto').value = '';
  document.getElementById('g-moneda').value = 'ARS';
  document.getElementById('g-tipo').value = 'flexible';
  document.getElementById('g-estado').value = 'realizado';
  document.getElementById('g-estado-wrap').style.display = 'none';
  document.getElementById('g-vencimiento-wrap').style.display = 'none';
  document.getElementById('g-etiquetas').value = '';
  document.getElementById('g-notas').value = '';
  document.getElementById('g-proyeccion').checked = false;
  document.getElementById('g-reemplazo').innerHTML = '';
  document.getElementById('g-warning').innerHTML = '';
  prepararSelectProyecto(null);
  proyeccionTocada = false;
  sugerenciasEtiquetas('g-etiquetas', 'g-etiquetas-sug');
  borradoresActuales = [];
  document.getElementById('borradores').innerHTML = '';
  document.getElementById('ia-status').innerHTML = '';
  document.getElementById('file-name').textContent = '';
  archivoAdjunto = null;
  actualizarVisibilidadCompose();
}
function actualizarSubcategorias(sel) {
  const cat = document.getElementById('g-categoria').value;
  document.getElementById('g-subcategoria').innerHTML = subcatOptions(cat, sel || null);
}
document.getElementById('g-categoria').addEventListener('change', async e => {
  if (e.target.value === NUEVA_CAT) {
    const nombre = await crearCategoriaRapida(prompt('Nombre de la nueva categoría:'));
    e.target.innerHTML = catOptions(nombre || Object.keys(DATA.categorias)[0]);
    renderChips();
  }
  actualizarSubcategorias();
  actualizarReemplazoManual();
});
document.getElementById('g-subcategoria').addEventListener('change', async e => {
  if (e.target.value === NUEVA_SUB) {
    const cat = document.getElementById('g-categoria').value;
    const nombre = await crearSubcategoriaRapida(cat, prompt('Nombre de la nueva subcategoría:'));
    actualizarSubcategorias(nombre);
  }
  actualizarReemplazoManual();
});
document.getElementById('g-estado').addEventListener('change', e => {
  document.getElementById('g-vencimiento-wrap').style.display = e.target.value === 'pendiente' ? 'block' : 'none';
});
document.getElementById('g-tipo').addEventListener('change', e => {
  const esFijoUnico = e.target.value === 'fijo';
  document.getElementById('g-estado-wrap').style.display = esFijoUnico ? 'block' : 'none';
  if (!esFijoUnico) { document.getElementById('g-estado').value = 'realizado'; document.getElementById('g-vencimiento-wrap').style.display = 'none'; }
});
document.getElementById('g-fecha').addEventListener('change', e => {
  if (!editandoId && !proyeccionTocada) document.getElementById('g-proyeccion').checked = e.target.value > hoyISO();
  actualizarReemplazoManual();
});
document.getElementById('g-proyeccion').addEventListener('change', () => { proyeccionTocada = true; actualizarReemplazoManual(); });
['g-monto', 'g-moneda'].forEach(id => document.getElementById(id).addEventListener('input', actualizarReemplazoManual));

function actualizarReemplazoManual() {
  const box = document.getElementById('g-reemplazo');
  if (editandoId) { box.innerHTML = ''; return; }
  const n = {
    fecha: document.getElementById('g-fecha').value, categoria: document.getElementById('g-categoria').value,
    subcategoria: document.getElementById('g-subcategoria').value || null, moneda: document.getElementById('g-moneda').value
  };
  const proy = buscarProyectadoCoincidente(n);
  box.innerHTML = htmlReemplazo(proy, parseFloat(document.getElementById('g-monto').value) || 0, 'g-reemplaza');
  box.dataset.proyId = proy ? proy.id : '';
}

function toggleManual() {
  const form = document.getElementById('manual-form');
  const abierto = form.style.display === 'block';
  form.style.display = abierto ? 'none' : 'block';
  document.querySelector('.manual-toggle').textContent = (abierto ? '▸' : '▾') + ' Cargar a mano en vez de con IA';
}

function buscarPosibleDuplicado(nuevo) {
  const fechaNueva = new Date(nuevo.fecha);
  return DATA.gastos.find(g => {
    if (g.id === nuevo.id || esProyectado(g)) return false;
    if ((g.moneda || 'ARS') !== (nuevo.moneda || 'ARS')) return false;
    const diffMonto = Math.abs(g.monto - nuevo.monto);
    const montoCercano = diffMonto === 0 || (diffMonto / Math.max(g.monto, nuevo.monto)) < 0.01;
    if (!montoCercano) return false;
    const diffDias = Math.abs((fechaNueva - new Date(g.fecha)) / 86400000);
    if (diffDias > 2) return false;
    return g.categoria === nuevo.categoria || g.modoPago === nuevo.modoPago;
  });
}

function intentarGuardarGasto() {
  const fecha = document.getElementById('g-fecha').value || hoyISO();
  const categoria = document.getElementById('g-categoria').value;
  const tipo = document.getElementById('g-tipo').value;
  const monto = parseFloat(document.getElementById('g-monto').value);
  const esProy = document.getElementById('g-proyeccion').checked;
  let estado = tipo === 'fijo' ? document.getElementById('g-estado').value : 'realizado';
  let vencimiento = estado === 'pendiente' ? (document.getElementById('g-vencimiento').value || null) : null;
  if (esProy) { estado = 'pendiente'; vencimiento = fecha; }
  const warnBox = document.getElementById('g-warning');
  warnBox.innerHTML = '';

  if (!categoria || categoria === NUEVA_CAT || isNaN(monto) || monto <= 0) {
    warnBox.innerHTML = '<div class="warning-box"><strong>Faltan datos</strong>Elegí una categoría y un monto mayor a 0.</div>';
    return;
  }
  const original = editandoId ? DATA.gastos.find(g => g.id === editandoId) : null;
  let origen;
  if (esProy) origen = 'proyectado';
  else if (original) origen = esProyectado(original) ? 'confirmado' : 'manual-editado';
  else origen = 'manual';

  const nuevo = {
    id: editandoId || uid(), fecha, hora: document.getElementById('g-hora').value || null, categoria,
    subcategoria: document.getElementById('g-subcategoria').value || null, tipo,
    modoPago: document.getElementById('g-modo').value, monto, moneda: document.getElementById('g-moneda').value,
    estado, vencimiento, notas: document.getElementById('g-notas').value,
    etiquetas: parseEtiquetas(document.getElementById('g-etiquetas').value),
    origen, recurrenteId: original ? original.recurrenteId : null,
    proyectoId: document.getElementById('g-proyecto').value || null
  };
  if (nuevo.subcategoria === NUEVA_SUB) nuevo.subcategoria = null;

  const chk = document.getElementById('g-reemplaza');
  const reemplazaId = (chk && chk.checked) ? document.getElementById('g-reemplazo').dataset.proyId : null;

  const dup = (esProy || reemplazaId) ? null : buscarPosibleDuplicado(nuevo);
  if (dup) {
    warnBox.innerHTML = `<div class="warning-box">
      <strong>Posible duplicado</strong>
      Ya existe ${moneyM(dup.monto, dup.moneda)} en ${esc(dup.categoria)} el ${fechaCorta(dup.fecha)}${dup.notas ? ', "' + esc(dup.notas) + '"' : ''}.
      <div class="btn-row">
        <button class="pill pill-danger" id="btn-guardar-igual">Guardar igual</button>
        <button class="pill pill-secondary" onclick="document.getElementById('g-warning').innerHTML=''">Cancelar</button>
      </div>
    </div>`;
    document.getElementById('btn-guardar-igual').onclick = () => guardarGastoDefinitivo(nuevo, reemplazaId);
    return;
  }
  guardarGastoDefinitivo(nuevo, reemplazaId);
}

function mostrarToast(texto) {
  const toast = document.createElement('div');
  toast.className = 'save-toast';
  toast.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>${esc(texto)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1100);
}

async function guardarGastoDefinitivo(nuevo, reemplazaId) {
  const idActualizar = editandoId || reemplazaId || null;
  if (reemplazaId && !editandoId) {
    const proy = DATA.gastos.find(g => g.id === reemplazaId);
    if (proy) nuevo.recurrenteId = proy.recurrenteId;
  }
  const fila = filaDB(nuevo);
  if (idActualizar) {
    const { error } = await supa.from('gastos').update(fila).eq('id', idActualizar);
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    nuevo.id = idActualizar;
    const idx = DATA.gastos.findIndex(g => g.id === idActualizar);
    if (idx >= 0) DATA.gastos[idx] = nuevo; else DATA.gastos.push(nuevo);
  } else {
    const { data, error } = await supa.from('gastos').insert(fila).select().single();
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    DATA.gastos.push(mapGasto(data));
  }
  const eraEdicion = !!editandoId;
  editandoId = null;
  actualizarStatus();
  mostrarToast(nuevo.origen === 'proyectado' ? 'Proyección guardada' : 'Gasto guardado');
  setTimeout(() => {
    // si es parte de una tanda de borradores, no cerramos la hoja
    if (eraEdicion || borradoresActuales.length === 0) cerrarSheet();
    renderTodo(); renderAlertas();
  }, 550);
}

function editarGasto(id) {
  const g = DATA.gastos.find(x => x.id === id);
  if (!g) return;
  abrirSheet('cargar');
  editandoId = id;
  document.getElementById('dropzone').style.display = 'none';
  document.getElementById('btn-agregar-mas').style.display = 'none';
  document.querySelector('.manual-toggle').style.display = 'none';
  document.getElementById('manual-form').style.display = 'block';
  document.querySelector('#sheet-cargar .sheet-title').textContent = esProyectado(g) ? 'Editar proyección' : 'Editar gasto';

  document.getElementById('g-categoria').innerHTML = catOptions(g.categoria);
  actualizarSubcategorias(g.subcategoria);
  document.getElementById('g-modo').innerHTML = opcionesModo(g.modoPago);
  document.getElementById('g-fecha').value = g.fecha;
  document.getElementById('g-hora').value = g.hora ? g.hora.slice(0, 5) : '';
  document.getElementById('g-tipo').value = g.tipo;
  document.getElementById('g-tipo').dispatchEvent(new Event('change'));
  document.getElementById('g-monto').value = g.monto;
  document.getElementById('g-moneda').value = g.moneda || 'ARS';
  document.getElementById('g-estado').value = esProyectado(g) ? 'realizado' : (g.estado || 'realizado');
  document.getElementById('g-estado').dispatchEvent(new Event('change'));
  document.getElementById('g-vencimiento').value = g.vencimiento || '';
  document.getElementById('g-etiquetas').value = (g.etiquetas || []).join(', ');
  document.getElementById('g-notas').value = g.notas || '';
  document.getElementById('g-proyeccion').checked = esProyectado(g);
  prepararSelectProyecto(g.proyectoId);
  document.getElementById('g-reemplazo').innerHTML = '';
  document.getElementById('g-warning').innerHTML = '';
  sugerenciasEtiquetas('g-etiquetas', 'g-etiquetas-sug');
}

async function borrarGasto(id) {
  const g = DATA.gastos.find(x => x.id === id);
  if (g && esProyectado(g) && g.recurrenteId) await omitirMesDeRecurrente(g);
  await supa.from('gastos').delete().eq('id', id);
  DATA.gastos = DATA.gastos.filter(x => x.id !== id);
  actualizarStatus();
  renderTodo(); renderAlertas();
}
