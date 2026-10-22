// ---------- Recurrentes (UI) ----------
function renderRecurrentes() {
  const cont = document.getElementById('lista-recurrentes');
  if (!DATA.recurrentes.length) {
    cont.innerHTML = '<div class="empty">Todavía no hay gastos recurrentes. Creá uno con el botón de arriba, o tocá el ícono de repetir en cualquier gasto ya cargado.</div>';
    return;
  }
  const orden = DATA.recurrentes.slice().sort((a, b) => (b.activo - a.activo) || a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  cont.innerHTML = orden.map(r => {
    const termina = r.hasta ? `hasta ${nombreMes(ymDe(r.hasta))}` : 'sin fecha de fin';
    const empieza = ymDe(r.desde) > ymActual() ? `empieza en ${nombreMes(ymDe(r.desde))}, ` : '';
    return `<div class="rec-item ${r.activo ? '' : 'pausado'}" data-rec="${r.id}">
      <div class="rec-name">${esc(r.nombre)}${r.activo ? '' : ' (pausado)'}</div>
      <div class="rec-amt">${moneyM(r.monto, r.moneda)}</div>
      <div class="rec-meta">${esc(r.categoria)}${r.subcategoria ? ' / ' + esc(r.subcategoria) : ''}. Día ${r.dia} de cada mes, ${empieza}${termina}. ${esc(r.modoPago || '')}</div>
    </div>`;
  }).join('');
}
document.getElementById('lista-recurrentes').addEventListener('click', e => {
  const it = e.target.closest('[data-rec]');
  if (it) abrirEditorRecurrente(it.dataset.rec);
});

function abrirEditorRecurrente(id, prefill, gastoOrigenId) {
  const r = id ? DATA.recurrentes.find(x => x.id === id) : null;
  const d = r || prefill || {
    nombre: '', categoria: Object.keys(DATA.categorias)[0], subcategoria: null, tipo: 'fijo', modoPago: 'Mercado Pago',
    monto: '', moneda: 'ARS', dia: 1, desde: ymActual() + '-01', hasta: null, etiquetas: [], activo: true
  };
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box editor" role="dialog" aria-label="Gasto recurrente">
      <p style="font-weight:700;margin-bottom:4px;">${r ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}</p>
      <label>Nombre</label><input type="text" id="r-nombre" value="${esc(d.nombre)}" placeholder="Ej: Cochera, Catelli, Allianz">
      <div class="row2">
        <div><label>Monto</label><input type="number" id="r-monto" value="${d.monto}" step="0.01"></div>
        <div><label>Moneda</label><select id="r-moneda"><option value="ARS" ${d.moneda !== 'USD' ? 'selected' : ''}>Pesos</option><option value="USD" ${d.moneda === 'USD' ? 'selected' : ''}>Dólares</option></select></div>
      </div>
      <div class="row2">
        <div><label>Categoría</label><select id="r-categoria">${catOptions(d.categoria, false)}</select></div>
        <div><label>Subcategoría</label><select id="r-subcategoria">${subcatOptions(d.categoria, d.subcategoria, false)}</select></div>
      </div>
      <div class="row2">
        <div><label>Tipo</label><select id="r-tipo">${opcionesTipo(d.tipo)}</select></div>
        <div><label>Forma de pago</label><select id="r-modo">${opcionesModo(d.modoPago)}</select></div>
      </div>
      <div class="row2">
        <div><label>Día del mes</label><input type="number" id="r-dia" min="1" max="31" value="${d.dia}"></div>
        <div></div>
      </div>
      <div class="row2">
        <div><label>Empieza</label><input type="month" id="r-desde" value="${ymDe(d.desde)}"></div>
        <div><label>Termina (opcional)</label><input type="month" id="r-hasta" value="${d.hasta ? ymDe(d.hasta) : ''}"></div>
      </div>
      <label>Etiquetas (opcional)</label><input type="text" id="r-etiquetas" value="${esc((d.etiquetas || []).join(', '))}">
      <div class="tag-sugs" id="r-etiquetas-sug"></div>
      ${r ? `<label class="check"><input type="checkbox" id="r-activo" ${r.activo ? 'checked' : ''}> Activo (si lo pausás, se borran sus proyecciones futuras)</label>` : ''}
      <div class="hint">Se proyecta en cada mes desde que empieza hasta ${HORIZONTE_MESES} meses adelante. Los meses ya pagados no se tocan.</div>
      <div id="r-warning"></div>
      <div class="btn-row">
        <button class="pill pill-primary" id="r-guardar">Guardar</button>
        <button class="pill pill-secondary" id="r-cancelar">Cancelar</button>
        ${r ? '<button class="pill pill-danger" id="r-eliminar">Eliminar</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  sugerenciasEtiquetas('r-etiquetas', 'r-etiquetas-sug');
  const $ = s => overlay.querySelector(s);
  $('#r-categoria').addEventListener('change', e => { $('#r-subcategoria').innerHTML = subcatOptions(e.target.value, null, false); });
  $('#r-cancelar').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  if (r) $('#r-eliminar').onclick = () => {
    mostrarConfirmacion(`¿Eliminar "${esc(r.nombre)}"? Se borran sus proyecciones pendientes; los pagos ya confirmados quedan.`, async () => {
      await eliminarRecurrente(r.id);
      overlay.remove();
      renderRecurrentes(); renderTodo(); renderAlertas();
    });
  };
  $('#r-guardar').onclick = async () => {
    const nombre = $('#r-nombre').value.trim();
    const monto = parseFloat($('#r-monto').value);
    const desdeYM = $('#r-desde').value;
    const hastaYM = $('#r-hasta').value;
    const dia = Math.min(Math.max(parseInt($('#r-dia').value) || 1, 1), 31);
    const warn = $('#r-warning');
    if (!nombre || isNaN(monto) || monto <= 0 || !desdeYM) {
      warn.innerHTML = '<div class="warning-box">Completá nombre, monto y el mes en que empieza.</div>'; return;
    }
    if (hastaYM && hastaYM < desdeYM) { warn.innerHTML = '<div class="warning-box">El mes en que termina es anterior al de inicio.</div>'; return; }
    const datos = {
      nombre, monto, moneda: $('#r-moneda').value, categoria: $('#r-categoria').value,
      subcategoria: $('#r-subcategoria').value || null, tipo: $('#r-tipo').value, modoPago: $('#r-modo').value,
      dia, desde: desdeYM + '-01', hasta: hastaYM ? finDeMes(hastaYM) : null,
      etiquetas: parseEtiquetas($('#r-etiquetas').value), activo: r ? $('#r-activo').checked : true
    };
    $('#r-guardar').disabled = true;
    const ok = await guardarRecurrente(datos, r ? r.id : null, gastoOrigenId);
    if (!ok) { $('#r-guardar').disabled = false; return; }
    overlay.remove();
    mostrarToast('Recurrente guardado');
    renderRecurrentes(); renderTodo(); renderAlertas();
  };
}

function mostrarConfirmacion(mensaje, onConfirm, textoSi = 'Sí, borrar') {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.style.zIndex = 250;
  overlay.innerHTML = `
    <div class="confirm-box">
      <p>${mensaje}</p>
      <div class="btn-row">
        <button class="pill pill-danger" id="confirm-si">${textoSi}</button>
        <button class="pill pill-secondary" id="confirm-no">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#confirm-si').onclick = () => { onConfirm(); overlay.remove(); };
  overlay.querySelector('#confirm-no').onclick = () => overlay.remove();
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}
