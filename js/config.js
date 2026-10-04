// Configuración general del formulario.
window.CONFIG = {
  // Dónde está el backend (carpeta /api). '.' = mismo sitio que el formulario (Vercel o el servidor local).
  // Si no responde, el formulario sigue funcionando: guarda en el dispositivo y se carga a mano.
  API_BASE: '.',

  // true: el producto aparece en la tienda apenas se publica.
  PUBLICAR_VISIBLE: true,

  IDIOMA: 'es',

  // Árbol de categorías propio. Si no existe en Tiendanube, el backend la crea con este nombre.
  CATEGORIAS: ['Piletas', 'Riego', 'Jardín', 'Vivero', 'Herramientas', 'Exterior y reposeras', 'Repuestos', 'Servicios'],

  // Para sugerir nuestra categoría a partir de la categoría que trae el catálogo global (en inglés o español).
  // Se usa la primera regla que coincida. La CM siempre puede cambiarla.
  MAPA_CATEGORIAS: [
    [/pool|spa|piscina|pileta|chlorine|cloro|alguicida/i, 'Piletas'],
    [/irrigation|sprinkler|hose|watering|riego|manguera|aspersor/i, 'Riego'],
    [/plant|seed|flower|bulb|vivero|planta|semilla|maceta|pot\b/i, 'Vivero'],
    [/tool|hardware|drill|saw|herramienta/i, 'Herramientas'],
    [/furniture|chair|lounger|umbrella|parasol|mueble|reposera|sombrilla/i, 'Exterior y reposeras'],
    [/garden|lawn|yard|jard[ií]n|c[eé]sped|fertiliz/i, 'Jardín'],
  ],

  CATEGORIAS_SIN_ENVIO: ['Servicios'],

  // Lo que puede cambiar entre variantes. Tiendanube admite hasta 3.
  ATRIBUTOS_VARIANTE: ['Medida', 'Color', 'Capacidad'],

  FOTOS_MINIMO: 1,
  FOTO_LADO_MINIMO: 1024, // px
  FOTO_LADO_MAXIMO: 2048, // px

  // Tiempo máximo para esperar la búsqueda del código de barras antes de pasar a carga manual.
  BUSQUEDA_TIMEOUT_MS: 10000,
};
