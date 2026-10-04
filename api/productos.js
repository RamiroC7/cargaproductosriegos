// POST /api/productos  { producto: <payload de Tiendanube>, categoria: "Riego" }
// Crea el producto en Tiendanube y devuelve { id, url }.
const { tn, preparar, responderError } = require('./_tiendanube');

const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
let cacheCategorias = null;

// Busca la categoría por nombre; si no existe, la crea.
async function idCategoria(nombre) {
  if (!nombre) return null;
  if (!cacheCategorias) cacheCategorias = await tn('GET', '/categories?fields=id,name&per_page=200');
  const encontrada = cacheCategorias.find(c => Object.values(c.name || {}).some(n => normalizar(n) === normalizar(nombre)));
  if (encontrada) return encontrada.id;
  const nueva = await tn('POST', '/categories', { name: { es: nombre } });
  cacheCategorias.push(nueva);
  return nueva.id;
}

module.exports = async (req, res) => {
  if (!preparar(req, res)) return;
  try {
    const { producto, categoria } = req.body || {};
    if (!producto?.variants?.length) return res.status(400).json({ error: 'Faltan los datos del producto.' });

    // Evita duplicados: si algún SKU ya existe en la tienda, no se crea de nuevo.
    for (const { sku } of producto.variants) {
      if (!sku) continue;
      const existente = await tn('GET', `/products/sku/${encodeURIComponent(sku)}`).catch(e => {
        if (e.status === 404) return null;
        throw e;
      });
      if (existente) {
        return res.status(409).json({ error: `Ya hay un producto con el SKU ${sku} en Tiendanube.`, id: existente.id });
      }
    }

    const cat = await idCategoria(categoria);
    const creado = await tn('POST', '/products', { ...producto, categories: cat ? [cat] : [] });
    const url = creado.canonical_url || null;
    res.status(201).json({ id: creado.id, url });
  } catch (e) {
    responderError(res, e);
  }
};
