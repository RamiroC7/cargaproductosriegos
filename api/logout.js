// POST /api/logout → borra la cookie de sesión.
const { preparar } = require('./_tiendanube');
const { cerrarSesion } = require('./_sesion');

module.exports = (req, res) => {
  if (!preparar(req, res, 'POST', { sinSesion: true })) return;
  cerrarSesion(req, res);
  res.status(200).json({ ok: true });
};
