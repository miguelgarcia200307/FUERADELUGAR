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
node tools/egress-upload-staged.mjs --dry-run
node tools/egress-upload-staged.mjs --test10
node tools/egress-upload-staged.mjs --rest
```

El uploader comprueba el respaldo local y la huella MD5/tamaño remotos antes de escribir, omite individualmente cualquier discrepancia y continúa con el siguiente objeto. Repetirlo es idempotente. Los reportes de ejecución están en la carpeta de staging. Los originales usan la misma ruta, extensión y content-type; sus rutas optimizadas son `product-images/optimized/{thumb,md,lg}/<ruta-original-sin-ext>.webp`. Las variantes tienen cache de un año.

## Frontend, consultas y cargas nuevas

- Grillas, tarjetas, carrito y miniaturas usan `thumb`; detalle usa `md/lg` con `srcset`. La foto original de hasta 2.000 px solo se solicita cuando se activa el zoom. Si falta una variante, se intenta la ruta original.
- En el panel, las imágenes nuevas se procesan con Canvas, limitadas a 2.000 px, se les generan las tres variantes WebP, reciben rutas UUID y cache de un año. Se rechazan formatos no compatibles y entradas de imagen sobre 50 MB; el selector de archivos no admite videos.
- Las consultas públicas usan columnas explícitas, paginación, límites, caché de sesión con TTL y deduplicación. Búsqueda espera 350 ms y no consulta con menos de dos caracteres. Carrito y stock se validan frescos al checkout. No hay suscripciones Realtime, consultas GraphQL ni pings de salud; el intervalo restante solo anima anuncios.
- `og:image` sigue siendo local y pesa 59.434 bytes. `robots.txt` excluye rutas de búsqueda/filtros con query string. Los placeholders son locales; no hay service worker ni videos cargados desde Storage.
- `_headers` aplica revalidación a HTML y cache largo a CSS, JS e imágenes estáticas para Cloudflare Pages.

## Medición real de visita

Medición fría con Chromium vía CDP: home completo desplazado para disparar lazy loading, primera página del catálogo con scroll y dos detalles (uno con PNG y otro con JPEG), sin abrir zoom. Se midieron bytes codificados de red en DevTools; se contaron 41 tarjetas en home, 20 en catálogo, 86 imágenes totales (74 desde Storage y 12 assets locales), y 52 respuestas REST/preflight.

- Imágenes servidas desde Storage: 4.800.806 bytes por visita; los 74 objetos tuvieron `cf-cache-status: HIT`. Los assets locales añadieron 318.228 bytes de transferencia, fuera del egress de Supabase.
- Datos API: 84.084 bytes y 52 solicitudes, medidos con los bytes codificados de red.
- Total de descarga de página: 5.203.118 bytes. Egress Supabase por 1.000 visitas: 4.800.806.000 bytes cacheados y 84.084.000 bytes no cacheados.
- En una cuota de 5 GB decimal por tipo, caben aproximadamente 1.041 visitas antes de agotar cached egress; la cuota no cacheada alcanzaría para 59.464 visitas. El límite práctico es el cached egress.
- Comparando las mismas 74 rutas de Storage con su inventario previo: 47.151.719 → 4.800.806 bytes (89,8 % menos). Las 12 imágenes locales no consumen Storage egress.

## Verificación de código y QA

Las pruebas de navegación, filtros, panel, promociones, carrito, checkout, personalización y carga de imágenes se ejecutaron en Chromium local; el detalle confirmó que la imagen original de 2000 px solo se solicita al activar el zoom. `node --check` pasó para 56 archivos JS/MJS. Este repositorio no contiene `package.json`, `tsconfig.json` ni configuración de ESLint, así que no hay comandos de lint, typecheck o build que ejecutar; el sitio se sirve como archivos estáticos.

## Cloudflare Pages (documentado, sin migración ni despliegue)

1. Crear un proyecto Pages conectado a este repositorio y a la rama de producción cuando se decida migrar.
2. Elegir despliegue estático sin comando de build y como directorio de salida la raíz del repositorio.
3. Mantener el archivo `_headers` en la raíz; Pages lo aplica a respuestas estáticas. Revisar el dominio y DNS antes de apuntar tráfico.
4. Verificar home, catálogo, detalle/zoom, carrito, checkout y panel en la URL de previsualización antes de cambiar DNS.

Guías oficiales: [configuración de cabeceras](https://developers.cloudflare.com/pages/configuration/headers/) y [cómo sirve Pages los archivos](https://developers.cloudflare.com/pages/configuration/serving-pages/). GitHub Pages no debe usarse para alojar esta tienda; no se cambió el hosting ni se desplegó.
