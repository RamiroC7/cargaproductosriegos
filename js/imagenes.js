// Prepara cada foto para Tiendanube: cuadrada, fondo blanco, JPG y con un tamaño razonable.
window.Imagenes = (() => {
  const C = window.CONFIG;

  async function cargar(archivo) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      } catch { /* algunos navegadores no aceptan opciones: probamos con <img> */ }
    }
    return new Promise((resolver, rechazar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rechazar(new Error(`No se pudo abrir "${archivo.name}". ¿Es una imagen?`));
      img.src = URL.createObjectURL(archivo);
    });
  }

  async function procesar(archivo) {
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

  // Copia achicada (JPG, base64) para mandar a la IA: más rápido y dentro de los límites del servidor.
  async function reducir(blob, lado = 1024) {
    const img = await cargar(blob);
    const escala = Math.min(1, lado / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return aBase64(await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85)));
  }

  return { procesar, aBase64, reducir };
})();
