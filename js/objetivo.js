// ---------- Objetivo mensual ----------
// El objetivo se guarda por subcategoría (tabla objetivos_subcategoria; '' = la categoría entera, para las que no tienen
// subcategorías). El objetivo de una categoría es la suma de sus subcategorías activas; al guardar se sincroniza
// objetivos.monto, que es lo que lee v_flujo_disponible.
const OBJ_MAX_CAT = 2000000, OBJ_MAX_SUB = 1000000;
let OBJ = null;            // copia de trabajo: { categoría: { subcategoría: { monto, activa } } }
let OBJ_ORDEN = [];        // categorías visibles, en el orden en que se muestran
let OBJ_ABIERTAS = new Set();
let OBJ_ARRASTRE = null;   // proporciones de las variables al empezar a mover la perilla de una categoría
let objDesdeHome = false;

function esSubFija(cat, sub) {
  const s = buscarSub(cat, sub);
  return !!s && typeof s === 'object' && (s.tipo === 'fijo' || s.tipo === 'fijo_acumulable');
}
function categoriasObjetivo() { return Object.keys(DATA.objetivos); }
function subsDeCategoria(cat) {
  const nombres = (DATA.categorias[cat] || []).map(nombreSub);
  return nombres.length ? nombres : [''];
}

// Objetivo de cada subcategoría de la taxonomía actual. Una categoría sin filas guardadas (por ejemplo, una nueva)
// arranca con su objetivo de la tabla objetivos: fijas = recurrente activo y el resto en partes iguales entre las variables.
function subsObjetivo(cat, mapa = DATA.objSub) {
  const filas = mapa[cat];
  const subs = subsDeCategoria(cat).map(n => ({
    sub: n, fija: !!n && esSubFija(cat, n),
    monto: filas && filas[n] ? filas[n].monto : 0, activa: filas && filas[n] ? filas[n].activa : true
  }));
  if (filas) return subs;
  subs.filter(s => s.fija).forEach(s => {
    s.monto = DATA.recurrentes.filter(r => r.activo && (r.moneda || 'ARS') === 'ARS' && r.categoria === cat && r.subcategoria === s.sub)
      .reduce((t, r) => t + r.monto, 0);
  });
  const vars = subs.filter(s => !s.fija);
  const resto = Math.max(0, (DATA.objetivos[cat] || 0) - subs.reduce((t, s) => t + s.monto, 0));
  vars.forEach(s => { s.monto = Math.round(resto / vars.length); });
  return subs;
}
function objetivoCategoria(cat, mapa = DATA.objSub) {
  return subsObjetivo(cat, mapa).reduce((t, s) => t + (s.activa ? s.monto : 0), 0);
}
function objetivosTotales(mapa = DATA.objSub) {
  let fijos = 0, variables = 0;
  categoriasObjetivo().filter(sumaAlTotal).forEach(cat => subsObjetivo(cat, mapa).forEach(s => {
    if (!s.activa) return;
    if (s.fija) fijos += s.monto; else variables += s.monto;
  }));
  return { fijos, variables, total: fijos + variables };
}

// ---- Torta del header: largo de cada tramo = peso en el objetivo; color pleno = ejecutado (tope 100% del tramo) ----
function renderDona(R) {
  const a = document.getElementById('hud-dona');
  const O = objetivosTotales();
  if (R.esRango || O.total <= 0) { a.hidden = true; a.innerHTML = ''; return; }
  const T = calcularTablero(mesSeleccionado);
  const gF = T.fijosPagados, gV = T.variablesTotal;
  const pct = Math.round((gF + gV) / O.total * 100);
  const C = 2 * Math.PI * 40, corte = 2;
  const lf = Math.max(C * O.fijos / O.total - corte, 0), lv = Math.max(C * O.variables / O.total - corte, 0);
  const ef = O.fijos ? lf * Math.min(1, gF / O.fijos) : 0, ev = O.variables ? lv * Math.min(1, gV / O.variables) : 0;
  const arco = (color, largo, desde) => largo > 0.01
    ? `<circle cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="13" stroke-dasharray="${largo.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-desde).toFixed(2)}"/>` : '';
  a.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${arco('#f5c04d', ef, 0)}${arco('#5c4c22', lf - ef, ef)}${arco('#8b7cf6', ev, lf + corte)}${arco('#3a3466', lv - ev, lf + corte + ev)}</svg>
    <span class="dona-centro" aria-hidden="true"><span class="dona-pct">${pct}%</span><span class="dona-lb">objetivo ›</span></span>`;
  a.setAttribute('aria-label', `Gastado: ${pct}% del objetivo mensual. Abrir objetivo mensual para ajustarlo`);
  a.hidden = false;
}

// ---- Pantalla Objetivo mensual ----
function copiaObjSub() {
  const out = {};
  categoriasObjetivo().forEach(cat => {
    out[cat] = {};
    subsObjetivo(cat).forEach(s => { out[cat][s.sub] = { monto: s.monto, activa: s.activa }; });
  });
  return out;
}
function filaObj(cat, sub) { return (OBJ[cat] = OBJ[cat] || {})[sub] = OBJ[cat][sub] || { monto: 0, activa: true }; }

// Gastado del mes (solo realizados, en pesos, sin proyectos), por categoría y por subcategoría
function gastadoObjetivo(ym) {
  const cat = {}, sub = {};
  DATA.gastos.forEach(g => {
    if (ymDe(g.fecha) !== ym || g.proyectoId || esUSD(g) || !esPagado(g)) return;
    cat[g.categoria] = (cat[g.categoria] || 0) + g.monto;
    const k = claveSub(g.categoria, g.subcategoria);
    sub[k] = (sub[k] || 0) + g.monto;
  });
  return { cat, sub };
}

function vmObjetivo() {
  const ym = mesSeleccionado, G = gastadoObjetivo(ym), T = calcularTablero(ym);
  const cats = {};
  let fO = 0, vO = 0;
  categoriasObjetivo().forEach(cat => {
    const sola = !(DATA.categorias[cat] || []).length;
    const filas = subsDeCategoria(cat).map(n => {
      const f = filaObj(cat, n);
      return { sub: n, nombre: n || cat, fija: !!n && esSubFija(cat, n), monto: f.monto, activa: f.activa,
        gast: n ? (G.sub[claveSub(cat, n)] || 0) : (G.cat[cat] || 0) };
    });
    const act = filas.filter(f => f.activa);
    const obj = act.reduce((t, f) => t + f.monto, 0), fijas = act.filter(f => f.fija).reduce((t, f) => t + f.monto, 0);
    if (sumaAlTotal(cat)) { fO += fijas; vO += obj - fijas; }
    cats[cat] = { cat, sola, filas, obj, fijas, gast: G.cat[cat] || 0, guardado: DATA.objetivos[cat] || 0 };
  });
  return { ym, cats, fO, vO, total: fO + vO, guardado: objetivosTotales().total, fG: T.fijosPagados, vG: T.variablesTotal };
}

const pctAncho = (v, max) => `${Math.min(100, Math.max(0, v / max * 100)).toFixed(2)}%`;
const OBJ_EXCEDIDO = '#f08a4b';

function construirObjetivo() {
  const cont = document.getElementById('vista-objetivo');
  const V = vmObjetivo();
  const mes = nombreMes(V.ym).replace(' de ', ' ');
  if (!OBJ_ORDEN.length) {
    OBJ_ORDEN = Object.values(V.cats).filter(c => c.obj > 0 || c.gast > 0).sort((a, b) => b.obj - a.obj).map(c => c.cat);
  }
  const filasCat = OBJ_ORDEN.map(cat => {
    const c = V.cats[cat];
    if (!c) return '';
    const i = categoriasObjetivo().indexOf(cat);
    const abierta = OBJ_ABIERTAS.has(cat);
    const subs = c.filas.map((f, j) => f.activa ? `<div class="obj-sub" data-obj-sub-fila="${j}">
        <div class="obj-fila-top">
          <label for="os-${i}-${j}" class="obj-sub-n">${esc(f.nombre)}</label>
          <span class="obj-tag ${f.fija ? 'fijo' : 'var'}">${f.fija ? 'Fijo' : 'Variable'}</span>
          <span class="obj-sub-m" data-v="monto"></span>
          <button type="button" class="obj-x" data-obj-quitar="${j}" aria-label="Eliminar ${esc(f.nombre)}">×</button>
        </div>
        <div class="obj-perilla chica">
          <div class="obj-track" aria-hidden="true"><div class="obj-l obj-l-obj ${f.fija ? 'fijo' : ''}" data-v="wobj"></div><div class="obj-l obj-l-gas" data-v="wgas"></div></div>
          <input type="range" class="obj-range" id="os-${i}-${j}" min="0" max="${Math.max(OBJ_MAX_SUB, Math.ceil(f.monto / 5000) * 5000)}" step="5000"
            data-obj-sub="${j}" aria-describedby="os-${i}-${j}-g">
        </div>
        <div class="obj-sub-g" id="os-${i}-${j}-g">Gastado ${money(f.gast)}</div>
      </div>` : '').join('');
    const quitadas = c.filas.map((f, j) => f.activa ? '' : `<div class="obj-quitada"><span>${esc(f.nombre)} · eliminada</span>
        <button type="button" class="obj-volver-sub" data-obj-restaurar="${j}">Volver a agregar</button></div>`).join('');
    return `<div class="obj-cat" data-obj-cat-fila="${esc(cat)}">
      <div class="obj-fila-top">
        ${c.sola ? '' : `<button type="button" class="obj-chev" data-obj-toggle="1" aria-expanded="${abierta}" aria-controls="obj-subs-${i}" aria-label="Ver subcategorías de ${esc(cat)}">${abierta ? '▾' : '▸'}</button>`}
        <label for="oc-${i}" class="obj-cat-n">${esc(cat)}</label>
        <span class="obj-cat-m" data-v="monto"></span>
      </div>
      <div class="obj-perilla">
        <div class="obj-track" aria-hidden="true"><div class="obj-l obj-l-obj" data-v="wobj"></div><div class="obj-l obj-l-fij" data-v="wfij"></div><div class="obj-l obj-l-gas" data-v="wgas"></div></div>
        <input type="range" class="obj-range" id="oc-${i}" min="0" max="${Math.max(OBJ_MAX_CAT, Math.ceil(c.obj / 10000) * 10000)}" step="10000"
          data-obj-cat="1" aria-describedby="oc-${i}-nota">
      </div>
      <div class="obj-nota" id="oc-${i}-nota" data-v="nota"></div>
      <div class="obj-aviso" data-v="aviso" hidden></div>
      ${c.sola ? '' : `<div class="obj-subs" id="obj-subs-${i}" ${abierta ? '' : 'hidden'}>${subs}${quitadas}</div>`}
    </div>`;
  }).join('');

  cont.innerHTML = `
    <div class="obj-head">
      <button type="button" class="obj-volver" data-obj-volver="1" aria-label="Volver al resumen">‹</button>
      <div><h2 class="obj-titulo">Objetivo mensual</h2><div class="obj-subt">${esc(mes.charAt(0).toUpperCase() + mes.slice(1))} · aplica a los meses siguientes</div></div>
    </div>
    <div class="obj-card obj-resumen">
      <div class="obj-lb">Objetivo total</div>
      <div class="obj-total-fila"><span class="obj-total" data-v="total"></span><span class="obj-diff" data-v="diff"></span></div>
      <div class="obj-comp" role="img" data-v="comp">
        <div class="obj-comp-t" data-v="tf">
          <span class="obj-comp-lb fijos" data-v="lf"></span>
          <div class="obj-comp-bar fijos"><div data-v="bf"></div></div>
          <span class="obj-comp-m" data-v="mf"></span><span class="obj-comp-e" data-v="ef"></span>
        </div>
        <div class="obj-comp-t" data-v="tv">
          <span class="obj-comp-lb vars" data-v="lv"></span>
          <div class="obj-comp-bar vars"><div data-v="bv"></div></div>
          <span class="obj-comp-m" data-v="mv"></span><span class="obj-comp-e" data-v="ev"></span>
        </div>
      </div>
    </div>
    <div class="obj-card obj-lista">${filasCat || '<div class="empty">No hay categorías con objetivo.</div>'}</div>
    <div class="obj-pie">
      <button type="button" class="pill pill-secondary" data-obj-reset="1">Restablecer</button>
      <button type="button" class="pill pill-primary" data-obj-guardar="1">Guardar objetivo</button>
    </div>`;
  pintarObjetivo(null, V);
}

// Actualiza números, barras y perillas sin rearmar la pantalla (así no se corta el arrastre de la perilla que se está moviendo)
function pintarObjetivo(activa, V = vmObjetivo()) {
  const cont = document.getElementById('vista-objetivo');
  const $ = (el, k) => el.querySelector(`[data-v="${k}"]`);
  const diff = Math.round(V.total - V.guardado);
  $(cont, 'total').textContent = money(V.total);
  const d = $(cont, 'diff');
  d.textContent = diff === 0 ? 'sin cambios' : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))} vs. guardado`;
  d.className = 'obj-diff ' + (diff === 0 ? '' : diff > 0 ? 'mas' : 'menos');
  const shareF = V.total ? Math.round(V.fO / V.total * 100) : 0, shareV = V.total ? 100 - shareF : 0;
  const pctF = V.fO ? Math.round(V.fG / V.fO * 100) : 0, pctV = V.vO ? Math.round(V.vG / V.vO * 100) : 0;
  $(cont, 'tf').style.flexGrow = Math.max(V.fO, 1); $(cont, 'tv').style.flexGrow = Math.max(V.vO, 1);
  $(cont, 'lf').textContent = `Fijos ${shareF}%`; $(cont, 'lv').textContent = `Variables ${shareV}%`;
  $(cont, 'bf').style.width = pctAncho(V.fG, V.fO || 1); $(cont, 'bv').style.width = pctAncho(V.vG, V.vO || 1);
  $(cont, 'mf').textContent = money(V.fO); $(cont, 'mv').textContent = money(V.vO);
  $(cont, 'ef').textContent = `${pctF}% ejecutado`; $(cont, 'ev').textContent = `${pctV}% ejecutado`;
  $(cont, 'comp').setAttribute('aria-label', `Objetivo: ${shareF}% fijos (${pctF}% ejecutado), ${shareV}% variables (${pctV}% ejecutado)`);

  cont.querySelectorAll('[data-obj-cat-fila]').forEach(el => {
    const c = V.cats[el.dataset.objCatFila];
    if (!c) return;
    const over = c.gast > c.obj;
    $(el, 'monto').textContent = money(c.obj);
    $(el, 'wobj').style.width = pctAncho(c.obj, OBJ_MAX_CAT);
    $(el, 'wfij').style.width = pctAncho(c.fijas, OBJ_MAX_CAT);
    const wg = $(el, 'wgas');
    wg.style.width = pctAncho(c.gast, OBJ_MAX_CAT);
    wg.style.background = over ? OBJ_EXCEDIDO : '';
    const inp = el.querySelector('[data-obj-cat]');
    if (inp !== activa) inp.value = c.obj;
    inp.setAttribute('aria-valuetext', money(c.obj));
    const nota = $(el, 'nota');
    if (c.obj <= 0) { nota.textContent = `Sin objetivo · gastado ${money(c.gast)}`; nota.className = 'obj-nota exc'; }
    else if (over) { nota.textContent = `Gastado ${money(c.gast)} · excedido ${money(c.gast - c.obj)}`; nota.className = 'obj-nota exc'; }
    else { nota.textContent = `Gastado ${money(c.gast)} · quedan ${money(c.obj - c.gast)}`; nota.className = 'obj-nota'; }
    const aviso = $(el, 'aviso');
    aviso.hidden = c.sola || c.fijas <= c.guardado;
    aviso.textContent = aviso.hidden ? '' : `Los fijos (${money(c.fijas)}) superan el objetivo guardado de la categoría (${money(c.guardado)})`;
    el.querySelectorAll('[data-obj-sub-fila]').forEach(se => {
      const f = c.filas[se.dataset.objSubFila];
      $(se, 'monto').textContent = money(f.monto);
      $(se, 'wobj').style.width = pctAncho(f.monto, OBJ_MAX_SUB);
      const g = $(se, 'wgas');
      g.style.width = pctAncho(f.gast, OBJ_MAX_SUB);
      g.style.background = f.gast > f.monto ? OBJ_EXCEDIDO : (f.fija ? '#f5c04d' : '');
      const si = se.querySelector('[data-obj-sub]');
      if (si !== activa) si.value = f.monto;
      si.setAttribute('aria-valuetext', money(f.monto));
    });
  });
}

// Perilla de categoría: la diferencia se reparte solo entre sus subcategorías variables activas, proporcional a su
// monto (en partes iguales si suman 0). Las fijas no se tocan; por debajo de la suma de fijas, las variables quedan en 0.
function fijarCategoria(cat, valor) {
  const subs = subsDeCategoria(cat);
  if (subs.length === 1 && subs[0] === '') { filaObj(cat, '').monto = valor; return; }
  const act = subs.filter(n => filaObj(cat, n).activa);
  const fijas = act.filter(n => esSubFija(cat, n)), vars = act.filter(n => !esSubFija(cat, n));
  if (!vars.length) return;
  if (!OBJ_ARRASTRE || OBJ_ARRASTRE.cat !== cat) OBJ_ARRASTRE = { cat, pesos: Object.fromEntries(vars.map(n => [n, filaObj(cat, n).monto])) };
  const P = OBJ_ARRASTRE.pesos, suma = vars.reduce((t, n) => t + (P[n] || 0), 0);
  const lugar = Math.max(0, valor - fijas.reduce((t, n) => t + filaObj(cat, n).monto, 0));
  const peso = n => suma > 0 ? (P[n] || 0) / suma : 1 / vars.length;
  const mayor = vars.reduce((a, n) => peso(n) > peso(a) ? n : a, vars[0]);
  let usado = 0;
  vars.forEach(n => { if (n !== mayor) { const v = Math.round(lugar * peso(n)); filaObj(cat, n).monto = v; usado += v; } });
  filaObj(cat, mayor).monto = Math.max(0, lugar - usado);
}

async function guardarObjetivo() {
  const btn = document.querySelector('[data-obj-guardar]');
  btn.disabled = true;
  const filas = [];
  Object.entries(OBJ).forEach(([categoria, subs]) => Object.entries(subs).forEach(([subcategoria, f]) => {
    f.monto = Math.round(f.monto);
    filas.push({ categoria, subcategoria, monto: f.monto, activa: f.activa });
  }));
  const { error } = await supa.from('objetivos_subcategoria').upsert(filas, { onConflict: 'user_id,categoria,subcategoria' });
  if (error) { alert('No se pudo guardar el objetivo: ' + error.message); btn.disabled = false; return; }
  DATA.objSub = JSON.parse(JSON.stringify(OBJ));
  const objs = categoriasObjetivo().map(cat => ({ categoria: cat, monto: objetivoCategoria(cat), suma_al_total: sumaAlTotal(cat) }));
  const r = await supa.from('objetivos').upsert(objs, { onConflict: 'user_id,categoria' });
  if (r.error) { alert('Se guardaron las subcategorías, pero no el total por categoría: ' + r.error.message); btn.disabled = false; return; }
  objs.forEach(o => { DATA.objetivos[o.categoria] = o.monto; });
  OBJ_ARRASTRE = null; OBJ_ORDEN = [];
  construirObjetivo();
  renderTodo();
  mostrarToast('Objetivo guardado');
}

function objetivoVisible() { return document.getElementById('vista-objetivo').style.display !== 'none'; }
function mostrarObjetivo() {
  OBJ = copiaObjSub(); OBJ_ARRASTRE = null; OBJ_ORDEN = []; OBJ_ABIERTAS = new Set();
  ['.topbar', '.vista-tabs', '.fab'].forEach(s => { document.querySelector(s).style.display = 'none'; });
  ['mes', 'proyectos', 'fuentes'].forEach(n => { document.getElementById('vista-' + n).style.display = 'none'; });
  document.getElementById('vista-objetivo').style.display = 'block';
  construirObjetivo();
  window.scrollTo(0, 0);
  document.querySelector('[data-obj-volver]').focus();
}
function ocultarObjetivo() {
  document.getElementById('vista-objetivo').style.display = 'none';
  document.querySelector('.topbar').style.display = '';
  document.querySelector('.vista-tabs').style.display = '';
  document.querySelector('.fab').style.display = '';
  cambiarVista(vistaActual);
  const dona = document.getElementById('hud-dona');
  if (!dona.hidden) dona.focus();
}
function sincronizarRuta() {
  if (document.getElementById('app-root').style.display === 'none') return;
  const quiere = location.hash === '#objetivo';
  if (quiere && !objetivoVisible()) mostrarObjetivo();
  else if (!quiere && objetivoVisible()) ocultarObjetivo();
}
window.addEventListener('hashchange', sincronizarRuta);
document.getElementById('hud-dona').addEventListener('click', () => { objDesdeHome = true; });

const vistaObjetivo = document.getElementById('vista-objetivo');
vistaObjetivo.addEventListener('input', e => {
  const t = e.target;
  const fila = t.closest('[data-obj-cat-fila]');
  if (!fila) return;
  const cat = fila.dataset.objCatFila;
  if (t.matches('[data-obj-cat]')) fijarCategoria(cat, Number(t.value));
  else if (t.matches('[data-obj-sub]')) filaObj(cat, subsDeCategoria(cat)[t.dataset.objSub]).monto = Number(t.value);
  else return;
  pintarObjetivo(t);
});
vistaObjetivo.addEventListener('change', e => {
  if (!e.target.matches('.obj-range')) return;
  OBJ_ARRASTRE = null;
  pintarObjetivo(null);
});
vistaObjetivo.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-obj-volver]')) {
    if (objDesdeHome) { objDesdeHome = false; history.back(); }
    else { history.replaceState(null, '', location.pathname + location.search); sincronizarRuta(); }
    return;
  }
  if (t.closest('[data-obj-reset]')) { OBJ = copiaObjSub(); OBJ_ARRASTRE = null; OBJ_ORDEN = []; construirObjetivo(); return; }
  if (t.closest('[data-obj-guardar]')) { guardarObjetivo(); return; }
  const fila = t.closest('[data-obj-cat-fila]');
  if (!fila) return;
  const cat = fila.dataset.objCatFila;
  const tg = t.closest('[data-obj-toggle]');
  if (tg) {
    const abrir = !OBJ_ABIERTAS.has(cat);
    if (abrir) OBJ_ABIERTAS.add(cat); else OBJ_ABIERTAS.delete(cat);
    tg.setAttribute('aria-expanded', abrir);
    tg.textContent = abrir ? '▾' : '▸';
    document.getElementById(tg.getAttribute('aria-controls')).hidden = !abrir;
    return;
  }
  const q = t.closest('[data-obj-quitar]') || t.closest('[data-obj-restaurar]');
  if (q) {
    const quitar = q.matches('[data-obj-quitar]');
    filaObj(cat, subsDeCategoria(cat)[quitar ? q.dataset.objQuitar : q.dataset.objRestaurar]).activa = !quitar;
    OBJ_ARRASTRE = null;
    construirObjetivo();
    const foco = document.querySelector(`[data-obj-cat-fila="${CSS.escape(cat)}"] [data-obj-toggle]`);
    if (foco) foco.focus();
  }
});
