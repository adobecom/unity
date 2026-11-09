export function getExtension(name) {
  if (!name || typeof name !== 'string' || (name.startsWith('.') && name.indexOf('.', 1) === -1) || !name.includes('.')) return '';
  const lastDot = name.lastIndexOf('.');
  if (lastDot === 0) return '';
  return name.substring(lastDot + 1);
}

export function removeExtension(name) {
  if (name == null || typeof name !== 'string' || (name.startsWith('.') && name.indexOf('.', 1) === -1)) return name;
  const lastDot = name.lastIndexOf('.');
  if (lastDot > 0 && lastDot < name.length - 1) {
    return name.substring(0, lastDot);
  }
  return name;
}

export function getMimeType(fileName) {
  const extToTypeMap = {
    indd: 'application/x-indesign',
    ai: 'application/illustrator',
    psd: 'image/vnd.adobe.photoshop',
    form: 'application/vnd.adobe.form.fillsign',
    msg: 'application/vnd.ms-outlook',
  };
  return extToTypeMap[getExtension(fileName)];
}

export function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unable to read video metadata for: ${file.name}`));
    };
    video.src = url;
  });
}

function parsePsd(view) {
  if (view.byteLength < 26 || view.getUint32(0) !== 0x38425053 || view.getUint16(4) !== 1) {
    throw new Error('Invalid PSD: missing header, signature, or unsupported version');
  }
  const channels = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  const depth = view.getUint16(22);
  const colorMode = view.getUint16(24);
  if (view.getUint32(6) !== 0 || view.getUint16(10) !== 0
    || channels < 1 || channels > 56
    || width < 1 || height < 1 || width > 30000 || height > 30000
    || ![1, 8, 16, 32].includes(depth) || ![0, 1, 2, 3, 4, 7, 8, 9].includes(colorMode)) {
    throw new Error('Invalid PSD: invalid document header');
  }
  return { width, height };
}

export async function getImageDimensions(file) {
  const buffer = await file.slice(0, 256 * 1024).arrayBuffer();
  const view = new DataView(buffer);
  const type = file.type || '';
  const parsers = {
    'image/png': (v) => parsePng(v),
    'image/jpeg': (v) => parseJpeg(v),
    'image/jpg': (v) => parseJpeg(v),
    'image/webp': (v, b) => parseWebp(v, b),
    'image/vnd.adobe.photoshop': (v) => parsePsd(v),
  };
  const parser = parsers[type];
  if (!parser) throw new Error(`Unsupported file type: ${type}`);
  return parser(view, buffer);
}

function parsePng(view) {
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function parseJpeg(view) {
  let offset = 2;
  while (offset < view.byteLength) {
    if (view.getUint8(offset) !== 0xFF) break;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2);
    const isSOF = (marker >= 0xC0 && marker <= 0xC3)
      || (marker >= 0xC5 && marker <= 0xC7)
      || (marker >= 0xC9 && marker <= 0xCB)
      || (marker >= 0xCD && marker <= 0xCF);
    if (isSOF) {
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return { width, height };
    }
    offset += 2 + length;
  }
  throw new Error('Invalid JPEG: SOFn marker not found');
}

function parseWebp(view, buffer) {
  const td = new TextDecoder();
  const riffHeader = td.decode(new Uint8Array(buffer, 0, 4));
  if (riffHeader !== 'RIFF') throw new Error('Invalid WebP');
  const vp8Header = td.decode(new Uint8Array(buffer, 12, 4));
  if (vp8Header === 'VP8X') {
    const width = 1 + view.getUint8(24) + (view.getUint8(25) << 8) + (view.getUint8(26) << 16);
    const height = 1 + view.getUint8(27) + (view.getUint8(28) << 8) + (view.getUint8(29) << 16);
    return { width, height };
  }
  if (vp8Header === 'VP8 ') {
    const width = view.getUint16(26, true);
    const height = view.getUint16(28, true);
    return { width, height };
  }
  if (vp8Header === 'VP8L') {
    const b0 = view.getUint8(21);
    const b1 = view.getUint8(22);
    const b2 = view.getUint8(23);
    const b3 = view.getUint8(24);
    const width = 1 + (((b1 & 0x3F) << 8) | b0);
    const height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
    return { width, height };
  }
  throw new Error('Unsupported WebP variant');
}
