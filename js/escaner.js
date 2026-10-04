// Escáner de códigos de barras con la cámara (html5-qrcode).
// Usa el lector nativo del navegador (BarcodeDetector) cuando existe, que es más rápido en Android.
// La cámara solo funciona en https o en localhost.
window.Escaner = (() => {
  const LIBRERIA = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
  let cargando = null;
  let lector = null;
  let cancelar = null;

  function cargarLibreria() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (!cargando) {
      cargando = new Promise((resolver, rechazar) => {
        const s = document.createElement('script');
        s.src = LIBRERIA;
        s.onload = resolver;
        s.onerror = () => { cargando = null; rechazar(new Error('No se pudo cargar el lector de códigos. Revisá la conexión.')); };
        document.head.appendChild(s);
      });
    }
    return cargando;
  }

  // Abre la cámara y resuelve con el código leído, o con null si se cancela.
  async function escanear() {
    const modal = document.getElementById('escaner');
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    try {
      await cargarLibreria();
      const F = window.Html5QrcodeSupportedFormats;
      lector = new window.Html5Qrcode('escaner-video', {
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.ITF],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
      return await new Promise((resolver, rechazar) => {
        cancelar = () => resolver(null);
        lector.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 360), height: Math.min(h * 0.4, 160) }) },
          texto => { navigator.vibrate?.(80); resolver(texto.trim()); },
          () => { /* cuadro sin código: seguir buscando */ },
        ).catch(e => rechazar(new Error(/permission|notallowed/i.test(String(e))
          ? 'No hay permiso para usar la cámara. Habilitalo en el navegador o escribí el código a mano.'
          : 'No se pudo abrir la cámara. Escribí el código a mano.')));
      });
    } finally {
      cancelar = null;
      if (lector) {
        await lector.stop().catch(() => {});
        lector.clear();
        lector = null;
      }
      modal.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }
  }

  document.getElementById('escaner-cerrar').addEventListener('click', () => cancelar?.());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cancelar?.(); });

  return { escanear };
})();
