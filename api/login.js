// POST /api/login  { usuario, clave } → cookie de sesión.
// Después de 5 intentos fallidos desde la misma IP, bloquea 15 minutos.
const { preparar, responderError } = require('./_tiendanube');
const { iniciarSesion, credencialesValidas } = require('./_sesion');

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const intentos = new Map(); // ip -> { n, desde } (vive mientras la instancia esté activa)

const esperar = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (!preparar(req, res, 'POST', { sinSesion: true })) return;
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const registro = intentos.get(ip);
    if (registro && Date.now() - registro.desde > BLOQUEO_MS) intentos.delete(ip);
    if ((intentos.get(ip)?.n || 0) >= MAX_INTENTOS) {
      return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' });
    }

    const { usuario, clave } = req.body || {};
    if (typeof usuario !== 'string' || typeof clave !== 'string' || !usuario || !clave) {
      return res.status(400).json({ error: 'Completá usuario y contraseña.' });
    }

    // Se ignoran espacios de más (típico al copiar y pegar) y mayúsculas en el usuario
    // (el teclado del celular a veces pone la primera en mayúscula).
    if (!credencialesValidas(usuario.trim(), clave.trim())) {
      const r = intentos.get(ip) || { n: 0, desde: Date.now() };
      intentos.set(ip, { n: r.n + 1, desde: r.desde });
      await esperar(600);
      const quedan = MAX_INTENTOS - r.n - 1;
      return res.status(401).json({
        error: quedan > 0
          ? `Usuario o contraseña incorrectos. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.`
          : 'Usuario o contraseña incorrectos. Por seguridad, esperá 15 minutos para volver a probar.',
      });
    }

    intentos.delete(ip);
    iniciarSesion(req, res, process.env.ADMIN_USUARIO);
    res.status(200).json({ usuario: process.env.ADMIN_USUARIO });
  } catch (e) {
    responderError(res, e);
  }
};
