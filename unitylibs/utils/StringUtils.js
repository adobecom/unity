export function getExtension(name) {
    return name && name.includes('.') ? name.split('.').pop() : '';
  }

export function withoutExtension(name) {
    if (name) {
      const lastDot = name.lastIndexOf('.');
      if (lastDot >= 0 && lastDot < name.length - 1) {
        return name.substring(0, lastDot);
      }
    }
    return name;
  }