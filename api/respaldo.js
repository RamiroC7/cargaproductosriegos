// /api/respaldo
//   POST { registro }  → guarda (o reemplaza) el respaldo de un producto
//   GET                → lista los productos respaldados (sin descargar su contenido)
//   GET ?id=<id>       → el respaldo completo de un producto (datos + fotos)
const { preparar, responderError } = require('./_tiendanube');
const { respaldoConfigurado, guardarRegistro, leerRegistro, listarRegistros } = require('./_respaldo');

const MAX_BYTES = 4.2 * 1024 * 1024; // el límite de Vercel por pedido es 4,5 MB

module.exports = async (req, res) => {
  if (!preparar(req, res, req.method === 'GET' ? 'GET' : 'POST')) return;
  try {
    if (!respaldoConfigurado()) return res.status(503).json({ error: 'El respaldo no está configurado en el servidor.' });

    if (req.method === 'GET') {
      if (req.query?.id) {
        const registro = await leerRegistro(String(req.query.id));
        return registro ? res.status(200).json(registro) : res.status(404).json({ error: 'No hay respaldo de ese producto.' });
      }
      return res.status(200).json({ productos: await listarRegistros() });
    }

    const { registro } = req.body || {};
    if (!registro || typeof registro !== 'object') return res.status(400).json({ error: 'Falta el producto.' });
    if (JSON.stringify(registro).length > MAX_BYTES) return res.status(413).json({ error: 'El producto con sus fotos es demasiado pesado para respaldar.' });
    await guardarRegistro({ ...registro, respaldadoEn: new Date().toISOString() });
    res.status(200).json({ ok: true });
  } catch (e) {
    responderError(res, e);
  }
};
