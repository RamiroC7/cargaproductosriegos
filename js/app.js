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
    if (vista === 'lista') renderLista();
    window.scrollTo(0, 0);
  }
  $$('[data-vista]').forEach(b => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

  async function actualizarContador() {
    const n = (await DB.listar()).length;
    $('#contador').textContent = n ? `(${n})` : '';
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

  // ---------- Completar con IA (lee la foto principal) ----------
  function autocompletarIA(info) {
    const llenados = [];
    const poner = (campo, valor) => ponerSiVacio(campo, valor, llenados);
    // Las partes del nombre: si el título no se escribió a mano, se arma solo con ellas.
    ['tipo', 'marca', 'modelo', 'medida', 'paraQue', 'modoUso'].forEach(c => poner(c, info[c]));
    poner('especificaciones', (info.especificaciones || []).join('\n'));
    poner('incluye', (info.incluye || []).join('\n'));
    elegirCategoriaSiVacia(info.categoria, llenados);
    actual.datos.fuenteIA = { modelo: info.modelo_ia || null, fecha: new Date().toISOString() };
    actualizarDerivados();
    $$('.autocompletado').forEach(el => el.closest('[data-campo]')?.classList.remove('con-error'));
    return llenados;
  }

  $('#btn-ia').addEventListener('click', async () => {
    const fotos = actual.fotos.slice(0, 4);
    if (!fotos.length) return;
    const boton = $('#btn-ia');
    const contenido = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = `${SPINNER}Leyendo ${fotos.length === 1 ? 'la foto' : 'las fotos'}…`;
    setEstado('buscando_info', `La IA está leyendo ${fotos.length === 1 ? 'la foto' : `las ${fotos.length} fotos`}…`);
    try {
      const imagenes = await Promise.all(fotos.map(f => Imagenes.reducir(f.blob, 1024)));
      const info = await TN.completarConIA(imagenes, form.elements.codigo.value.replace(/\D/g, ''));
      const llenados = autocompletarIA(info);
      setEstado(llenados.length ? 'completado_automatico' : 'modo_manual', llenados.length
        ? 'La IA completó lo marcado en azul. Revisalo antes de publicar: puede equivocarse.'
        : 'La IA no encontró datos nuevos para completar. Probá con una foto donde se lea mejor la etiqueta.');
      $('[data-campo=codigo]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setEstado('modo_manual', e.message);
    } finally {
      boton.disabled = false;
      boton.innerHTML = contenido;
    }
  });

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
    const repetido = (await DB.listar()).find(p => p.id !== actual.id && p.datos.codigo === codigo);
    if (repetido) {
      setEstado('modo_manual', `Este código ya está cargado: "${TN.titulo(repetido.datos)}" (SKU ${repetido.datos.sku || 'sin SKU'}). Revisá la lista de Cargados antes de seguir.`);
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

  $('#btn-escanear').addEventListener('click', async () => {
    setEstado('escaneando', 'Abriendo la cámara…');
    try {
      const codigo = await Escaner.escanear();
      if (!codigo) { setEstado('inicial'); return; }
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

  async function agregarFotos(archivos) {
    if (!archivos.length) return;
    $('#fotos-procesando').classList.remove('hidden');
    const errores = [];
    for (const archivo of archivos) {
      try {
        const r = await Imagenes.procesar(archivo);
        actual.fotos.push({ id: nuevoId(), blob: r.blob, completada: !r.cuadrada });
      } catch (e) {
        errores.push(e.message);
      }
    }
    $('#fotos-procesando').classList.add('hidden');
    renderFotos();
    if (actual.fotos.length >= C.FOTOS_MINIMO) $('[data-campo=fotos]').classList.remove('con-error');
    if (errores.length) aviso(errores.join('\n'), 'error');
  }

  $$('input[data-fotos]').forEach(input => input.addEventListener('change', async () => {
    await agregarFotos([...input.files]);
    input.value = '';
  }));

  function renderFotos() {
    const fotos = actual.fotos;
    $('#fotos-grilla').innerHTML = fotos.map((f, i) => `
      <div class="relative rounded-xl overflow-hidden border border-slate-200 bg-white aspect-square">
        <img src="${urlFoto(f)}" alt="Foto ${i + 1}" class="w-full h-full object-contain">
        ${i === 0 ? '<span class="absolute top-1.5 left-1.5 text-[11px] font-semibold bg-marca-700 text-white px-2 py-0.5 rounded-full">Principal</span>' : ''}
        ${f.completada ? '<span class="absolute top-1.5 right-1.5 text-[11px] bg-white/90 text-slate-600 px-1.5 py-0.5 rounded-full border border-slate-200" title="No era cuadrada: se completó con fondo blanco">Ajustada</span>' : ''}
        <div class="absolute inset-x-0 bottom-0 flex justify-between p-1.5 bg-gradient-to-t from-black/40 to-transparent">
          <button type="button" class="btn-foto" data-foto="izq" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover antes">←</button>
          <button type="button" class="btn-foto text-red-600" data-foto="quitar" data-i="${i}" aria-label="Quitar foto">✕</button>
          <button type="button" class="btn-foto" data-foto="der" data-i="${i}" ${i === fotos.length - 1 ? 'disabled' : ''} aria-label="Mover después">→</button>
        </div>
      </div>`).join('');

    const n = fotos.length, ok = n >= C.FOTOS_MINIMO;
    const contador = $('#fotos-contador');
    contador.textContent = ok ? `${n} ${n === 1 ? 'foto' : 'fotos'} ✓` : `${n} de ${C.FOTOS_MINIMO} mínimo`;
    contador.className = `shrink-0 text-xs font-medium rounded-full px-2.5 py-1 ${ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`;
    $('#ia-panel').classList.toggle('hidden', !(TN.estado().ia && n > 0 && actual.estado !== 'publicado'));
  }

  $('#fotos-grilla').addEventListener('click', e => {
    const b = e.target.closest('[data-foto]');
    if (!b) return;
    const i = Number(b.dataset.i), fotos = actual.fotos;
    if (b.dataset.foto === 'quitar') {
      const [f] = fotos.splice(i, 1);
      URL.revokeObjectURL(urlsFotos.get(f.id));
      urlsFotos.delete(f.id);
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
    if (!(TN.numero(d.precio) > 0)) error('precio', 'Falta el precio de venta.');
    if (!d.tieneVariantes && !esStock(d.stock)) error('stock', 'Falta la cantidad en stock (un número entero, puede ser 0).');
    if (actual.fotos.length < C.FOTOS_MINIMO) error('fotos', C.FOTOS_MINIMO === 1 ? 'Falta al menos una foto.' : `Faltan fotos: hay ${actual.fotos.length} y se necesitan al menos ${C.FOTOS_MINIMO}.`);
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
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
    caja.focus({ preventScroll: true });
  }

  // ---------- Guardar ----------
  async function guardarLocal(p) {
    p.guardado = true;
    p.actualizado = Date.now();
    await DB.guardar(p);
    await actualizarContador();
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
  async function guardarYPublicar() {
    const errores = await validar();
    mostrarErrores(errores);
    if (errores.length) return;

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

    cargarEnForm(vacio());
    window.scrollTo(0, 0);
    form.elements.codigo.focus({ preventScroll: true });
    aviso(mensaje, tipo);
  }

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

  async function renderLista() {
    urlsLista.forEach(u => URL.revokeObjectURL(u));
    urlsLista = [];
    const productos = (await DB.listar()).sort((a, b) => b.actualizado - a.actualizado);
    $('#aviso-api').classList.toggle('hidden', TN.conectado());

    if (!productos.length) {
      $('#lista').innerHTML = `<div class="card text-center py-10">
        <p class="text-slate-600">Todavía no cargaste productos.</p>
        <button type="button" class="btn-primario mt-4" data-accion="nuevo">Cargar el primero</button></div>`;
      return;
    }

    $('#lista').innerHTML = productos.map(p => {
      const d = p.datos;
      const [estado, color] = ESTADOS[p.estado];
      let miniatura = '<div class="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl bg-slate-100"></div>';
      if (p.fotos[0]) {
        const url = URL.createObjectURL(p.fotos[0].blob);
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
              <div class="flex items-start justify-between gap-2">
                <h2 class="font-semibold text-slate-900 leading-snug break-words">${esc(TN.titulo(d) || 'Sin nombre')}</h2>
                <span class="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 ${color}">${estado}</span>
              </div>
              <p class="text-sm text-slate-500 mt-0.5"><span class="font-mono">${esc(d.sku || 'sin SKU')}</span> · ${esc(d.categoria || 'sin categoría')}${precio}</p>
              <p class="text-xs text-slate-400 mt-0.5">${p.fotos.length} ${p.fotos.length === 1 ? 'foto' : 'fotos'}${variantes}${d.codigo ? ` · EAN ${esc(d.codigo)}` : ''}</p>
              ${p.tnError ? `<p class="text-xs text-red-600 mt-1">No se pudo publicar: ${esc(p.tnError)}</p>` : ''}
              ${p.tn?.url ? `<a href="${esc(p.tn.url)}" target="_blank" rel="noopener" class="text-xs text-marca-700 underline mt-1 inline-block">Ver en la tienda</a>` : ''}
            </div>
          </div>
          <div class="flex flex-wrap gap-2 mt-3 sm:justify-end">
            <button type="button" class="btn-secundario !py-2 flex-1 sm:flex-none" data-accion="editar" data-id="${p.id}">${p.estado === 'publicado' ? 'Ver' : 'Editar'}</button>
            ${p.estado === 'listo' ? `<button type="button" class="btn-primario !py-2 flex-1 sm:flex-none" data-accion="publicar" data-id="${p.id}" ${TN.conectado() ? '' : 'disabled title="Falta conectar con Tiendanube"'}>Publicar</button>` : ''}
            <button type="button" class="btn-secundario !py-2 text-red-600" data-accion="borrar" data-id="${p.id}">Borrar</button>
          </div>
        </article>`;
    }).join('');
  }

  $('#lista').addEventListener('click', async e => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'nuevo') { cargarEnForm(vacio()); mostrarVista('form'); return; }

    const p = await DB.obtener(b.dataset.id);
    if (!p) return;

    if (accion === 'editar') {
      cargarEnForm(p);
      mostrarVista('form');
    } else if (accion === 'borrar') {
      const extra = p.estado === 'publicado' ? '\n\nSolo se borra de esta lista: en Tiendanube sigue publicado.' : '';
      if (!confirm(`¿Borrar "${TN.titulo(p.datos) || 'este producto'}"?${extra}`)) return;
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

  // ---------- Exportar ----------
  $('#btn-exportar').addEventListener('click', async () => {
    const productos = await DB.listar();
    if (!productos.length) { aviso('No hay productos para exportar.', 'error'); return; }
    const salida = productos.map(p => ({
      estado: p.estado,
      registro: TN.armarRegistro(p),
      tiendanube: TN.armarPayload(p),
    }));
    const blob = new Blob([JSON.stringify(salida, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `productos-riegos-del-sur-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- Inicio ----------
  cargarEnForm(vacio());
  TN.cargarEstado().then(() => renderFotos());
  actualizarContador().catch(() => aviso('Este navegador no permite guardar datos. Probá con Chrome o Safari actualizados.', 'error'));
})();
