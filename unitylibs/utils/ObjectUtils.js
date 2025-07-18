export default function flattenObject(obj, options = {}) {
  const {
    separator = '.',
    prefix = '',
    maxDepth = 10,
    includeArrays = true,
    preserveNull = false,
    excludeTypes = ['function'],
    seenObjects = new WeakSet(),
  } = options;
  if (obj === null || obj === undefined) return preserveNull ? { [prefix || 'value']: obj } : {};
  if (typeof obj !== 'object') return { [prefix || 'value']: obj };
  if (seenObjects.has(obj)) return { [prefix || 'circular']: '[Circular Reference]' };
  if (maxDepth <= 0) return { [prefix || 'maxDepth']: '[Max Depth Reached]' };
  seenObjects.add(obj);
  const flattened = {};
  try {
    if (Array.isArray(obj)) {
      if (!includeArrays) flattened[prefix || 'array'] = `[Array(${obj.length})]`;
      else {
        obj.forEach((item, index) => {
          const key = prefix ? `${prefix}${separator}${index}` : `${index}`;
          const nested = flattenObject(item, {
            ...options,
            prefix: key,
            maxDepth: maxDepth - 1,
            seenObjects,
          });
          Object.assign(flattened, nested);
        });
      }
    } else {
      const keys = obj instanceof Error
        ? Object.getOwnPropertyNames(obj)
        : Object.keys(obj);
      keys.forEach((key) => {
        const value = obj[key];
        const newKey = prefix ? `${prefix}${separator}${key}` : key;
        if (excludeTypes.includes(typeof value)) {
          flattened[newKey] = `[${typeof value}]`;
          return;
        }
        if (value === null || value === undefined) {
          if (preserveNull) flattened[newKey] = value;
          return;
        }
        if (typeof value !== 'object') flattened[newKey] = value;
        else {
          const nested = flattenObject(value, {
            ...options,
            prefix: newKey,
            maxDepth: maxDepth - 1,
            seenObjects,
          });
          Object.assign(flattened, nested);
        }
      });
    }
  } finally {
    seenObjects.delete(obj);
  }
  return flattened;
}