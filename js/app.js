(() => {
  const C = window.CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nuevoId = () => (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const form = $('#form');
  const CAMPOS = ['codigo', 'nombre', 'sku', 'tipo', 'marca', 'modelo', 'medida', 'precio', 'stock', 'paraQue', 'especificaciones', 'modoUso', 'incluye', 'peso', 'alto', 'ancho', 'profundidad', 'proveedor'];
  const PARTES_NOMBRE = ['tipo', 'marca', 'modelo', 'medida'];
  const EJEMPLOS = { Medida: 'Ej.: 1/2"', Color: 'Ej.: Verde', Capacidad: 'Ej.: 20 L' };

  let actual = null;              // producto que se está editando
  const urlsFotos = new Map();    // foto.id -> URL de vista previa
  let urlsLista = [];

  function vacio() {
    return {
      id: nuevoId(), estado: 'borrador', guardado: false, creado: Date.now(), actualizado: Date.now(),
      datos: { categoria: '', nombreManual: false, tieneVariantes: false, atributos: [], variantes: [], fuenteCatalogo: null },
      fotos: [], tn: null, tnError: null,
    };
  }

  // ---------- Avisos ----------
  let timerAviso;
  function aviso(mensaje, tipo = 'ok') {
    const t = $('#toast');
    const estilo = tipo === 'error' ? 'bg-red-600' : 'bg-slate-900';
    t.innerHTML = `<div class="${estilo} text-white text-sm rounded-xl shadow-lg px-4 py-3 whitespace-pre-line">${esc(mensaje)}</div>`;
    t.classList.remove('hidden');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => t.classList.add('hidden'), tipo === 'error' ? 6000 : 3000);
  }

  // ---------- Estados del formulario ----------
  // inicial → escaneando → buscando_info → completado_automatico | modo_manual → guardando → inicial
  const ESTILOS_ESTADO = {
    escaneando: 'bg-slate-100 text-slate-700',
    buscando_info: 'bg-slate-100 text-slate-700',
    completado_automatico: 'bg-marca-50 text-marca-900 border border-marca-200',
    modo_manual: 'bg-amber-50 text-amber-900 border border-amber-200',
    guardando: 'bg-slate-100 text-slate-700',
  };
  const SPINNER = '<span class="inline-block w-4 h-4 mr-2 align-[-3px] rounded-full border-2 border-current border-r-transparent animate-spin"></span>';
  let estadoUI = 'inicial';

  function setEstado(estado, mensaje = '') {
    estadoUI = estado;
    form.dataset.estado = estado;
    const banner = $('#estado-busqueda');
    const ocupado = estado === 'escaneando' || estado === 'buscando_info' || estado === 'guardando';
    if (estado === 'inicial' || !mensaje) {
      banner.classList.add('hidden');
    } else {
      banner.className = `mt-3 rounded-xl px-3 py-2.5 text-sm ${ESTILOS_ESTADO[estado]}`;
      banner.innerHTML = (ocupado ? SPINNER : '') + esc(mensaje);
    }
    // Los campos siguen editables mientras se busca; solo se bloquean al guardar.
    $('#campos').disabled = estado === 'guardando' || actual?.estado === 'publicado';
    $('#btn-escanear').disabled = ocupado;
    $('#btn-listo').disabled = estado === 'buscando_info' || estado === 'guardando';
    $('#btn-borrador').disabled = estado === 'guardando';
    $('#btn-listo').innerHTML = estado === 'guardando' ? `${SPINNER}${esc(mensaje || 'Guardando…')}` : 'Guardar y publicar';
  }

  // ---------- Vistas ----------
  function mostrarVista(vista) {
    $('#vista-form').classList.toggle('hidden', vista !== 'form');
    $('#vista-lista').classList.toggle('hidden', vista !== 'lista');
    $$('[data-vista]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.vista === vista)));
    if (vista === 'lista') abrirLista();
    window.scrollTo(0, 0);
  }
  $$('[data-vista]').forEach(b => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

  // Cuenta lo de este dispositivo más lo que está en la tienda (sin contar dos veces lo publicado desde acá).
  async function actualizarContador() {
    const locales = await DB.listar();
    const n = locales.length + soloEnTienda(locales).length;
    $('#contador').textContent = n ? `(${n})` : '';
  }

  // Productos de la tienda que no son los publicados desde este dispositivo.
  function soloEnTienda(locales) {
    const ids = new Set(locales.map(p => p.tn?.id).filter(Boolean));
    return TN.estadoTienda().productos.filter(p => !ids.has(p.id));
  }

  // ---------- Opciones fijas ----------
  $('#categorias').innerHTML = C.CATEGORIAS.map(c => `
    <label class="cursor-pointer"><input type="radio" name="categoria" value="${esc(c)}" class="sr-only"><span class="chip">${esc(c)}</span></label>`).join('');
  $('#atributos').innerHTML = C.ATRIBUTOS_VARIANTE.slice(0, 3).map(a => `
    <label class="cursor-pointer"><input type="checkbox" name="atributo" value="${esc(a)}" class="sr-only"><span class="chip">${esc(a)}</span></label>`).join('');

  // ---------- Formulario <-> datos ----------
  function leerForm() {
    const d = actual.datos;
    CAMPOS.forEach(n => { d[n] = form.elements[n].value.trim(); });
    d.categoria = form.elements.categoria.value;
    d.tieneVariantes = form.elements.tieneVariantes.checked;
    d.atributos = $$('input[name=atributo]:checked').map(i => i.value);
  }

  function cargarEnForm(p) {
    busqueda?.abort();
    busqueda = null;
    urlsFotos.forEach(u => URL.revokeObjectURL(u));
    urlsFotos.clear();
    $('#banner-parecido').classList.add('hidden');
    actual = p;
    const d = p.datos;
    CAMPOS.forEach(n => { form.elements[n].value = d[n] ?? ''; });
    $$('.autocompletado').forEach(el => el.classList.remove('autocompletado'));
    $$('input[name=categoria]').forEach(i => { i.checked = i.value === d.categoria; });
    form.elements.tieneVariantes.checked = !!d.tieneVariantes;
    $$('input[name=atributo]').forEach(i => { i.checked = d.atributos.includes(i.value); });
    mostrarCategoriaExterna();

    const publicado = p.estado === 'publicado';
    $('#aviso-publicado').classList.toggle('hidden', !publicado);
    $('#barra').classList.toggle('hidden', publicado);
    $('#titulo-form').textContent = publicado ? 'Producto publicado' : p.guardado ? 'Editar producto' : 'Nuevo producto';
    $('#btn-nuevo').classList.toggle('hidden', !p.guardado);

    setEstado('inicial');
    limpiarErrores();
    renderFotos();
    actualizarDerivados();
    renderVariantes();
  }

  function actualizarDerivados() {
    const d = actual.datos;
    // Mientras nadie escriba el título a mano, se arma con las partes.
    if (!d.nombreManual) form.elements.nombre.value = TN.armarNombre({
      tipo: form.elements.tipo.value, marca: form.elements.marca.value, modelo: form.elements.modelo.value, medida: form.elements.medida.value,
    });
    leerForm();
    $('#btn-rearmar').classList.toggle('hidden', !(d.nombreManual && TN.armarNombre(d)));
    const sinEnvio = TN.sinEnvio(d);
    $('#envio-campos').classList.toggle('hidden', sinEnvio);
    $('#envio-servicio').classList.toggle('hidden', !sinEnvio);
    $('#variantes-panel').classList.toggle('hidden', !d.tieneVariantes);
    $('#ayuda-sku-variantes').classList.toggle('hidden', !d.tieneVariantes);
    $('#grupo-stock').classList.toggle('hidden', d.tieneVariantes);
    $('#ayuda-stock-variantes').classList.toggle('hidden', !d.tieneVariantes);
  }

  form.addEventListener('input', e => {
    const t = e.target;
    if (t.closest('#variantes-lista')) return;
    t.classList.remove('autocompletado');
    if (t.name === 'nombre') actual.datos.nombreManual = t.value.trim() !== '';
    if (t.name === 'codigo') alEscribirCodigo();
    actualizarDerivados();
    t.closest('[data-campo]')?.classList.remove('con-error');
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'categoria') e.target.closest('[data-campo]')?.classList.remove('con-error');
    if (e.target.name === 'atributo' || e.target.name === 'tieneVariantes') {
      actualizarDerivados();
      const d = actual.datos;
      if (d.tieneVariantes && d.atributos.length && !d.variantes.length) agregarVariante(false);
      renderVariantes();
    }
  });
  $('#btn-rearmar').addEventListener('click', () => {
    actual.datos.nombreManual = false;
    form.elements.nombre.classList.remove('autocompletado');
    actualizarDerivados();
  });

  // ---------- Código de barras ----------
  let busqueda = null;      // AbortController de la búsqueda en curso
  let timerCodigo;

  function digitoValido(codigo) {
    const d = codigo.split('').map(Number);
    const control = d.pop();
    const suma = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (suma % 10)) % 10 === control;
  }

  // Al tipear: si ya es un EAN-13/EAN-8 válido, busca solo (también sirve para lectoras USB).
  function alEscribirCodigo() {
    clearTimeout(timerCodigo);
    const codigo = form.elements.codigo.value.replace(/\D/g, '');
    if ((codigo.length === 13 || codigo.length === 8) && digitoValido(codigo)) {
      timerCodigo = setTimeout(() => buscarCodigo(), 350);
    }
  }

  function mostrarCategoriaExterna() {
    const f = actual.datos.fuenteCatalogo;
    const p = $('#categoria-externa');
    p.classList.toggle('hidden', !f?.categoria);
    if (f?.categoria) p.textContent = `En el catálogo global figura como: ${f.categoria}`;
  }

  // Completa solo los campos vacíos: nunca pisa lo que la CM ya escribió.
  function ponerSiVacio(campo, valor, llenados) {
    const el = form.elements[campo];
    if (!valor || el.value.trim()) return;
    el.value = valor;
    el.classList.add('autocompletado');
    llenados.push(campo);
  }

  function elegirCategoriaSiVacia(categoria, llenados) {
    if (!categoria || form.elements.categoria.value) return;
    const opcion = $(`input[name=categoria][value="${CSS.escape(categoria)}"]`);
    if (!opcion) return;
    opcion.checked = true;
    llenados.push('categoria');
  }

  function autocompletar(info) {
    const llenados = [];
    const poner = (campo, valor) => ponerSiVacio(campo, valor, llenados);
    poner('nombre', info.nombre);
    if (llenados.includes('nombre')) actual.datos.nombreManual = true;
    poner('marca', info.marca);
    poner('paraQue', info.descripcion);

    elegirCategoriaSiVacia(TN.sugerirCategoria(`${info.categoriaExterna} ${info.nombre}`), llenados);

    actual.datos.fuenteCatalogo = { fuente: info.fuente, categoria: info.categoriaExterna || null, fecha: new Date().toISOString() };
    mostrarCategoriaExterna();
    actualizarDerivados();
    return llenados;
  }

  // ---------- Completar con IA (lee hasta 3 fotos) ----------
  // Lo que la IA quiere poner en cada campo del formulario.
  function valoresIA(info) {
    const v = {};
    ['tipo', 'marca', 'modelo', 'medida', 'paraQue', 'modoUso'].forEach(c => { v[c] = info[c] || ''; });
    v.especificaciones = (info.especificaciones || []).join('\n');
    v.incluye = (info.incluye || []).join('\n');
    v.codigo = info.codigoBarras || '';
    // Peso y medidas son estimaciones: quedan en azul para que los confirme.
    if (!TN.sinEnvio({ categoria: form.elements.categoria.value || info.categoria })) {
      [['peso', 'pesoKg'], ['alto', 'altoCm'], ['ancho', 'anchoCm'], ['profundidad', 'profundidadCm']]
        .forEach(([campo, clave]) => { v[campo] = (info[clave] || '').replace('.', ','); });
    }
    return v;
  }

  // Campos que identifican al producto: si la IA lee otra cosa acá, es otro producto o una lectura mejor.
  const IDENTIDAD = { tipo: 'Tipo', marca: 'Marca', modelo: 'Modelo', medida: 'Medida', codigo: 'Código de barras' };
  const igual = (a, b) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

  function diferenciasIA(info) {
    const v = valoresIA(info);
    return Object.keys(IDENTIDAD)
      .filter(c => v[c] && form.elements[c].value.trim() && !igual(v[c], form.elements[c].value))
      .map(c => ({ campo: c, antes: form.elements[c].value.trim(), despues: v[c] }));
  }

  // reemplazar = false: solo completa lo vacío. true: pisa todo lo que la IA leyó.
  function autocompletarIA(info, reemplazar = false) {
    const llenados = [];
    Object.entries(valoresIA(info)).forEach(([campo, valor]) => {
      const el = form.elements[campo];
      if (!valor || (!reemplazar && el.value.trim()) || igual(valor, el.value)) return;
      el.value = valor;
      el.classList.add('autocompletado');
      llenados.push(campo);
    });
    if (reemplazar && info.categoria && $(`input[name=categoria][value="${CSS.escape(info.categoria)}"]`)) {
      form.elements.categoria.value = '';
      $$('input[name=categoria]').forEach(i => { i.checked = false; });
    }
    elegirCategoriaSiVacia(info.categoria, llenados);
    actual.datos.fuenteIA = { modelo: info.modelo_ia || null, fecha: new Date().toISOString() };
    actualizarDerivados();
    $$('.autocompletado').forEach(el => el.closest('[data-campo]')?.classList.remove('con-error'));
    return llenados;
  }

  // Si la IA leyó algo distinto a lo cargado, pregunta qué hacer.
  // Devuelve 'nuevo' (otro producto: empieza de cero con las fotos nuevas), 'reemplazar' o 'completar'.
  function decidirIA(info, hayFotosViejas) {
    const dif = diferenciasIA(info);
    if (!dif.length) return 'completar';
    const lista = dif.map(d => `• ${IDENTIDAD[d.campo]}: "${d.antes}" → "${d.despues}"`).join('\n');
    if (hayFotosViejas) {
      const queda = actual.guardado ? 'el anterior ya está guardado' : 'el anterior NO está guardado y se descarta';
      return confirm(`La IA leyó otro producto en las fotos nuevas:\n${lista}\n\nAceptar: empezar un producto nuevo con las fotos nuevas y lo que leyó la IA (${queda}).\nCancelar: dejar lo cargado y completar solo los campos vacíos.`)
        ? 'nuevo' : 'completar';
    }
    return confirm(`La IA leyó datos distintos a los cargados:\n${lista}\n\nAceptar: reemplazarlos con lo nuevo.\nCancelar: dejar lo cargado y completar solo los campos vacíos.`)
      ? 'reemplazar' : 'completar';
  }

  // Busca el código en lo cargado en este dispositivo y en lo que ya está en Tiendanube.
  // Devuelve { nombre, sku, donde } o null.
  async function productoConCodigo(codigo) {
    if (!codigo) return null;
    const local = (await DB.listar()).find(p => p.id !== actual.id && p.datos.codigo === codigo);
    if (local) return { nombre: TN.titulo(local.datos), sku: local.datos.sku, donde: 'en Cargados' };
    const tienda = await TN.enTienda({ codigo, excluirId: actual.tn?.id });
    if (tienda) return { nombre: tienda.nombre, sku: tienda.skus[0], donde: 'en Tiendanube' };
    return null;
  }

  let iaEnCurso = false;
  async function completarConIA() {
    // Si hay fotos que la IA todavía no leyó, se leen solo esas: pueden ser de otro producto.
    // Primero las de etiqueta (solo IA), que son las que tienen más datos.
    // Hasta 3 fotos: menos datos = respuesta más rápida.
    const nuevas = actual.fotos.filter(f => !f.leida);
    const base = nuevas.length ? nuevas : actual.fotos;
    const hayFotosViejas = nuevas.length > 0 && nuevas.length < actual.fotos.length;
    const fotos = [...base.filter(f => f.soloIA), ...publicables(base)].slice(0, 3);
    if (!fotos.length || iaEnCurso) return;
    iaEnCurso = true;
    const boton = $('#btn-ia');
    const contenido = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = `${SPINNER}Leyendo ${fotos.length === 1 ? 'la foto' : 'las fotos'}…`;
    setEstado('buscando_info', `La IA está leyendo ${fotos.length === 1 ? 'la foto' : `las ${fotos.length} fotos`}…`);
    // Si Google está saturado el servidor sigue reintentando: se avisa para que no parezca colgado.
    const avisoDemora = setTimeout(() => {
      if (estadoUI === 'buscando_info') setEstado('buscando_info', 'Google está con mucha demanda. Seguimos intentando, puede tardar hasta un minuto…');
    }, 12000);
    try {
      // La etiqueta va nítida para que se lea la letra chica; con etiqueta aparte, la foto del producto alcanza más chica.
      // Sin foto de etiqueta (lo más común), la del producto es la que tiene el texto: va nítida también.
      const hayEtiqueta = fotos.some(f => f.soloIA);
      const imagenes = await Promise.all(fotos.map(f => Imagenes.reducir(f.blob, f.soloIA || !hayEtiqueta ? 1024 : 640)));
      // Con fotos de otro producto el código cargado no corresponde: no se le pasa a la IA.
      const info = await TN.completarConIA(imagenes, hayFotosViejas ? '' : form.elements.codigo.value.replace(/\D/g, ''), fotos.filter(f => f.soloIA).length);
      const decision = decidirIA(info, hayFotosViejas);
      // Si eligió no cambiar de producto, las fotos nuevas siguen "sin leer" para poder volver a ofrecerlo.
      if (!(hayFotosViejas && decision === 'completar' && diferenciasIA(info).length)) base.forEach(f => { f.leida = true; });
      if (decision === 'nuevo') {
        const p = vacio();
        p.fotos = nuevas;
        cargarEnForm(p);
        window.scrollTo(0, 0);
      }
      const llenados = autocompletarIA(info, decision !== 'completar');
      const repetido = await productoConCodigo(form.elements.codigo.value);
      const leyo = Object.values(valoresIA(info)).some(Boolean) || info.categoria;
      if (repetido) {
        setEstado('modo_manual', `Ojo: este código de barras ya está cargado ${repetido.donde}: "${repetido.nombre}". Revisá en Cargados que no sea el mismo producto.`);
      } else if (llenados.length) {
        const estimados = ['peso', 'alto', 'ancho', 'profundidad'].some(c => llenados.includes(c));
        const que = decision === 'nuevo' ? 'Producto nuevo: la IA completó' : decision === 'reemplazar' ? 'La IA reemplazó y completó' : 'La IA completó';
        setEstado('completado_automatico', `${que} lo marcado en azul. Revisalo${estimados ? ' (el peso y las medidas son estimados: confirmalos)' : ''} y poné precio y cantidad.`);
      } else if (leyo) {
        setEstado('modo_manual', decision === 'completar' && diferenciasIA(info).length
          ? 'Se dejó lo que ya estaba cargado. Si querés usar lo que leyó la IA, tocá "Completar con IA" de nuevo y elegí Aceptar.'
          : 'La IA leyó lo mismo que ya está cargado: no hubo nada para cambiar.');
      } else {
        setEstado('modo_manual', 'La IA no pudo leer datos en las fotos. Probá con una foto donde se lea mejor la etiqueta.');
      }
    } catch (e) {
      setEstado('modo_manual', e.message);
    } finally {
      clearTimeout(avisoDemora);
      iaEnCurso = false;
      boton.disabled = false;
      boton.innerHTML = contenido;
    }
  }

  $('#btn-ia').addEventListener('click', completarConIA);

  async function buscarCodigo() {
    clearTimeout(timerCodigo);
    const input = form.elements.codigo;
    const codigo = input.value.replace(/\D/g, '');
    input.value = codigo;
    if (!codigo) return;
    if (![8, 12, 13, 14].includes(codigo.length)) {
      setEstado('modo_manual', 'El código tiene que tener 8, 12, 13 o 14 números. Podés seguir cargando a mano.');
      return;
    }

    // ¿Ya lo cargamos antes?
    const repetido = await productoConCodigo(codigo);
    if (repetido) {
      setEstado('modo_manual', `Este código ya está cargado ${repetido.donde}: "${repetido.nombre}" (SKU ${repetido.sku || 'sin SKU'}). Revisá la lista de Cargados antes de seguir.`);
      return;
    }

    busqueda?.abort();
    const control = new AbortController();
    busqueda = control;
    setEstado('buscando_info', 'Buscando en el catálogo global…');

    const r = await TN.buscarCodigo(codigo, control.signal);
    if (busqueda !== control || r.tipo === 'cancelado') return; // llegó una respuesta vieja
    busqueda = null;

    if (r.tipo === 'encontrado') {
      const llenados = autocompletar(r.datos);
      setEstado('completado_automatico', llenados.length
        ? 'Encontrado en el catálogo global. Completamos lo marcado en azul: revisalo y ajustá lo que haga falta.'
        : 'Encontrado en el catálogo global, pero los campos ya estaban completos. No se cambió nada.');
    } else if (r.tipo === 'no_encontrado') {
      setEstado('modo_manual', TN.estado().ia
        ? 'Producto no encontrado en el catálogo global. Sacale una foto a la etiqueta y tocá "Completar con IA", o completalo a mano.'
        : 'Producto no encontrado en el catálogo global. Completalo a mano.');
      if (!form.elements.nombre.value) form.elements.tipo.focus({ preventScroll: true });
    } else {
      setEstado('modo_manual', `No se pudo consultar el catálogo (${r.mensaje}). Seguí cargando a mano.`);
    }
  }

  form.elements.codigo.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); buscarCodigo(); }
  });
  $('#btn-buscar-codigo').addEventListener('click', () => buscarCodigo());

  // Si se escanea un código distinto con el formulario ya cargado (por ejemplo, completado con IA
  // y sin guardar), pregunta si es otro producto: si no, se mezclarían los datos de los dos.
  function esOtroProducto(codigo) {
    leerForm();
    const d = actual.datos;
    if (codigo === d.codigo) return false;
    const conDatos = actual.fotos.length || CAMPOS.some(n => n !== 'codigo' && d[n]);
    if (!conDatos) return false;
    const nombre = TN.titulo(d) || 'el producto que estás cargando';
    const queda = actual.guardado ? 'ya está guardado' : 'NO está guardado y se descarta';
    return confirm(`¿Este código es de otro producto?\n\nAceptar: empezar un producto nuevo ("${nombre}" ${queda}).\nCancelar: ponerle este código a "${nombre}".`);
  }

  $('#btn-escanear').addEventListener('click', async () => {
    setEstado('escaneando', 'Abriendo la cámara…');
    try {
      const codigo = await Escaner.escanear();
      if (!codigo) { setEstado('inicial'); return; }
      if (esOtroProducto(codigo.replace(/\D/g, ''))) cargarEnForm(vacio());
      form.elements.codigo.value = codigo.replace(/\D/g, '');
      form.elements.codigo.classList.remove('autocompletado');
      await buscarCodigo();
    } catch (e) {
      setEstado('modo_manual', e.message);
    }
  });

  // ---------- Fotos ----------
  function urlFoto(f) {
    if (!urlsFotos.has(f.id)) urlsFotos.set(f.id, URL.createObjectURL(f.blob));
    return urlsFotos.get(f.id);
  }

  // Fotos que van a la tienda (las "solo IA" se leen pero no se publican).
  const publicables = fotos => fotos.filter(f => !f.soloIA);

  async function agregarFotos(archivos, soloIA = false) {
    if (!archivos.length) return;
    const hayHEIC = archivos.some(a => /\.(heic|heif)$/i.test(a.name || '') || a.type === 'image/heic' || a.type === 'image/heif');
    const procesando = $('#fotos-procesando');
    procesando.textContent = hayHEIC ? 'Convirtiendo fotos HEIC… puede tardar unos segundos' : 'Procesando fotos…';
    procesando.classList.remove('hidden');
    const errores = [];
    for (const archivo of archivos) {
      try {
        const r = await Imagenes.procesar(archivo, { soloIA });
        actual.fotos.push({ id: nuevoId(), blob: r.blob, completada: !r.cuadrada, soloIA });
      } catch (e) {
        errores.push(e.message);
      }
    }
    procesando.classList.add('hidden');
    renderFotos();
    if (publicables(actual.fotos).length >= C.FOTOS_MINIMO) $('[data-campo=fotos]').classList.remove('con-error');
    if (errores.length) aviso(errores.join('\n'), 'error');
  }

  $$('input[data-fotos]').forEach(input => input.addEventListener('change', async () => {
    const soloIA = input.hasAttribute('data-solo-ia');
    await agregarFotos([...input.files], soloIA);
    input.value = '';
    // La foto de etiqueta es la señal de "ya está todo para leer": la IA arranca sola.
    if (soloIA && TN.estado().ia && actual.fotos.some(f => f.soloIA)) completarConIA();
  }));

  function renderFotos() {
    const fotos = actual.fotos;
    const principal = fotos.find(f => !f.soloIA);
    $('#fotos-grilla').innerHTML = fotos.map((f, i) => `
      <div class="relative rounded-xl overflow-hidden border ${f.soloIA ? 'border-dashed border-marca-300' : 'border-slate-200'} bg-white aspect-square">
        <img src="${urlFoto(f)}" alt="Foto ${i + 1}" class="w-full h-full object-contain ${f.soloIA ? 'opacity-60' : ''}">
        ${f === principal ? '<span class="absolute top-1.5 left-1.5 text-[11px] font-semibold bg-marca-700 text-white px-2 py-0.5 rounded-full">Principal</span>' : ''}
        <button type="button" data-foto="ia" data-i="${i}"
          class="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold px-2 py-1 rounded-full shadow ${f.soloIA ? 'bg-marca-700 text-white' : 'bg-white/90 text-slate-700 border border-slate-200'}"
          aria-pressed="${f.soloIA}" title="${f.soloIA ? 'Esta foto no se publica: tocá para publicarla' : 'Tocá para que no se publique (solo la lee la IA)'}">
          ${f.soloIA ? 'Solo IA' : 'Se publica'}
        </button>
        <div class="absolute inset-x-0 bottom-0 flex justify-between p-1.5 bg-gradient-to-t from-black/40 to-transparent">
          <button type="button" class="btn-foto" data-foto="izq" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover antes">←</button>
          <button type="button" class="btn-foto text-red-600" data-foto="quitar" data-i="${i}" aria-label="Quitar foto">✕</button>
          <button type="button" class="btn-foto" data-foto="der" data-i="${i}" ${i === fotos.length - 1 ? 'disabled' : ''} aria-label="Mover después">→</button>
        </div>
      </div>`).join('');

    const n = publicables(fotos).length, ok = n >= C.FOTOS_MINIMO;
    const soloIA = fotos.length - n;
    const contador = $('#fotos-contador');
    contador.textContent = (ok ? `${n} ${n === 1 ? 'foto' : 'fotos'} ✓` : `Falta${C.FOTOS_MINIMO - n === 1 ? "" : "n"} ${C.FOTOS_MINIMO - n} foto${C.FOTOS_MINIMO - n === 1 ? "" : "s"}`) + (soloIA ? ` · ${soloIA} solo IA` : '');
    contador.className = `shrink-0 text-xs font-medium rounded-full px-2.5 py-1 ${ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`;
    const conIA = TN.estado().ia && actual.estado !== 'publicado';
    $('#ia-panel').classList.toggle('hidden', !(conIA && fotos.length > 0));
    $('#btn-foto-ia').classList.toggle('hidden', !conIA);
  }

  $('#fotos-grilla').addEventListener('click', async e => {
    const b = e.target.closest('[data-foto]');
    if (!b) return;
    const i = Number(b.dataset.i), fotos = actual.fotos;
    if (b.dataset.foto === 'quitar') {
      const [f] = fotos.splice(i, 1);
      URL.revokeObjectURL(urlsFotos.get(f.id));
      urlsFotos.delete(f.id);
    } else if (b.dataset.foto === 'ia') {
      const f = fotos[i];
      if (!f.soloIA) {
        f.soloIA = true;
      } else {
        // Para publicarla tiene que cumplir lo mismo que las demás: cuadrada y de buen tamaño.
        try {
          const r = await Imagenes.procesar(new File([f.blob], `foto-${i + 1}.jpg`, { type: f.blob.type }));
          URL.revokeObjectURL(urlsFotos.get(f.id));
          urlsFotos.delete(f.id);
          Object.assign(f, { blob: r.blob, completada: !r.cuadrada, soloIA: false });
        } catch (err) {
          aviso(`Esta foto no se puede publicar: ${err.message}`, 'error');
        }
      }
    } else {
      const j = b.dataset.foto === 'izq' ? i - 1 : i + 1;
      [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
    }
    renderFotos();
  });

  // ---------- Variantes ----------
  function agregarVariante(enfocar = true) {
    actual.datos.variantes.push({ id: nuevoId(), valores: {}, sku: '', precio: '', stock: '', peso: '' });
    renderVariantes();
    if (enfocar) $('#variantes-lista .variante:last-child input')?.focus();
  }
  $('#btn-variante').addEventListener('click', () => agregarVariante());

  function renderVariantes() {
    const d = actual.datos, attrs = d.atributos;
    const cont = $('#variantes-lista');
    $('#btn-variante').classList.toggle('hidden', !attrs.length);
    if (!attrs.length) {
      cont.innerHTML = '<p class="text-sm text-slate-500">Elegí arriba qué cambia entre las variantes.</p>';
      return;
    }
    const envio = !TN.sinEnvio(d);
    const campo = (i, nombre, etiqueta, valor, extra = '') => `
      <label class="block"><span class="lbl">${etiqueta}</span>
        <input class="inp" data-v="${i}" data-campo="${nombre}" value="${esc(valor)}" ${extra}></label>`;
    cont.innerHTML = d.variantes.map((v, i) => `
      <div class="variante rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-slate-700">Variante ${i + 1}</span>
          <button type="button" class="text-sm text-red-600 hover:underline" data-quitar-variante="${i}">Quitar</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          ${attrs.map(a => `
            <label class="block"><span class="lbl">${esc(a)}</span>
              <input class="inp" data-v="${i}" data-attr="${esc(a)}" value="${esc(v.valores[a])}" placeholder="${esc(EJEMPLOS[a] || '')}"></label>`).join('')}
          ${campo(i, 'sku', 'SKU', v.sku, 'autocapitalize="characters" spellcheck="false"')}
          ${campo(i, 'stock', 'Cantidad', v.stock, 'inputmode="numeric"')}
          ${campo(i, 'precio', 'Precio <span class="opc">si cambia</span>', v.precio, 'inputmode="decimal"')}
          ${envio ? campo(i, 'peso', 'Peso kg <span class="opc">si cambia</span>', v.peso, 'inputmode="decimal"') : ''}
        </div>
      </div>`).join('');
  }

  $('#variantes-lista').addEventListener('input', e => {
    const t = e.target, v = actual.datos.variantes[t.dataset.v];
    if (!v) return;
    if (t.dataset.attr) v.valores[t.dataset.attr] = t.value;
    else v[t.dataset.campo] = t.value;
  });
  $('#variantes-lista').addEventListener('click', e => {
    const b = e.target.closest('[data-quitar-variante]');
    if (!b) return;
    actual.datos.variantes.splice(Number(b.dataset.quitarVariante), 1);
    renderVariantes();
  });

  // ---------- Validación ----------
  const esStock = v => String(v ?? '').trim() !== '' && /^\d+$/.test(String(v).trim());

  async function validar() {
    leerForm();
    const d = actual.datos, errores = [];
    const error = (campo, msg) => errores.push({ campo, msg });

    if (d.codigo && ![8, 12, 13, 14].includes(d.codigo.replace(/\D/g, '').length)) error('codigo', 'El código de barras tiene que tener 8, 12, 13 o 14 números.');
    if (!TN.titulo(d)) error('nombre', 'Falta el título del producto.');
    if (!d.sku) error('sku', 'Falta el SKU.');
    if (!d.categoria) error('categoria', 'Elegí una categoría.');
    // El precio es opcional: sin precio el producto queda de vidriera en Tiendanube.
    if (String(d.precio ?? '').trim() && !(TN.numero(d.precio) > 0)) error('precio', 'El precio no es un número válido (o dejalo vacío para que quede de vidriera).');
    if (!d.tieneVariantes && !esStock(d.stock)) error('stock', 'Falta la cantidad en stock (un número entero, puede ser 0).');
    const nFotos = publicables(actual.fotos).length;
    if (nFotos < C.FOTOS_MINIMO) error('fotos', C.FOTOS_MINIMO === 1 ? 'Falta al menos una foto para publicar (las "Solo IA" no cuentan).' : `Faltan fotos: hay ${nFotos} para publicar y se necesitan al menos ${C.FOTOS_MINIMO}.`);
    if (!d.paraQue) error('paraQue', 'Contá para qué sirve el producto.');

    if (!TN.sinEnvio(d)) {
      [['peso', 'el peso'], ['alto', 'el alto'], ['ancho', 'el ancho'], ['profundidad', 'la profundidad']].forEach(([c, texto]) => {
        if (!(TN.numero(d[c]) > 0)) error(c, `Falta ${texto} (se necesita para cotizar envíos).`);
      });
    }

    if (d.tieneVariantes) {
      if (!d.atributos.length) error('variantes', 'Elegí qué cambia entre las variantes (medida, color o capacidad).');
      else if (!d.variantes.length) error('variantes', 'Agregá al menos una variante.');
      else {
        const combinaciones = new Set();
        d.variantes.forEach((v, i) => {
          const faltan = d.atributos.filter(a => !(v.valores[a] || '').trim());
          if (faltan.length) error('variantes', `Variante ${i + 1}: falta ${faltan.join(' y ').toLowerCase()}.`);
          if (!(v.sku || '').trim()) error('variantes', `Variante ${i + 1}: falta el SKU.`);
          if (!esStock(v.stock)) error('variantes', `Variante ${i + 1}: falta la cantidad (un número entero, puede ser 0).`);
          if (v.precio && !(TN.numero(v.precio) > 0)) error('variantes', `Variante ${i + 1}: el precio no es un número válido.`);
          if (v.peso && !(TN.numero(v.peso) > 0)) error('variantes', `Variante ${i + 1}: el peso no es un número válido.`);
          const combo = d.atributos.map(a => (v.valores[a] || '').trim().toLowerCase()).join('|');
          if (!faltan.length && combinaciones.has(combo)) error('variantes', `Variante ${i + 1}: está repetida.`);
          combinaciones.add(combo);
        });
      }
    }

    // SKUs y códigos repetidos, dentro del producto y contra lo ya cargado.
    const otros = (await DB.listar()).filter(p => p.id !== actual.id);
    const usados = new Set(otros.flatMap(p => [p.datos.sku, ...TN.skus(p.datos)]).filter(Boolean).map(s => s.toLowerCase()));
    [...new Set([d.sku, ...TN.skus(d)].filter(Boolean))].forEach(s => {
      if (usados.has(s.toLowerCase())) error(s === d.sku ? 'sku' : 'variantes', `El SKU ${s} ya está cargado en otro producto.`);
    });
    const vistos = new Set();
    TN.skus(d).forEach(s => {
      if (vistos.has(s.toLowerCase())) error('variantes', `El SKU ${s} está repetido entre las variantes.`);
      vistos.add(s.toLowerCase());
    });
    if (d.codigo && otros.some(p => p.datos.codigo === d.codigo)) error('codigo', `El código ${d.codigo} ya está cargado en otro producto.`);

    // Lo mismo contra lo que ya está en Tiendanube (lo haya cargado quien sea).
    const excluirId = actual.tn?.id;
    if (d.codigo && !otros.some(p => p.datos.codigo === d.codigo)) {
      const t = await TN.enTienda({ codigo: d.codigo, excluirId });
      if (t) error('codigo', `El código ${d.codigo} ya está en Tiendanube: "${t.nombre}".`);
    }
    for (const s of new Set([d.sku, ...TN.skus(d)].filter(Boolean))) {
      if (usados.has(s.toLowerCase())) continue;
      const t = await TN.enTienda({ sku: s, excluirId });
      if (t) error(s === d.sku ? 'sku' : 'variantes', `El SKU ${s} ya está en Tiendanube: "${t.nombre}".`);
    }

    return errores;
  }

  function limpiarErrores() {
    $('#errores').classList.add('hidden');
    $$('.con-error').forEach(el => el.classList.remove('con-error'));
  }

  function mostrarErrores(errores) {
    limpiarErrores();
    if (!errores.length) return;
    errores.forEach(e => $(`[data-campo="${e.campo}"]`)?.classList.add('con-error'));
    const caja = $('#errores');
    caja.innerHTML = `<p class="font-semibold mb-1">Antes de publicar falta completar:</p>
      <ul class="list-disc pl-5 space-y-0.5">${errores.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul>`;
    caja.classList.remove('hidden');

    // Toast flotante visible inmediatamente en mobile para que el usuario sepa qué pasó
    const primerError = errores[0]?.msg || 'Faltan completar campos obligatorios.';
    aviso(`⚠️ No se pudo publicar:\n${primerError}${errores.length > 1 ? ` (y ${errores.length - 1} más arriba)` : ''}`, 'error');

    // Desplazar la vista al primer campo con error o a la caja de errores
    const primerElemento = $(`[data-campo="${errores[0]?.campo}"]`) || caja;
    primerElemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const foco = primerElemento.querySelector('input, select, textarea');
    if (foco) foco.focus({ preventScroll: true });
    else caja.focus({ preventScroll: true });
  }

  // ---------- Guardar ----------
  async function guardarLocal(p) {
    p.guardado = true;
    p.actualizado = Date.now();
    await DB.guardar(p);
    await actualizarContador();
    Respaldo.sincronizar(); // copia en la nube, en segundo plano
  }

  async function guardarBorrador() {
    leerForm();
    const d = actual.datos;
    if (!d.codigo && !d.sku && !TN.titulo(d) && !actual.fotos.length) {
      aviso('Todavía no hay nada para guardar.', 'error');
      return;
    }
    limpiarErrores();
    actual.estado = 'borrador';
    try {
      await guardarLocal(actual);
    } catch (e) {
      aviso('No se pudo guardar en este dispositivo: ' + e.message, 'error');
      return;
    }
    aviso('Borrador guardado');
    $('#titulo-form').textContent = 'Editar producto';
    $('#btn-nuevo').classList.remove('hidden');
  }

  // Guarda en el dispositivo (para no perder nada), publica en Tiendanube (producto + fotos),
  // registra en la base interna y deja el formulario limpio para el siguiente escaneo.
  // SKU automático: si quedó vacío, se usa el código de barras o se genera uno único.
  // Cuando llegue Contabilium se pueden vincular por código de barras.
  function completarSkus() {
    const sku = form.elements.sku;
    if (!sku.value.trim()) {
      const codigo = form.elements.codigo.value.replace(/\D/g, '');
      sku.value = codigo || `RDS-${Date.now().toString(36).toUpperCase()}`;
    }
    if (form.elements.tieneVariantes.checked) {
      let cambio = false;
      actual.datos.variantes.forEach((v, i) => {
        if (!(v.sku || '').trim()) { v.sku = `${sku.value.trim()}-${i + 1}`; cambio = true; }
      });
      if (cambio) renderVariantes();
    }
  }

  let ultimoGuardado = null; // datos del último producto, para "Cargar uno parecido"

  async function guardarYPublicar() {
    try {
      completarSkus();
      const errores = await validar();
      mostrarErrores(errores);
      if (errores.length) return;

      const d = actual.datos;
      const sinPrecio = !(TN.numero(d.precio) > 0) && (!d.tieneVariantes || d.variantes.some(v => !(TN.numero(v.precio) > 0)));
      if (sinPrecio && !confirm('Este producto no tiene precio.\n\n¿Querés agregarlo igual? Va a quedar de vidriera en la tienda: se ve pero no se puede comprar.')) return;

      const p = actual;
      setEstado('guardando', 'Guardando…');
      p.estado = 'listo';
      try {
        await guardarLocal(p);
      } catch (e) {
        setEstado('inicial');
        aviso('No se pudo guardar en este dispositivo: ' + e.message, 'error');
        return;
      }

      let mensaje = 'Guardado en este dispositivo. Se publica cuando se conecte Tiendanube.';
      let tipo = 'ok';
      if (TN.conectado()) {
        try {
          await TN.publicar(p, texto => setEstado('guardando', texto));
          p.estado = 'publicado';
          p.tnError = null;
          mensaje = 'Publicado en Tiendanube ✓';
        } catch (e) {
          p.tnError = e.message;
          mensaje = `Quedó guardado pero no se pudo publicar: ${e.message}\nLo podés reintentar desde Cargados.`;
          tipo = 'error';
        }
        await guardarLocal(p);
      }

      ultimoGuardado = JSON.parse(JSON.stringify(p.datos));
      cargarEnForm(vacio());
      const banner = $('#banner-parecido');
      $('p', banner).textContent = `✓ "${TN.titulo(ultimoGuardado)}" ${p.estado === 'publicado' ? 'publicado' : 'guardado'}. ¿El próximo es parecido (otra medida, otro color)?`;
      banner.classList.remove('hidden');
      window.scrollTo(0, 0);
      aviso(mensaje, tipo);
    } catch (errInesperado) {
      setEstado('inicial');
      aviso('Ocurrió un error al intentar guardar: ' + (errInesperado.message || errInesperado), 'error');
    }
  }

  // Copia todo del producto anterior menos fotos, códigos y cantidades: solo cambia lo distinto.
  $('#btn-parecido').addEventListener('click', () => {
    if (!ultimoGuardado) return;
    const p = vacio();
    const { codigo, sku, stock, fuenteCatalogo, fuenteIA, ...resto } = ultimoGuardado;
    p.datos = { ...p.datos, ...resto, variantes: (resto.variantes || []).map(v => ({ ...v, id: nuevoId(), sku: '', stock: '' })) };
    cargarEnForm(p);
    window.scrollTo(0, 0);
    aviso('Datos copiados del producto anterior. Sacá las fotos y cambiá lo que sea distinto.');
  });

  $('#btn-borrador').addEventListener('click', guardarBorrador);
  $('#btn-listo').addEventListener('click', guardarYPublicar);
  $('#btn-nuevo').addEventListener('click', () => { cargarEnForm(vacio()); window.scrollTo(0, 0); });
  $('#btn-ir-cargar').addEventListener('click', () => { cargarEnForm(vacio()); mostrarVista('form'); });

  // ---------- Lista ----------
  const ESTADOS = {
    borrador: ['Borrador', 'bg-slate-100 text-slate-700'],
    listo: ['Sin publicar', 'bg-amber-100 text-amber-800'],
    publicado: ['Publicado', 'bg-green-100 text-green-800'],
  };

  const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Todas las palabras buscadas tienen que aparecer (en cualquier orden).
  function coincide(textos, busqueda) {
    if (!busqueda) return true;
    const todo = normalizar(textos.filter(Boolean).join(' '));
    return busqueda.split(/\s+/).every(palabra => todo.includes(palabra));
  }
  const precioTexto = n => (n ? ` · $ ${Number(n).toLocaleString('es-AR')}` : '');

  function hace(fecha) {
    const min = Math.round((Date.now() - fecha) / 60000);
    return min < 1 ? 'recién' : min === 1 ? 'hace 1 minuto' : `hace ${min} minutos`;
  }

  function renderEstadoTienda() {
    const caja = $('#estado-tienda');
    const boton = $('#btn-actualizar-tienda');
    const t = TN.estadoTienda();
    boton.classList.toggle('hidden', !TN.conectado());
    boton.disabled = t.cargando;
    boton.textContent = t.cargando ? 'Actualizando…' : 'Actualizar';
    if (!TN.conectado()) { caja.textContent = ''; return; }
    if (t.cargando && !t.fecha) caja.innerHTML = `${SPINNER}Trayendo los productos de Tiendanube…`;
    else if (t.error && !t.fecha) caja.innerHTML = `<span class="text-red-600">No se pudieron traer los productos de Tiendanube: ${esc(t.error)}</span>`;
    else if (t.fecha) caja.innerHTML = `${t.productos.length} productos en Tiendanube · actualizado ${hace(t.fecha)}${t.error ? ` · <span class="text-red-600">no se pudo actualizar: ${esc(t.error)}</span>` : ''}`;
    else caja.textContent = '';
  }

  // Dibuja la lista con lo que hay y, si hace falta, pide la tienda y vuelve a dibujar.
  function abrirLista({ forzar = false } = {}) {
    renderLista();
    if (!TN.conectado()) return;
    const pedido = TN.productosTienda({ forzar });
    renderEstadoTienda();
    pedido.then(() => {
      actualizarContador();
      if (!$('#vista-lista').classList.contains('hidden')) renderLista();
    });
  }

  function tarjetaTienda(p) {
    const miniatura = p.imagen
      ? `<img src="${esc(p.imagen)}" alt="" loading="lazy" class="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl border border-slate-200 object-contain bg-white">`
      : '<div class="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl bg-slate-100"></div>';
    const [estado, color] = p.publicado ? ['En Tiendanube', 'bg-marca-50 text-marca-800 border border-marca-200'] : ['Oculto en la tienda', 'bg-slate-100 text-slate-700'];
    const stock = p.stock == null ? '' : ` · ${p.stock} en stock`;
    return `
      <article class="card !p-3 sm:!p-4">
        <div class="flex gap-3">
          ${miniatura}
          <div class="min-w-0 flex-1">
            <div class="flex flex-col-reverse items-start gap-1 sm:flex-row sm:justify-between sm:gap-2">
              <h2 class="font-semibold text-slate-900 leading-snug break-words">${esc(p.nombre || 'Sin nombre')}</h2>
              <span class="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 ${color}">${estado}</span>
            </div>
            <p class="text-sm text-slate-500 mt-0.5"><span class="font-mono">${esc(p.skus.join(', ') || 'sin SKU')}</span>${precioTexto(p.precio)}${stock}</p>
            <p class="text-xs text-slate-400 mt-0.5">${p.fotos} ${p.fotos === 1 ? 'foto' : 'fotos'}${p.variantes ? ` · ${p.variantes} variantes` : ''}${p.codigos.length ? ` · EAN ${esc(p.codigos.join(', '))}` : ''}</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-3 sm:justify-end">
          <button type="button" class="btn-secundario !py-2 flex-1 sm:flex-none" data-accion="ver-tienda" data-tid="${p.id}">Ver todo</button>
        </div>
      </article>`;
  }

  const tituloSeccion = (texto, n) => `<h2 class="text-sm font-semibold text-slate-600 pt-2">${texto} <span class="font-normal text-slate-400">(${n})</span></h2>`;

  async function renderLista() {
    urlsLista.forEach(u => URL.revokeObjectURL(u));
    urlsLista = [];
    const todos = (await DB.listar()).sort((a, b) => b.actualizado - a.actualizado);
    $('#aviso-api').classList.toggle('hidden', TN.conectado());
    renderEstadoTienda();

    const busqueda = normalizar($('#buscar-lista').value.trim());
    const productos = todos.filter(p => coincide([TN.titulo(p.datos), p.datos.codigo, p.datos.sku, ...TN.skus(p.datos)], busqueda));
    const deTienda = soloEnTienda(todos)
      .filter(p => coincide([p.nombre, ...p.skus, ...p.codigos], busqueda))
      .sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
    const cargandoTienda = TN.conectado() && TN.estadoTienda().cargando && !TN.estadoTienda().fecha;

    if (!productos.length && !deTienda.length) {
      $('#lista').innerHTML = busqueda
        ? `<div class="card text-center py-10"><p class="text-slate-600">No hay productos que coincidan con "${esc($('#buscar-lista').value.trim())}".</p></div>`
        : cargandoTienda ? '' : `<div class="card text-center py-10">
        <p class="text-slate-600">Todavía no cargaste productos.</p>
        <button type="button" class="btn-primario mt-4" data-accion="nuevo">Cargar el primero</button></div>`;
      return;
    }

    const partes = [];
    if (productos.length) {
      if (deTienda.length) partes.push(tituloSeccion('Cargados desde este dispositivo', productos.length));
      partes.push(...productos.map(tarjetaLocal));
    }
    if (deTienda.length) {
      partes.push(tituloSeccion('Ya están en Tiendanube', deTienda.length));
      partes.push(...deTienda.map(tarjetaTienda));
    }
    $('#lista').innerHTML = partes.join('');
  }

  let timerBusqueda;
  $('#buscar-lista').addEventListener('input', () => { clearTimeout(timerBusqueda); timerBusqueda = setTimeout(renderLista, 150); });
  $('#btn-actualizar-tienda').addEventListener('click', () => abrirLista({ forzar: true }));

  function tarjetaLocal(p) {
    const d = p.datos;
    const [estado, color] = ESTADOS[p.estado];
    let miniatura = '<div class="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl bg-slate-100"></div>';
    const fotosTienda = publicables(p.fotos);
    if (fotosTienda[0]) {
      const url = URL.createObjectURL(fotosTienda[0].blob);
      urlsLista.push(url);
      miniatura = `<img src="${url}" alt="" class="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl border border-slate-200 object-contain bg-white">`;
    }
    const variantes = d.tieneVariantes ? ` · ${d.variantes.length} variantes` : '';
    const precio = TN.numero(d.precio) ? ` · $ ${TN.numero(d.precio).toLocaleString('es-AR')}` : '';
    return `
      <article class="card !p-3 sm:!p-4">
        <div class="flex gap-3">
          ${miniatura}
          <div class="min-w-0 flex-1">
            <div class="flex flex-col-reverse items-start gap-1 sm:flex-row sm:justify-between sm:gap-2">
              <h2 class="font-semibold text-slate-900 leading-snug break-words">${esc(TN.titulo(d) || 'Sin nombre')}</h2>
              <span class="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 ${color}">${estado}</span>
            </div>
            <p class="text-sm text-slate-500 mt-0.5"><span class="font-mono">${esc(d.sku || 'sin SKU')}</span> · ${esc(d.categoria || 'sin categoría')}${precio}</p>
            <p class="text-xs text-slate-400 mt-0.5">${fotosTienda.length} ${fotosTienda.length === 1 ? 'foto' : 'fotos'}${variantes}${d.codigo ? ` · EAN ${esc(d.codigo)}` : ''}${Respaldo.disponible() ? (Respaldo.pendiente(p) ? ' · <span class="text-amber-700">respaldo pendiente</span>' : ' · <span class="text-green-700">respaldado ✓</span>') : ''}</p>
            ${p.tnError ? `<p class="text-xs text-red-600 mt-1">No se pudo publicar: ${esc(p.tnError)}</p>` : ''}
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-3 sm:justify-end">
          <button type="button" class="btn-secundario !py-2 flex-1 sm:flex-none" data-accion="editar" data-id="${p.id}">${p.estado === 'publicado' ? 'Ver' : 'Editar'}</button>
          ${p.estado === 'listo' ? `<button type="button" class="btn-primario !py-2 flex-1 sm:flex-none" data-accion="publicar" data-id="${p.id}" ${TN.conectado() ? '' : 'disabled title="Falta conectar con Tiendanube"'}>Publicar</button>` : ''}
          <button type="button" class="btn-secundario !py-2 text-red-600" data-accion="borrar" data-id="${p.id}">Borrar</button>
        </div>
      </article>`;
  }

  $('#lista').addEventListener('click', async e => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'nuevo') { cargarEnForm(vacio()); mostrarVista('form'); return; }
    if (accion === 'ver-tienda') { verDetalleTienda(Number(b.dataset.tid)); return; }

    const p = await DB.obtener(b.dataset.id);
    if (!p) return;

    if (accion === 'editar') {
      cargarEnForm(p);
      mostrarVista('form');
    } else if (accion === 'borrar') {
      const extra = p.estado === 'publicado' ? '\n\nSolo se borra de esta lista: en Tiendanube sigue publicado.' : '';
      if (!confirm(`¿Borrar "${TN.titulo(p.datos) || 'este producto'}"?${extra}`)) return;
      await Respaldo.marcarBorrado(p).catch(() => {});
      await DB.borrar(p.id);
      if (actual?.id === p.id) cargarEnForm(vacio());
      await actualizarContador();
      renderLista();
    } else if (accion === 'publicar') {
      b.disabled = true;
      try {
        await TN.publicar(p, texto => { b.textContent = texto; });
        p.estado = 'publicado';
        p.tnError = null;
        aviso('Publicado en Tiendanube ✓');
      } catch (err) {
        p.tnError = err.message;
        aviso(err.message, 'error');
      }
      await guardarLocal(p);
      renderLista();
    }
  });

  // ---------- Detalle de un producto de la tienda ----------
  // La descripción viene en HTML desde Tiendanube: se deja solo el formato básico (sin scripts, links ni estilos).
  function descripcionSegura(html) {
    const permitidas = new Set(['P', 'BR', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'U']);
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    const limpiar = nodo => [...nodo.childNodes].map(n => {
      if (n.nodeType === Node.TEXT_NODE) return esc(n.textContent);
      if (n.nodeType !== Node.ELEMENT_NODE || ['SCRIPT', 'STYLE', 'IFRAME'].includes(n.tagName)) return '';
      const adentro = limpiar(n);
      if (!permitidas.has(n.tagName)) return adentro;
      const tag = n.tagName.toLowerCase();
      return tag === 'br' ? '<br>' : `<${tag}>${adentro}</${tag}>`;
    }).join('');
    return limpiar(doc.body.firstChild).trim();
  }

  const dinero = n => (n == null ? '—' : `$ ${Number(n).toLocaleString('es-AR')}`);
  const cantidad = n => (n == null ? 'Ilimitado' : String(n));
  const medida = (n, u) => (n ? `${Number(n).toLocaleString('es-AR')} ${u}` : '—');
  const fecha = f => (f ? new Date(f).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const dato = (titulo, valor) => `<div><dt class="text-xs text-slate-500">${titulo}</dt><dd class="text-sm text-slate-900 break-words">${valor}</dd></div>`;

  function renderDetalle(p) {
    const v0 = p.variantes[0] || {};
    const conVariantes = p.variantes.length > 1 || p.atributos.length > 0;
    const fotos = p.imagenes.length
      ? `<img id="detalle-foto" src="${esc(p.imagenes[0])}" alt="" class="w-full aspect-square sm:aspect-[4/3] object-contain rounded-xl border border-slate-200 bg-white">
         ${p.imagenes.length > 1 ? `<div class="flex gap-2 mt-2 overflow-x-auto pb-1">${p.imagenes.map((src, i) => `
           <button type="button" data-foto="${esc(src)}" class="shrink-0 rounded-lg border-2 ${i ? 'border-transparent' : 'border-marca-600'}">
             <img src="${esc(src)}" alt="Foto ${i + 1}" loading="lazy" class="w-16 h-16 object-contain rounded-md bg-white"></button>`).join('')}</div>` : ''}`
      : '<div class="w-full aspect-[4/3] grid place-items-center rounded-xl bg-slate-100 text-sm text-slate-500">Sin fotos</div>';

    const tablaVariantes = conVariantes ? `
      <h3 class="font-semibold text-slate-900 mt-6 mb-2">Variantes (${p.variantes.length})</h3>
      <div class="sm:hidden space-y-2">${p.variantes.map(v => `
        <div class="rounded-xl border border-slate-200 p-3">
          <p class="font-medium text-slate-900">${esc(v.valores.filter(Boolean).join(' · ') || 'Variante')}</p>
          <dl class="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">
            ${dato('Precio', dinero(v.precio))}${dato('Stock', cantidad(v.stock))}
            ${dato('SKU', `<span class="font-mono text-xs">${esc(v.sku || '—')}</span>`)}${dato('Código', `<span class="font-mono text-xs">${esc(v.codigo || '—')}</span>`)}
          </dl>
        </div>`).join('')}
      </div>
      <div class="hidden sm:block overflow-x-auto rounded-xl border border-slate-200">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs text-slate-500">
            <tr>${p.atributos.map(a => `<th class="px-3 py-2 font-medium">${esc(a)}</th>`).join('')}<th class="px-3 py-2 font-medium">SKU</th><th class="px-3 py-2 font-medium">Precio</th><th class="px-3 py-2 font-medium">Stock</th><th class="px-3 py-2 font-medium">Código</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">${p.variantes.map(v => `
            <tr>${p.atributos.map((_, i) => `<td class="px-3 py-2">${esc(v.valores[i] || '—')}</td>`).join('')}
              <td class="px-3 py-2 font-mono text-xs">${esc(v.sku || '—')}</td><td class="px-3 py-2 whitespace-nowrap">${dinero(v.precio)}</td>
              <td class="px-3 py-2">${cantidad(v.stock)}</td><td class="px-3 py-2 font-mono text-xs">${esc(v.codigo || '—')}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>` : '';

    const descripcion = descripcionSegura(p.descripcion);
    const [estado, color] = p.publicado ? ['Visible en la tienda', 'bg-green-100 text-green-800'] : ['Oculto en la tienda', 'bg-slate-100 text-slate-700'];

    $('#detalle-cuerpo').innerHTML = `
      ${fotos}
      <div class="flex flex-wrap gap-2 mt-4">
        <span class="text-xs font-medium rounded-full px-2 py-0.5 ${color}">${estado}</span>
        ${p.categorias.map(c => `<span class="text-xs rounded-full px-2 py-0.5 bg-marca-50 text-marca-800">${esc(c)}</span>`).join('')}
      </div>
      <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-4">
        ${conVariantes ? '' : dato('SKU', `<span class="font-mono">${esc(v0.sku || '—')}</span>`)}
        ${conVariantes ? '' : dato('Código de barras', `<span class="font-mono">${esc(v0.codigo || '—')}</span>`)}
        ${dato('Precio', dinero(v0.precio) + (v0.precioPromocional ? ` <span class="text-green-700">(oferta ${dinero(v0.precioPromocional)})</span>` : ''))}
        ${conVariantes ? '' : dato('Stock', cantidad(v0.stock))}
        ${dato('Marca', esc(p.marca || '—'))}
        ${p.requiereEnvio ? dato('Peso', medida(v0.peso, 'kg')) : dato('Envío', 'No requiere')}
        ${p.requiereEnvio ? dato('Medidas (an × al × prof)', [v0.ancho, v0.alto, v0.profundidad].some(Boolean) ? `${[v0.ancho, v0.alto, v0.profundidad].map(n => n || '—').join(' × ')} cm` : '—') : ''}
        ${dato('Cargado', fecha(p.creado))}
        ${dato('Última modificación', fecha(p.actualizado))}
      </dl>
      ${tablaVariantes}
      <h3 class="font-semibold text-slate-900 mt-6 mb-2">Descripción</h3>
      <div class="text-sm text-slate-700 space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold">
        ${descripcion || '<p class="text-slate-500">Sin descripción.</p>'}
      </div>
      ${p.etiquetas ? `<p class="text-xs text-slate-500 mt-4">Etiquetas: ${esc(p.etiquetas)}</p>` : ''}`;
  }

  let detalleAbierto = null;
  async function verDetalleTienda(id) {
    const resumen = TN.estadoTienda().productos.find(p => p.id === id);
    detalleAbierto = id;
    $('#detalle-titulo').textContent = resumen?.nombre || 'Producto';
    $('#detalle-cuerpo').innerHTML = `<p class="text-sm text-slate-600 py-10 text-center">${SPINNER}Cargando el producto…</p>`;
    $('#detalle').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    try {
      const p = await TN.detalleTienda(id);
      if (detalleAbierto !== id) return; // se cerró o se abrió otro
      $('#detalle-titulo').textContent = p.nombre || 'Sin nombre';
      renderDetalle(p);
    } catch (e) {
      if (detalleAbierto !== id) return;
      $('#detalle-cuerpo').innerHTML = `<p class="text-sm text-red-600 py-10 text-center">No se pudo traer el producto: ${esc(e.message)}</p>`;
    }
  }

  function cerrarDetalle() {
    detalleAbierto = null;
    $('#detalle').classList.add('hidden');
    document.body.style.overflow = '';
  }
  $('#detalle-cerrar').addEventListener('click', cerrarDetalle);
  $('#detalle').addEventListener('click', e => {
    if (e.target.id === 'detalle') { cerrarDetalle(); return; }
    const mini = e.target.closest('[data-foto]');
    if (!mini) return;
    $('#detalle-foto').src = mini.dataset.foto;
    $$('[data-foto]', $('#detalle')).forEach(b => b.classList.toggle('border-marca-600', b === mini));
    $$('[data-foto]', $('#detalle')).forEach(b => b.classList.toggle('border-transparent', b !== mini));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#detalle').classList.contains('hidden')) cerrarDetalle(); });

  // ---------- Inicio ----------
  cargarEnForm(vacio());
  TN.cargarEstado().then(() => {
    renderFotos();
    Respaldo.sincronizar();
    // Trae lo que ya está en la tienda: para el contador y para avisar repetidos al escanear.
    TN.productosTienda().then(() => actualizarContador().catch(() => {}));
  });

  // ---------- Respaldo en la nube ----------
  // Reintenta lo pendiente cada minuto y al recuperar la conexión.
  setInterval(() => Respaldo.sincronizar(), 60000);
  window.addEventListener('online', () => Respaldo.sincronizar());

  let avisoRespaldoMostrado = false;
  window.addEventListener('respaldo-actualizado', e => {
    const { pendientes, error } = e.detail;
    const caja = $('#aviso-respaldo');
    caja.classList.toggle('hidden', !pendientes);
    if (pendientes) caja.querySelector('span').textContent = `${pendientes} ${pendientes === 1 ? 'producto todavía no se copió' : 'productos todavía no se copiaron'} a la nube${error ? ` (${error.message})` : ''}. Se reintenta solo cada minuto; no borres los datos del navegador hasta que diga "respaldado".`;
    if (error?.status === 507 && !avisoRespaldoMostrado) { avisoRespaldoMostrado = true; aviso(error.message, 'error'); }
    if (!$('#vista-lista').classList.contains('hidden')) renderLista();
  });

  $('#btn-recuperar').addEventListener('click', async () => {
    if (!Respaldo.disponible()) { aviso('El respaldo no está disponible ahora. Revisá la conexión.', 'error'); return; }
    if (!confirm('¿Traer a este celular los productos guardados en la nube que no están acá? No se borra ni se reemplaza nada.')) return;
    const b = $('#btn-recuperar');
    const texto = b.textContent;
    b.disabled = true;
    try {
      const r = await Respaldo.recuperar(t => { b.textContent = t; });
      aviso(r.recuperados ? `Se recuperaron ${r.recuperados} ${r.recuperados === 1 ? 'producto' : 'productos'} ✓` : 'Este celular ya tiene todo lo que está en el respaldo.');
      await actualizarContador();
      renderLista();
    } catch (e) {
      aviso(`No se pudo recuperar: ${e.message}`, 'error');
    } finally {
      b.disabled = false;
      b.textContent = texto;
    }
  });
  actualizarContador().catch(() => aviso('Este navegador no permite guardar datos. Probá con Chrome o Safari actualizados.', 'error'));
})();
