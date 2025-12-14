// Minimal, no-build-friendly MIME resolver.
// Not exhaustive; extend as needed. Returns '' when unknown.
const extToMime = {
  // images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  psd: 'image/vnd.adobe.photoshop',

  // adobe
  ai: 'application/illustrator',
  indd: 'application/x-indesign',
  indt: 'application/x-indesign',
  form: 'application/vnd.adobe.form.fillsign',
  pdf: 'application/pdf',

  // text/code
  txt: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  xml: 'application/xml',

  // office
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // audio/video
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',

  // archives/containers
  zip: 'application/zip',
  gz: 'application/gzip',
  gzip: 'application/gzip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  tar: 'application/x-tar',
  iso: 'application/x-iso9660-image',
};

function getExtension(input) {
  if (!input || typeof input !== 'string') return '';
  const lower = input.trim().toLowerCase();
  if (!lower) return '';
  const lastSegment = lower.split('?')[0].split('#')[0]; // strip query/hash
  const idx = lastSegment.lastIndexOf('.');
  if (idx === -1) return lastSegment; // treat raw ext like "png"
  if (idx === lastSegment.length - 1) return ''; // ends with dot
  return lastSegment.slice(idx + 1);
}

export function getType(pathOrExt) {
  const ext = getExtension(pathOrExt);
  return extToMime[ext] || '';
}

export default { getType };
