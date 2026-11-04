# Optimización de egress de Supabase

Alcance: este repositorio y el proyecto Supabase `gacqqaimdfvkmznsglpg` únicamente. El sitio es estático, sin framework ni bundler, con módulos JavaScript y Supabase JS; la tienda, catálogo, búsqueda, detalle, carrito, checkout y panel administrativo consultan Supabase directamente. No se cambió la base de datos.

## Resultado de Storage

- Antes: 1.036 objetos, 896.267.793 bytes en 7 buckets.
- Después: 3.866 objetos, 725.366.862 bytes. De ellos, 582.030.306 bytes son objetos originales en sus rutas y formatos, y 143.336.556 bytes son 2.830 variantes WebP de producto.
- Ahorro neto: 170.900.931 bytes (19,1 %); quedan 174.633.138 bytes hasta 900.000.000 bytes y 274.633.138 bytes hasta el límite de 1 GB decimal.
- Se conservaron los 1.036 objetos originales, sin mover ni borrar los 30 sin referencia. Los cinco SVG de `team-crests/demo/` solo se respaldaron y nunca se procesaron ni sobrescribieron.
- Inventario final y referencias: `backups/2026-11-04T03-28-21-774Z/`. Verificación pública SHA-256 de los 3.861 archivos procesados: `backups/egress-stage-20261104T024715176Z/cdn-verification.json`.

La diferencia de 29 objetos corresponde al respaldo previo incompleto: contabilizó 1.007 y dejó fuera 29 que no se habían descargado. Se recuperaron por la API autenticada de Storage con `service_role`; el inventario verificado ahora incluye los 1.036. Los cinco SVG de demostración también se descargaron por esa API, se compararon sus SHA-256 con el inventario y quedaron únicamente en el respaldo.

## Copia de seguridad y reversión

ZIP completo, con rutas, inventario, manifiesto y checksums SHA-256:

`C:\Users\Miguel\Documents\FUERADELUGAR GIT\FUERADELUGAR\backups\originales-20261104T024429977Z.zip`

Contiene 1.036 objetos verificados. El respaldo sin comprimir está en `backups/originales-20261104T024429977Z/`. `backup-manifest.json` relaciona bucket/ruta, tamaño, SHA-256 y MD5 remotos con cada archivo local; `dry-run-report.json` relaciona los checksums y tamaños antes/después, las rutas de variantes y la ruta del original respaldado. Para restaurar, subir cada archivo de ese respaldo a su bucket/ruta original con `cacheControl: 31536000`; no restaurar los cinco SVG demo si el cambio no corresponde a ellos. La base de datos comparada está en `backups/2026-11-04T03-28-21-774Z/database-public.json` y la instantánea posterior en `backups/2026-11-04T04-20-32-689Z/database-public.json`.

Herramientas de operación, todas limitadas al proyecto indicado y sin credenciales versionadas:

```powershell
node tools/egress-full-backup.mjs
node tools/egress-stage-images.mjs --dry-run backups/originales-20261104T024429977Z backups/egress-stage-20261104T024715176Z
node tools/egress-stage-supporting-images.mjs backups/originales-20261104T024429977Z backups/egress-supporting-images-20261104T131200Z --copy-local
node tools/egress-upload-staged.mjs --dry-run
node tools/egress-upload-staged.mjs --test10
node tools/egress-upload-staged.mjs --rest
```

El uploader comprueba el respaldo local y la huella MD5/tamaño remotos antes de escribir, omite individualmente cualquier discrepancia y continúa con el siguiente objeto. Repetirlo es idempotente. Los reportes de ejecución están en la carpeta de staging. Los originales usan la misma ruta, extensión y content-type; sus rutas optimizadas son `product-images/optimized/{thumb,md,lg}/<ruta-original-sin-ext>.webp`. Las variantes tienen cache de un año.

## Frontend, consultas y cargas nuevas

- Grillas, tarjetas, carrito y miniaturas usan `thumb`; detalle usa `md/lg` con `srcset`. La foto original de hasta 2.000 px solo se solicita cuando se activa el zoom. Si falta una variante, se intenta la ruta original.
- En el panel, las imágenes nuevas se procesan con Canvas, limitadas a 2.000 px, se les generan las tres variantes WebP, reciben rutas UUID y cache de un año. Se rechazan formatos no compatibles y entradas de imagen sobre 50 MB; el selector de archivos no admite videos.
- Las consultas públicas usan columnas explícitas, paginación, límites, caché de sesión con TTL y deduplicación. Búsqueda espera 350 ms y no consulta con menos de dos caracteres. Carrito y stock se validan frescos al checkout. No hay suscripciones Realtime, consultas GraphQL ni pings de salud; el intervalo restante solo anima anuncios.
- Categorías y escudos usan 66 WebP locales generados desde el respaldo verificado: 480 px para mosaicos de categoría y 180 px para escudos. Conservan fallback al original si la ruta no está empaquetada. Los cinco SVG de demostración siguen intactos.
- Las tarjetas de producto activan sus imágenes al entrar en el viewport o quedar a 500 px de él; el catálogo ya no descarga todas las imágenes al abrir. La medición confirmó carga progresiva al desplazarse.
- Los banners del home siguen en Storage porque se administran desde el panel (tabla `homepage_banners`); no son fijos. Cada banner de escritorio tiene además una copia WebP de 1.280 px en `banner-images/home/<uuid>-1280.webp` (misma carpeta y regla de nombre que ya permite la política de Storage, sin cambios de BD). La página la sirve con `srcset`/`sizes` a pantallas 1x y deja el original de 1.920 px para HiDPI; si la copia falta, vuelve al original sin quitar el slide. El panel genera esa copia al subir un banner de escritorio y la borra junto con el original. Banner principal en escritorio 1x: 143.581 → 66.432 bytes. Solo se carga el slide activo.
- Accesos rápidos de categoría del home (41–48 px en pantalla) usan un WebP local de 128 px en lugar del de 480 px; escudos usan `srcset` 96 px / 180 px; filtros y buscador usan esas mismas copias pequeñas, y las miniaturas de producto del buscador usan `thumb` en vez del original. Logo de cabecera/pie: `srcset` 240/420/600 px. Favicon: PNG de 64 px (2.301 bytes) en lugar del de 256 px (52.359 bytes); `apple-touch-icon` de 180 px. Generador: `node tools/egress-small-variants.mjs --local`; banners: `--banners-dry-run` y `--banners-upload` (nunca sobrescribe; reporte en `backups/banner-variants/`).
- `og:image` sigue siendo local y pesa 59.434 bytes. `robots.txt` excluye rutas de búsqueda/filtros con query string. Los placeholders son locales; no hay service worker ni videos cargados desde Storage.
- `_headers` aplica revalidación a HTML y cache largo a CSS, JS e imágenes estáticas para Cloudflare Pages.

## Medición real de visita

Medición fría reproducible con Chromium (`node .qa/measure-real-visit.mjs --base=http://localhost:8081 [--mobile]`): home y catálogo desplazados progresivamente, detalle PNG y JPEG, zoom cerrado; 41 tarjetas en home, 20 en catálogo, 52 respuestas REST. Se sirve con `.qa/pages-like-server.mjs`, que imita GitHub Pages (gzip y `max-age=600`), así que el total incluye HTML, CSS, JS, fuentes, imágenes y API. Se excluye un script que inyecta el antivirus de la estación de trabajo. Auditoría por imagen (tamaño natural vs. tamaño mostrado × DPR, variante usada, zoom): `node .qa/audit-image-variants.mjs [--mobile] [--base=…]`.

| Visita fría | Antes del ajuste de variantes | Después |
|---|---:|---:|
| Escritorio 1366×900, total | 1.581.064 B | **1.203.297 B** (−23,9 %) |
| Escritorio, egress Supabase (Storage + API) | 936.701 B | **847.210 B** |
| Móvil 390×844, total | 1.733.724 B | **1.445.294 B** (−16,6 %) |
| Móvil, egress Supabase | 1.089.361 B | 1.089.363 B |
| Imágenes locales (ambos) | 353.816 B | 59.862 B |

- Visitas en 5 GB decimales: escritorio 3.162 → **4.155** contando todo el tráfico; 5.337 → **5.901** contando solo el egress de Supabase. Móvil: 2.883 → **3.459** total; 4.589 de Supabase (sin cambio: en móvil el banner ya usa su imagen móvil de 1.080 px y las tarjetas ya usaban `thumb`).
- Producción (`https://fueradelugarsport.com`, commit `f732280`, medido tras el despliegue del 2026-11-04): escritorio 1.214.638 B por visita fría (847.413 B de Supabase) y móvil 1.456.732 B (1.089.582 B de Supabase). En vivo: 293 imágenes en 12 rutas y el buscador sin fallos, sin errores de consola, sin originales fuera del zoom, y el zoom funcionando.
- Referencia histórica (antes de toda la optimización): 5.203.118 bytes por visita de escritorio y 4.884.890 bytes de egress Supabase.
- Las 15 imágenes más pesadas son ahora el banner de 1.280 px, el `md` del detalle y miniaturas `thumb`; ninguna supera lo que se muestra salvo `thumb` (400 px) en tarjetas de 240 px en pantallas 1x, que ya es la variante más pequeña. El original de 2.000 px solo aparece al abrir el zoom. El catálogo carga 15 de 20 imágenes en escritorio (6 de 20 en móvil) y el resto al desplazarse.

## Verificación de código y QA

Las pruebas de navegación, filtros, panel, promociones, carrito, checkout, personalización y carga de imágenes pasaron en Chromium local. La comprobación de 11 rutas cargó 222 imágenes sin fallos. El zoom confirmó que la imagen original solo se solicita al activarlo. El catálogo cargó las imágenes progresivamente. `node --check` pasó para 56 archivos JS/MJS. El repositorio no tiene `package.json`, `tsconfig.json` ni configuración de ESLint; es un sitio estático sin comando de build.

## Cloudflare Pages (documentado, sin migración ni despliegue)

1. Crear un proyecto Pages conectado a este repositorio y a la rama de producción cuando se decida migrar.
2. Elegir despliegue estático sin comando de build y como directorio de salida la raíz del repositorio.
3. Mantener el archivo `_headers` en la raíz; Pages lo aplica a respuestas estáticas. Revisar el dominio y DNS antes de apuntar tráfico.
4. Verificar home, catálogo, detalle/zoom, carrito, checkout y panel en la URL de previsualización antes de cambiar DNS.

Guías oficiales: [configuración de cabeceras](https://developers.cloudflare.com/pages/configuration/headers/) y [cómo sirve Pages los archivos](https://developers.cloudflare.com/pages/configuration/serving-pages/). Hoy la tienda se publica con GitHub Pages (push a `main`, dominio `fueradelugarsport.com`); ahí `_headers` no tiene efecto y HTML/CSS/JS se sirven con `max-age=600`. Por eso se mantiene la recomendación de migrar a Cloudflare Pages; el hosting no se cambió.
