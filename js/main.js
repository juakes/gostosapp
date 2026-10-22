// ---------- Inicio ----------
(async function init() {
  const { data: { session } } = await supa.auth.getSession();
  if (session) await entrarALaApp();
})();
