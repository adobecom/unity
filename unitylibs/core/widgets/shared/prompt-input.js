/*
 * Shared prompt / search input primitive.
 * Critical-path: renders on initial load, safe to preload.
 * Uses the binder DOM contract id `#pbuPromptInput` (+ `.inp-field`).
 */
import { createTag } from '../../../scripts/utils.js';

/*
 * @param {object} opts
 * @param {string} [opts.id]
 * @param {string} [opts.defaultValue] - seeded value.
 * @param {string} [opts.ariaLabel]
 * @param {string} [opts.placeholder]
 * @param {(value:string)=>void} [opts.onInput] - called with the trimmed value on every input.
 * @returns { textarea }
 */
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
