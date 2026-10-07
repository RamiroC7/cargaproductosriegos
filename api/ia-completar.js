// POST /api/ia-completar  { imagenes: [base64 JPG, ...], codigo?, categorias[] } → campos para el formulario.
const { preparar, responderError } = require('./_tiendanube');
const { leerProducto } = require('./_ia');

const MAX_FOTOS = 4;
const MAX_TOTAL = 4 * 1024 * 1024; // el límite de Vercel por pedido es 4,5 MB; el formulario manda fotos de 1024 px

module.exports = async (req, res) => {
  if (!preparar(req, res)) return;
  try {
    const { imagenes, codigo, categorias } = req.body || {};
    const fotos = (Array.isArray(imagenes) ? imagenes : []).filter(i => typeof i === 'string' && i).slice(0, MAX_FOTOS);
    if (!fotos.length) return res.status(400).json({ error: 'Falta la foto.' });
    if (fotos.reduce((t, f) => t + f.length, 0) > MAX_TOTAL) return res.status(413).json({ error: 'Las fotos son demasiado pesadas.' });
    const lista = Array.isArray(categorias) ? categorias.filter(c => typeof c === 'string').slice(0, 30) : [];
    const cod = typeof codigo === 'string' && /^\d{8,14}$/.test(codigo) ? codigo : '';
    res.status(200).json(await leerProducto({ imagenes: fotos, codigo: cod, categorias: lista }));
  } catch (e) {
    responderError(res, e);
  }
};
