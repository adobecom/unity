export function getExtension(name) {
    return name && name.includes('.') ? name.split('.').pop() : '';
  }

export function removeExtension(name) {
  if (name == null) return name;
  const lastDot = name.lastIndexOf('.');
  return lastDot >= 0 && lastDot < name.length - 1 ? name.substring(0, lastDot) : name;
}

export function getMimeType(fileName) {
  const extToTypeMap = {
    'indd': 'application/x-indesign',
    'ai': 'application/illustrator',
    'psd': 'image/vnd.adobe.photoshop',
  };
  return extToTypeMap[getExtension(fileName)];
}