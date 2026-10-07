// Convierte lo que carga la CM al formato de la API de productos de Tiendanube (2025-03)
// y habla con el backend (/api): estado, código de barras, publicación y registro interno.
window.TN = (() => {
  const C = window.CONFIG;
  const L = texto => ({ [C.IDIOMA]: texto });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function numero(valor) {
    const texto = String(valor ?? '').trim().replace(/\s/g, '');
    // Acepta "1.234,50", "12.500", "1234,5" y "1234.50".
    let normal = texto;
    if (/,\d{1,2}$/.test(texto)) normal = texto.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) normal = texto.replace(/\./g, '');
    else normal = texto.replace(/,/g, '');
    const n = parseFloat(normal);
    return Number.isFinite(n) ? n : null;
  }
  // Tiendanube recibe precios, peso (kg) y medidas (cm) como texto decimal: "1.50".
  function decimal(valor) {
    const n = numero(valor);
    return n == null ? undefined : n.toFixed(2);
  }
  function entero(valor) {
    const n = numero(valor);
    return n == null ? undefined : Math.max(0, Math.round(n));
  }
  function lineas(texto) {
    return String(texto || '').split('\n').map(s => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
  }
  function parrafos(texto) {
    return String(texto).trim().split(/\n\s*\n/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`);
  }
  const lista = items => `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;

  // Título armado con las partes (tipo + marca + modelo + medida).
  function armarNombre(d) {
    return [d.tipo, d.marca, d.modelo, d.medida].map(s => (s || '').trim()).filter(Boolean).join(' ');
  }
  // Título final: el que está en el campo (escrito, autocompletado o armado).
  const titulo = d => (d.nombre || '').trim() || armarNombre(d);

  function slug(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  const sinEnvio = d => C.CATEGORIAS_SIN_ENVIO.includes(d.categoria);

  // SKUs que viajan a Tiendanube: uno por variante, o el del producto si no tiene variantes.
  function skus(d) {
    const lista = d.tieneVariantes ? (d.variantes || []).map(v => v.sku) : [d.sku];
    return lista.map(s => (s || '').trim()).filter(Boolean);
  }

  // Sugiere una categoría propia a partir de la categoría del catálogo global.
  function sugerirCategoria(texto) {
    const regla = C.MAPA_CATEGORIAS.find(([re]) => re.test(texto || ''));
    return regla ? regla[1] : '';
  }

  function armarDescripcion(d) {
    const partes = [];
    if (d.paraQue) partes.push(...parrafos(d.paraQue));
    const specs = lineas(d.especificaciones);
    if (specs.length) partes.push('<h3>Especificaciones</h3>', lista(specs));
    if (d.modoUso) partes.push('<h3>Modo de uso</h3>', ...parrafos(d.modoUso));
    const incluye = lineas(d.incluye);
    if (incluye.length) partes.push('<h3>Qué incluye</h3>', lista(incluye));
    return partes.join('\n');
  }

  function armarPayload(p) {
    const d = p.datos;
    const nombre = titulo(d);
    const envio = !sinEnvio(d);
    const medidas = envio
      ? { weight: decimal(d.peso), width: decimal(d.ancho), height: decimal(d.alto), depth: decimal(d.profundidad) }
      : {};

    const conVariantes = d.tieneVariantes && d.atributos.length > 0;
    const variants = conVariantes
      ? d.variantes.map(v => ({
          sku: (v.sku || '').trim(),
          values: d.atributos.map(a => L((v.valores[a] || '').trim())),
          price: decimal(numero(v.precio) ? v.precio : d.precio),
          stock_management: true,
          stock: entero(v.stock),
          ...medidas,
          ...(envio && numero(v.peso) ? { weight: decimal(v.peso) } : {}),
        }))
      : [{
          sku: (d.sku || '').trim(),
          barcode: (d.codigo || '').trim() || undefined,
          price: decimal(d.precio),
          stock_management: true,
          stock: entero(d.stock),
          ...medidas,
        }];

    const resumen = String(d.paraQue || '').replace(/\s+/g, ' ').trim();

    // JSON.parse(JSON.stringify()) saca los campos vacíos (undefined).
    return JSON.parse(JSON.stringify({
      name: L(nombre),
      description: L(armarDescripcion(d)),
      handle: L(slug(nombre)),
      attributes: conVariantes ? d.atributos.map(L) : [],
      variants,
      brand: (d.marca || '').trim() || undefined,
      published: C.PUBLICAR_VISIBLE,
      requires_shipping: envio,
      free_shipping: false,
      seo_title: nombre.slice(0, 70),
      seo_description: resumen.slice(0, 160),
      tags: [d.categoria, d.marca, d.tipo].map(s => (s || '').trim()).filter(Boolean).join(', '),
    }));
  }

  // Registro para la base interna: lo de Tiendanube más los datos propios.
  function armarRegistro(p) {
    const d = p.datos;
    return {
      sku: d.sku, codigo: d.codigo || null, nombre: titulo(d), categoria: d.categoria,
      marca: d.marca || null, proveedor: d.proveedor || null,
      precio: numero(d.precio), stock: d.tieneVariantes ? null : entero(d.stock),
      variantes: d.tieneVariantes ? d.variantes.map(v => ({ sku: v.sku, valores: v.valores, precio: numero(v.precio) ?? numero(d.precio), stock: entero(v.stock) })) : [],
      fuenteCatalogo: d.fuenteCatalogo || null,
      tiendanube: p.tn ? { id: p.tn.id, url: p.tn.url, imagenes: p.tn.imagenesUrls || [] } : null,
      creado: new Date(p.creado).toISOString(),
    };
  }

  // ---------- Backend ----------

  const base = () => C.API_BASE.replace(/\/$/, '');

  // La sesión viaja sola en la cookie. Si venció, se avisa para mostrar el login.
  async function llamar(metodo, ruta, cuerpo, { signal } = {}) {
    const r = await fetch(base() + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
      signal,
    });
    const datos = await r.json().catch(() => ({}));
    if (r.status === 401 && ruta !== '/api/login') window.dispatchEvent(new Event('sesion-vencida'));
    return { status: r.status, ok: r.ok, datos };
  }

  // ---------- Sesión ----------
  async function sesion() {
    const r = await llamar('GET', '/api/sesion');
    return r.ok ? r.datos : null;
  }
  async function ingresar(usuario, clave) {
    const r = await llamar('POST', '/api/login', { usuario, clave });
    if (!r.ok) throw new Error(r.datos.error || `Error ${r.status} al ingresar.`);
    return r.datos;
  }
  const salir = () => llamar('POST', '/api/logout');

  // La IA lee la foto y devuelve campos sugeridos. Tira error con un mensaje para mostrar.
  async function completarConIA(imagenBase64, codigo) {
    const r = await llamar('POST', '/api/ia-completar', { imagen: imagenBase64, codigo, categorias: C.CATEGORIAS });
    if (!r.ok) throw new Error(r.datos.error || `Error ${r.status} al consultar la IA.`);
    return r.datos;
  }

  // Qué está configurado en el servidor. Si no hay backend, todo queda en false.
  let estadoServidor = { backend: false, tiendanube: false, registro: false };
  async function cargarEstado() {
    try {
      const r = await fetch(`${base()}/api/estado`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) estadoServidor = { backend: true, ...(await r.json()) };
    } catch { /* sin backend: modo sin conexión */ }
    return estadoServidor;
  }
  const estado = () => estadoServidor;
  const conectado = () => estadoServidor.tiendanube;

  // Devuelve { tipo: 'encontrado' | 'no_encontrado' | 'error', datos | mensaje }. Nunca tira error.
  async function buscarCodigo(codigo, signal) {
    if (!estadoServidor.backend) return { tipo: 'error', mensaje: 'Sin conexión con el servidor.' };
    try {
      const tiempo = AbortSignal.timeout(C.BUSQUEDA_TIMEOUT_MS);
      const senal = AbortSignal.any ? AbortSignal.any([signal, tiempo].filter(Boolean)) : signal;
      const r = await llamar('GET', `/api/codigo-barras?codigo=${encodeURIComponent(codigo)}`, null, { signal: senal });
      if (r.status === 200 && r.datos.encontrado) return { tipo: 'encontrado', datos: r.datos };
      if (r.status === 404) return { tipo: 'no_encontrado', datos: r.datos };
      return { tipo: 'error', mensaje: r.datos.error || `Error ${r.status}` };
    } catch (e) {
      if (signal?.aborted) return { tipo: 'cancelado' };
      return { tipo: 'error', mensaje: e.name === 'TimeoutError' ? 'El catálogo tardó demasiado.' : e.message };
    }
  }

  async function exigir(metodo, ruta, cuerpo) {
    const r = await llamar(metodo, ruta, cuerpo);
    if (!r.ok) throw new Error(r.datos.error || `Error ${r.status} al comunicarse con el servidor.`);
    return r.datos;
  }

  // Guarda el avance en p.tn: si se corta a mitad, al reintentar sigue desde donde quedó.
  async function publicar(p, progreso = () => {}) {
    if (!conectado()) throw new Error('La carga todavía no está conectada a Tiendanube.');
    p.tn = p.tn || { id: null, url: null, imagenes: 0, imagenesUrls: [] };

    if (!p.tn.id) {
      progreso('Creando producto…');
      const r = await exigir('POST', '/api/productos', { producto: armarPayload(p), categoria: p.datos.categoria });
      p.tn.id = r.id;
      p.tn.url = r.url || null;
    }

    for (let i = p.tn.imagenes; i < p.fotos.length; i++) {
      progreso(`Subiendo foto ${i + 1} de ${p.fotos.length}…`);
      const img = await exigir('POST', '/api/imagenes', {
        product_id: p.tn.id,
        position: i + 1,
        filename: `${slug(p.datos.sku) || 'producto'}-${i + 1}.jpg`,
        attachment: await Imagenes.aBase64(p.fotos[i].blob),
      });
      p.tn.imagenesUrls = [...(p.tn.imagenesUrls || []), img.src];
      p.tn.imagenes = i + 1;
    }

    if (estadoServidor.registro && !p.tn.registrado) {
      progreso('Guardando en la base interna…');
      const r = await exigir('POST', '/api/registros', { registro: armarRegistro(p) });
      p.tn.registrado = !!r.guardado;
    }
  }

  return { armarNombre, titulo, armarPayload, armarRegistro, sinEnvio, skus, numero, slug, sugerirCategoria, cargarEstado, estado, conectado, buscarCodigo, publicar, sesion, ingresar, salir, completarConIA };
})();
