# Auditoría de egress de Supabase

Este trabajo corresponde únicamente a `gacqqaimdfvkmznsglpg` y a este repositorio. El respaldo y los informes locales están en `backups/` (ignorado por Git). La clave secreta está en `.env.local` (ignorado por Git); nunca se copia al navegador.

## Estado y cambios

- El inventario de Storage fue de 896.267.793 bytes (0,8963 GB decimal): 1.036 imágenes en 7 buckets. Hay 903 imágenes de producto referenciadas por la base de datos, ninguna referencia base64 y ningún objeto duplicado entre las referencias examinadas.
- Las páginas públicas cachean lecturas repetibles en `sessionStorage` por 30–180 segundos y deduplican solicitudes simultáneas. Tarjetas piden menos columnas; búsqueda espera 350 ms. Inventarios de colores, tallas y variantes se leen por páginas para no truncar datos al límite REST.
- Las subidas nuevas de productos, categorías, equipos, marcas y logos de pago se optimizan en el navegador. Se mantienen UUID de ruta y `cacheControl` de un año.
- El logo y la imagen social están optimizados como archivos WebP/JPEG locales. Los originales locales se conservan.
- No se cambiaron filas de base de datos ni objetos de Storage. No se generaron variantes remotas: el margen actual hasta 0,9 GB es solo 3.732.207 bytes, menor que el espacio requerido para variantes de catálogo. Antes se comprimió una muestra local de 12 imágenes: 13.084.723 → 265.788 bytes en miniatura WebP 400 px, cerca de 98 % menos para esa muestra.

## Estimación por visita

Con el respaldo actual, una visita de referencia que carga home (8 promociones, 8 recientes y 2 destacados disponibles), los primeros 20 productos del catálogo y dos detalles (imagen principal y una secundaria por detalle) toca 28 imágenes distintas: 18.186.275 bytes, promedio de 649.510 bytes. Esto proyecta 18,19 GB por 1.000 visitas y unas 274 visitas por cada 5 GB, si todas las visitas vuelven a descargar las mismas imágenes. Es una proyección basada en las rutas y tamaños del respaldo; la carga diferida del navegador y su caché puede reducirla. La cifra no cambia aún para imágenes existentes porque las variantes no se han subido.

El sitio hace aproximadamente 15 lecturas de Supabase en ese recorrido en frío (7 home, 4 catálogo contando filtros de referencia, 2 por detalle incluyendo recomendaciones), antes de interacciones o filtros. Las lecturas repetibles pueden evitarse o reutilizarse en la misma sesión. Los bytes REST antes y después y la división real de egress cacheado/no cacheado no se midieron con telemetría de la cuenta; no se presenta una cifra inventada para ello.

## Candidatos y siguiente paso

Hay 30 objetos sin referencia encontrada en la base de datos ni el código, con 38.579.432 bytes en total. La lista completa está en `backups/2026-11-04T01-34-46-109Z/candidates-to-review.json`. Incluye un archivo de `customer-customizations` que puede ser contenido aportado por un cliente; revisar todos antes de decidir mover o borrar. No se borró ni movió ninguno. Tras liberar espacio habría que recalcular el inventario y generar solo las variantes que quepan bajo 900.000.000 bytes.

## Comandos de auditoría (solo lectura remota)

```powershell
node tools/egress-backup.mjs
node tools/egress-storage-inventory.mjs
node tools/egress-audit.mjs
node tools/egress-image-sample.mjs
```

Los scripts comprueban que `.env.local` apunta al proyecto esperado. No hay script de escritura remoto en esta rama. Para revertir los cambios de código, revertir los commits de esta rama; el respaldo en `backups/` queda local. No ejecutar borrados de Storage hasta revisar la lista y confirmar cada objeto.

## Límites de medición

La tasa real de aciertos de CDN y los bytes REST antes/después requieren telemetría de la cuenta. La reducción de imágenes existentes depende de generar y servir variantes, lo cual queda pendiente por el margen de Storage. GitHub Pages sirve el sitio actual; su [política de uso](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) no permite usarlo como plataforma de comercio electrónico. No se movieron imágenes dinámicas allí.
