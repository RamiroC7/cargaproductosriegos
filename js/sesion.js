// Pantalla de ingreso del administrador. Tapa la app hasta que haya una sesión válida.
// Si la sesión vence mientras se carga un producto, vuelve a pedir el ingreso
// sin perder lo que estaba en el formulario.
(() => {
  const $ = s => document.querySelector(s);
  const pantalla = $('#login');
  const formLogin = $('#form-login');
  const error = $('#login-error');
  const boton = $('#btn-ingresar');

  function mostrarError(mensaje) {
    error.textContent = mensaje;
    error.classList.toggle('hidden', !mensaje);
  }

  function mostrarLogin(mensaje = '') {
    pantalla.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    mostrarError(mensaje);
    formLogin.clave.value = '';
    (formLogin.usuario.value ? formLogin.clave : formLogin.usuario).focus();
  }

  function ocultarLogin() {
    pantalla.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    mostrarError('');
    formLogin.clave.value = '';
  }

  formLogin.addEventListener('submit', async e => {
    e.preventDefault();
    const usuario = formLogin.usuario.value.trim();
    const clave = formLogin.clave.value;
    if (!usuario || !clave) { mostrarError('Completá usuario y contraseña.'); return; }
    boton.disabled = true;
    boton.textContent = 'Ingresando…';
    try {
      await TN.ingresar(usuario, clave);
      ocultarLogin();
    } catch (err) {
      mostrarError(err.name === 'TypeError' ? 'No hay conexión con el servidor.' : err.message);
      formLogin.clave.select();
    } finally {
      boton.disabled = false;
      boton.textContent = 'Ingresar';
    }
  });

  $('#btn-ver-clave').addEventListener('click', () => {
    const campo = formLogin.clave;
    const ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    $('#btn-ver-clave').setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  $('#btn-salir').addEventListener('click', async () => {
    await TN.salir().catch(() => {});
    formLogin.usuario.value = '';
    mostrarLogin();
  });

  window.addEventListener('sesion-vencida', () => {
    if (pantalla.classList.contains('hidden')) mostrarLogin('Tu sesión venció. Volvé a ingresar para seguir: lo que cargaste sigue ahí.');
  });

  // Al abrir la página: si ya hay sesión, entra directo.
  TN.sesion()
    .then(s => (s ? ocultarLogin() : mostrarLogin()))
    .catch(() => mostrarLogin('No hay conexión con el servidor.'));
})();
