// Consulta de códigos de barras (EAN/UPC) en catálogos globales.
// La API key vive solo acá (variables de entorno), nunca en el navegador.
//
// Variables de entorno:
//   BARCODE_PROVEEDOR  'upcitemdb' (por defecto) | 'eansearch' | 'barcodelookup'
//   BARCODE_API_KEY    key del proveedor. upcitemdb funciona sin key (modo prueba: 100 consultas/día)
//
// Todas las respuestas se normalizan a:
//   { encontrado, codigo, nombre, marca, categoriaExterna, descripcion, imagenes[], fuente }

const TIMEOUT_MS = 6000;
const TTL_ENCONTRADO = 7 * 24 * 3600 * 1000; // 7 días
const TTL_NO_ENCONTRADO = 24 * 3600 * 1000;  // 1 día: puede que lo agreguen al catálogo
const cache = new Map(); // vive mientras la instancia del servidor siga activa

// Dígito verificador GS1 (sirve para EAN-8, UPC-A, EAN-13 y GTIN-14).
function digitoValido(codigo) {
  const d = codigo.split('').map(Number);
  const control = d.pop();
  const suma = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === control;
}

function normalizarCodigo(valor) {
  const codigo = String(valor || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(codigo.length)) return null;
  return codigo;
}

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { status: r.status, datos };
}

const limpiar = s => String(s || '').replace(/\s+/g, ' ').trim();
const noEncontrado = (codigo, fuente) => ({ encontrado: false, codigo, fuente });

function errorProveedor(fuente, status, datos) {
  const e = new Error(`El catálogo ${fuente} respondió ${status}: ${limpiar(datos?.message || datos?.error || JSON.stringify(datos)).slice(0, 200)}`);
  e.status = status === 429 ? 429 : 502;
  return e;
}

const PROVEEDORES = {
  // https://www.upcitemdb.com/wp/docs/main/development/getting-started/
  async upcitemdb(codigo, key) {
    const url = key
      ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${codigo}`
      : `https://api.upcitemdb.com/prod/trial/lookup?upc=${codigo}`;
    const headers = key ? { user_key: key, key_type: '3scale' } : {};
    const { status, datos } = await pedir(url, { headers });
    if (datos?.code === 'INVALID_UPC' || (status === 200 && !datos?.items?.length)) return noEncontrado(codigo, 'upcitemdb');
    if (status !== 200) throw errorProveedor('upcitemdb', status, datos);
    const it = datos.items[0];
    return {
      encontrado: true, codigo, fuente: 'upcitemdb',
      nombre: limpiar(it.title), marca: limpiar(it.brand), categoriaExterna: limpiar(it.category),
      descripcion: limpiar(it.description), imagenes: (it.images || []).filter(u => /^https:\/\//.test(u)),
    };
  },

  // https://www.ean-search.org — devuelve nombre y categoría, sin marca ni descripción.
  async eansearch(codigo, key) {
    if (!key) throw Object.assign(new Error('Falta BARCODE_API_KEY para ean-search.'), { status: 500 });
    const { status, datos } = await pedir(`https://api.ean-search.org/api?op=barcode-lookup&format=json&ean=${codigo}&token=${encodeURIComponent(key)}`);
    const it = Array.isArray(datos) ? datos[0] : null;
    if (it?.error && /not found/i.test(it.error)) return noEncontrado(codigo, 'eansearch');
    if (status !== 200 || !it || it.error) throw errorProveedor('eansearch', status, it || datos);
    return {
      encontrado: true, codigo, fuente: 'eansearch',
      nombre: limpiar(it.name), marca: '', categoriaExterna: limpiar(it.categoryName), descripcion: '', imagenes: [],
    };
  },

  // https://www.barcodelookup.com/api-documentation (v3). No verificado contra una key real todavía.
  async barcodelookup(codigo, key) {
    if (!key) throw Object.assign(new Error('Falta BARCODE_API_KEY para Barcode Lookup.'), { status: 500 });
    const { status, datos } = await pedir(`https://api.barcodelookup.com/v3/products?barcode=${codigo}&formatted=y&key=${encodeURIComponent(key)}`);
    if (status === 404 || (status === 200 && !datos?.products?.length)) return noEncontrado(codigo, 'barcodelookup');
    if (status !== 200) throw errorProveedor('barcodelookup', status, datos);
    const it = datos.products[0];
    return {
      encontrado: true, codigo, fuente: 'barcodelookup',
      nombre: limpiar(it.title), marca: limpiar(it.brand || it.manufacturer), categoriaExterna: limpiar(it.category),
      descripcion: limpiar(it.description), imagenes: (it.images || []).filter(u => /^https:\/\//.test(u)),
    };
  },
};

async function buscarCodigo(valor) {
  const codigo = normalizarCodigo(valor);
  if (!codigo) throw Object.assign(new Error('El código tiene que tener 8, 12, 13 o 14 números.'), { status: 400 });

  const enCache = cache.get(codigo);
  if (enCache && enCache.vence > Date.now()) return { ...enCache.resultado, cache: true };

  const nombreProveedor = process.env.BARCODE_PROVEEDOR || 'upcitemdb';
  const proveedor = PROVEEDORES[nombreProveedor];
  if (!proveedor) throw Object.assign(new Error(`Proveedor de códigos desconocido: ${nombreProveedor}`), { status: 500 });

  let resultado;
  try {
    resultado = await proveedor(codigo, process.env.BARCODE_API_KEY);
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw Object.assign(new Error('El catálogo global tardó demasiado en responder.'), { status: 504 });
    }
    throw e;
  }
  resultado.digitoValido = digitoValido(codigo);
  cache.set(codigo, { resultado, vence: Date.now() + (resultado.encontrado ? TTL_ENCONTRADO : TTL_NO_ENCONTRADO) });
  return resultado;
}

module.exports = { buscarCodigo, normalizarCodigo, digitoValido };
