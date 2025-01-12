import { createTag, createIntersectionObserver } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg) {
    this.target = target;
    this.el = el;
    this.workflowCfg = workflowCfg;
    this.widget = null;
  }

  async initWidget() {
    this.widget = this.createWidget();
    this.populatePlaceholders();
    this.insertWidget();
    this.initObserver();
    return this.workflowCfg.targetCfg.actionMap;
  }

  createWidget() {
    const widgetContainer = createTag('div', { class: 'unity-widget' });
    const combobox = this.createCombobox();
    widgetContainer.append(combobox);
    return widgetContainer;
  }

  createCombobox() {
    const combobox = createTag('div', {
      class: 'autocomplete',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-owns': 'dropdown',
      'aria-haspopup': 'listbox',
    });

    const inputWrapper = createTag('div', { class: 'input-wrapper' });
    const actionWrapper = createTag('div', { class: 'action-wrapper' });
    const inputField = this.createInputField();
    const dropdown = this.createDropdown();

    actionWrapper.append(
      this.createActionBtn(this.el.querySelector('.icon-surpriseMe')?.closest('li'), 'surprise-btn'),
      this.createActionBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'generate-btn')
    );

    inputWrapper.append(inputField, actionWrapper);
    combobox.append(inputWrapper, dropdown);

    return combobox;
  }

  createInputField() {
    const placeholder = this.workflowCfg.placeholder['placeholder-input'];
    return createTag('input', {
      id: 'promptInput',
      class: 'input-field',
      type: 'text',
      placeholder,
      'aria-autocomplete': 'list',
      'aria-controls': 'dropdown',
    });
  }

  createDropdown() {
    const dropdown = createTag('ul', {
      class: 'dropdown hidden',
      role: 'listbox',
      'aria-label': 'promptInput',
    });

    dropdown.append(this.createDropdownHeader());
    this.appendDropdownItems(dropdown);
    dropdown.append(this.createDropdownFooter());

    return dropdown;
  }

  createDropdownHeader() {
    const placeholder = this.workflowCfg.placeholder;
    return createTag('li', {
      class: 'dropdown-title',
      role: 'presentation',
    }, `${placeholder['placeholder-prompt']} ${placeholder['placeholder-suggestions']}`);
  }

  appendDropdownItems(dropdown) {
    const prompts = this.el.querySelectorAll('.icon-prompt');
    prompts.forEach((el, idx) => {
      const text = el.closest('li').innerText;
      const item = createTag('li', {
        id: `item-${idx}`,
        class: 'dropdown-item',
        role: 'option',
        'daa-ll': `prompt ${text}`,
      }, text);
      dropdown.append(item);
    });
    dropdown.append(createTag('li', { class: 'dropdown-separator', role: 'separator' }));
  }

  createDropdownFooter() {
    const footer = createTag('li', { class: 'dropdown-footer' });
    const tipContent = this.createTipContent();
    const legalContent = this.createLegalContent();

    footer.append(tipContent, legalContent);
    return footer;
  }

  createTipContent() {
    const placeholder = this.workflowCfg.placeholder;
    const tipText = `${placeholder['placeholder-tip']}: Tip:`;
    const tipDescription = this.el.querySelector('.icon-tip')?.closest('li').innerText;

    const tipContainer = createTag('div', { class: 'tip-container' });
    tipContainer.append(
      createTag('span', { class: 'tip-text' }, tipText),
      createTag('span', { class: 'tip-description' }, tipDescription),
    );

    return tipContainer;
  }

  createLegalContent() {
    const legalEl = this.el.querySelector('.icon-legal')?.closest('li');
    const legalLink = legalEl.querySelector('a');

    const legalContainer = createTag('div', { class: 'legal-container' });
    legalContainer.append(
      createTag('a', { href: legalLink.href, class: 'legal-link' }, legalLink.innerText),
    );

    return legalContainer;
  }

  createActionBtn(btnEl, btnClass) {
    if (!btnEl) return null;

    const text = btnEl.innerText?.trim();
    const icon = btnEl.querySelector('img[src*=".svg"]');
    const button = createTag('a', { href: '#', class: `action-btn ${btnClass}` });

    if (icon) button.append(createTag('div', { class: 'btn-icon' }, icon));
    if (text) button.append(createTag('div', { class: 'btn-text' }, text.split('\n')[0]));

    return button;
  }

  populatePlaceholders() {
    const placeholders = Object.fromEntries(
      [...this.el.querySelectorAll('[class*="placeholder"]')].map((el) => [
        el.classList[1]?.replace('icon-', '') || '',
        el.closest('li')?.innerText || '',
      ]).filter(([key]) => key)
    );
    this.workflowCfg.placeholder = placeholders;
  }

  insertWidget() {
    const interactiveArea = this.target.querySelector('div[data-valign="middle"].text');
    const paragraphs = interactiveArea.querySelectorAll('p.body-m');
    interactiveArea.insertBefore(this.widget, paragraphs[1]);
  }

  initObserver() {
    const targetEl = this.target.querySelector('#free-ai-image-generator');
    createIntersectionObserver({
      el: targetEl,
      callback: (cfg) => this.toggleSticky(cfg),
      cfg: this.workflowCfg,
    });
  }

  toggleSticky(cfg) {
    const dropdown = this.widget.querySelector('.dropdown');
    this.widget.classList.toggle('sticky', !cfg.isIntersecting);
    dropdown.classList.toggle('open-upward', !cfg.isIntersecting);
  }
}
