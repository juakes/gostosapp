// ---------- Sheets ----------
const SHEETS = ['cargar', 'alertas', 'config', 'filtros', 'evolucion', 'cargas', 'proyecto', 'ficha'];
function abrirSheet(nombre) {
  document.getElementById('overlay').classList.add('open');
  SHEETS.forEach(s => document.getElementById('sheet-' + s).style.display = 'none');
  document.getElementById('sheet-' + nombre).style.display = 'block';
  if (nombre === 'cargar') prepararCarga();
  if (nombre === 'alertas') renderAlertas();
  if (nombre === 'config') { renderRecurrentes(); renderIngresos(); renderObjetivos(); renderCategorias(); }
  if (nombre === 'filtros') renderFiltros();
  if (nombre === 'evolucion') renderEvolucion();
  if (nombre === 'cargas') { renderCargas(); traerCargas().then(renderCargas); }
  if (nombre === 'proyecto') renderDetalleProyecto();
  if (nombre === 'ficha') renderFicha();
}
function cerrarSheet() {
  document.getElementById('overlay').classList.remove('open');
  editandoId = null;
  proyectoAbierto = null;
  fichaId = null; fichaEdit = null;
  document.querySelector('.manual-toggle').style.display = 'block';
  document.querySelector('#sheet-cargar .sheet-title').textContent = 'Nuevo gasto';
}
document.querySelectorAll('.seg-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.seg-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.seg-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('seg-' + tab.dataset.seg).classList.add('active');
  });
});

// ---------- Navegación de meses ----------
async function cambiarMes(delta) {
  const ym = ymSumar(mesSeleccionado, delta);
  if (ym > ymSumar(ymActual(), MAX_MESES_ADELANTE)) return;
  mesSeleccionado = ym;
  renderTodo();
  if (ym > ymSumar(ymActual(), HORIZONTE_MESES)) { await asegurarProyecciones(ym); renderTodo(); }
}
function irAMes(ym) {
  FILTROS.rango = false;
  mesSeleccionado = ym;
  asegurarProyecciones(horizonteActual()).then(renderTodo);
  renderTodo();
}
