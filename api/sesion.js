// GET /api/sesion → 200 { usuario } si hay sesión activa, 401 si no.
const { preparar, responderError } = require('./_tiendanube');
const { sesionActual } = require('./_sesion');

module.exports = (req, res) => {
  if (!preparar(req, res, 'GET', { sinSesion: true })) return;
  try {
    const sesion = sesionActual(req);
    if (!sesion) return res.status(401).json({ error: 'No hay sesión iniciada.' });
    res.status(200).json(sesion);
  } catch (e) {
    responderError(res, e);
  }
};
