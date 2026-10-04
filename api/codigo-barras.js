// GET /api/codigo-barras?codigo=7790000000000
// 200 { encontrado: true, ... }   → el formulario autocompleta
// 404 { encontrado: false, ... }  → carga manual
// 4xx/5xx { error }               → carga manual (el formulario no se bloquea)
const { preparar, responderError } = require('./_tiendanube');
const { buscarCodigo } = require('./_codigos');

module.exports = async (req, res) => {
  if (!preparar(req, res, 'GET')) return;
  try {
    const resultado = await buscarCodigo(req.query.codigo);
    res.status(resultado.encontrado ? 200 : 404).json(resultado);
  } catch (e) {
    responderError(res, e);
  }
};
