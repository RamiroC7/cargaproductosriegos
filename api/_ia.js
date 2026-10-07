// Lectura de la foto de un producto con IA: devuelve los datos para autocompletar el formulario.
// La API key vive solo en el servidor.
//
// Variables de entorno:
//   GEMINI_API_KEY   key de Google AI Studio (https://aistudio.google.com). Tiene uso gratis con límites diarios.
//   GEMINI_MODELO    opcional; por defecto 'gemini-3.8-flash'.
//
// Nota: en el plan gratis Google puede usar lo que se envía para mejorar sus productos.
// Acá solo viajan fotos de envases y etiquetas, no datos de clientes.

const MODELO = () => process.env.GEMINI_MODELO || 'gemini-3.8-flash';
const TIMEOUT_MS = 25000;

const iaConfigurada = () => !!process.env.GEMINI_API_KEY;

function instrucciones(categorias, codigo) {
  return `Sos asistente de carga de productos de "Riegos del Sur", un comercio argentino de piletas, riego, jardín, vivero, herramientas y muebles de exterior.
Te paso una o varias fotos del MISMO producto (frente, dorso, etiqueta, caja o el producto en sí)${codigo ? `, cuyo código de barras es ${codigo}` : ''}.
Combiná lo que se lee en todas las fotos y extraé los datos para la ficha de la tienda online, en español rioplatense neutro.

Reglas:
- Usá solo lo que se ve en la foto o lo que es evidente del producto. No inventes marcas, modelos, medidas ni especificaciones: si algo no se lee, dejalo como texto vacío o lista vacía.
- "tipo": qué es el producto, en 1 a 3 palabras y con mayúscula inicial (ej.: "Cloro granulado", "Manguera", "Bomba autocebante").
- "medida": medida, capacidad o peso con su unidad tal como figura (ej.: "10 kg", "1/2\\" x 25 m", "1 HP").
- "categoria": una de estas, o texto vacío si ninguna aplica: ${categorias.join(', ')}.
- "paraQue": 1 o 2 oraciones claras para el cliente, sin exagerar.
- "especificaciones" e "incluye": ítems cortos, uno por elemento.
- "modoUso": resumí las instrucciones impresas si están; si no, texto vacío.
- "codigoBarras": los números impresos debajo del código de barras (EAN/UPC, 8 a 14 dígitos), solo dígitos y solo si se leen completos; si no, texto vacío.
- "pesoKg", "altoCm", "anchoCm", "profundidadCm": estimación del producto EMBALADO para el envío (como número con punto decimal, ej. "10.5"). Basate en el contenido neto, el tamaño del envase o el tamaño habitual de ese producto. Si no podés estimarlo con criterio, texto vacío.`;
}

function esquema() {
  const texto = { type: 'STRING' };
  const lista = { type: 'ARRAY', items: { type: 'STRING' } };
  return {
    type: 'OBJECT',
    properties: {
      tipo: texto, marca: texto, modelo: texto, medida: texto, categoria: texto,
      paraQue: texto, especificaciones: lista, modoUso: texto, incluye: lista,
      codigoBarras: texto, pesoKg: texto, altoCm: texto, anchoCm: texto, profundidadCm: texto,
    },
    required: ['tipo', 'marca', 'modelo', 'medida', 'categoria', 'paraQue', 'especificaciones', 'modoUso', 'incluye',
      'codigoBarras', 'pesoKg', 'altoCm', 'anchoCm', 'profundidadCm'],
  };
}

// imagenes: lista de fotos en base64 (JPG) del mismo producto.
async function leerProducto({ imagenes, codigo, categorias }) {
  if (!iaConfigurada()) throw Object.assign(new Error('La IA todavía no está configurada en el servidor.'), { status: 503 });

  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODELO())}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: instrucciones(categorias, codigo) },
            ...imagenes.map(data => ({ inline_data: { mime_type: 'image/jpeg', data } })),
          ],
        }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: esquema(), temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw Object.assign(new Error('La IA tardó demasiado. Probá de nuevo.'), { status: 504 });
    throw Object.assign(new Error('No se pudo conectar con la IA.'), { status: 502 });
  }

  const datos = await r.json().catch(() => ({}));
  if (r.status === 429) {
    throw Object.assign(new Error('Se alcanzó el límite de uso gratis de la IA. Esperá un minuto (o hasta mañana si es el límite diario) y probá de nuevo.'), { status: 429 });
  }
  if (!r.ok) {
    throw Object.assign(new Error(`La IA respondió ${r.status}: ${datos?.error?.message || 'error desconocido'}`), { status: 502 });
  }

  const candidato = datos.candidates?.[0];
  const texto = (candidato?.content?.parts || []).map(p => p.text || '').join('');
  if (!texto) {
    const motivo = candidato?.finishReason || datos.promptFeedback?.blockReason || 'sin respuesta';
    throw Object.assign(new Error(`La IA no devolvió datos (${motivo}). Probá con otra foto.`), { status: 502 });
  }

  let campos;
  try { campos = JSON.parse(texto); } catch { throw Object.assign(new Error('La IA devolvió un formato inesperado. Probá de nuevo.'), { status: 502 }); }

  const limpiar = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const listar = v => (Array.isArray(v) ? v : []).map(limpiar).filter(Boolean);
  // Medidas: solo números positivos razonables; si no, vacío.
  const medida = (v, max) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 && n <= max ? String(Math.round(n * 100) / 100) : '';
  };
  const leido = String(campos.codigoBarras ?? '').replace(/\D/g, '');
  return {
    codigoBarras: [8, 12, 13, 14].includes(leido.length) ? leido : '',
    pesoKg: medida(campos.pesoKg, 1000), altoCm: medida(campos.altoCm, 500),
    anchoCm: medida(campos.anchoCm, 500), profundidadCm: medida(campos.profundidadCm, 500),
    tipo: limpiar(campos.tipo), marca: limpiar(campos.marca), modelo: limpiar(campos.modelo), medida: limpiar(campos.medida),
    categoria: categorias.includes(limpiar(campos.categoria)) ? limpiar(campos.categoria) : '',
    paraQue: limpiar(campos.paraQue), especificaciones: listar(campos.especificaciones),
    modoUso: limpiar(campos.modoUso), incluye: listar(campos.incluye),
    modelo_ia: MODELO(),
  };
}

module.exports = { leerProducto, iaConfigurada };
