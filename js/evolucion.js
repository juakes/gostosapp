// ---------- Evolución ----------
let chartEv = null;
const PALETA = ['#4CE0B3', '#8B7CFF', '#FFC24C', '#FF6B5E', '#5CC8FF', '#F28CD1', '#B5E36B', '#8B94A0'];

function opcionesEvolucion() {
  const sel = document.getElementById('ev-modo');
  const actual = sel.value || 'total';
  const cats = Object.keys(DATA.categorias);
  const subs = new Set();
  DATA.gastos.forEach(g => { if (g.subcategoria) subs.add(claveSub(g.categoria, g.subcategoria)); });
  const tags = todasLasEtiquetas();
  sel.innerHTML = `<option value="total">Total del mes</option><option value="categorias">Todas las categorías</option>
    <optgroup label="Una categoría">${cats.map(c => `<option value="cat:${esc(c)}">${esc(c)}</option>`).join('')}</optgroup>
    <optgroup label="Una subcategoría">${[...subs].sort().map(k => `<option value="sub:${esc(k)}">${esc(k.split('›')[1])} (${esc(k.split('›')[0])})</option>`).join('')}</optgroup>
    ${tags.length ? `<optgroup label="Una etiqueta">${tags.map(t => `<option value="tag:${esc(t)}">#${esc(t)}</option>`).join('')}</optgroup>` : ''}`;
  sel.value = actual;
  if (!sel.value) sel.value = 'total';
}

function renderEvolucion() {
  opcionesEvolucion();
  const modo = document.getElementById('ev-modo').value;
  const atras = parseInt(document.getElementById('ev-atras').value);
  const adelante = document.getElementById('ev-proy').checked ? HORIZONTE_MESES : 0;
  const hoyYM = ymActual();
  const meses = [];
  for (let i = -(atras - 1); i <= adelante; i++) meses.push(ymSumar(hoyYM, i));
  const base = DATA.gastos.filter(g => !esUSD(g) && !g.proyectoId && cumpleFiltros(g, { ignorarCategoria: modo !== 'total' && modo !== 'categorias' }));
  const porMes = {};
  base.forEach(g => { const ym = ymDe(g.fecha); (porMes[ym] = porMes[ym] || []).push(g); });

  let sel = () => true, objetivoMes = null, titulo = 'el total';
  if (modo === 'total') {
    sel = g => sumaAlTotal(g.categoria);
    const cats = (FILTROS.categorias.length ? FILTROS.categorias : Object.keys(DATA.objetivos)).filter(sumaAlTotal);
    objetivoMes = cats.reduce((s, c) => s + (DATA.objetivos[c] || 0), 0) || null;
  } else if (modo.startsWith('cat:')) {
    const c = modo.slice(4); sel = g => g.categoria === c; objetivoMes = DATA.objetivos[c] || null; titulo = c;
  } else if (modo.startsWith('sub:')) {
    const k = modo.slice(4); sel = g => claveSub(g.categoria, g.subcategoria) === k; titulo = k.split('›')[1];
  } else if (modo.startsWith('tag:')) {
    const t = modo.slice(4); sel = g => (g.etiquetas || []).includes(t); titulo = '#' + t;
  }

  let datasets;
  if (modo === 'categorias') {
    const totales = {};
    meses.forEach(ym => (porMes[ym] || []).forEach(g => { totales[g.categoria] = (totales[g.categoria] || 0) + g.monto; }));
    const orden = Object.keys(totales).sort((a, b) => totales[b] - totales[a]);
    const top = orden.slice(0, 7), resto = orden.slice(7);
    const grupos = top.map(c => [c, g => g.categoria === c]);
    if (resto.length) grupos.push(['Otras', g => resto.includes(g.categoria)]);
    datasets = grupos.map(([nombre, f], i) => ({
      label: nombre, stack: 's', backgroundColor: PALETA[i % PALETA.length], borderRadius: 3,
      data: meses.map(ym => sumar((porMes[ym] || []).filter(f)))
    }));
  } else {
    const real = meses.map(ym => sumar((porMes[ym] || []).filter(g => sel(g) && esPagado(g))));
    const proy = meses.map(ym => sumar((porMes[ym] || []).filter(g => sel(g) && !esPagado(g))));
    datasets = [
      { type: 'bar', label: 'Pagado', data: real, backgroundColor: '#4CE0B3', stack: 's', borderRadius: 3, order: 2 },
      { type: 'bar', label: 'Proyectado', data: proy, backgroundColor: 'rgba(139,124,255,0.55)', stack: 's', borderRadius: 3, order: 2 }
    ];
    if (objetivoMes) datasets.push({ type: 'line', label: 'Objetivo', data: meses.map(() => objetivoMes), borderColor: '#FFC24C', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, order: 1 });

    // Resumen: promedio de los últimos 3 meses cerrados
    const cerrados = meses.filter(ym => ym < hoyYM).slice(-3);
    const prom = cerrados.length ? cerrados.reduce((s, ym) => s + real[meses.indexOf(ym)], 0) / cerrados.length : 0;
    const iAct = meses.indexOf(hoyYM);
    let txt = `Promedio pagado en los últimos ${cerrados.length} meses cerrados para ${esc(titulo)}: <strong>${money(prom)}</strong>`;
    if (objetivoMes) txt += `, contra un objetivo de ${money(objetivoMes)} (${prom > objetivoMes ? 'por encima' : 'por debajo'} en ${money(Math.abs(prom - objetivoMes))}).`;
    else txt += '.';
    if (iAct >= 0) txt += ` Este mes: ${money(real[iAct])} pagado${proy[iAct] ? ` y ${money(proy[iAct])} proyectado` : ''}.`;
    const futuros = meses.map((ym, i) => [ym, proy[i] + real[i]]).filter(([ym]) => ym > hoyYM);
    if (futuros.length) txt += ` Próximos meses ya comprometidos: ${futuros.map(([ym, v]) => `${mesCorto(ym)} ${money(v)}`).join(', ')}.`;
    document.getElementById('ev-resumen').innerHTML = txt;
  }
  if (modo === 'categorias') document.getElementById('ev-resumen').innerHTML = 'Cada barra suma lo pagado y lo proyectado del mes, repartido por categoría. Se muestran las 7 categorías más grandes del período y el resto se agrupa en "Otras".';

  if (typeof Chart === 'undefined') { document.getElementById('ev-resumen').innerHTML = 'No se pudo cargar la librería de gráficos. Revisá la conexión y volvé a abrir.'; return; }
  if (chartEv) chartEv.destroy();
  Chart.defaults.color = '#8B94A0';
  Chart.defaults.font.family = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
  chartEv = new Chart(document.getElementById('ev-canvas'), {
    type: 'bar',
    data: { labels: meses.map(ym => mesCorto(ym)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true } },
        y: { stacked: true, grid: { color: '#2C333B' }, ticks: { font: { size: 10 }, callback: v => v >= 1e6 ? '$' + (v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M' : '$' + Math.round(v / 1000) + 'k' } }
      },
      plugins: {
        legend: { labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y)}` } }
      },
      onClick: (evt, els) => {
        if (!els.length) return;
        irAMes(meses[els[0].index]);
        cerrarSheet();
      }
    }
  });
}
