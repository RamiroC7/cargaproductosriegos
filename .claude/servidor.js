// Servidor local para probar: sirve el formulario y ejecuta las funciones de /api igual que Vercel.
// Usuario de prueba en local: admin / prueba (se pueden cambiar con ADMIN_USUARIO y ADMIN_CLAVE).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const raiz = path.join(__dirname, '..');
process.env.ADMIN_USUARIO = process.env.ADMIN_USUARIO || 'admin';
process.env.ADMIN_CLAVE = process.env.ADMIN_CLAVE || 'prueba';
process.env.SESION_SECRETO = process.env.SESION_SECRETO || crypto.randomBytes(32).toString('hex');

const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function adaptar(res) {
  res.status = codigo => { res.statusCode = codigo; return res; };
  res.json = datos => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(datos)); return res; };
  return res;
}

async function api(req, res, url) {
  const nombre = url.pathname.replace(/^\/api\//, '').replace(/[^a-z0-9-]/gi, '');
  const archivo = path.join(raiz, 'api', `${nombre}.js`);
  if (!nombre || nombre.startsWith('_') || !fs.existsSync(archivo)) return adaptar(res).status(404).json({ error: 'No existe' });
  let cuerpo = '';
  for await (const parte of req) cuerpo += parte;
  try { req.body = cuerpo ? JSON.parse(cuerpo) : {}; } catch { req.body = {}; }
  req.query = Object.fromEntries(url.searchParams);
  try {
    await require(archivo)(req, adaptar(res));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) adaptar(res).status(500).json({ error: e.message });
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  const ruta = path.join(raiz, decodeURIComponent(url.pathname).replace(/\/$/, '/index.html'));
  if (!ruta.startsWith(raiz) || ruta.includes(`${path.sep}.claude${path.sep}`)) { res.writeHead(403).end(); return; }
  fs.readFile(ruta, (err, datos) => {
    if (err) { res.writeHead(404).end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(ruta)] || 'application/octet-stream' }).end(datos);
  });
}).listen(5173, () => console.log('http://localhost:5173'));
