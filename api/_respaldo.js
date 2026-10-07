// Respaldo de los productos en Vercel Blob (almacenamiento privado, región São Paulo).
// Un archivo por producto: productos/<id>.json con los datos y, mientras no esté publicado, sus fotos.
// Cuando el producto ya está en Tiendanube se guarda sin fotos (Tiendanube ya las tiene) para ahorrar espacio.
//
// Variable de entorno (la agrega Vercel al conectar el store): BLOB_READ_WRITE_TOKEN
const { put, get, list, BlobStoreSuspendedError } = require('@vercel/blob');

const respaldoConfigurado = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

const ruta = id => `productos/${id}.json`;
const idValido = id => typeof id === 'string' && /^[A-Za-z0-9-]{6,64}$/.test(id);

function traducirError(e) {
  if (e instanceof BlobStoreSuspendedError) {
    return Object.assign(new Error('El respaldo llegó al límite gratis del mes de Vercel. Avisale al administrador.'), { status: 507 });
  }
  return Object.assign(new Error(`No se pudo usar el respaldo: ${e.message}`), { status: e.status || 502 });
}

async function guardarRegistro(registro) {
  if (!idValido(registro?.id)) throw Object.assign(new Error('Producto sin identificador válido.'), { status: 400 });
  try {
    await put(ruta(registro.id), JSON.stringify(registro), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
    });
  } catch (e) { throw traducirError(e); }
}

async function leerRegistro(id) {
  if (!idValido(id)) throw Object.assign(new Error('Identificador inválido.'), { status: 400 });
  try {
    const r = await get(ruta(id), { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch (e) { throw traducirError(e); }
}

// Lista liviana: solo qué productos hay y cuándo se respaldaron (no descarga los archivos).
async function listarRegistros() {
  const salida = [];
  let cursor;
  try {
    do {
      const r = await list({ prefix: 'productos/', cursor, limit: 1000 });
      r.blobs.forEach(b => salida.push({
        id: b.pathname.replace(/^productos\//, '').replace(/\.json$/, ''),
        kb: Math.round(b.size / 1024),
        respaldado: b.uploadedAt,
      }));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
  } catch (e) { throw traducirError(e); }
  return salida;
}

module.exports = { respaldoConfigurado, guardarRegistro, leerRegistro, listarRegistros };
