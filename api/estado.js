// GET /api/estado — le dice al formulario qué está configurado, sin exponer ninguna credencial.
const { preparar } = require('./_tiendanube');
const { registroConfigurado } = require('./_registro');

module.exports = (req, res) => {
  if (!preparar(req, res, 'GET', { sinSesion: true })) return;
  res.status(200).json({
    tiendanube: !!(process.env.TN_STORE_ID && process.env.TN_ACCESS_TOKEN && process.env.TN_USER_AGENT),
    codigos: process.env.BARCODE_PROVEEDOR || 'upcitemdb',
    registro: registroConfigurado(),
  });
};
