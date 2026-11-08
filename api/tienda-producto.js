// GET /api/tienda-producto?id=123 → todos los datos de un producto de Tiendanube,
// para verlo completo dentro del sistema (fotos, descripción, variantes, medidas).
const { tn, preparar, responderError } = require('./_tiendanube');

const texto = valor => (valor && typeof valor === 'object' ? valor.es || Object.values(valor).find(Boolean) : valor) || '';
const numero = valor => (valor == null || valor === '' ? null : Number(valor));

module.exports = async (req, res) => {
  if (!preparar(req, res, 'GET')) return;
  try {
    const id = String(req.query.id || '').replace(/\D/g, '');
    if (!id) return res.status(400).json({ error: 'Falta el producto.' });
    const p = await tn('GET', `/products/${id}`);
    res.status(200).json({
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
    });
  } catch (e) {
    responderError(res, e);
  }
};
