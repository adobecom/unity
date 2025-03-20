/**
   * Returns the extension of a file name, if any.
   * @param {string} name - Target file name.
   * @returns {string} Extension or an empty string if none exists.
   */
export function getExtension(name) {
    if (name) {
      const segments = name.split('.');
      if (segments.length > 1) {
        return segments.pop(); // Get the last segment as the extension
      }
    }
    return '';
  }

  /**
   * Returns the file name without its extension.
   * @param {string} name - Target file name.
   * @returns {string} Name without extension.
   */
export function withoutExtension(name) {
    if (name) {
      const lastDot = name.lastIndexOf('.');
      if (lastDot >= 0 && lastDot < name.length - 1) {
        return name.substring(0, lastDot);
      }
    }
    return name; // Return original name if no extension is found
  }