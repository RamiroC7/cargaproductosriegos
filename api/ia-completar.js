// POST /api/ia-completar  { imagen (base64 JPG), codigo?, categorias[] } → campos para el formulario.
const { preparar, responderError } = require('./_tiendanube');
const { leerProducto } = require('./_ia');

const MAX_BASE64 = 3 * 1024 * 1024; // ~2,2 MB de imagen; el formulario la manda achicada a 1024 px

module.exports = async (req, res) => {
  if (!preparar(req, res)) return;
  try {
    const { imagen, codigo, categorias } = req.body || {};
    if (typeof imagen !== 'string' || !imagen) return res.status(400).json({ error: 'Falta la foto.' });
    if (imagen.length > MAX_BASE64) return res.status(413).json({ error: 'La foto es demasiado pesada.' });
    const lista = Array.isArray(categorias) ? categorias.filter(c => typeof c === 'string').slice(0, 30) : [];
    const cod = typeof codigo === 'string' && /^\d{8,14}$/.test(codigo) ? codigo : '';
    res.status(200).json(await leerProducto({ imagenBase64: imagen, codigo: cod, categorias: lista }));
  } catch (e) {
    responderError(res, e);
  }
};
