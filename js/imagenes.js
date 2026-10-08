// Prepara cada foto para Tiendanube: cuadrada, fondo blanco, JPG y con un tamaño razonable.
// Soporta HEIC/HEIF (formato nativo de iPhone): los convierte a JPEG antes de procesarlos.
window.Imagenes = (() => {
  const C = window.CONFIG;

  // Detecta si un archivo es HEIC/HEIF (los navegadores desktop no lo decodifican nativamente).
  function esHEIC(archivo) {
    const tipo = (archivo.type || '').toLowerCase();
    if (tipo === 'image/heic' || tipo === 'image/heif') return true;
    // Muchos navegadores reportan HEIC como vacío o application/octet-stream.
    const nombre = (archivo.name || '').toLowerCase();
    return nombre.endsWith('.heic') || nombre.endsWith('.heif');
  }

  // Convierte un archivo HEIC/HEIF a un Blob JPEG usando heic2any.
  async function convertirHEIC(archivo) {
    if (typeof heic2any === 'undefined') {
      throw new Error('No se pudo cargar la librería para abrir fotos HEIC. Recargá la página e intentá de nuevo.');
    }
    const resultado = await heic2any({ blob: archivo, toType: 'image/jpeg', quality: 0.92 });
    // heic2any puede devolver un Blob o un array de Blobs (para HEIF multi-imagen).
    return Array.isArray(resultado) ? resultado[0] : resultado;
  }

  async function cargar(archivo) {
    // Si es HEIC, convertir a JPEG antes de intentar decodificarlo.
    if (esHEIC(archivo)) archivo = await convertirHEIC(archivo);

    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      } catch { /* algunos navegadores no aceptan opciones: probamos con <img> */ }
    }
    return new Promise((resolver, rechazar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rechazar(new Error(`No se pudo abrir "${archivo.name || 'foto'}". ¿Es una imagen?`));
      img.src = URL.createObjectURL(archivo);
    });
  }

  async function procesar(archivo, { soloIA = false } = {}) {
    // Convertir HEIC antes de cualquier procesamiento.
    if (esHEIC(archivo)) archivo = new File([await convertirHEIC(archivo)], archivo.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), { type: 'image/jpeg' });

    // Las fotos solo para la IA no se publican: no hace falta que sean cuadradas ni grandes.
    if (soloIA) return { blob: await achicar(archivo, 1600), cuadrada: true };

    const img = await cargar(archivo);
    const ancho = img.width, alto = img.height;
    const lado = Math.max(ancho, alto);

    if (lado < C.FOTO_LADO_MINIMO) {
      throw new Error(`"${archivo.name}" es muy chica (${ancho}×${alto} px). Tiene que medir al menos ${C.FOTO_LADO_MINIMO} px.`);
    }

    // Se completa con blanco hasta quedar cuadrada, sin recortar el producto.
    const destino = Math.min(lado, C.FOTO_LADO_MAXIMO);
    const escala = destino / lado;
    const w = Math.round(ancho * escala), h = Math.round(alto * escala);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = destino;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, destino, destino);
    ctx.drawImage(img, Math.round((destino - w) / 2), Math.round((destino - h) / 2), w, h);

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88));
    return { blob, cuadrada: ancho === alto };
  }

  function aBase64(blob) {
    return new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result).split(',')[1]);
      lector.onerror = () => rechazar(lector.error);
      lector.readAsDataURL(blob);
    });
  }

  // Copia achicada en JPG, sin cambiar la proporción.
  async function achicar(blob, lado) {
    // Si el blob es HEIC, convertir primero.
    if (esHEIC(blob)) blob = await convertirHEIC(blob);

    const img = await cargar(blob);
    const escala = Math.min(1, lado / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  }

  // Para mandar a la IA: más rápido y dentro de los límites del servidor.
  const reducir = async (blob, lado = 1024) => aBase64(await achicar(blob, lado));

  return { procesar, aBase64, reducir };
})();

