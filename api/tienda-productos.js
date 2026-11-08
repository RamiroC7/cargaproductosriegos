// Productos que ya están en Tiendanube.
// GET /api/tienda-productos        → todos, en versión resumida (para la lista de Cargados
//                                     y para avisar si un código de barras o SKU ya existe).
// GET /api/tienda-productos?id=123 → todos los datos de uno, para verlo completo dentro del sistema.
// (Van juntas porque el plan gratis de Vercel permite hasta 12 funciones en /api.)
const { tn, preparar, responderError } = require('./_tiendanube');

const POR_PAGINA = 200; // máximo que acepta Tiendanube
const CAMPOS = 'id,name,variants,images,canonical_url,published,created_at,updated_at';

const texto = valor => (valor && typeof valor === 'object' ? valor.es || Object.values(valor).find(Boolean) : valor) || '';
const numero = valor => (valor == null || valor === '' ? null : Number(valor));

function resumir(p) {
  const variantes = p.variants || [];
  const limpios = lista => [...new Set(lista.map(s => String(s || '').trim()).filter(Boolean))];
  const stocks = variantes.map(v => v.stock);
  return {
    id: p.id,
    nombre: texto(p.name),
    url: p.canonical_url || null,
    imagen: p.images?.[0]?.src || null,
    fotos: (p.images || []).length,
    publicado: !!p.published,
    skus: limpios(variantes.map(v => v.sku)),
    codigos: limpios(variantes.map(v => v.barcode)),
    precio: numero(variantes[0]?.price),
    // null = stock ilimitado en alguna variante
    stock: stocks.some(s => s == null) ? null : stocks.reduce((a, s) => a + Number(s), 0),
    variantes: variantes.length > 1 ? variantes.length : 0,
    creado: p.created_at || null,
    actualizado: p.updated_at || null,
  };
}

function detallar(p) {
  return {
    id: p.id,
    nombre: texto(p.name),
    descripcion: texto(p.description),
    publicado: !!p.published,
    marca: p.brand || null,
    etiquetas: p.tags || '',
    categorias: (p.categories || []).map(c => texto(c.name)).filter(Boolean),
    atributos: (p.attributes || []).map(texto),
    imagenes: (p.images || []).sort((a, b) => (a.position || 0) - (b.position || 0)).map(i => i.src),
    requiereEnvio: p.requires_shipping !== false,
    variantes: (p.variants || []).map(v => ({
      valores: (v.values || []).map(texto),
      sku: v.sku || null,
      codigo: v.barcode || null,
      precio: numero(v.price),
      precioPromocional: numero(v.promotional_price),
      stock: v.stock == null ? null : Number(v.stock), // null = ilimitado
      peso: numero(v.weight),
      ancho: numero(v.width),
      alto: numero(v.height),
      profundidad: numero(v.depth),
    })),
    creado: p.created_at || null,
    actualizado: p.updated_at || null,
  };
}

module.exports = async (req, res) => {
  if (!preparar(req, res, 'GET')) return;
  try {
    if (req.query.id != null) {
      const id = String(req.query.id).replace(/\D/g, '');
      if (!id) return res.status(400).json({ error: 'Falta el producto.' });
      return res.status(200).json(detallar(await tn('GET', `/products/${id}`)));
    }

    const productos = [];
    for (let pagina = 1; pagina <= 50; pagina++) {
      const lote = await tn('GET', `/products?per_page=${POR_PAGINA}&page=${pagina}&fields=${CAMPOS}`).catch(e => {
        if (e.status === 404) return []; // Tiendanube responde 404 cuando la página ya no existe
        throw e;
      });
      productos.push(...lote.map(resumir));
      if (lote.length < POR_PAGINA) break;
    }
    res.status(200).json({ productos, fecha: new Date().toISOString() });
  } catch (e) {
    responderError(res, e);
  }
};
