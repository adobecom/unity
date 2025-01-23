import { createTag, createCustomIntersectionObserver } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
  }

  async initWidget() {
    this.widgetParent = createTag('div', { class: 'express-unity-wrapper' });
    this.widget = createTag('div', { class: 'express-unity-widget' });
    const comboboxContainer = this.createComboboxContainer();
    const placeholders = this.populatePlaceholders();
    this.workflowCfg.placeholder = placeholders;
    const inputWrapper = this.createInputWrapper(placeholders);
    const dropdown = this.createDropdown(placeholders);
    comboboxContainer.append(inputWrapper, dropdown);
    this.widget.append(comboboxContainer);
    this.insertWidget();
    this.initIntersectionObserver();
    return this.workflowCfg.targetCfg.actionMap;
  }

  populatePlaceholders() {
    return Object.fromEntries(
      [...this.el.querySelectorAll('[class*="placeholder"]')].map((element) => [
        element.classList[1]?.replace('icon-', '') || '',
        element.closest('li')?.innerText || '',
      ]).filter(([key]) => key),
    );
  }

  createComboboxContainer() {
    return createTag('div', {
      class: 'autocomplete',
      role: 'combobox',
    });
  }

  createInputWrapper(placeholders) {
    const inputWrapper = createTag('div', { class: 'input-wrapper' });
    const actionWrapper = createTag('div', { class: 'action-wrapper' });
    const inputField = createTag('input', {
      id: 'promptInput',
      class: 'input-field',
      type: 'text',
      placeholder: placeholders['placeholder-input'],
      'aria-autocomplete': 'list',
      'aria-controls': 'prompt-dropdown',
      'aria-expanded': 'false',
      'aria-owns': 'prompt-dropdown',
    });

    const surpriseButton = this.createActionBtn(
      this.el.querySelector('.icon-surpriseMe')?.closest('li'),
      'surprise-btn',
    );
    const generateButton = this.createActionBtn(
      this.el.querySelector('.icon-generate')?.closest('li'),
      'generate-btn',
    );

    actionWrapper.append(surpriseButton, generateButton);
    inputWrapper.append(inputField, actionWrapper);

    return inputWrapper;
  }

  createDropdown(placeholders) {
    const dropdown = createTag('ul', {
      id: 'prompt-dropdown',
      class: 'dropdown hidden',
      'daa-lh': 'Marquee',
      role: 'listbox',
      'aria-labelledby': 'promptInput',
      'aria-hidden': 'true',
    });

    const promptTitleCon = createTag('li', {
      class: 'dropdown-title-con',
      role: 'presentation',
    });
    const promptTitle = createTag('span', { class: 'dropdown-title' }, `${placeholders['placeholder-prompt']} ${placeholders['placeholder-suggestions']}`);
    const promptClose = createTag('button', { class: 'close-btn', 'daa-ll': 'prompt-dropdown-close', 'aria-label': 'Close dropdown' });
    promptTitleCon.append(promptTitle);
    promptTitleCon.append(promptClose);
    dropdown.append(promptTitleCon);

    const prompts = this.el.querySelectorAll('.icon-prompt');
    prompts.forEach((el, i) => {
      const prompt = createTag('li', {
        id: `item-${i}`,
        class: 'dropdown-item',
        role: 'option',
        'daa-ll': `prompt-bar-curated-prompt-${i}|${el.closest('li').innerText}`,
      }, el.closest('li').innerText);
      dropdown.append(prompt);
    });

    const separator = createTag('li', { class: 'dropdown-separator', role: 'separator' });
    dropdown.append(separator);

    const footer = this.createDropdownFooter(placeholders);
    dropdown.append(footer);

    return dropdown;
  }

  createDropdownFooter(placeholders) {
    const footer = createTag('li', { class: 'dropdown-footer' });
    const tipElement = this.el.querySelector('.icon-tip').closest('li');
    const tipContainer = createTag('div', { class: 'tip-con' });
    const tipText = createTag('span', { class: 'tip-text' }, `${placeholders['placeholder-tip']}:`);
    const tipDescription = createTag('span', { class: 'tip-Desc' }, `${tipElement.innerText}`);
    tipContainer.append(tipText, tipDescription);

    const legalElement = this.el.querySelector('.icon-legal').closest('li');
    const legalContainer = createTag('div', { class: 'legal-con' });
    const legalText = createTag('a', {
      href: legalElement.querySelector('a').href,
      class: 'legal-text',
    }, legalElement.querySelector('a').innerText);
    legalContainer.append(legalText);

    footer.append(tipContainer, legalContainer);

    return footer;
  }

  createActionBtn(btnCfg, btnClass) {
    if (!btnCfg) return null;
    const text = btnCfg.innerText?.trim();
    const img = btnCfg.querySelector('img[src*=".svg"]');
    const actionBtn = createTag('a', { href: '#', class: `unity-action-btn ${btnClass}` });
    if (img) {
      actionBtn.append(createTag('div', { class: 'btn-icon' }, img));
    }
    if (text) {
      const btnText = createTag('div', { class: 'btn-text' }, text.split('\n')[0]);
      actionBtn.append(btnText);
    }
    return actionBtn;
  }

  insertWidget() {
    const interactiveArea = this.target.querySelector('div[data-valign="middle"].text');
    const paragraphs = interactiveArea.querySelectorAll('p.body-m');
    this.widgetParent.append(this.widget);
    interactiveArea.insertBefore(this.widgetParent, paragraphs[1]);
  }

  initIntersectionObserver() {
    const observerElement = this.target.querySelector('#free-ai-image-generator');
    if (!observerElement) return;
    const checkVisibility = () => {
      const rect = observerElement.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        this.addStickyBehaviour({ isIntersecting: false });
      }
      this.setupIntersectionObserver(observerElement);
    };
    requestAnimationFrame(() => requestAnimationFrame(checkVisibility));
  }

  setupIntersectionObserver() {
    this.workflowCfg.stickyBehavior = true;
    const observerElement = this.target.querySelector('#free-ai-image-generator');
    createCustomIntersectionObserver({
      el: observerElement,
      callback: (cfg) => this.addStickyBehaviour(cfg),
      cfg: this.workflowCfg,
      options: {
        root: null,
        rootMargin: '10px',
        threshold: [0.1, 0.9],
      },
    });
  }

  addStickyBehaviour(cfg) {
    const dropdown = this.widget.querySelector('.dropdown');
    if (cfg.isIntersecting) {
      this.widgetParent.classList.remove('sticky');
      dropdown.classList.remove('open-upward');
      dropdown.setAttribute('daa-lh', 'Marquee');
    } else {
      this.widgetParent.classList.add('sticky');
      dropdown.classList.add('open-upward');
      dropdown.setAttribute('daa-lh', 'Floating');
    }
  }
}
