// Guarda el registro completo del producto en la base de datos interna del negocio.
// Incluye lo que Tiendanube no guarda: proveedor, código de barras, de qué catálogo vino, quién lo cargó.
//
// PENDIENTE: elegir la base (ver README). Mientras no haya una configurada, no guarda nada
// y la publicación en Tiendanube sigue funcionando igual.

function registroConfigurado() {
  return false;
}

// registro: { sku, codigo, nombre, categoria, marca, proveedor, precio, stock, variantes[],
//             fuenteCatalogo, tiendanube: { id, url, imagenes[] }, creado }
async function guardarRegistro(registro) {
  if (!registroConfigurado()) return { guardado: false, motivo: 'Base interna sin configurar' };
  // Acá va el INSERT/UPSERT por SKU en la base elegida.
  throw new Error('guardarRegistro sin implementar');
}

module.exports = { registroConfigurado, guardarRegistro };
