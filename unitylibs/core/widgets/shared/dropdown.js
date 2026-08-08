/*
 * Shared combobox/dropdown primitive with full keyboard a11y.
 * DEFERRED: only needed on interaction (e.g. Search click / option pickers),
 * so it is intentionally NOT preloaded and is lazy-imported after LCP.
 * Promoted from prompt-bar-upload's module-level dropdown helpers (the cleanest
 * of the 4 duplicate implementations across widgets).
 */
import { createTag } from '../../../scripts/utils.js';
import { svgIcon } from './widget-base.js';

export function setComboboxTriggerAriaLabel(triggerBtn, nameContainer) {
  const v = (nameContainer.textContent || '').trim();
  const prefix = triggerBtn.dataset.comboboxLabel || '';
  triggerBtn.setAttribute('aria-label', v ? `${prefix}, ${v}` : prefix);
}

export function closeDropdown(container, triggerBtn, list) {
  container.classList.remove('show-menu');
  list.setAttribute('style', 'display: none;');
  triggerBtn.setAttribute('aria-expanded', 'false');
}

export function syncDropdownSelection(list, activeLink) {
  list.querySelectorAll('li').forEach((li) => {
    const a = li.querySelector('a');
    const isActive = a === activeLink;
    li.classList.toggle('selected', isActive);
    a?.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

export function buildDropdownShell({ label, menuId, extraClass = '', imgEl = null, ariaLabelledBy = null }) {
  const container = createTag('div', {
    class: `models-container${extraClass ? ` ${extraClass}` : ''}`,
    role: 'group',
    'aria-label': label,
  });
  const nameContainer = createTag('span', { class: 'model-name' });
  const menuIcon = createTag('span', { class: 'menu-icon' }, svgIcon('#unity-chevron-icon'));
  const triggerBtn = createTag('button', {
    type: 'button',
    class: 'selected-model',
    'aria-expanded': 'false',
    'aria-controls': menuId,
    'aria-haspopup': 'listbox',
    role: 'combobox',
  });
  triggerBtn.dataset.comboboxLabel = label;
  if (imgEl) triggerBtn.append(imgEl, nameContainer, menuIcon);
  else triggerBtn.append(nameContainer, menuIcon);

  const listAttrs = { class: 'verb-list', id: menuId, role: 'listbox' };
  if (ariaLabelledBy) listAttrs['aria-labelledby'] = ariaLabelledBy;
  const list = createTag('ul', listAttrs);
  list.setAttribute('style', 'display: none;');

  container.append(triggerBtn, list);
  return { container, triggerBtn, nameContainer, menuIcon, list };
}

export function attachDropdownBehavior(container, triggerBtn, list) {
  const getOptions = () => [...list.querySelectorAll('a.model-link')];
  const focusSelectedOrFirst = () => {
    const options = getOptions();
    if (!options.length) return;
    const selected = options.find((option) => option.getAttribute('aria-selected') === 'true');
    (selected || options[0])?.focus();
  };

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.models-container.show-menu').forEach((other) => {
      if (other === container) return;
      other.classList.remove('show-menu');
      other.querySelector(':scope > .verb-list')?.setAttribute('style', 'display: none;');
      other.querySelector('.selected-model')?.setAttribute('aria-expanded', 'false');
    });
    const isOpen = container.classList.toggle('show-menu');
    if (isOpen) list.removeAttribute('style');
    else list.setAttribute('style', 'display: none;');
    triggerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  triggerBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown(container, triggerBtn, list);
      triggerBtn.focus();
      return;
    }
    if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    if (!container.classList.contains('show-menu')) {
      container.classList.add('show-menu');
      list.removeAttribute('style');
      triggerBtn.setAttribute('aria-expanded', 'true');
    }
    focusSelectedOrFirst();
  });

  list.addEventListener('keydown', (e) => {
    const options = getOptions();
    if (!options.length) return;
    const idx = options.findIndex((option) => option === document.activeElement);
    if (e.key === 'Tab') {
      if (idx < 0) return;
      const atStart = idx === 0;
      const atEnd = idx === options.length - 1;
      if ((e.shiftKey && atStart) || (!e.shiftKey && atEnd)) closeDropdown(container, triggerBtn, list);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown(container, triggerBtn, list);
      triggerBtn.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      options[idx < 0 ? 0 : (idx + 1) % options.length]?.focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      options[idx < 0 ? options.length - 1 : (idx - 1 + options.length) % options.length]?.focus();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      options[0]?.focus();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      options[options.length - 1]?.focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (idx >= 0 ? options[idx] : options[0])?.click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closeDropdown(container, triggerBtn, list);
  });
}
