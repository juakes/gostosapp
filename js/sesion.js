// ---------- Sesión ----------
async function iniciarSesion() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const warn = document.getElementById('login-warning');
  warn.innerHTML = '';
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) { warn.innerHTML = `<div class="warning-box">${esc(error.message)}</div>`; return; }
  await entrarALaApp();
}
async function crearCuenta() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const warn = document.getElementById('login-warning');
  warn.innerHTML = '';
  if (password.length < 6) { warn.innerHTML = '<div class="warning-box">La contraseña necesita al menos 6 caracteres.</div>'; return; }
  const { error } = await supa.auth.signUp({ email, password });
  if (error) { warn.innerHTML = `<div class="warning-box">${esc(error.message)}</div>`; return; }
  warn.innerHTML = '<div class="success-box">Cuenta creada. Si tu proyecto pide confirmar el email, revisá tu correo; si no, ya podés tocar "Ingresar".</div>';
}
async function entrarALaApp() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app-root').style.display = 'block';
  await cargarTodo();
  await refrescarVistasFinanzas();
  await asegurarProyecciones();
  renderTodo();
  renderAlertas();
}
