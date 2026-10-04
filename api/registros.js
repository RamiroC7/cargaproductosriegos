// POST /api/registros  { registro } → guarda el producto en la base interna.
const { preparar, responderError } = require('./_tiendanube');
const { guardarRegistro } = require('./_registro');

module.exports = async (req, res) => {
  if (!preparar(req, res)) return;
  try {
    const { registro } = req.body || {};
    if (!registro?.sku) return res.status(400).json({ error: 'Falta el registro del producto.' });
    res.status(200).json(await guardarRegistro(registro));
  } catch (e) {
    responderError(res, e);
  }
};
