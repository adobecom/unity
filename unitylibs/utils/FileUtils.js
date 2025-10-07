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
    ai: 'application/pdf',
    psd: 'image/vnd.adobe.photoshop',
    form: 'application/vnd.adobe.form.fillsign',
  };
  return extToTypeMap[getExtension(fileName)];
}
