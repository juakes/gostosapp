// ---------- Render principal ----------
function estadoClase(monto, objetivo) {
  if (objetivo === 0) return monto > 0 ? 'coral' : 'mint';
  const r = monto / objetivo;
  if (r > 1.05) return 'coral';
  if (r < 0.95) return 'mint';
  return 'amber';
}

const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const REPEAT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>';

function filaTx(g) {
  const proy = esProyectado(g);
  const pend = !proy && g.estado === 'pendiente';
  const tags = (g.etiquetas || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('');
  let badges = '';
  if (proy) badges += '<span class="tx-badge proy">proyectado</span>';
  else if (pend) badges += '<span class="tx-badge">pendiente</span>';
  const partes = [diaMes(g.fecha), subtituloGasto(g)];
  if (esFijo(g)) partes.push(esAutomatico(g.modoPago) ? 'débito' : 'manual');
  const d = proy ? null : deltaTexto(contextoGasto(g).delta);
  const ok = proy ? `<button class="tx-icon-btn tx-ok" data-acc="confirmar" data-id="${g.id}" title="Confirmar que se pagó" aria-label="Confirmar que se pagó">${CHECK_SVG}</button>` : '<span></span>';
  return `<div class="tx ${proy ? 'proyectado' : ''}" data-acc="ficha" data-id="${g.id}" role="button" tabindex="0" aria-label="Ver ${esc(tituloGasto(g))}">
    ${monograma(g.modoPago)}
    <div class="tx-main"><div class="tx-t">${esc(tituloGasto(g))}${badges}</div><div class="tx-s">${esc(partes.filter(Boolean).join(' · '))}</div>${tags ? `<div class="tx-tags">${tags}</div>` : ''}</div>
    <div class="tx-amt">${moneyM(g.monto, g.moneda)}${d ? `<div class="tx-d ${d.cls}">${d.txt}</div>` : ''}</div>
    ${ok}
  </div>`;
}
function textoMontos(items) {
  const ars = items.filter(g => !esUSD(g));
  // gastado = solo realizados; lo pendiente (proyectado o cargado como pendiente) va aparte
  const real = sumar(ars.filter(esPagado));
  const proy = sumar(ars.filter(g => !esPagado(g)));
  const usd = sumar(items.filter(g => esUSD(g) && esPagado(g)));
  return { real, proy, usd };
}

function renderSubcategoriasDeCategoria(cat, items) {
  const porSubcat = {};
  items.forEach(g => { const key = g.subcategoria || '__sin__'; (porSubcat[key] = porSubcat[key] || []).push(g); });
  const nombresTaxonomia = (DATA.categorias[cat] || []).map(nombreSub);
  const ordenadas = [];
  nombresTaxonomia.forEach(n => { if (porSubcat[n]) ordenadas.push(n); });
  Object.keys(porSubcat).forEach(k => { if (k !== '__sin__' && !ordenadas.includes(k)) ordenadas.push(k); });
  if (porSubcat['__sin__']) ordenadas.push('__sin__');

  return ordenadas.map(key => {
    const subItems = porSubcat[key];
    const m = textoMontos(subItems);
    const nombre = key === '__sin__' ? 'Sin subcategoría' : key;
    const filas = subItems.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(filaTx).join('');
    const partes = [`${subItems.length} mov.`];
    if (m.proy) partes.push(`<span style="color:#C7BFFF">+ ${money(m.proy)} proyectado</span>`);
    if (m.usd) partes.push(`US$ ${m.usd.toLocaleString('es-AR')}`);
    return `<details class="subcategory">
      <summary>
        <div class="subcat-top"><span class="subcat-name">${esc(nombre)}</span><span class="subcat-amt">${money(m.real)}</span></div>
        <div class="subcat-count">${partes.join(' · ')}</div>
      </summary>
      <div class="tx-list">${filas}</div>
    </details>`;
  }).join('');
}

function renderTodo() {
  IDX_COMP = null;
  const R = rangoVisible();
  const futuro = R.tipo === 'futuro';

  // Navegación / etiqueta del período
  const label = document.getElementById('mes-label');
  label.textContent = R.esRango ? R.etiqueta : nombreMes(mesSeleccionado).replace(' de ', ' ');
  label.classList.toggle('futuro', futuro);
  document.getElementById('mes-arrow-prev').style.visibility = R.esRango ? 'hidden' : 'visible';
  document.getElementById('mes-arrow-next').style.visibility = R.esRango ? 'hidden' : 'visible';
  document.getElementById('mes-arrow-next').disabled = !R.esRango && mesSeleccionado >= ymSumar(ymActual(), MAX_MESES_ADELANTE);

  // los gastos asignados a un proyecto no cuentan en el gasto del mes: se ven en la sección Proyectos
  const enRango = DATA.gastos.filter(g => !g.proyectoId && g.fecha >= R.desde && g.fecha <= R.hasta && cumpleFiltros(g));
  const cuenta = enRango.filter(g => sumaAlTotal(g.categoria));
  const m = textoMontos(cuenta);

  let hudLabel;
  if (R.esRango) hudLabel = futuro ? 'Proyectado para el período' : 'Gastado en el período';
  else hudLabel = futuro ? 'Proyectado para ese mes' : (R.tipo === 'actual' ? 'Gastado este mes' : 'Gastado ese mes');
  document.getElementById('hud-label').textContent = hudLabel + (cantidadFiltros() ? ' (con filtros)' : '');
  const hudNum = document.getElementById('hud-total');
  hudNum.textContent = money(futuro ? m.real + m.proy : m.real);
  hudNum.classList.toggle('futuro', futuro);

  const nReales = cuenta.filter(g => !esProyectado(g)).length;
  const nProy = cuenta.length - nReales;
  document.getElementById('hud-sub').textContent = futuro ? `${nReales ? nReales + ' ya cargados y ' : ''}${nProy} proyectados` : `${nReales} movimientos`;
  document.getElementById('hud-usd').textContent = m.usd ? `+ ${moneyM(m.usd, 'USD')}` : '';

  renderTablero(R);
  renderDona(R);

  renderChips();
  renderFilterStrip();

  // Acordeón
  const porCategoria = {};
  enRango.forEach(g => { (porCategoria[g.categoria] = porCategoria[g.categoria] || []).push(g); });
  let cats = FILTROS.categorias.length ? FILTROS.categorias.slice() : Object.keys(DATA.categorias);
  Object.keys(porCategoria).forEach(c => { if (!cats.includes(c)) cats.push(c); });
  if (filtrosActivosSinCategoria() > 0) cats = cats.filter(c => porCategoria[c]);
  cats.sort((a, b) => (sumaAlTotal(b) ? 1 : 0) - (sumaAlTotal(a) ? 1 : 0));

  const html = cats.map(cat => {
    const items = porCategoria[cat] || [];
    const mm = textoMontos(items);
    const suma = sumaAlTotal(cat);
    const objetivo = objetivoCategoria(cat) * R.meses;
    const st = !suma ? 'neutral' : estadoClase(mm.real, objetivo);
    const pct = objetivo > 0 ? Math.min(mm.real / objetivo * 100, 100) : (mm.real > 0 ? 100 : 0);
    const pctG = objetivo > 0 ? Math.min((mm.real + mm.proy) / objetivo * 100, 100) : ((mm.real + mm.proy) > 0 ? 100 : 0);
    const partes = [];
    partes.push(!suma ? 'no suma al total' : `objetivo ${objetivo > 0 ? money(objetivo) : '—'}`);
    partes.push(`${items.length} mov.`);
    if (mm.proy) partes.push(`<span class="proy">+ ${money(mm.proy)} proyectado</span>`);
    if (mm.usd) partes.push(`US$ ${mm.usd.toLocaleString('es-AR')}`);
    return `<details class="category ${!suma ? 'fuera' : ''}">
      <summary>
        <div class="cat-top"><span class="cat-name">${esc(cat)}</span><span class="cat-amt ${st}">${money(futuro ? mm.real + mm.proy : mm.real)}</span></div>
        <div class="cat-obj">${partes.join(' · ')}</div>
        <div class="cat-bar"><div class="cat-bar-ghost" style="width:${pctG}%"></div><div class="cat-bar-fill ${st}" style="width:${pct}%"></div></div>
      </summary>
      <div class="subcat-list">${renderSubcategoriasDeCategoria(cat, items) || '<div class="empty">Sin movimientos en este período.</div>'}</div>
    </details>`;
  }).join('');
  document.getElementById('acordeon').innerHTML = html || '<div class="empty">Ningún gasto coincide con los filtros. Probá quitar alguno.</div>';

  renderVistasFinanzas();
}

document.getElementById('acordeon').addEventListener('click', e => {
  const b = e.target.closest('[data-acc]');
  if (!b) return;
  e.preventDefault();
  accionGasto(b.dataset.acc, b.dataset.id);
});
async function accionGasto(acc, id) {
  if (acc === 'ficha') return abrirFicha(id);
  if (acc === 'confirmar') return confirmarProyectado(id);
  if (acc === 'editar') return editarGasto(id);
  if (acc === 'borrar') return borrarGasto(id);
  if (acc === 'omitir') return borrarGasto(id);
  if (acc === 'recurrente') {
    const g = DATA.gastos.find(x => x.id === id);
    if (!g) return;
    abrirEditorRecurrente(null, {
      nombre: g.notas || g.subcategoria || g.categoria, categoria: g.categoria, subcategoria: g.subcategoria,
      tipo: g.tipo === 'flexible' ? 'fijo' : g.tipo, modoPago: g.modoPago, monto: g.monto, moneda: g.moneda || 'ARS',
      dia: Number(g.fecha.slice(8, 10)), desde: ymDe(g.fecha) + '-01', hasta: null, etiquetas: g.etiquetas || [], activo: true
    }, g.id);
  }
}
