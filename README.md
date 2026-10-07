# Carga de productos · Riegos del Sur

Formulario web responsive para que la CM cargue productos (fotos, SKU, categoría, descripción, envío y variantes) y los publique directo en Tiendanube.

## Cómo está armado

```
index.html          formulario y lista de productos cargados
js/config.js        ← lo único que hay que tocar (API_BASE, categorías, reglas de fotos)
js/app.js           pantalla: formulario, validaciones, lista
js/tiendanube.js    convierte lo cargado al formato de la API de Tiendanube
js/imagenes.js      fotos: cuadradas con fondo blanco, JPG, entre 1024 y 2048 px
js/db.js            guarda borradores y fotos en el navegador (IndexedDB)
api/                backend para Vercel que habla con Tiendanube (el token nunca llega al navegador)
```

## Cómo carga la empleada (4 pasos)

1. **Fotos:** el producto de frente (se publica) y la etiqueta o el dorso (solo la lee la IA). Al sacar la de etiqueta, la IA completa sola: nombre, marca, categoría, descripción, código de barras y una estimación de peso y medidas.
2. **Revisá:** lo azul lo completó la IA; se corrige lo que haga falta.
3. **Precio, cantidad y envío:** lo único que la IA no puede saber. Peso y medidas estimados se confirman.
4. **Códigos y extras (opcional):** el código de barras ya viene leído (o se escanea); el SKU se genera solo si queda vacío (usa el código de barras o RDS-xxxx). Variantes y proveedor.

Después de guardar aparece **Cargar uno parecido**: copia todo menos fotos, códigos y cantidad, para cargar rápido otra medida o color del mismo producto.

## Qué se manda a Tiendanube

| Dato cargado | Campo en la API (2025-03) |
|---|---|
| Tipo + marca + modelo + medida | `name`, `handle`, `seo_title` |
| Para qué sirve, especificaciones, modo de uso, qué incluye | `description` (HTML con títulos y listas), `seo_description` |
| Categoría | `categories` (el backend busca el ID por nombre y la crea si no existe) |
| SKU | `variants[].sku` |
| Peso (kg) y medidas (cm) | `variants[].weight/width/height/depth` |
| Variantes (medida/color/capacidad) | `attributes` + `variants[].values` |
| Marca | `brand` |
| Fotos | `POST /products/{id}/images` (base64, una por pedido, en orden) |
| Proveedor | No se envía (dato interno) |
| Precio de venta y cantidad en stock | `variants[].price`, `variants[].stock` (con `stock_management: true`) |
| Código de barras | `variants[].barcode` |

Si Contabilium sincroniza precio y stock por SKU, va a pisar lo que se cargue acá.

## Ingreso (administrador único)

La app pide usuario y contraseña al abrirse. Hay un solo usuario, definido en Vercel:

- `ADMIN_USUARIO` y `ADMIN_CLAVE`: usuario y contraseña del administrador.
- `SESION_SECRETO`: texto aleatorio de 32 caracteres o más para firmar las sesiones. Si se cambia, se cierran todas las sesiones abiertas.

La sesión dura 12 horas y se guarda en una cookie `HttpOnly` (el JavaScript de la página no la puede leer). Después de 5 intentos fallidos desde la misma IP, se bloquea 15 minutos. Toda la API (`/api/*`) exige sesión, salvo `login`, `sesion`, `logout` y `estado`.

## Conectarlo con Tiendanube

1. En el [Portal de Partners](https://partners.tiendanube.com) creá una app:
   - Permisos: **Productos → escritura** (`write_products`).
   - URL de redirección: `https://carga-productos-riegos.vercel.app/api/tiendanube-callback`
2. Cargá en Vercel el ID y el secreto de la app: `TN_APP_ID` y `TN_CLIENT_SECRET` (`--sensitive`). Volvé a publicar.
3. En la app, entrá a **Cargados → Conectar con Tiendanube** y aceptá en Tiendanube. La página de vuelta muestra el número de tienda y la clave de acceso.
4. Cargalos en Vercel como `TN_STORE_ID` y `TN_ACCESS_TOKEN` (`--sensitive`) y volvé a publicar.

`TN_USER_AGENT` ya está cargado. La clave de acceso no vence; deja de valer solo si se desinstala la app o se vuelve a conectar.

Si el SKU ya existe en Tiendanube, el producto no se crea de nuevo. Si se corta a mitad, al reintentar sigue desde la última foto subida.

## Código de barras

- `api/codigo-barras.js` + `api/_codigos.js`: consulta el catálogo global desde el servidor (la key nunca llega al navegador), con caché de 7 días (1 día si no lo encontró) y corte a los 6 s.
- Catálogos en `BARCODE_PROVEEDOR`, en orden y separados por coma (por defecto `upcitemdb,openfacts`; también `eansearch` y `barcodelookup`, pagos, con key en `BARCODE_API_KEY`). Se usa el primero que encuentre el producto. upcitemdb: 100 consultas por día, fuerte en importados. Open Food Facts: gratis, tiene alimentos argentinos y pocos productos no alimenticios.
- Estados del formulario: `escaneando` → `buscando_info` → `completado_automatico` o `modo_manual` → `guardando`. Solo se completan campos vacíos y quedan marcados en azul.
- **Ojo:** en las pruebas, los productos argentinos (códigos 779…) no aparecieron en upcitemdb. Para el vivero y lo artesanal la carga va a ser manual de todos modos.

## Completar con IA

Cuando el código no está en ningún catálogo, la empleada saca una foto de la etiqueta y toca **Completar con IA**: la IA lee hasta 4 fotos del producto y completa tipo, marca, modelo, medida, categoría, descripción, especificaciones, modo de uso y qué incluye. Solo llena campos vacíos y los marca en azul. Las fotos marcadas **Solo IA** (etiquetas, dorsos, códigos) se leen pero nunca se suben a la tienda.

- Usa Google Gemini (`api/_ia.js`), que tiene uso gratis con límites diarios. Key en `GEMINI_API_KEY` (se saca en https://aistudio.google.com) y modelo opcional en `GEMINI_MODELO` (por defecto `gemini-3.8-flash`).
- En el plan gratis Google puede usar las fotos enviadas para mejorar sus productos. Solo viajan fotos de envases y etiquetas.
- Si no hay key cargada, el botón no aparece.

## Probar en local

```
node .claude/servidor.js
```
Abrí http://localhost:5173. En local el usuario es `admin` y la contraseña `prueba` (solo en tu compu; en Vercel se usan las variables de entorno).

## Pendientes

- **Base interna**: `api/_registro.js` está listo para conectar, falta elegir la base. Mientras tanto, se publica igual en Tiendanube.
- **Precio y stock vs. Contabilium**: si Contabilium sincroniza por SKU, va a pisar lo que se cargue acá.

- Cambiar los colores y el logo "RS" por los de la marca.
- Para producción, reemplazar el Tailwind por CDN por un build (`npx tailwindcss`).
- Si se edita un producto ya publicado, hoy se hace desde el panel de Tiendanube (acá queda en solo lectura).
