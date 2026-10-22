// ---------- Categorías / subcategorías (helpers) ----------
const NUEVA_CAT = '__nueva_categoria__';
const NUEVA_SUB = '__nueva_subcategoria__';

function normalizarCategorias(cats) {
  const out = {};
  Object.entries(cats).forEach(([cat, subs]) => { out[cat] = subs.map(s => typeof s === 'string' ? { nombre: s, tipo: 'variable', diaVencimiento: null } : s); });
  return out;
}
function nombreSub(s) { return typeof s === 'string' ? s : s.nombre; }
function buscarSub(cat, nombre) { return (DATA.categorias[cat] || []).find(s => nombreSub(s) === nombre); }

async function crearCategoriaRapida(nombre) {
  nombre = (nombre || '').trim();
  if (!nombre) return null;
  if (!DATA.categorias[nombre]) {
    DATA.categorias[nombre] = [];
    DATA.objetivos[nombre] = 0;
    DATA.sumaAlTotal[nombre] = true;
    await supa.from('objetivos').insert({ categoria: nombre, monto: 0 });
  }
  return nombre;
}
async function crearSubcategoriaRapida(categoria, nombre) {
  nombre = (nombre || '').trim();
  if (!nombre || !categoria || !DATA.categorias[categoria]) return null;
  if (!DATA.categorias[categoria].some(s => nombreSub(s) === nombre)) {
    DATA.categorias[categoria].push({ nombre, tipo: 'variable', diaVencimiento: null });
    await supa.from('subcategorias').insert({ categoria, nombre, tipo: 'variable', dia_vencimiento: null });
  }
  return nombre;
}
function subcatOptions(categoria, subcatActual, conNueva = true) {
  const subs = (DATA.categorias[categoria] || []).map(nombreSub);
  if (subcatActual && !subs.includes(subcatActual)) subs.push(subcatActual);
  return '<option value="">—</option>' + subs.map(n => `<option value="${esc(n)}" ${n === subcatActual ? 'selected' : ''}>${esc(n)}</option>`).join('') +
    (conNueva ? `<option value="${NUEVA_SUB}">+ Nueva subcategoría...</option>` : '');
}
function catOptions(sel, conNueva = true) {
  return Object.keys(DATA.categorias).map(c => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('') +
    (conNueva ? `<option value="${NUEVA_CAT}">+ Nueva categoría...</option>` : '');
}
function sugerenciasEtiquetas(inputId, contId) {
  const cont = document.getElementById(contId);
  const input = document.getElementById(inputId);
  if (!cont || !input) return;
  const pintar = () => {
    const actuales = parseEtiquetas(input.value);
    const sug = todasLasEtiquetas().filter(t => !actuales.includes(t)).slice(0, 12);
    cont.innerHTML = sug.map(t => `<button type="button" class="tag-sug" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');
  };
  cont.onclick = e => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    const actuales = parseEtiquetas(input.value);
    actuales.push(b.dataset.tag);
    input.value = actuales.join(', ');
    pintar();
  };
  input.oninput = pintar;
  pintar();
}
