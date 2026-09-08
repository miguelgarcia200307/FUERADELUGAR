const MIB = 1024 * 1024;

export const IMAGE_LIMITS = Object.freeze({
  maxInputBytes: 50 * MIB,
  targetBytes: Math.round(2.5 * MIB),
  maxOutputBytes: 8 * MIB,
  maxLongEdge: 2560,
  minLongEdge: 1280,
  maxPixels: 220_000_000
});

const MIME_DETAILS = Object.freeze({
  'image/jpeg': { extension: 'jpg', kind: 'jpeg' },
  'image/png': { extension: 'png', kind: 'png' },
  'image/webp': { extension: 'webp', kind: 'webp' },
  'image/avif': { extension: 'avif', kind: 'avif' },
  'image/heic': { extension: 'heic', kind: 'heic' },
  'image/heif': { extension: 'heif', kind: 'heif' }
});

export class ImageProcessingError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ImageProcessingError';
    this.code = code;
  }
}

const readAscii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
const containsAscii = (bytes, text) => {
  const values = [...text].map(character => character.charCodeAt(0));
  for (let offset = 0; offset <= bytes.length - values.length; offset += 1) {
    if (values.every((value, index) => bytes[offset + index] === value)) return true;
  }
  return false;
};
const uint16be = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];
const uint24le = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
const uint32be = (bytes, offset) => ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;

function jpegMetadata(bytes) {
  let width = 0;
  let height = 0;
  let orientation = 1;
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01) { offset += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break;
    const length = uint16be(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const dataOffset = offset + 4;
    if (sofMarkers.has(marker) && length >= 7) {
      height = uint16be(bytes, dataOffset + 1);
      width = uint16be(bytes, dataOffset + 3);
    }
    if (marker === 0xe1 && length >= 16 && readAscii(bytes, dataOffset, 6) === 'Exif\0\0') {
      const tiff = dataOffset + 6;
      const littleEndian = readAscii(bytes, tiff, 2) === 'II';
      const get16 = position => littleEndian
        ? bytes[position] | (bytes[position + 1] << 8)
        : uint16be(bytes, position);
      const get32 = position => littleEndian
        ? (bytes[position] | (bytes[position + 1] << 8) | (bytes[position + 2] << 16) | (bytes[position + 3] * 0x1000000)) >>> 0
        : uint32be(bytes, position);
      const ifd = tiff + get32(tiff + 4);
      if (ifd + 2 <= bytes.length) {
        const count = get16(ifd);
        for (let index = 0; index < count; index += 1) {
          const entry = ifd + 2 + index * 12;
          if (entry + 12 > bytes.length) break;
          if (get16(entry) === 0x0112) {
            orientation = get16(entry + 8) || 1;
            break;
          }
        }
      }
    }
    offset += 2 + length;
  }
  return { width, height, orientation };
}

function pngMetadata(bytes) {
  const width = bytes.length >= 24 ? uint32be(bytes, 16) : 0;
  const height = bytes.length >= 24 ? uint32be(bytes, 20) : 0;
  const colorType = bytes[25];
  return {
    width,
    height,
    orientation: 1,
    hasTransparency: colorType === 4 || colorType === 6 || containsAscii(bytes, 'tRNS')
  };
}

function webpMetadata(bytes) {
  const chunk = readAscii(bytes, 12, 4);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { width: uint24le(bytes, 24) + 1, height: uint24le(bytes, 27) + 1, orientation: 1, hasTransparency: Boolean(bytes[20] & 0x10) };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: uint16be(new Uint8Array([bytes[27], bytes[26]]), 0) & 0x3fff, height: uint16be(new Uint8Array([bytes[29], bytes[28]]), 0) & 0x3fff, orientation: 1 };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] * 0x1000000)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, orientation: 1, hasTransparency: true };
  }
  return { width: 0, height: 0, orientation: 1 };
}

export function detectImageType(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg', kind: 'jpeg', ...jpegMetadata(bytes) };
  }
  if (bytes.length >= 26 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) {
    return { mime: 'image/png', extension: 'png', kind: 'png', ...pngMetadata(bytes) };
  }
  if (bytes.length >= 30 && readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp', kind: 'webp', ...webpMetadata(bytes) };
  }
  if (bytes.length >= 16 && readAscii(bytes, 4, 4) === 'ftyp') {
    const brands = readAscii(bytes, 8, Math.min(bytes.length - 8, 80));
    if (/(avif|avis)/.test(brands)) return { mime: 'image/avif', extension: 'avif', kind: 'avif', width: 0, height: 0, orientation: 1 };
    if (/(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)/.test(brands)) return { mime: 'image/heic', extension: 'heic', kind: 'heic', width: 0, height: 0, orientation: 1 };
  }
  return null;
}

function normalizedDeclaredMime(file) {
  const mime = String(file?.type || '').toLowerCase().replace('image/jpg', 'image/jpeg');
  return mime === 'image/heif-sequence' ? 'image/heif' : mime === 'image/heic-sequence' ? 'image/heic' : mime;
}

export async function inspectImageFile(file) {
  if (!file || typeof file.slice !== 'function') throw new ImageProcessingError('not-image', 'El archivo seleccionado no es una imagen válida.');
  if (!file.size) throw new ImageProcessingError('corrupt', 'La fotografía está vacía o dañada.');
  if (file.size > IMAGE_LIMITS.maxInputBytes) throw new ImageProcessingError('input-too-large', 'La fotografía supera el límite de seguridad de 50 MB.');
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, MIB)).arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) throw new ImageProcessingError('unsupported-format', 'El contenido no corresponde a una imagen JPG, PNG, WebP, AVIF, HEIC o HEIF válida.');
  const declared = normalizedDeclaredMime(file);
  const declaredDetails = MIME_DETAILS[declared];
  const declaredMatches = declared === detected.mime || (declaredDetails?.kind === 'heif' && detected.kind === 'heic');
  if (declared && declared !== 'application/octet-stream' && !declaredMatches) {
    throw new ImageProcessingError('mime-mismatch', 'El tipo declarado del archivo no coincide con su contenido.');
  }
  if (detected.width && detected.height && detected.width * detected.height > IMAGE_LIMITS.maxPixels) {
    throw new ImageProcessingError('dimensions-too-large', 'La resolución de esta fotografía supera el límite seguro de procesamiento.');
  }
  return detected;
}

const abortIfNeeded = signal => {
  if (signal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError');
};

function outputName(name, extension) {
  const clean = String(name || 'fotografia').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _-]+/g, '').trim().slice(0, 100) || 'fotografia';
  return `${clean}.${extension}`;
}

async function decodeImage(file, info, resizeScale, signal) {
  abortIfNeeded(signal);
  if (typeof createImageBitmap === 'function') {
    const options = { imageOrientation: 'from-image', premultiplyAlpha: 'default', colorSpaceConversion: 'default' };
    if (resizeScale < 1 && info.width && info.height) {
      options.resizeWidth = Math.max(1, Math.round(info.width * resizeScale));
      options.resizeHeight = Math.max(1, Math.round(info.height * resizeScale));
      options.resizeQuality = 'high';
    }
    try {
      const bitmap = await createImageBitmap(file, options);
      abortIfNeeded(signal);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (error) {
      if (info.kind === 'heic' || info.kind === 'heif') throw new ImageProcessingError('heic-unsupported', 'Este navegador no puede convertir fotografías HEIC o HEIF.', error);
      throw new ImageProcessingError('corrupt', 'No se pudo decodificar la fotografía.', error);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    abortIfNeeded(signal);
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
  } catch (error) {
    if (info.kind === 'heic' || info.kind === 'heif') throw new ImageProcessingError('heic-unsupported', 'Este navegador no puede convertir fotografías HEIC o HEIF.', error);
    throw new ImageProcessingError('corrupt', 'No se pudo decodificar la fotografía.', error);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));

function canvasBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) reject(new ImageProcessingError('processing', 'El navegador no pudo generar la imagen optimizada.'));
    else resolve(blob);
  }, mime, quality));
}

let webpSupport;
async function supportsWebp() {
  if (webpSupport != null) return webpSupport;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const blob = await canvasBlob(canvas, 'image/webp', 0.8);
  webpSupport = blob.type === 'image/webp';
  canvas.width = canvas.height = 0;
  return webpSupport;
}

function normalizedFile(file, info) {
  const desiredName = outputName(file.name, info.extension);
  if (file.type === info.mime && file.name.toLowerCase().endsWith(`.${info.extension}`)) return file;
  return new File([file], desiredName, { type: info.mime, lastModified: file.lastModified || Date.now() });
}

export async function imageFingerprint(file) {
  const chunk = 64 * 1024;
  const first = new Uint8Array(await file.slice(0, Math.min(file.size, chunk)).arrayBuffer());
  const lastStart = Math.max(first.length, file.size - chunk);
  const last = new Uint8Array(await file.slice(lastStart, file.size).arrayBuffer());
  const bytes = new Uint8Array(first.length + last.length + 16);
  bytes.set(first);
  bytes.set(last, first.length);
  new DataView(bytes.buffer).setBigUint64(bytes.length - 16, BigInt(file.size));
  new DataView(bytes.buffer).setBigUint64(bytes.length - 8, BigInt(file.lastModified || 0));
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  return `${file.size}:${file.lastModified}:${[...first.subarray(0, 32)].join('.')}:${[...last.subarray(-32)].join('.')}`;
}

export async function prepareProductImage(file, { onStatus = () => {}, signal } = {}) {
  onStatus('preparing');
  const info = await inspectImageFile(file);
  abortIfNeeded(signal);
  const knownLongEdge = Math.max(info.width || 0, info.height || 0);
  const mustBakeOrientation = info.orientation > 1;
  const mustConvert = info.kind === 'heic' || info.kind === 'heif';
  const mustResize = knownLongEdge > IMAGE_LIMITS.maxLongEdge;
  const mustCompress = file.size > IMAGE_LIMITS.targetBytes;
  const resizeScale = mustResize ? IMAGE_LIMITS.maxLongEdge / knownLongEdge : 1;
  const decoded = await decodeImage(file, info, resizeScale, signal);
  try {
    if (!decoded.width || !decoded.height) throw new ImageProcessingError('corrupt', 'La fotografía no contiene dimensiones válidas.');
    if (decoded.width * decoded.height > IMAGE_LIMITS.maxPixels) throw new ImageProcessingError('dimensions-too-large', 'La resolución de esta fotografía supera el límite seguro de procesamiento.');
    if (!mustBakeOrientation && !mustConvert && !mustResize && !mustCompress) {
      return {
        file: normalizedFile(file, info),
        optimized: false,
        originalBytes: file.size,
        finalBytes: file.size,
        originalWidth: decoded.width,
        originalHeight: decoded.height,
        finalWidth: decoded.width,
        finalHeight: decoded.height,
        mime: info.mime
      };
    }

    onStatus('optimizing');
    const sourceWidth = decoded.width;
    const sourceHeight = decoded.height;
    const originalWidth = info.orientation >= 5 && info.orientation <= 8 ? info.height || sourceWidth : info.width || sourceWidth;
    const originalHeight = info.orientation >= 5 && info.orientation <= 8 ? info.width || sourceHeight : info.height || sourceHeight;
    const outputMime = await supportsWebp() ? 'image/webp' : (info.hasTransparency ? 'image/png' : 'image/jpeg');
    const outputExtension = MIME_DETAILS[outputMime].extension;
    const qualities = outputMime === 'image/png' ? [undefined] : [0.88, 0.84, 0.80, 0.76, 0.72, 0.68];
    let width = sourceWidth;
    let height = sourceHeight;
    let best = null;
    let canvas = document.createElement('canvas');

    for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
      abortIfNeeded(signal);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: Boolean(info.hasTransparency), desynchronized: true });
      if (!context) throw new ImageProcessingError('processing', 'No hay memoria suficiente para optimizar la fotografía.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.source, 0, 0, width, height);
      for (const quality of qualities) {
        abortIfNeeded(signal);
        const blob = await canvasBlob(canvas, outputMime, quality);
        if (!best || blob.size < best.blob.size) best = { blob, width, height, quality };
        if (blob.size <= IMAGE_LIMITS.targetBytes) break;
        await nextFrame();
      }
      if (best.blob.size <= IMAGE_LIMITS.targetBytes || Math.max(width, height) <= IMAGE_LIMITS.minLongEdge) break;
      const scale = Math.max(IMAGE_LIMITS.minLongEdge / Math.max(width, height), 0.85);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      await nextFrame();
    }

    canvas.width = canvas.height = 0;
    canvas = null;
    if (!best || best.blob.size > IMAGE_LIMITS.maxOutputBytes) throw new ImageProcessingError('output-too-large', 'No fue posible reducir la fotografía a un tamaño seguro sin afectar demasiado su calidad.');
    const resultFile = new File([best.blob], outputName(file.name, outputExtension), { type: outputMime, lastModified: file.lastModified || Date.now() });
    return {
      file: resultFile,
      optimized: true,
      originalBytes: file.size,
      finalBytes: resultFile.size,
      originalWidth,
      originalHeight,
      finalWidth: best.width,
      finalHeight: best.height,
      mime: outputMime,
      quality: best.quality
    };
  } finally {
    decoded.close();
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < MIB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MIB).toFixed(bytes >= 10 * MIB ? 1 : 2)} MB`;
}

export function imageProcessingMessage(error) {
  const code = error?.code;
  if (code === 'input-too-large') return 'Esta fotografía supera 50 MB. Elige una imagen más pequeña para proteger el rendimiento del teléfono.';
  if (code === 'heic-unsupported') return 'Este navegador no puede convertir la foto HEIC/HEIF. Actualízalo o configura la cámara en “Más compatible” (JPG).';
  if (code === 'unsupported-format' || code === 'mime-mismatch' || code === 'not-image') return 'El archivo no es una fotografía compatible. Usa JPG, PNG, WebP, AVIF, HEIC o HEIF.';
  if (code === 'corrupt') return 'No pudimos leer esta fotografía porque parece estar dañada. Intenta seleccionarla nuevamente.';
  if (code === 'dimensions-too-large' || code === 'output-too-large') return error.message;
  if (error?.name === 'AbortError') return 'El procesamiento fue cancelado.';
  return 'No pudimos procesar esta fotografía. Intenta seleccionarla nuevamente o utiliza una imagen JPG, PNG o WebP.';
}
