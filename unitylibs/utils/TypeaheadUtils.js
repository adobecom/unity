export default class TypeaheadUtils {
  static optionTextMatches(text, query) {
    if (!query) return false;
    if (text.startsWith(query)) return true;
    return text.split(/\s+/).some((word) => word.startsWith(query));
  }

  static createMatcher() {
    let buffer = '';
    let timer = null;
    return (options, key) => {
      if (!options?.length) return null;
      clearTimeout(timer);
      const char = key.toLowerCase();
      const isRepeat = buffer.length > 0 && [...buffer].every((c) => c === char);
      buffer = isRepeat ? buffer + char : char;
      timer = setTimeout(() => { buffer = ''; }, 500);
      const texts = options.map((o) => (o.textContent || '').trim().toLowerCase());
      if (isRepeat && buffer.length > 1) {
        const letter = char;
        const matches = options.filter((_, i) => TypeaheadUtils.optionTextMatches(texts[i], letter));
        if (!matches.length) return null;
        const currentIdx = options.indexOf(document.activeElement);
        const next = matches.find((o) => options.indexOf(o) > currentIdx);
        return next || matches[0];
      }
      const matchIdx = texts.findIndex((t) => TypeaheadUtils.optionTextMatches(t, buffer));
      if (matchIdx >= 0) return options[matchIdx];
      buffer = char;
      const fallbackIdx = texts.findIndex((t) => TypeaheadUtils.optionTextMatches(t, char));
      return fallbackIdx >= 0 ? options[fallbackIdx] : null;
    };
  }
}
