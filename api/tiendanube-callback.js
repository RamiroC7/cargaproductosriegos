// GET /api/tiendanube-callback?code=...&state=...
// Tiendanube vuelve acá después de autorizar. Se cambia el código (dura 5 minutos) por el
// access_token, que no vence. Se le muestra una sola vez al administrador para cargarlo en Vercel.
const { sesionActual, leerCookie, cookieTexto } = require('./_sesion');
const { pagina, esc } = require('./_pagina');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
  res.setHeader('Set-Cookie', cookieTexto(req, 'tn_state', '', 0));

  let sesion = null;
  try { sesion = sesionActual(req); } catch { /* sin configurar */ }
  if (!sesion) {
    return pagina(res, 401, 'Primero ingresá', `<p>Ingresá como administrador y volvé a tocar <b>Conectar con Tiendanube</b>.</p>
      <p><a class="btn" href="/">Ir a ingresar</a></p>`);
  }

  const { code, state, error } = req.query || {};
  if (error) {
    return pagina(res, 400, 'No se autorizó', `<p>Tiendanube respondió: <code>${esc(error)}</code>. Podés volver a intentarlo.</p>
      <p><a class="btn" href="/api/tiendanube-conectar">Reintentar</a></p>`);
  }
  if (!code || !state || state !== leerCookie(req, 'tn_state')) {
    return pagina(res, 400, 'Enlace vencido', `<p>Este enlace ya se usó o venció. Empezá de nuevo desde el botón.</p>
      <p><a class="btn" href="/api/tiendanube-conectar">Conectar con Tiendanube</a></p>`);
  }

  let datos;
  try {
    const r = await fetch('https://www.tiendanube.com/apps/authorize/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.TN_APP_ID,
        client_secret: process.env.TN_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
      signal: AbortSignal.timeout(10000),
    });
    datos = await r.json().catch(() => ({}));
    if (!r.ok || !datos.access_token) throw new Error(datos.error_description || datos.error || `Error ${r.status}`);
  } catch (e) {
    return pagina(res, 502, 'No se pudo conectar', `<p>Tiendanube no entregó la clave de acceso: <code>${esc(e.message)}</code></p>
      <p>Revisá que <code>TN_APP_ID</code> y <code>TN_CLIENT_SECRET</code> estén bien copiados y volvé a intentar (el código dura 5 minutos).</p>
      <p><a class="btn" href="/api/tiendanube-conectar">Reintentar</a></p>`);
  }

  const permisos = String(datos.scope || '');
  const sinPermiso = !/write_products/.test(permisos);

  pagina(res, 200, '¡Tiendanube autorizó la app!', `
    <p class="ok">Ya tenemos los datos de tu tienda. Falta guardarlos en Vercel (una sola vez).</p>
    ${sinPermiso ? `<p class="aviso">Ojo: la app no tiene permiso para <b>escribir productos</b> (permisos: <code>${esc(permisos)}</code>). Activalo en el Portal de Partners y volvé a conectar.</p>` : ''}
    <label for="tienda">Número de tienda</label>
    <div class="fila"><input id="tienda" readonly value="${esc(datos.user_id)}"><button data-copiar="tienda">Copiar</button></div>
    <label for="token">Clave de acceso</label>
    <div class="fila"><input id="token" type="password" readonly value="${esc(datos.access_token)}"><button data-copiar="token">Copiar</button></div>
    <p style="margin-top:1.25rem"><b>Qué hacer ahora</b> (en la terminal, dentro de la carpeta del proyecto):</p>
    <ol>
      <li><code>npx vercel env add TN_STORE_ID production</code> → pegá el número de tienda.</li>
      <li><code>npx vercel env add TN_ACCESS_TOKEN production --sensitive</code> → pegá la clave de acceso.</li>
      <li>Avisale a quien mantiene la app para volver a publicarla.</li>
    </ol>
    <p class="aviso">La clave de acceso no vence y permite modificar la tienda: no la compartas ni la pegues en chats.
      Esta página no la guarda: si la cerrás, hay que volver a conectar.</p>`);
};
