// Respaldo en la nube: cada producto guardado en el celular se copia al servidor (Vercel Blob).
// Si se pierde el celular o se borran los datos del navegador, se recupera desde "Cargados".
//  - Mientras no está publicado, el respaldo lleva las fotos (las que se publican, a 1600 px).
//  - Ya publicado, va sin fotos: Tiendanube las tiene y así el respaldo ocupa poco.
window.Respaldo = (() => {
  const C = window.CONFIG;
  const base = () => C.API_BASE.replace(/\/$/, '');
  const disponible = () => !!TN.estado().respaldo;

  // Qué versión del producto se respaldó: si cambia, hay que volver a respaldar.
  const firma = p => `${p.actualizado}|${p.estado}|${p.borrado ? 1 : 0}`;
  const pendiente = p => p.respaldo?.firma !== firma(p);

  async function pedir(ruta, opciones = {}) {
    const r = await fetch(base() + ruta, { credentials: 'same-origin', ...opciones });
    const datos = await r.json().catch(() => ({}));
    if (r.status === 401) window.dispatchEvent(new Event('sesion-vencida'));
    if (!r.ok) throw Object.assign(new Error(datos.error || `Error ${r.status} en el respaldo.`), { status: r.status });
    return datos;
  }

  async function armarRegistro(p) {
    const conFotos = p.estado !== 'publicado' && !p.borrado;
    const fotosTienda = p.fotos.filter(f => !f.soloIA);
    let fotos = [];
    if (conFotos) {
      // Si con todas las fotos se pasa del tamaño permitido, se achican un poco más.
      for (const lado of [1600, 1200, 1024]) {
        fotos = [];
        for (const f of fotosTienda) fotos.push({ id: f.id, completada: !!f.completada, data: await Imagenes.reducir(f.blob, lado) });
        if (fotos.reduce((t, f) => t + f.data.length, 0) < 3.6e6) break;
      }
    }
    return {
      v: 1, id: p.id, estado: p.estado, creado: p.creado, actualizado: p.actualizado,
      datos: p.datos, tn: p.tn || null, tnError: p.tnError || null, borrado: !!p.borrado,
      fotosIncluidas: conFotos, cantidadFotos: fotosTienda.length, fotos,
    };
  }

  async function respaldar(p) {
    if (!disponible() || !pendiente(p)) return;
    const registro = await armarRegistro(p);
    await pedir('/api/respaldo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registro }) });
    const marca = { firma: firma(p), fecha: Date.now() };
    p.respaldo = marca;
    // Se anota en el celular sin pisar cambios que se hayan hecho mientras subía.
    const guardado = await DB.obtener(p.id);
    if (guardado && firma(guardado) === marca.firma) {
      guardado.respaldo = marca;
      await DB.guardar(guardado);
    }
  }

  let enCurso = false;
  let otraVez = false;
  async function sincronizar() {
    if (!disponible()) return;
    if (enCurso) { otraVez = true; return; }
    enCurso = true;
    let error = null;
    try {
      do {
        otraVez = false;
        for (const p of await DB.listar()) {
          if (!pendiente(p)) continue;
          try { await respaldar(p); } catch (e) { error = e; if (e.status === 401 || e.status === 507) break; }
        }
      } while (otraVez);
    } finally {
      enCurso = false;
    }
    const pendientes = (await DB.listar()).filter(pendiente).length;
    window.dispatchEvent(new CustomEvent('respaldo-actualizado', { detail: { pendientes, error } }));
  }

  // Al borrar un producto del celular, el respaldo queda marcado como borrado (no se recupera).
  async function marcarBorrado(p) {
    if (!disponible()) return;
    await respaldar({ ...p, borrado: true, actualizado: Date.now() });
  }

  // Trae del respaldo los productos que no están en este celular.
  async function recuperar(progreso = () => {}) {
    const { productos } = await pedir('/api/respaldo');
    const locales = new Set((await DB.listar()).map(p => p.id));
    const faltan = productos.filter(x => !locales.has(x.id));
    let recuperados = 0;
    for (const [i, item] of faltan.entries()) {
      progreso(`Recuperando ${i + 1} de ${faltan.length}…`);
      const reg = await pedir(`/api/respaldo?id=${encodeURIComponent(item.id)}`);
      if (reg.borrado) continue;
      const fotos = [];
      for (const f of reg.fotos || []) {
        fotos.push({ id: f.id, completada: !!f.completada, soloIA: false, blob: await (await fetch(`data:image/jpeg;base64,${f.data}`)).blob() });
      }
      const p = {
        id: reg.id, estado: reg.estado, guardado: true, creado: reg.creado, actualizado: reg.actualizado,
        datos: reg.datos, fotos, tn: reg.tn, tnError: reg.tnError,
      };
      p.respaldo = { firma: firma(p), fecha: Date.now() };
      await DB.guardar(p);
      recuperados++;
    }
    return { recuperados, enRespaldo: productos.length };
  }

  return { disponible, pendiente, sincronizar, marcarBorrado, recuperar };
})();
