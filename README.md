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

**Precio y stock no se cargan acá**: se espera que Contabilium los sincronice por SKU.
Si eso no pasa, el producto se publica sin precio. Para evitarlo, poné `PUBLICAR_VISIBLE: false` en `js/config.js`.

## Probarlo ya (sin conexión)

Abrí `index.html` en Chrome. Los productos quedan guardados en ese navegador y se pueden exportar a JSON con el formato listo para la API.

## Conectarlo con Tiendanube

1. En el [Portal de Partners](https://partners.tiendanube.com) creá una app con permisos de **write_products**, instalala en la tienda y guardá el `access_token` y el `store_id` (`user_id`).
2. Subí esta carpeta a Vercel y cargá estas variables de entorno:
   - `TN_STORE_ID`
   - `TN_ACCESS_TOKEN`
   - `TN_USER_AGENT`, por ejemplo `Carga Riegos del Sur (mail@dominio.com)`
   - `CARGA_CLAVE`: una clave que le pasás a la CM
3. En `js/config.js` poné `API_BASE: '.'`.
4. La primera vez que la CM toque **Publicar**, le va a pedir la clave.

Si el SKU ya existe en Tiendanube, el producto no se crea de nuevo. Si se corta a mitad, al reintentar sigue desde la última foto subida.

## Código de barras

- `api/codigo-barras.js` + `api/_codigos.js`: consulta el catálogo global desde el servidor (la key nunca llega al navegador), con caché de 7 días (1 día si no lo encontró) y corte a los 6 s.
- Proveedor en `BARCODE_PROVEEDOR` (`upcitemdb` por defecto, `eansearch`, `barcodelookup`) y su key en `BARCODE_API_KEY`. upcitemdb anda sin key con un límite de 100 consultas por día.
- Estados del formulario: `escaneando` → `buscando_info` → `completado_automatico` o `modo_manual` → `guardando`. Solo se completan campos vacíos y quedan marcados en verde.
- **Ojo:** en las pruebas, los productos argentinos (códigos 779…) no aparecieron en upcitemdb. Para el vivero y lo artesanal la carga va a ser manual de todos modos.

## Probar en local

```
node .claude/servidor.js
```
Abrí http://localhost:5173. La clave de carga en local es `prueba`.

## Pendientes

- **Base interna**: `api/_registro.js` está listo para conectar, falta elegir la base. Mientras tanto, se publica igual en Tiendanube.
- **Precio y stock vs. Contabilium**: si Contabilium sincroniza por SKU, va a pisar lo que se cargue acá.

- Cambiar los colores y el logo "RS" por los de la marca.
- Para producción, reemplazar el Tailwind por CDN por un build (`npx tailwindcss`).
- Si se edita un producto ya publicado, hoy se hace desde el panel de Tiendanube (acá queda en solo lectura).
