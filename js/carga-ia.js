// ---------- Carga inteligente (IA) ----------
let archivoAdjunto = null;
let borradoresActuales = [];

function mostrarCompose() {
  document.getElementById('dropzone').style.display = 'block';
  document.getElementById('btn-agregar-mas').style.display = 'none';
  document.getElementById('smart-input').focus();
}
function actualizarVisibilidadCompose() {
  const hay = borradoresActuales.length > 0;
  document.getElementById('dropzone').style.display = hay ? 'none' : 'block';
  document.getElementById('btn-agregar-mas').style.display = hay ? 'block' : 'none';
}

const dz = document.getElementById('dropzone');
['dragover', 'dragleave', 'drop'].forEach(evt => {
  dz.addEventListener(evt, e => {
    e.preventDefault();
    dz.classList.toggle('dragover', evt === 'dragover');
    if (evt === 'drop' && e.dataTransfer.files.length) onFileSelected(e.dataTransfer.files);
  });
});
function onFileSelected(files) {
  const file = files[0];
  if (!file) return;
  document.getElementById('file-name').textContent = file.name;
  const reader = new FileReader();
  if (file.type.startsWith('image/') || file.type === 'application/pdf') {
    reader.onload = () => { archivoAdjunto = { tipo: file.type === 'application/pdf' ? 'pdf' : 'imagen', contenido: reader.result.split(',')[1], mediaType: file.type, nombre: file.name }; };
    reader.readAsDataURL(file);
  } else {
    reader.onload = () => { archivoAdjunto = { tipo: 'texto', contenido: reader.result, nombre: file.name }; };
    reader.readAsText(file);
  }
}
function historialParaContexto() {
  return DATA.gastos.filter(g => !esProyectado(g)).slice(-40).map(g => ({
    notas: g.notas, categoria: g.categoria, subcategoria: g.subcategoria, tipo: g.tipo, modoPago: g.modoPago, etiquetas: g.etiquetas
  }));
}
document.getElementById('smart-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); interpretarConIA(); }
});

async function interpretarConIA() {
  const texto = document.getElementById('smart-input').value.trim();
  if (!texto && !archivoAdjunto) return;
  const statusEl = document.getElementById('ia-status');
  statusEl.innerHTML = '<span class="spinner"></span>Leyendo e interpretando...';

  const categoriasTxt = Object.entries(DATA.categorias).map(([c, s]) => `${c}${s.length ? ': ' + s.map(nombreSub).join(', ') : ''}`).join('\n');
  const etiquetas = todasLasEtiquetas();

  const systemPrompt = `Sos el asistente de carga de una app de gastos familiares. Tu trabajo es convertir texto libre, o el contenido de un documento/imagen de comprobante, en uno o más gastos estructurados.

Categorías y subcategorías disponibles (usá SOLO estas, elegí la más parecida si no hay match exacto):
${categoriasTxt}

Formas de pago posibles: ${modosDePago().join(', ')}.

Tipos de gasto:
- "fijo": pasa una sola vez en el mes, monto conocido (expensas, seguro, cuotas).
- "fijo_acumulable": recurrente y de monto más o menos estable, pero se paga en varios pagos a lo largo del mes (servicio doméstico, sesiones de psicólogo).
- "flexible": gasto variable del día a día (supermercado, salidas, nafta).

Moneda: "ARS" salvo que el texto hable de dólares, USD, US$ o u$s, en cuyo caso "USD" (y el monto va en dólares, sin convertir ni multiplicar).

Etiquetas: lista opcional de palabras cortas para agrupar gastos que cruzan categorías (un viaje, un trámite). Usá solo etiquetas que el texto mencione explícitamente o que ya existan y claramente apliquen. Etiquetas existentes: ${etiquetas.length ? etiquetas.join(', ') : '(ninguna todavía)'}. Si no aplica ninguna, devolvé [].

Reglas fijas aprendidas de correcciones anteriores (tienen PRIORIDAD ABSOLUTA sobre el historial y sobre tu propio criterio — si el texto menciona alguna de estas palabras clave, usá exactamente lo que dice acá, sin excepción):
${JSON.stringify(DATA.correcciones)}

Historial reciente de esta familia, para que aprendas sus patrones cuando NO haya una regla fija arriba (mismo texto o comercio → misma categoría/forma de pago/tipo que usaron antes):
${JSON.stringify(historialParaContexto())}

Tratamiento de montos en pesos: en esta familia los montos chicos dichos de forma casual están en miles de pesos. Si el número es menor a 10.000, la moneda es ARS y no se aclara explícitamente "pesos" ni aparecen decimales que sugieran otra cosa, multiplicalo por 1.000 (ej: "180" significa $180.000). Si el texto ya trae un número grande (10.000 o más) o dice explícitamente "pesos"/"$", usalo tal cual. Nunca multipliques montos en dólares.

Hoy es ${hoyISO()}. Si el texto no aclara fecha, usá hoy. Si dice "ayer", restá un día. Si dice un día del mes sin año, asumí el mes y año actual. Si dice un mes futuro ("en noviembre", "el mes que viene"), usá esa fecha futura.

Devolvé SOLO un array JSON (sin texto alrededor, sin markdown) con uno o más objetos, cada uno con estos campos exactos:
{"fecha":"YYYY-MM-DD","hora":null,"categoria":"...","subcategoria":null,"tipo":"fijo|fijo_acumulable|flexible","modoPago":"...","monto":0,"moneda":"ARS","etiquetas":[],"estado":"realizado","vencimiento":null,"notas":"..."}

Si el texto/documento describe varios gastos (ej: un resumen con varias líneas), devolvé un objeto por cada uno. Si es un solo gasto, devolvé un array de un solo elemento igual.`;

  const contentBlocks = [];
  if (texto) contentBlocks.push({ type: 'text', text: texto });
  if (archivoAdjunto) {
    if (archivoAdjunto.tipo === 'texto') contentBlocks.push({ type: 'text', text: `Contenido del archivo "${archivoAdjunto.nombre}":\n${archivoAdjunto.contenido}` });
    else if (archivoAdjunto.tipo === 'imagen') contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: archivoAdjunto.mediaType, data: archivoAdjunto.contenido } });
    else if (archivoAdjunto.tipo === 'pdf') contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: archivoAdjunto.contenido } });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/interpretar-gasto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ systemPrompt, contentBlocks })
    });
    const data = await resp.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) throw new Error('Sin respuesta de texto');
    const drafts = JSON.parse(textBlock.text.replace(/```json|```/g, '').trim());
    borradoresActuales = drafts.map(d => ({ ...d, moneda: d.moneda === 'USD' ? 'USD' : 'ARS', etiquetas: Array.isArray(d.etiquetas) ? d.etiquetas : [], _id: uid() }));
    statusEl.innerHTML = `Encontré ${drafts.length} gasto${drafts.length > 1 ? 's' : ''}. Revisá antes de guardar:`;
    renderBorradores();
    document.getElementById('smart-input').value = '';
    archivoAdjunto = null;
    document.getElementById('file-name').textContent = '';
  } catch (err) {
    statusEl.innerHTML = `<span style="color:var(--coral);">No pude interpretarlo (${esc(err.message)}). Probá cargar a mano.</span>`;
  }
}

function renderBorradores() {
  actualizarVisibilidadCompose();
  const cont = document.getElementById('borradores');
  cont.innerHTML = borradoresActuales.map(b => {
    const esFuturo = b.fecha > hoyISO();
    const dup = esFuturo ? null : buscarPosibleDuplicado({ id: null, fecha: b.fecha, monto: b.monto, categoria: b.categoria, modoPago: b.modoPago, moneda: b.moneda });
    const proy = buscarProyectadoCoincidente({ fecha: b.fecha, categoria: b.categoria, subcategoria: b.subcategoria, moneda: b.moneda });
    return `<div class="borrador" data-id="${b._id}">
      <div class="borrador-top">
        <div class="monto-edit">
          <span class="borrador-monto" data-role="monto-display">${moneyM(b.monto, b.moneda)}</span>
          <input type="number" class="borrador-monto-input" data-role="monto-input" data-f="monto" value="${b.monto}" style="display:none;">
          <button class="pencil-btn" data-role="monto-pencil" title="Editar monto">${PENCIL_SVG}</button>
        </div>
        <div class="fecha-edit">
          <span class="fecha-chip" data-role="fecha-display"><span class="weekday">${nombreDiaSemana(b.fecha)}</span> ${fechaCorta(b.fecha)}</span>
          <input type="date" data-role="fecha-input" data-f="fecha" value="${b.fecha}" style="display:none;">
          <button class="pencil-btn" data-role="fecha-pencil" title="Editar fecha">${PENCIL_SVG}</button>
        </div>
      </div>
      <div class="subcat-row">
        <select class="subcat-select" data-f="subcategoria" data-role="subcat-select">${subcatOptions(b.categoria, b.subcategoria)}</select>
      </div>
      <div class="accesorios-label">Detalles</div>
      <div class="borrador-fields">
        <div><label>Categoría</label><select data-f="categoria" data-role="categoria-select">${catOptions(b.categoria)}</select></div>
        <div><label>Forma de pago</label><select data-f="modoPago">${opcionesModo(b.modoPago || 'Efectivo')}</select></div>
        <div><label>Tipo</label><select data-f="tipo">${opcionesTipo(b.tipo || 'flexible')}</select></div>
        <div><label>Moneda</label><select data-f="moneda"><option value="ARS" ${b.moneda !== 'USD' ? 'selected' : ''}>Pesos</option><option value="USD" ${b.moneda === 'USD' ? 'selected' : ''}>Dólares</option></select></div>
        <div class="full"><label>Etiquetas</label><input type="text" data-f="etiquetas" value="${esc((b.etiquetas || []).join(', '))}" placeholder="Ej: Miami"></div>
        <div class="full"><label>Notas</label><input type="text" data-f="notas" value="${esc(b.notas || '')}"></div>
        ${hayProyectosElegibles(null) ? `<div class="full"><label>Proyecto</label><select data-f="proyecto">${opcionesProyecto(null)}</select></div>` : ''}
      </div>
      <label class="check"><input type="checkbox" data-f="proyeccion" ${esFuturo ? 'checked' : ''}> Todavía no se pagó: guardarlo como proyección</label>
      ${proy ? htmlReemplazo(proy, b.monto, 'reemp-' + b._id).replace('<div class="reemplazo-box">', `<div class="reemplazo-box" data-proy-id="${proy.id}">`) : ''}
      ${dup ? `<div class="warning-box" style="margin-top:8px;"><strong>Posible duplicado</strong>Ya hay ${moneyM(dup.monto, dup.moneda)} en ${esc(dup.categoria)} el ${fechaCorta(dup.fecha)}.</div>` : ''}
      <div class="btn-row">
        <button class="pill pill-primary" style="width:auto;padding:9px 16px;" onclick="aceptarBorrador('${b._id}')">${dup ? 'Guardar igual' : 'Aceptar'}</button>
        <button class="pill pill-secondary" style="width:auto;padding:9px 16px;" onclick="descartarBorrador('${b._id}')">Descartar</button>
      </div>
    </div>`;
  }).join('');

  borradoresActuales.forEach(b => {
    const el = cont.querySelector(`[data-id="${b._id}"]`);
    if (!el) return;
    const catSelect = el.querySelector('[data-role="categoria-select"]');
    const subSelect = el.querySelector('[data-role="subcat-select"]');
    catSelect.addEventListener('change', async e => {
      if (e.target.value === NUEVA_CAT) {
        const nombre = await crearCategoriaRapida(prompt('Nombre de la nueva categoría:'));
        catSelect.innerHTML = catOptions(nombre || b.categoria);
      }
      subSelect.innerHTML = subcatOptions(catSelect.value, null);
    });
    subSelect.addEventListener('change', async e => {
      if (e.target.value === NUEVA_SUB) {
        const nombre = await crearSubcategoriaRapida(catSelect.value, prompt('Nombre de la nueva subcategoría:'));
        subSelect.innerHTML = subcatOptions(catSelect.value, nombre);
      }
    });
    const montoDisplay = el.querySelector('[data-role="monto-display"]');
    const montoInput = el.querySelector('[data-role="monto-input"]');
    const monedaSel = el.querySelector('[data-f="moneda"]');
    el.querySelector('[data-role="monto-pencil"]').onclick = () => {
      montoDisplay.style.display = 'none'; montoInput.style.display = 'inline-block'; montoInput.focus(); montoInput.select();
    };
    const pintarMonto = () => { montoDisplay.textContent = moneyM(parseFloat(montoInput.value) || 0, monedaSel.value); };
    montoInput.addEventListener('blur', () => { pintarMonto(); montoDisplay.style.display = 'inline'; montoInput.style.display = 'none'; });
    montoInput.addEventListener('keydown', e => { if (e.key === 'Enter') montoInput.blur(); });
    monedaSel.addEventListener('change', pintarMonto);

    const fechaDisplay = el.querySelector('[data-role="fecha-display"]');
    const fechaInput = el.querySelector('[data-role="fecha-input"]');
    el.querySelector('[data-role="fecha-pencil"]').onclick = () => { fechaDisplay.style.display = 'none'; fechaInput.style.display = 'inline-block'; fechaInput.focus(); };
    const cerrarFecha = () => {
      const val = fechaInput.value || b.fecha;
      fechaDisplay.innerHTML = `<span class="weekday">${nombreDiaSemana(val)}</span> ${fechaCorta(val)}`;
      fechaDisplay.style.display = 'inline'; fechaInput.style.display = 'none';
      el.querySelector('[data-f="proyeccion"]').checked = val > hoyISO();
    };
    fechaInput.addEventListener('change', cerrarFecha);
    fechaInput.addEventListener('blur', cerrarFecha);
  });
}

async function aceptarBorrador(id) {
  const el = document.querySelector(`.borrador[data-id="${id}"]`);
  const b = borradoresActuales.find(x => x._id === id);
  if (!el || !b) return;
  const q = f => el.querySelector(`[data-f="${f}"]`);
  const esProy = q('proyeccion').checked;
  const fecha = q('fecha').value || b.fecha || hoyISO();
  const nuevo = {
    id: uid(), fecha, hora: b.hora || null,
    categoria: q('categoria').value, subcategoria: (q('subcategoria').value && q('subcategoria').value !== NUEVA_SUB) ? q('subcategoria').value : null,
    tipo: q('tipo').value, modoPago: q('modoPago').value, monto: parseFloat(q('monto').value), moneda: q('moneda').value,
    estado: esProy ? 'pendiente' : 'realizado', vencimiento: esProy ? fecha : null,
    notas: q('notas').value, etiquetas: parseEtiquetas(q('etiquetas').value),
    origen: esProy ? 'proyectado' : 'ia', recurrenteId: null,
    proyectoId: q('proyecto') ? (q('proyecto').value || null) : null
  };
  if (!nuevo.categoria || isNaN(nuevo.monto) || nuevo.monto <= 0) { alert('Falta la categoría o el monto.'); return; }

  // Aprendizaje: si se corrigió lo que propuso la IA, guardar la regla
  const cambioCategoria = nuevo.categoria !== (b.categoria || '');
  const cambioSubcat = (nuevo.subcategoria || '') !== (b.subcategoria || '');
  const clave = (nuevo.notas || '').trim().toLowerCase();
  if ((cambioCategoria || cambioSubcat) && clave) {
    DATA.correcciones[clave] = { categoria: nuevo.categoria, subcategoria: nuevo.subcategoria, tipo: nuevo.tipo, modoPago: nuevo.modoPago };
    await supa.from('correcciones').upsert({ clave, categoria: nuevo.categoria, subcategoria: nuevo.subcategoria, tipo: nuevo.tipo, modo_pago: nuevo.modoPago }, { onConflict: 'user_id,clave' });
  }
  const box = el.querySelector('[data-proy-id]');
  const chk = el.querySelector(`#reemp-${id}`);
  const reemplazaId = (box && chk && chk.checked) ? box.dataset.proyId : null;

  borradoresActuales = borradoresActuales.filter(x => x._id !== id);
  await guardarGastoDefinitivo(nuevo, reemplazaId);
  renderBorradores();
}
function descartarBorrador(id) {
  borradoresActuales = borradoresActuales.filter(b => b._id !== id);
  renderBorradores();
  if (borradoresActuales.length === 0) document.getElementById('ia-status').innerHTML = '';
}
