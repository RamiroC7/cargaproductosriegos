// Funciones compartidas por /api/productos y /api/imagenes (el "_" evita que Vercel lo publique como ruta).
// Variables de entorno necesarias:
//   TN_STORE_ID      número de tienda
//   TN_ACCESS_TOKEN  token de la app instalada en la tienda (nunca va en el navegador)
//   TN_USER_AGENT    ej.: "Carga Riegos del Sur (tu-mail@dominio.com)"
// (Usuario y sesión del administrador: ver _sesion.js)
const { sesionActual } = require('./_sesion');

const VERSION = '2025-03';

async function tn(metodo, ruta, cuerpo) {
  if (!process.env.TN_STORE_ID || !process.env.TN_ACCESS_TOKEN || !process.env.TN_USER_AGENT) {
    throw Object.assign(new Error('Tiendanube todavía no está configurado en el servidor.'), { status: 503 });
  }
  const r = await fetch(`https://api.tiendanube.com/${VERSION}/${process.env.TN_STORE_ID}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${process.env.TN_ACCESS_TOKEN}`,
      'User-Agent': process.env.TN_USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  if (!r.ok) {
    const e = new Error(`Tiendanube respondió ${r.status}: ${datos?.description || datos?.message || texto}`);
    e.status = r.status;
    e.detalle = datos;
    throw e;
  }
  return datos;
}

// Valida método y sesión del administrador. Devuelve false si ya respondió.
// Sin CORS: la API solo atiende al formulario publicado en el mismo sitio.
function preparar(req, res, metodo = 'POST', { sinSesion = false } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== metodo) { res.status(405).json({ error: 'Método no permitido' }); return false; }
  if (sinSesion) return true;
  try {
    if (!sesionActual(req)) {
      res.status(401).json({ error: 'La sesión venció. Volvé a ingresar.' });
      return false;
    }
  } catch (e) {
    responderError(res, e);
    return false;
  }
  return true;
}

function responderError(res, e) {
  const status = e.status || 502;
  res.status(status).json({ error: e.message, detalle: e.detalle });
}

module.exports = { tn, preparar, responderError };
