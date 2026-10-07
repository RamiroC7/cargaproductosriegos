// Lectura de las fotos de un producto con IA: devuelve los datos para autocompletar el formulario.
// Las API keys viven solo en el servidor. Cada IA se usa solo si su key está cargada.
//
// Variables de entorno (todas opcionales; con una alcanza):
//   GEMINI_API_KEY     Google AI Studio (gratis con límites). Modelo: GEMINI_MODELO (def. 'gemini-3.8-flash').
//   MISTRAL_API_KEY    Mistral (plan Experiment gratis, sin tarjeta). Modelo: MISTRAL_MODELO (def. 'mistral-small-latest').
//   OPENAI_API_KEY     ChatGPT (OpenAI, pago).        Modelo: OPENAI_MODELO (def. 'gpt-6-luna').
//   XAI_API_KEY        Grok (xAI, pago).              Modelo: XAI_MODELO    (def. 'grok-4.7').
//   ANTHROPIC_API_KEY  Claude (Anthropic, pago).      Modelo: CLAUDE_MODELO (def. 'claude-opus-5-5').
//
// Orden: primero Gemini (gratis); si está saturado o tarda, entran las pagas de la más barata a la más cara.
// Las IAs compiten en vez de esperar en fila: si una no respondió en ESCALON_MS (o falló), arranca la
// siguiente en paralelo, y gana la primera respuesta buena. El error de una nunca frena a las otras.
//
// Nota: en el plan gratis Google puede usar lo que se envía para mejorar sus productos.
// Acá solo viajan fotos de envases y etiquetas, no datos de clientes.
const AnthropicSDK = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSDK.default || AnthropicSDK;

const TIMEOUT_MS = 45000; // tope por IA
const ESCALON_MS = 6000;  // si una IA no respondió en este tiempo, arranca la siguiente en paralelo

const env = (nombre, porDefecto) => process.env[nombre] || porDefecto;
const iaConfigurada = () => !!(process.env.GEMINI_API_KEY || process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY || process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY);
const esGratis = nombre => nombre.startsWith('gemini') || nombre.startsWith('mistral') || nombre.startsWith('ministral');

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
- "pesoKg", "altoCm", "anchoCm", "profundidadCm": estimación del producto EMBALADO para el envío (como número con punto decimal, ej. "10.5"). Basate en el contenido neto, el tamaño del envase o el tamaño habitual de ese producto. Si no podés estimarlo con criterio, texto vacío.

Respondé solo con el JSON pedido.`;
}

const CAMPOS_TEXTO = ['tipo', 'marca', 'modelo', 'medida', 'categoria', 'paraQue', 'modoUso', 'codigoBarras', 'pesoKg', 'altoCm', 'anchoCm', 'profundidadCm'];
const CAMPOS_LISTA = ['especificaciones', 'incluye'];
const TODOS = [...CAMPOS_TEXTO, ...CAMPOS_LISTA];

// Esquema en JSON Schema estándar (OpenAI, Grok y Claude).
function esquemaJson() {
  const properties = {};
  CAMPOS_TEXTO.forEach(c => { properties[c] = { type: 'string' }; });
  CAMPOS_LISTA.forEach(c => { properties[c] = { type: 'array', items: { type: 'string' } }; });
  return { type: 'object', properties, required: TODOS, additionalProperties: false };
}

// El mismo esquema en el formato propio de Gemini.
function esquemaGemini() {
  const properties = {};
  CAMPOS_TEXTO.forEach(c => { properties[c] = { type: 'STRING' }; });
  CAMPOS_LISTA.forEach(c => { properties[c] = { type: 'ARRAY', items: { type: 'STRING' } }; });
  return { type: 'OBJECT', properties, required: TODOS };
}

// ---------- Cada IA: recibe un AbortSignal y devuelve { status, texto, motivo } ----------

async function leerJson(r) { return r.json().catch(() => ({})); }

function gemini(modelo) {
  return {
    nombre: modelo,
    async pedir({ prompt, imagenes, signal }) {
      const cuerpo = pensarPoco => JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...imagenes.map(data => ({ inline_data: { mime_type: 'image/jpeg', data } }))] }],
        generationConfig: {
          responseMimeType: 'application/json', responseSchema: esquemaGemini(), temperature: 0.2,
          // Para leer una etiqueta alcanza con "pensar poco": responde más rápido.
          ...(pensarPoco ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      });
      const llamar = async pensarPoco => {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: cuerpo(pensarPoco), signal,
        });
        return { r, json: await leerJson(r) };
      };
      let { r, json } = await llamar(true);
      // Si el modelo no acepta el ajuste de "pensar poco", se repite sin él.
      if (r.status === 400 && /think/i.test(json?.error?.message || '')) ({ r, json } = await llamar(false));
      if (!r.ok) return { status: r.status, motivo: json?.error?.message };
      const c = json.candidates?.[0];
      const texto = (c?.content?.parts || []).map(p => p.text || '').join('');
      return texto ? { status: 200, texto } : { status: 502, motivo: `sin datos (${c?.finishReason || json.promptFeedback?.blockReason || 'vacío'})` };
    },
  };
}

// OpenAI y Grok usan el mismo formato de "chat completions".
function compatibleOpenAI(nombre, url, key, modelo) {
  return {
    nombre,
    async pedir({ prompt, imagenes, signal }) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: modelo,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...imagenes.map(data => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } })),
            ],
          }],
          response_format: { type: 'json_schema', json_schema: { name: 'producto', strict: true, schema: esquemaJson() } },
        }),
        signal,
      });
      const json = await leerJson(r);
      if (!r.ok) return { status: r.status, motivo: json?.error?.message || json?.error };
      const texto = json.choices?.[0]?.message?.content;
      return texto ? { status: 200, texto } : { status: 502, motivo: 'sin datos' };
    },
  };
}

// Mistral: parecido a OpenAI, pero la imagen va como texto (data URL) y no como objeto.
function mistral(modelo) {
  return {
    nombre: modelo,
    async pedir({ prompt, imagenes, signal }) {
      const llamar = formato => fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.2,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...imagenes.map(data => ({ type: 'image_url', image_url: `data:image/jpeg;base64,${data}` })),
            ],
          }],
          response_format: formato,
        }),
        signal,
      });
      let r = await llamar({ type: 'json_schema', json_schema: { name: 'producto', strict: true, schema: esquemaJson() } });
      let json = await leerJson(r);
      // Si no acepta el esquema junto con imágenes, se pide JSON simple (el prompt ya dice qué campos van).
      if (r.status === 400) { r = await llamar({ type: 'json_object' }); json = await leerJson(r); }
      if (!r.ok) return { status: r.status, motivo: json?.message || json?.error?.message || json?.detail };
      const texto = json.choices?.[0]?.message?.content;
      return texto ? { status: 200, texto } : { status: 502, motivo: 'sin datos' };
    },
  };
}

function claude(modelo) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return {
    nombre: modelo,
    async pedir({ prompt, imagenes, signal }) {
      try {
        const respuesta = await client.beta.messages.create({
          model: modelo,
          max_tokens: 4000,
          // Si Claude rechazara el pedido por sus filtros, lo reintenta otro modelo de Anthropic.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // Leer una etiqueta es simple: esfuerzo bajo = respuesta más rápida y barata.
          output_config: { effort: 'low', format: { type: 'json_schema', schema: esquemaJson() } },
          messages: [{
            role: 'user',
            content: [
              ...imagenes.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
              { type: 'text', text: prompt },
            ],
          }],
        }, { signal, maxRetries: 0, timeout: TIMEOUT_MS });
        if (respuesta.stop_reason === 'refusal') return { status: 502, motivo: 'rechazado por Claude' };
        const texto = respuesta.content.filter(b => b.type === 'text').map(b => b.text).join('');
        return texto ? { status: 200, texto } : { status: 502, motivo: `sin datos (${respuesta.stop_reason})` };
      } catch (e) {
        if (e instanceof Anthropic.APIUserAbortError) throw e;
        if (e instanceof Anthropic.APIError) return { status: e.status || 502, motivo: e.message };
        throw e;
      }
    },
  };
}

// Las IAs disponibles, en el orden en que se prueban.
function candidatas() {
  const lista = [];
  const geminiPrincipal = env('GEMINI_MODELO', 'gemini-3.8-flash');
  if (process.env.GEMINI_API_KEY) lista.push(gemini(geminiPrincipal), gemini('gemini-3.6-flash'));
  if (process.env.MISTRAL_API_KEY) lista.push(mistral(env('MISTRAL_MODELO', 'mistral-small-latest')));
  if (process.env.OPENAI_API_KEY) lista.push(compatibleOpenAI(env('OPENAI_MODELO', 'gpt-6-luna'), 'https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY, env('OPENAI_MODELO', 'gpt-6-luna')));
  if (process.env.XAI_API_KEY) lista.push(compatibleOpenAI(env('XAI_MODELO', 'grok-4.7'), 'https://api.x.ai/v1/chat/completions', process.env.XAI_API_KEY, env('XAI_MODELO', 'grok-4.7')));
  if (process.env.ANTHROPIC_API_KEY) lista.push(claude(env('CLAUDE_MODELO', 'claude-opus-5-5')));
  if (process.env.GEMINI_API_KEY) lista.push(gemini('gemini-3.7-flash'), gemini('gemini-3.5-flash'));
  // Sin repetidos (por si GEMINI_MODELO coincide con un respaldo).
  return lista.filter((x, i) => lista.findIndex(y => y.nombre === x.nombre) === i);
}

// imagenes: lista de fotos en base64 (JPG) del mismo producto.
async function leerProducto({ imagenes, codigo, categorias }) {
  if (!iaConfigurada()) throw Object.assign(new Error('La IA todavía no está configurada en el servidor.'), { status: 503 });

  const prompt = instrucciones(categorias, codigo);
  const ias = candidatas();
  const intentos = []; // queda en los registros de Vercel para saber qué pasó con cada IA
  const inicio = Date.now();

  // Una "ronda": las IAs de la lista compiten y gana la primera respuesta buena (null si ninguna).
  function ronda(lista, numero) {
    const controles = [];
    let resuelto = false;

    async function intentar(ia) {
      const control = new AbortController();
      controles.push(control);
      const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);
      const t0 = Date.now();
      let r;
      try {
        r = await ia.pedir({ prompt, imagenes, signal: control.signal });
      } catch {
        // Cortada por demora, porque otra IA ya respondió, o sin conexión.
        r = resuelto ? { status: 0 } : { status: control.signal.aborted ? 504 : 502, motivo: control.signal.aborted ? 'tardó demasiado' : 'no se pudo conectar' };
      } finally {
        clearTimeout(reloj);
      }
      if (r.status !== 0) intentos.push({ ronda: numero, ia: ia.nombre, status: r.status, ms: Date.now() - t0, motivo: r.status === 200 ? 'ok' : String(r.motivo || '').slice(0, 160) });
      return { ...r, ia: ia.nombre };
    }

    return new Promise(resolver => {
      let lanzadas = 0, terminadas = 0;
      const terminar = valor => {
        if (resuelto) return;
        resuelto = true;
        clearInterval(escalonado);
        controles.forEach(c => c.abort());
        resolver(valor);
      };
      const lanzar = () => {
        if (resuelto || lanzadas >= lista.length) return;
        const ia = lista[lanzadas++];
        intentar(ia).then(r => {
          terminadas++;
          if (r.status === 200) return terminar(r);
          if (lanzadas < lista.length) lanzar();
          else if (terminadas >= lanzadas) terminar(null);
        });
      };
      const escalonado = setInterval(lanzar, ESCALON_MS);
      lanzar();
    });
  }

  let ganador = await ronda(ias, 1);
  // La saturación de las IAs gratis suele durar segundos: si todas dijeron "saturada" rápido,
  // se espera un poco y se prueba de nuevo solo con las gratis.
  if (!ganador && Date.now() - inicio < 30000 && intentos.some(x => x.status === 503 || x.status === 500)) {
    await new Promise(r => setTimeout(r, 4000));
    ganador = await ronda(ias.filter(x => esGratis(x.nombre)), 2);
  }
  console.log('IA intentos', JSON.stringify(intentos));

  if (!ganador) {
    const hayPagas = ias.some(x => !esGratis(x.nombre));
    const soloGoogle = ias.every(x => x.nombre.startsWith('gemini'));
    if (!hayPagas && intentos.some(x => x.status === 429)) {
      throw Object.assign(new Error('Se alcanzó el límite de uso gratis de la IA. Esperá un minuto (o hasta mañana si es el límite diario) y probá de nuevo.'), { status: 429 });
    }
    if (intentos.length && intentos.every(x => x.status === 504)) {
      throw Object.assign(new Error('La IA tardó demasiado en responder. Probá con menos fotos o de nuevo en unos minutos.'), { status: 504 });
    }
    if (soloGoogle) {
      throw Object.assign(new Error('La IA de Google está saturada en este momento. Probá de nuevo en unos minutos o completá los datos a mano.'), { status: 503 });
    }
    throw Object.assign(new Error('Ninguna IA pudo leer las fotos en este momento. Probá de nuevo en unos minutos o completá los datos a mano.'), { status: 503 });
  }

  let campos;
  try { campos = JSON.parse(ganador.texto); } catch { throw Object.assign(new Error('La IA devolvió un formato inesperado. Probá de nuevo.'), { status: 502 }); }

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
    modelo_ia: ganador.ia,
  };
}

module.exports = { leerProducto, iaConfigurada };
