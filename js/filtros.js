// ---------- Filtros ----------
function filtrosVacios() {
  return { rango: false, desde: '', hasta: '', categorias: [], subcategorias: [], modos: [], tipos: [], origenes: [], monedas: [], etiquetas: [], montoMin: '', montoMax: '', texto: '' };
}
let FILTROS = filtrosVacios();

function rangoVisible() {
  const hoy = hoyISO();
  if (FILTROS.rango && FILTROS.desde && FILTROS.hasta) {
    const d = FILTROS.desde <= FILTROS.hasta ? FILTROS.desde : FILTROS.hasta;
    const h = FILTROS.desde <= FILTROS.hasta ? FILTROS.hasta : FILTROS.desde;
    const dias = diasEntre(d, h) + 1;
    const tipo = hoy < d ? 'futuro' : (hoy > h ? 'pasado' : 'actual');
    const pct = tipo === 'futuro' ? 0 : tipo === 'pasado' ? 100 : (diasEntre(d, hoy) + 1) / dias * 100;
    return { desde: d, hasta: h, pct, meses: dias / 30.44, etiqueta: `${fechaCorta(d)}/${d.slice(2,4)} al ${fechaCorta(h)}/${h.slice(2,4)}`, tipo, esRango: true };
  }
  const ym = mesSeleccionado, desde = ym + '-01', hasta = finDeMes(ym), actual = ymActual();
  const tipo = ym === actual ? 'actual' : ym < actual ? 'pasado' : 'futuro';
  const dim = Number(hasta.slice(8));
  const pct = tipo === 'actual' ? new Date().getDate() / dim * 100 : tipo === 'pasado' ? 100 : 0;
  return { desde, hasta, pct, meses: 1, etiqueta: nombreMes(ym), tipo, esRango: false };
}

function cumpleFiltros(g, opts = {}) {
  const F = FILTROS;
  if (!opts.ignorarCategoria && F.categorias.length && !F.categorias.includes(g.categoria)) return false;
  if (F.subcategorias.length && !F.subcategorias.includes(claveSub(g.categoria, g.subcategoria))) return false;
  if (F.modos.length && !F.modos.includes(g.modoPago || '')) return false;
  if (F.tipos.length && !F.tipos.includes(g.tipo)) return false;
  if (F.origenes.length && !F.origenes.includes(esProyectado(g) ? 'proyectado' : 'real')) return false;
  if (F.monedas.length && !F.monedas.includes(g.moneda || 'ARS')) return false;
  if (F.etiquetas.length && !(g.etiquetas || []).some(t => F.etiquetas.includes(t))) return false;
  const min = parseFloat(F.montoMin), max = parseFloat(F.montoMax);
  if (!isNaN(min) && g.monto < min) return false;
  if (!isNaN(max) && g.monto > max) return false;
  if (F.texto) {
    const t = F.texto.toLowerCase();
    const hay = [g.notas, g.subcategoria, g.categoria, g.modoPago, ...(g.etiquetas || [])].join(' ').toLowerCase();
    if (!hay.includes(t)) return false;
  }
  return true;
}
function filtrosActivosSinCategoria() {
  const F = FILTROS;
  return (F.rango && F.desde && F.hasta ? 1 : 0) + F.subcategorias.length + F.modos.length + F.tipos.length + F.origenes.length +
    F.monedas.length + F.etiquetas.length + (F.montoMin !== '' ? 1 : 0) + (F.montoMax !== '' ? 1 : 0) + (F.texto ? 1 : 0);
}
function cantidadFiltros() { return filtrosActivosSinCategoria() + FILTROS.categorias.length; }

const NOMBRE_TIPO = { flexible: 'Flexible', fijo_acumulable: 'Fijo acumulable', fijo: 'Fijo único' };
const NOMBRE_ORIGEN = { real: 'Pagados', proyectado: 'Proyectados' };
const NOMBRE_MONEDA = { ARS: 'Pesos', USD: 'Dólares' };

let PILLS = [];
function renderFilterStrip() {
  const F = FILTROS;
  PILLS = [];
  if (F.rango && F.desde && F.hasta) PILLS.push({ t: 'Período: ' + rangoVisible().etiqueta, q: () => { F.rango = false; } });
  if (F.categorias.length > 1) F.categorias.forEach(c => PILLS.push({ t: c, q: () => { F.categorias = F.categorias.filter(x => x !== c); } }));
  F.subcategorias.forEach(k => PILLS.push({ t: k.split('›')[1] || 'Sin subcategoría', q: () => { F.subcategorias = F.subcategorias.filter(x => x !== k); } }));
  F.modos.forEach(m => PILLS.push({ t: m, q: () => { F.modos = F.modos.filter(x => x !== m); } }));
  F.tipos.forEach(m => PILLS.push({ t: NOMBRE_TIPO[m], q: () => { F.tipos = F.tipos.filter(x => x !== m); } }));
  F.origenes.forEach(m => PILLS.push({ t: NOMBRE_ORIGEN[m], q: () => { F.origenes = F.origenes.filter(x => x !== m); } }));
  F.monedas.forEach(m => PILLS.push({ t: NOMBRE_MONEDA[m], q: () => { F.monedas = F.monedas.filter(x => x !== m); } }));
  F.etiquetas.forEach(m => PILLS.push({ t: '#' + m, q: () => { F.etiquetas = F.etiquetas.filter(x => x !== m); } }));
  if (F.montoMin !== '') PILLS.push({ t: 'Desde ' + money(F.montoMin), q: () => { F.montoMin = ''; } });
  if (F.montoMax !== '') PILLS.push({ t: 'Hasta ' + money(F.montoMax), q: () => { F.montoMax = ''; } });
  if (F.texto) PILLS.push({ t: `"${F.texto}"`, q: () => { F.texto = ''; } });

  const cont = document.getElementById('filter-strip');
  cont.innerHTML = PILLS.map((p, i) => `<span class="fpill">${esc(p.t)}<button data-pill="${i}" aria-label="Quitar filtro">×</button></span>`).join('') +
    (PILLS.length ? `<button class="fclear" onclick="limpiarFiltros()">Limpiar</button>` : '');
  cont.style.display = PILLS.length ? 'flex' : 'none';

  const n = cantidadFiltros();
  const badge = document.getElementById('badge-filtros');
  badge.style.display = n ? 'block' : 'none';
  badge.textContent = n;
  document.getElementById('btn-filtros').classList.toggle('on', n > 0);
}
document.getElementById('filter-strip').addEventListener('click', e => {
  const b = e.target.closest('[data-pill]');
  if (!b) return;
  PILLS[Number(b.dataset.pill)].q();
  renderTodo();
});
function limpiarFiltros() {
  FILTROS = filtrosVacios();
  renderTodo();
  if (document.getElementById('sheet-filtros').style.display === 'block') renderFiltros();
}

function chipsGrupo(grupo, opciones) {
  const sel = FILTROS[grupo];
  return `<div class="chip-wrap">${opciones.map(([v, t]) => `<button class="fchip ${sel.includes(v) ? 'active' : ''}" data-grupo="${grupo}" data-valor="${esc(v)}">${esc(t)}</button>`).join('')}</div>`;
}
function renderFiltros() {
  const F = FILTROS;
  const cats = Object.keys(DATA.categorias);
  let subsHtml;
  if (F.categorias.length) {
    const opciones = [];
    F.categorias.forEach(c => {
      const nombres = new Set((DATA.categorias[c] || []).map(nombreSub));
      DATA.gastos.forEach(g => { if (g.categoria === c && g.subcategoria) nombres.add(g.subcategoria); });
      nombres.forEach(n => opciones.push([claveSub(c, n), F.categorias.length > 1 ? `${n} (${c})` : n]));
      opciones.push([claveSub(c, ''), F.categorias.length > 1 ? `Sin subcategoría (${c})` : 'Sin subcategoría']);
    });
    subsHtml = chipsGrupo('subcategorias', opciones);
  } else {
    subsHtml = '<div class="hint">Elegí una categoría para ver sus subcategorías.</div>';
  }
  const etiquetas = todasLasEtiquetas();
  const hayUSD = DATA.gastos.some(esUSD);

  document.getElementById('filtros-body').innerHTML = `
    <label>Período</label>
    <div class="seg-tabs" style="margin-bottom:8px;">
      <div class="seg-tab ${!F.rango ? 'active' : ''}" data-periodo="mes">Un mes</div>
      <div class="seg-tab ${F.rango ? 'active' : ''}" data-periodo="rango">Entre fechas</div>
    </div>
    ${F.rango ? `<div class="row2">
      <div><input type="date" id="f-desde" value="${F.desde}" aria-label="Desde"></div>
      <div><input type="date" id="f-hasta" value="${F.hasta}" aria-label="Hasta"></div>
    </div>` : `<div class="hint">Se usa el mes que elegís con las flechas en la pantalla principal.</div>`}

    <label>Categoría</label>
    ${chipsGrupo('categorias', cats.map(c => [c, c]))}
    <label>Subcategoría</label>
    ${subsHtml}
    <label>Forma de pago</label>
    ${chipsGrupo('modos', modosDePago().map(m => [m, m]))}
    <label>Tipo de gasto</label>
    ${chipsGrupo('tipos', TIPOS.map(([v, t]) => [v, t]))}
    <label>Estado</label>
    ${chipsGrupo('origenes', [['real', 'Pagados'], ['proyectado', 'Proyectados']])}
    ${hayUSD ? `<label>Moneda</label>${chipsGrupo('monedas', [['ARS', 'Pesos'], ['USD', 'Dólares']])}` : ''}
    <label>Monto</label>
    <div class="row2">
      <div><input type="number" id="f-min" placeholder="Mínimo" value="${F.montoMin}"></div>
      <div><input type="number" id="f-max" placeholder="Máximo" value="${F.montoMax}"></div>
    </div>
    ${etiquetas.length ? `<label>Etiquetas</label>${chipsGrupo('etiquetas', etiquetas.map(t => [t, '#' + t]))}` : ''}
    <label>Buscar en el detalle</label>
    <input type="text" id="f-texto" placeholder="Ej: coto, Catelli, peaje" value="${esc(F.texto)}">
  `;
  const body = document.getElementById('filtros-body');
  const bind = (id, campo) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { F[campo] = el.value; renderTodo(); });
  };
  bind('f-desde', 'desde'); bind('f-hasta', 'hasta'); bind('f-min', 'montoMin'); bind('f-max', 'montoMax'); bind('f-texto', 'texto');
  body.querySelectorAll('[data-periodo]').forEach(el => el.addEventListener('click', () => {
    F.rango = el.dataset.periodo === 'rango';
    if (F.rango && !F.desde) { F.desde = mesSeleccionado + '-01'; F.hasta = finDeMes(mesSeleccionado); }
    renderFiltros(); renderTodo();
  }));
}
document.getElementById('filtros-body').addEventListener('click', e => {
  const b = e.target.closest('[data-grupo]');
  if (!b) return;
  const g = b.dataset.grupo, v = b.dataset.valor;
  const arr = FILTROS[g];
  FILTROS[g] = arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  if (g === 'categorias') FILTROS.subcategorias = FILTROS.subcategorias.filter(k => FILTROS.categorias.includes(k.split('›')[0]));
  renderFiltros(); renderTodo();
});

function renderChips() {
  const cont = document.getElementById('filter-chips');
  const cats = Object.keys(DATA.categorias);
  const sel = FILTROS.categorias;
  cont.innerHTML = `<button class="fchip ${!sel.length ? 'active' : ''}" data-cat="">Todas</button>` +
    cats.map(c => `<button class="fchip ${sel.includes(c) ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}
document.getElementById('filter-chips').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const c = b.dataset.cat;
  FILTROS.categorias = c ? [c] : [];
  FILTROS.subcategorias = [];
  renderTodo();
});
