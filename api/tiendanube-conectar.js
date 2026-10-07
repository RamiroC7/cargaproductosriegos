// GET /api/tiendanube-conectar → manda al administrador a autorizar la app en Tiendanube.
// Necesita TN_APP_ID y TN_CLIENT_SECRET (los da el Portal de Partners al crear la app).
const crypto = require('crypto');
const { sesionActual, cookieTexto } = require('./_sesion');
const { pagina } = require('./_pagina');

module.exports = (req, res) => {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }

  let sesion = null;
  try { sesion = sesionActual(req); } catch { /* sin configurar: se trata como sin sesión */ }
  if (!sesion) {
    return pagina(res, 401, 'Primero ingresá', `<p>Para conectar Tiendanube tenés que estar logueado como administrador.</p>
      <p><a class="btn" href="/">Ir a ingresar</a></p>`);
  }

  if (!process.env.TN_APP_ID || !process.env.TN_CLIENT_SECRET) {
    return pagina(res, 503, 'Falta un paso', `<p>Todavía no están cargados los datos de la app de Tiendanube en Vercel:</p>
      <ul><li><code>TN_APP_ID</code></li><li><code>TN_CLIENT_SECRET</code></li></ul>
      <p>Se obtienen al crear la app en el Portal de Partners de Tiendanube.</p>`);
  }

  // "state" evita que alguien nos haga aceptar una autorización que no pedimos.
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', cookieTexto(req, 'tn_state', state, 600));
  res.statusCode = 302;
  res.setHeader('Location', `https://www.tiendanube.com/apps/${encodeURIComponent(process.env.TN_APP_ID)}/authorize?state=${state}`);
  res.end();
};
