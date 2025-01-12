import { createTag, createIntersectionObserver } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg) {
    this.target = target;
    this.el = el;
    this.workflowCfg = workflowCfg;
    this.widget = null;
  }

  async initWidget() {
    this.populatePlaceholders();
    this.createWidget();
    this.insertWidget();
    this.initObserver();
    return this.workflowCfg.targetCfg.actionMap;
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

  createWidget() {
    const widgetContainer = this.createWidgetContainer();
    const combobox = this.createCombobox();
    widgetContainer.append(combobox);
    this.widget = widgetContainer;
  }

  createWidgetContainer() {
    return createTag('div', { class: 'express-unity-widget' });
  }

  createCombobox() {
    const combobox = createTag('div', {
      class: 'autocomplete',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-owns': 'dropdown',
      'aria-haspopup': 'listbox',
    });

    const inputField = this.createInputField();
    const dropdown = this.createDropdown();

    combobox.append(inputField, dropdown);
    return combobox;
  }

  createInputField() {
    return createTag('input', {
      type: 'text',
      class: 'input-field',
      role: 'textbox',
      'aria-autocomplete': 'list',
      'aria-controls': 'dropdown',
    });
  }

  createDropdown() {
    return createTag('ul', {
      class: 'dropdown hidden',
      role: 'listbox',
      id: 'dropdown',
    });
  }

  insertWidget() {
    const interactiveArea = this.target.querySelector('div[data-valign="middle"].text');
    const Paragraphs = interactiveArea.querySelectorAll('p.body-m');
    interactiveArea.insertBefore(this.widget, Paragraphs[1]);
  }

  initObserver() {
    const targetEl = this.target.querySelector('#free-ai-image-generator');
    createIntersectionObserver({
      el: targetEl,
      callback: (cfg) => this.addStickyBehaviour(cfg),
      cfg: this.workflowCfg,
    });
  }

  addStickyBehaviour(cfg) {
    const dropdown = this.widget.querySelector('.dropdown');
    if (cfg.isIntersecting) {
      this.widget.classList.remove('sticky');
      dropdown.classList.remove('open-upward');
    } else {
      this.widget.classList.add('sticky');
      dropdown.classList.add('open-upward');
    }
  }
}
