// Funciones compartidas por /api/productos y /api/imagenes (el "_" evita que Vercel lo publique como ruta).
// Variables de entorno necesarias:
//   TN_STORE_ID      número de tienda
//   TN_ACCESS_TOKEN  token de la app instalada en la tienda (nunca va en el navegador)
//   TN_USER_AGENT    ej.: "Carga Riegos del Sur (tu-mail@dominio.com)"
//   CARGA_CLAVE      clave que la CM ingresa una vez en el formulario
//   CORS_ORIGIN      opcional: dominio del formulario si está en otro sitio
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

// Valida método y clave de carga. Devuelve false si ya respondió.
function preparar(req, res, metodo = 'POST', { sinClave = false } = {}) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Clave-Carga');
  res.setHeader('Access-Control-Allow-Methods', `${metodo}, OPTIONS`);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (req.method !== metodo) { res.status(405).json({ error: 'Método no permitido' }); return false; }
  if (sinClave) return true;
  if (!process.env.CARGA_CLAVE || req.headers['x-clave-carga'] !== process.env.CARGA_CLAVE) {
    res.status(401).json({ error: 'Clave de carga incorrecta.' });
    return false;
  }
  return true;
}

function responderError(res, e) {
  const status = e.status || 502;
  res.status(status).json({ error: e.message, detalle: e.detalle });
}

module.exports = { tn, preparar, responderError };
