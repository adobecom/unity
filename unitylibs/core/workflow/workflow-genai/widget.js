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
    this.widget = this.createWidget();
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
    return widgetContainer;
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
    this.el.append(this.widget);
  }

  initObserver() {
    const targetEl = this.target.querySelector('#free-ai-image-generator');
    createIntersectionObserver({
      el: targetEl,
      callback: (cfg) => this.toggleSticky(cfg),
      cfg: this.workflowCfg,
    });
  }
}
