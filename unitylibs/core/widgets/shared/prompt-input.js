import { createTag } from '../../../scripts/utils.js';

// Single-line (RS TextField, horizontal scroll) by default; `multiline` renders a
// fixed-height textarea (RS TextArea) that wraps and scrolls vertically past its rows.
export default function buildPromptInput({
  id = 'pbuPromptInput', defaultValue = '', ariaLabel = 'Search', placeholder = '',
  onInput, multiline = false,
}) {
  const attrs = {
    id,
    'aria-label': ariaLabel,
    'aria-autocomplete': 'list',
    ...(placeholder ? { placeholder } : {}),
  };
  const el = multiline
    ? createTag('textarea', { rows: '2', class: 'inp-field inp-field-multiline', ...attrs })
    : createTag('input', { type: 'text', class: 'inp-field', ...attrs });
  if (defaultValue) el.value = defaultValue;
  if (typeof onInput === 'function') {
    el.addEventListener('input', () => onInput(el.value.trim()));
  }
  return el;
}
