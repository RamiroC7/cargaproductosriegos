// POST /api/imagenes  { product_id, position, filename, attachment (base64) }
// Se sube una foto por pedido para no pasar el límite de tamaño de Vercel (4,5 MB).
const { tn, preparar, responderError } = require('./_tiendanube');

module.exports = async (req, res) => {
  if (!preparar(req, res)) return;
  try {
    const { product_id, position, filename, attachment } = req.body || {};
    if (!product_id || !attachment) return res.status(400).json({ error: 'Faltan datos de la imagen.' });
    const img = await tn('POST', `/products/${encodeURIComponent(product_id)}/images`, { attachment, filename, position });
    res.status(201).json({ id: img.id, src: img.src });
  } catch (e) {
    responderError(res, e);
  }
};
