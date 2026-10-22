// ---------- Ingresos ----------
async function guardarIngreso() {
  const fecha = document.getElementById('i-fecha').value || hoyISO();
  const monto = parseFloat(document.getElementById('i-monto').value);
  const descripcion = document.getElementById('i-descripcion').value;
  if (isNaN(monto) || monto <= 0) return;
  const { data } = await supa.from('ingresos').insert({ fecha, monto, descripcion }).select().single();
  DATA.ingresos.push({ id: data ? data.id : uid(), fecha, monto, descripcion });
  document.getElementById('i-monto').value = ''; document.getElementById('i-descripcion').value = '';
  renderIngresos();
}
function renderIngresos() {
  const cont = document.getElementById('lista-ingresos');
  if (!DATA.ingresos.length) { cont.innerHTML = '<div class="empty">Sin ingresos registrados.</div>'; return; }
  cont.innerHTML = DATA.ingresos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(i => `
    <div class="tx"><div class="tx-date">${fechaCorta(i.fecha)}</div><div>${esc(i.descripcion || '—')}</div>
    <div class="tx-amt">${money(i.monto)}</div><div class="tx-actions"><button class="tx-icon-btn tx-del" onclick="borrarIngreso('${i.id}')" title="Borrar">${X_SVG}</button></div></div>`).join('');
}
async function borrarIngreso(id) { await supa.from('ingresos').delete().eq('id', id); DATA.ingresos = DATA.ingresos.filter(i => i.id !== id); renderIngresos(); }

// ---------- Objetivos ----------
function formatMonedaComa(v) { return '$' + Math.round(v || 0).toLocaleString('es-AR'); }
function parseMonedaComa(str) { return parseFloat(String(str).replace(/[^0-9-]/g, '')) || 0; }
function renderObjetivos() {
  document.getElementById('lista-objetivos').innerHTML = Object.keys(DATA.categorias).map((cat, i) => `
    <div class="obj-row">
      <span>${esc(cat)}</span>
      <label class="mini-check"><input type="checkbox" data-suma-idx="${i}" ${sumaAlTotal(cat) ? 'checked' : ''}> suma</label>
      <input type="text" inputmode="numeric" data-obj-idx="${i}" value="${formatMonedaComa(DATA.objetivos[cat] || 0)}" aria-label="Objetivo ${esc(cat)}">
    </div>`).join('');
  document.querySelectorAll('[data-obj-idx]').forEach(inp => {
    inp.addEventListener('focus', () => { inp.value = Math.round(parseMonedaComa(inp.value)) || ''; });
    inp.addEventListener('blur', () => { inp.value = formatMonedaComa(parseMonedaComa(inp.value)); });
  });
}
async function guardarObjetivos() {
  const cats = Object.keys(DATA.categorias);
  const filas = cats.map((cat, i) => {
    const monto = parseMonedaComa(document.querySelector(`[data-obj-idx="${i}"]`).value);
    const suma = document.querySelector(`[data-suma-idx="${i}"]`).checked;
    DATA.objetivos[cat] = monto; DATA.sumaAlTotal[cat] = suma;
    return { categoria: cat, monto, suma_al_total: suma };
  });
  await supa.from('objetivos').upsert(filas, { onConflict: 'user_id,categoria' });
  mostrarToast('Objetivos guardados');
  renderObjetivos(); renderTodo();
}

// ---------- Categorías ----------
async function agregarCategoria() {
  const nombre = document.getElementById('nc-nombre').value.trim();
  if (!nombre || DATA.categorias[nombre]) return;
  await crearCategoriaRapida(nombre);
  document.getElementById('nc-nombre').value = ''; renderCategorias(); renderObjetivos(); renderTodo();
}
async function agregarSubcategoria() {
  const cat = document.getElementById('ns-categoria').value;
  const nombre = document.getElementById('ns-nombre').value.trim();
  if (!cat || !nombre) return;
  await crearSubcategoriaRapida(cat, nombre);
  document.getElementById('ns-nombre').value = ''; renderCategorias();
}
async function borrarSubcategoria(cat, sub) {
  await supa.from('subcategorias').delete().eq('categoria', cat).eq('nombre', sub);
  DATA.categorias[cat] = (DATA.categorias[cat] || []).filter(s => nombreSub(s) !== sub);
  renderCategorias(); renderTodo();
}
function abrirEditorSubcategoria(cat, nombre) {
  const sub = buscarSub(cat, nombre);
  if (!sub) return;
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <p style="font-weight:700;margin-bottom:10px;">${esc(nombre)} <span style="color:var(--ink-soft);font-weight:400;font-size:12px;">(${esc(cat)})</span></p>
      <label>Tipo de gasto</label>
      <select id="edsub-tipo"><option value="variable">Variable</option><option value="fijo">Fijo (monto y fecha más o menos estables)</option></select>
      <div id="edsub-venc-wrap" style="display:none;"><label>Día del mes en que vence (1-31)</label><input type="number" id="edsub-dia" min="1" max="31" placeholder="Ej: 10"></div>
      <div class="btn-row" style="margin-top:14px;">
        <button class="pill pill-primary" id="edsub-guardar">Guardar</button>
        <button class="pill pill-secondary" id="edsub-cancelar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const tipoSel = overlay.querySelector('#edsub-tipo'), vencWrap = overlay.querySelector('#edsub-venc-wrap'), diaInp = overlay.querySelector('#edsub-dia');
  tipoSel.value = sub.tipo || 'variable'; diaInp.value = sub.diaVencimiento || '';
  vencWrap.style.display = tipoSel.value === 'fijo' ? 'block' : 'none';
  tipoSel.addEventListener('change', () => { vencWrap.style.display = tipoSel.value === 'fijo' ? 'block' : 'none'; });
  overlay.querySelector('#edsub-guardar').onclick = async () => {
    sub.tipo = tipoSel.value;
    sub.diaVencimiento = tipoSel.value === 'fijo' ? (parseInt(diaInp.value) || null) : null;
    await supa.from('subcategorias').update({ tipo: sub.tipo, dia_vencimiento: sub.diaVencimiento }).eq('categoria', cat).eq('nombre', nombre);
    renderCategorias(); renderAlertas(); overlay.remove();
  };
  overlay.querySelector('#edsub-cancelar').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}
function renderCategorias() {
  document.getElementById('ns-categoria').innerHTML = catOptions(null, false);
  document.getElementById('lista-categorias').innerHTML = Object.entries(DATA.categorias).map(([cat, subs]) => `
    <div style="margin-bottom:10px;"><strong style="font-size:13px;">${esc(cat)}</strong>
    <div class="chip-list">${subs.map(s => {
      const n = nombreSub(s), esFijo = s.tipo === 'fijo';
      return `<span class="chip" style="cursor:pointer;" data-editsub-cat="${esc(cat)}" data-editsub="${esc(n)}">
        ${esc(n)}${esFijo ? ` <span style="color:var(--amber);font-size:10px;">fijo${s.diaVencimiento ? ', día ' + s.diaVencimiento : ''}</span>` : ''}
        <button class="chip-x" data-delsub-cat="${esc(cat)}" data-delsub="${esc(n)}" aria-label="Borrar ${esc(n)}">×</button></span>`;
    }).join('') || '<span class="chip">sin subcategorías</span>'}</div></div>`).join('');
}
document.getElementById('lista-categorias').addEventListener('click', e => {
  const del = e.target.closest('[data-delsub]');
  if (del) {
    e.stopPropagation();
    const cat = del.dataset.delsubCat, sub = del.dataset.delsub;
    mostrarConfirmacion(`¿Borrar la subcategoría "${esc(sub)}" de ${esc(cat)}? Los gastos ya cargados con esa subcategoría no se modifican.`, () => borrarSubcategoria(cat, sub));
    return;
  }
  const ed = e.target.closest('[data-editsub]');
  if (ed) abrirEditorSubcategoria(ed.dataset.editsubCat, ed.dataset.editsub);
});

// ---------- Backup ----------
async function borrarTodo() {
  await supa.from('gastos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supa.from('ingresos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  DATA.gastos = []; DATA.ingresos = [];
  actualizarStatus(); renderTodo(); renderIngresos();
}
function pedirConfirmacionBorrarTodo() {
  mostrarConfirmacion('¿Borrar TODOS los gastos e ingresos cargados (incluido cualquier backup ya importado)? Esto no se puede deshacer.', borrarTodo);
}
async function importarBackup() {
  const statusEl = document.getElementById('backup-status');
  try {
    const data = JSON.parse(document.getElementById('backup-input').value.trim());
    if (data.gastos && data.gastos.length) {
      const filas = data.gastos.map(g => filaDB({ ...g, origen: g.origen || 'importado', recurrenteId: null,
        proyectoId: DATA.proyectos.some(p => p.id === g.proyectoId) ? g.proyectoId : null }));
      const { data: ins } = await supa.from('gastos').insert(filas).select();
      DATA.gastos = DATA.gastos.concat((ins || []).map(mapGasto));
    }
    if (data.ingresos && data.ingresos.length) {
      const { data: ins } = await supa.from('ingresos').insert(data.ingresos.map(i => ({ fecha: i.fecha, monto: i.monto, descripcion: i.descripcion }))).select();
      DATA.ingresos = DATA.ingresos.concat((ins || []).map(i => ({ id: i.id, fecha: i.fecha, monto: Number(i.monto), descripcion: i.descripcion })));
    }
    if (data.objetivos) {
      DATA.objetivos = { ...DATA.objetivos, ...data.objetivos };
      await supa.from('objetivos').upsert(Object.entries(data.objetivos).map(([categoria, monto]) => ({ categoria, monto })), { onConflict: 'user_id,categoria' });
    }
    if (data.categorias) {
      DATA.categorias = normalizarCategorias({ ...DATA.categorias, ...data.categorias });
      const filas = [];
      Object.entries(data.categorias).forEach(([cat, subs]) => (subs || []).forEach(s => {
        const o = typeof s === 'string' ? { nombre: s, tipo: 'variable', diaVencimiento: null } : s;
        filas.push({ categoria: cat, nombre: o.nombre, tipo: o.tipo || 'variable', dia_vencimiento: o.diaVencimiento || null });
      }));
      if (filas.length) await supa.from('subcategorias').upsert(filas, { onConflict: 'user_id,categoria,nombre' });
    }
    statusEl.innerHTML = `<div class="success-box">Importado: ${data.gastos ? data.gastos.length : 0} gastos, ${data.ingresos ? data.ingresos.length : 0} ingresos.</div>`;
    document.getElementById('backup-input').value = '';
    actualizarStatus(); renderTodo(); renderObjetivos(); renderCategorias();
  } catch (err) {
    statusEl.innerHTML = `<div class="warning-box"><strong>No pude leer ese JSON</strong>${esc(err.message)}</div>`;
  }
}
function exportarBackup() {
  const data = { gastos: DATA.gastos, ingresos: DATA.ingresos, objetivos: DATA.objetivos, categorias: DATA.categorias, recurrentes: DATA.recurrentes,
    proyectos: DATA.proyectos, fuentes: DATA.fuentes, movimientos: DATA.movimientos, aportes: DATA.aportes, cotizaciones: DATA.cotizaciones };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `backup_gastos_${hoyISO()}.json`; a.click();
  URL.revokeObjectURL(url);
}
