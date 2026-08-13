import { createTag } from '../../../scripts/utils.js';

export default function buildPromptInput({ id = 'pbuPromptInput', defaultValue = '', ariaLabel = 'Search', placeholder = '', onInput }) {
  const textarea = createTag('textarea', {
    id,
    class: 'inp-field',
    rows: '1',
    'aria-label': ariaLabel,
    'aria-autocomplete': 'list',
    ...(placeholder ? { placeholder } : {}),
  });
  if (defaultValue) textarea.value = defaultValue;
  if (typeof onInput === 'function') {
    textarea.addEventListener('input', () => onInput(textarea.value.trim()));
  }
  return textarea;
}
