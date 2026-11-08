// GET  /api/sesion → 200 { usuario } si hay sesión activa, 401 si no.
// POST /api/sesion → cierra la sesión (borra la cookie).
// (Van juntas porque el plan gratis de Vercel permite hasta 12 funciones en /api.)
const { preparar, responderError } = require('./_tiendanube');
const { sesionActual, cerrarSesion } = require('./_sesion');

module.exports = (req, res) => {
  if (req.method === 'POST') {
    if (!preparar(req, res, 'POST', { sinSesion: true })) return;
    cerrarSesion(req, res);
    return res.status(200).json({ ok: true });
  }
  if (!preparar(req, res, 'GET', { sinSesion: true })) return;
  try {
    const sesion = sesionActual(req);
    if (!sesion) return res.status(401).json({ error: 'No hay sesión iniciada.' });
    res.status(200).json(sesion);
  } catch (e) {
    responderError(res, e);
  }
};
