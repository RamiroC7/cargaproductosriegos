// Sesión del administrador único: token firmado (HMAC) guardado en una cookie HttpOnly.
// No necesita base de datos y el JavaScript de la página no puede leerla.
//
// Variables de entorno:
//   ADMIN_USUARIO   usuario del administrador
//   ADMIN_CLAVE     contraseña del administrador
//   SESION_SECRETO  texto aleatorio largo (32+ caracteres) para firmar las sesiones
const crypto = require('crypto');

const COOKIE = 'sesion';
const DURACION_S = 12 * 3600; // 12 horas

const b64url = texto => Buffer.from(texto).toString('base64url');
const hash = texto => crypto.createHash('sha256').update(String(texto)).digest();

// Compara sin filtrar por tiempo cuántos caracteres coinciden.
const iguales = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));

function secreto() {
  const s = process.env.SESION_SECRETO;
  if (!s || s.length < 32) throw Object.assign(new Error('Falta configurar SESION_SECRETO en el servidor.'), { status: 503 });
  return s;
}

const firma = cuerpo => crypto.createHmac('sha256', secreto()).update(cuerpo).digest('base64url');

function crearToken(usuario) {
  const cuerpo = b64url(JSON.stringify({ u: usuario, exp: Math.floor(Date.now() / 1000) + DURACION_S }));
  return `${cuerpo}.${firma(cuerpo)}`;
}

function leerCookie(req, nombre) {
  const par = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${nombre}=`));
  return par ? decodeURIComponent(par.slice(nombre.length + 1)) : null;
}

// Devuelve { usuario } si la cookie es válida y no venció; si no, null.
function sesionActual(req) {
  const token = leerCookie(req, COOKIE);
  if (!token || !token.includes('.')) return null;
  const [cuerpo, recibida] = token.split('.');
  if (!iguales(firma(cuerpo), recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    if (!datos.exp || datos.exp < Date.now() / 1000) return null;
    if (datos.u !== process.env.ADMIN_USUARIO) return null; // si cambian el usuario, se cierran las sesiones viejas
    return { usuario: datos.u };
  } catch {
    return null;
  }
}

function ponerCookie(req, res, valor, maxAge) {
  const https = req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${valor}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${https ? '; Secure' : ''}`);
}

const iniciarSesion = (req, res, usuario) => ponerCookie(req, res, crearToken(usuario), DURACION_S);
const cerrarSesion = (req, res) => ponerCookie(req, res, '', 0);

function credencialesValidas(usuario, clave) {
  const u = process.env.ADMIN_USUARIO, c = process.env.ADMIN_CLAVE;
  if (!u || !c) throw Object.assign(new Error('El usuario administrador no está configurado en el servidor.'), { status: 503 });
  // Se evalúan las dos comparaciones siempre, para no revelar si el usuario existe.
  const okUsuario = iguales(String(usuario).toLowerCase(), u.toLowerCase());
  const okClave = iguales(clave, c);
  return okUsuario && okClave;
}

module.exports = { sesionActual, iniciarSesion, cerrarSesion, credencialesValidas };
