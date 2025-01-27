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
    this.widgetWrap = createTag('div', { class: 'ex-unity-wrap' });
    this.widget = createTag('div', { class: 'ex-unity-widget' });
    this.widgetBg = this.createBg();
    const comboboxContainer = createTag('div', { class: 'autocomplete', role: 'combobox' });
    const placeholders = this.popPlaceholders();
    console.log('placeholders', placeholders);
    this.workflowCfg.placeholder = placeholders;
    const inputWrapper = this.createInpWrap(placeholders);
    const dropdown = this.genDropdown(placeholders);
    comboboxContainer.append(inputWrapper, dropdown);
    this.widget.append(comboboxContainer);
    this.addWidget();
    this.initIO();
    return this.workflowCfg.targetCfg.actionMap;
  }

  popPlaceholders() {
    return Object.fromEntries(
      [...this.el.querySelectorAll('[class*="placeholder"]')].map((element) => [
        element.classList[1]?.replace('icon-', '') || '',
        element.closest('li')?.innerText || '',
      ]).filter(([key]) => key),
    );
  }

  // createComboboxContainer() {
  //   return createTag('div', {
  //     class: 'autocomplete',
  //     role: 'combobox',
  //   });
  // }

  // popPlaceholders() {
  //   return Object.fromEntries(
  //     Array.from(this.el.querySelectorAll('.placeholder')).map((el) => [
  //       el.classList[1]?.replace('icon-', ''),
  //       el.closest('li')?.innerText || '',
  //     ]).filter(([key]) => key),
  //   );
  // }

  // createInputWrapper(ph) {
  //   const inputWrapper = createTag('div', { class: 'input-wrapper' });
  //   const actionWrapper = createTag('div', { class: 'action-wrapper' });
  //   const inputField = createTag('input', {
  //     id: 'promptInput',
  //     class: 'input-field',
  //     type: 'text',
  //     placeholder: ph['placeholder-input'],
  //     'aria-autocomplete': 'list',
  //     'aria-controls': 'prompt-dropdown',
  //     'aria-expanded': 'false',
  //     'aria-owns': 'prompt-dropdown',
  //   });
  //   const surpriseButton = this.createActionBtn(
  //     this.el.querySelector('.icon-surpriseMe')?.closest('li'),
  //     'surprise-btn',
  //   );
  //   const generateButton = this.createActionBtn(
  //     this.el.querySelector('.icon-generate')?.closest('li'),
  //     'generate-btn',
  //   );
  //   actionWrapper.append(surpriseButton, generateButton);
  //   inputWrapper.append(inputField, actionWrapper);
  //   return inputWrapper;
  // }

  createInpWrap(ph) {
    const inpWrap = createTag('div', { class: 'inp-wrap' });
    const actWrap = createTag('div', { class: 'act-wrap' });
    const inpField = createTag('input', {
      id: 'promptInput',
      class: 'inp-field',
      type: 'text',
      placeholder: ph['placeholder-input'],
      'aria-autocomplete': 'list',
      'aria-controls': 'prompt-dropdown',
      'aria-expanded': 'false',
      'aria-owns': 'prompt-dropdown',
    });
    const surpriseBtn = this.createActBtn(this.el.querySelector('.icon-surpriseMe')?.closest('li'), 'surprise-btn');
    const genBtn = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');
    actWrap.append(surpriseBtn, genBtn);
    inpWrap.append(inpField, actWrap);
    return inpWrap;
  }

  // createDropdown(placeholders) {
  //   const dropdown = createTag('ul', {
  //     id: 'prompt-dropdown',
  //     class: 'dropdown hidden',
  //     'daa-lh': 'Marquee',
  //     role: 'listbox',
  //     'aria-labelledby': 'promptInput',
  //     'aria-hidden': 'true',
  //   });

  //   const promptTitleCon = createTag('li', {
  //     class: 'drop-title-con',
  //     role: 'presentation',
  //   });
  //   const promptTitle = createTag('span', { class: 'drop-title' }, `${placeholders['placeholder-prompt']} ${placeholders['placeholder-suggestions']}`);
  //   const promptClose = createTag('button', { class: 'close-btn', 'daa-ll': 'prompt-dropdown-close', 'aria-label': 'Close dropdown' });
  //   promptTitleCon.append(promptTitle);
  //   promptTitleCon.append(promptClose);
  //   dropdown.append(promptTitleCon);

  //   const prompts = this.el.querySelectorAll('.icon-prompt');
  //   prompts.forEach((el, i) => {
  //     const prompt = createTag('li', {
  //       id: `item-${i}`,
  //       class: 'dropdown-item',
  //       role: 'option',
  //       'daa-ll': `prompt-bar-curated-prompt-${i}|${el.closest('li').innerText}`,
  //     }, el.closest('li').innerText);
  //     dropdown.append(prompt);
  //   });

  //   const separator = createTag('li', { class: 'dropdown-separator', role: 'separator' });
  //   dropdown.append(separator);

  //   const footer = this.createDropdownFooter(placeholders);
  //   dropdown.append(footer);

  //   return dropdown;
  // }

  genDropdown(ph) {
    const dd = createTag('ul', {
      id: 'prompt-dropdown',
      class: 'drop hidden',
      'daa-lh': 'Marquee',
      role: 'listbox',
      'aria-labelledby': 'promptInput',
      'aria-hidden': 'true',
    });
    const titleCon = createTag('li', { class: 'drop-title-con', role: 'presentation' });
    const title = createTag('span', { class: 'drop-title' }, `${ph['placeholder-prompt']} ${ph['placeholder-suggestions']}`);
    const closeBtn = createTag('button', { class: 'close-btn', 'daa-ll': 'drop-close', 'aria-label': 'Close dropdown' });
    titleCon.append(title, closeBtn);
    dd.append(titleCon);
    const prompts = this.el.querySelectorAll('.icon-prompt');
    prompts.forEach((el, i) => {
      const item = createTag('li', { id: `item-${i}`, class: 'drop-item', role: 'option', 'daa-ll': `drop-cur-prompt-${i}|${el.closest('li').innerText}` }, el.closest('li').innerText);
      dd.append(item);
    });
    dd.append(createTag('li', { class: 'drop-sep', role: 'separator' }));
    dd.append(this.createFooter(ph));
    return dd;
  }

  createFooter(ph) {
    const footer = createTag('li', { class: 'drop-footer' });
    const tipEl = this.el.querySelector('.icon-tip')?.closest('li');
    const tipCon = createTag('div', { class: 'tip-con' });
    const tipText = createTag('span', { class: 'tip-text' }, `${ph['placeholder-tip']}:`);
    const tipDesc = createTag('span', { class: 'tip-desc' }, tipEl?.innerText || '');
    tipCon.append(tipText, tipDesc);
    const legalEl = this.el.querySelector('.icon-legal')?.closest('li');
    const legalCon = createTag('div', { class: 'legal-con' });
    const legalLink = legalEl?.querySelector('a');
    const legalText = createTag('a', { href: legalLink?.href || '#', class: 'legal-text' }, legalLink?.innerText || 'Legal');
    legalCon.append(legalText);
    footer.append(tipCon, legalCon);
    return footer;
  }

  // createDropdownFooter(placeholders) {
  //   const footer = createTag('li', { class: 'dropdown-footer' });
  //   const tipElement = this.el.querySelector('.icon-tip').closest('li');
  //   const tipContainer = createTag('div', { class: 'tip-con' });
  //   const tipText = createTag('span', { class: 'tip-text' }, `${placeholders['placeholder-tip']}:`);
  //   const tipDescription = createTag('span', { class: 'tip-Desc' }, `${tipElement.innerText}`);
  //   tipContainer.append(tipText, tipDescription);

  //   const legalElement = this.el.querySelector('.icon-legal').closest('li');
  //   const legalContainer = createTag('div', { class: 'legal-con' });
  //   const legalText = createTag('a', {
  //     href: legalElement.querySelector('a').href,
  //     class: 'legal-text',
  //   }, legalElement.querySelector('a').innerText);
  //   legalContainer.append(legalText);

  //   footer.append(tipContainer, legalContainer);

  //   return footer;
  // }

  // createActionBtn(btnCfg, btnClass) {
  //   if (!btnCfg) return null;
  //   const text = btnCfg.innerText?.trim();
  //   const img = btnCfg.querySelector('img[src*=".svg"]');
  //   const actionBtn = createTag('a', { href: '#', class: `unity-act-btn ${btnClass}` });
  //   if (img) {
  //     actionBtn.append(createTag('div', { class: 'btn-icon' }, img));
  //   }
  //   if (text) {
  //     const btnText = createTag('div', { class: 'btn-text' }, text.split('\n')[0]);
  //     actionBtn.append(btnText);
  //   }
  //   return actionBtn;
  // }

  createActBtn(cfg, cls) {
    if (!cfg) return null;
    const txt = cfg.innerText?.trim();
    const img = cfg.querySelector('img[src*=".svg"]');
    const btn = createTag('a', { href: '#', class: `unity-act-btn ${cls}` });
    if (img) btn.append(createTag('div', { class: 'btn-ico' }, img));
    if (txt) btn.append(createTag('div', { class: 'btn-txt' }, txt.split('\n')[0]));
    return btn;
  }

  // createWidgetBg() {
  //   const widgetBgCon = createTag('div', { class: 'ex-unity-widget-bg blur' });
  //   const widgetBgOne = createTag('div', { class: 'bg-one' });
  //   const widgetBgTwo = createTag('div', { class: 'bg-two' });
  //   widgetBgCon.append(widgetBgOne, widgetBgTwo);
  //   this.widgetWrap.append(widgetBgCon);
  // }

  // insertWidget() {
  //   const interactiveArea = this.target.querySelector('div[data-valign="middle"].text');
  //   const paragraphs = interactiveArea.querySelectorAll('p.body-m');
  //   this.widgetWrap.append(this.widget);
  //   interactiveArea.insertBefore(this.widgetWrap, paragraphs[1]);
  // }

  createBg() {
    const bgCon = createTag('div', { class: 'widget-bg blur' });
    const bgOne = createTag('div', { class: 'bg-one' });
    const bgTwo = createTag('div', { class: 'bg-two' });
    bgCon.append(bgOne, bgTwo);
    this.widgetWrap.append(bgCon);
  }

  addWidget() {
    const interactArea = this.target.querySelector('.text');
    const paras = interactArea.querySelectorAll('p.body-m');
    this.widgetWrap.append(this.widget);
    interactArea.insertBefore(this.widgetWrap, paras[1]);
  }

  // initIntersectionObserver() {
  //   const observerElement = this.target.querySelector('#free-ai-image-generator');
  //   if (!observerElement) return;
  //   const getFooterElement = () => document.querySelector('.global-footer');
  //   let footerObserver;
  //   const waitForFooterAndInit = () => {
  //     const footerElement = getFooterElement();
  //     if (footerElement) {
  //       this.setupIntersectionObserver(observerElement, footerElement);
  //       if (footerObserver) {
  //         footerObserver.disconnect();
  //       }
  //     }
  //   };
  //   const footerElement = getFooterElement();
  //   if (footerElement) {
  //     waitForFooterAndInit();
  //   } else {
  //     footerObserver = new MutationObserver(waitForFooterAndInit);
  //     footerObserver.observe(document.body, { childList: true, subtree: true });
  //   }
  //   const checkInitialVisibility = () => {
  //     const rect = observerElement.getBoundingClientRect();
  //     const isInViewport = !(rect.top >= window.innerHeight || rect.bottom <= 0);
  //     this.addStickyBehaviour({ isIntersecting: isInViewport });
  //   };
  //   requestAnimationFrame(() => requestAnimationFrame(checkInitialVisibility));
  // }

  // setupIntersectionObserver(observerElement, footerElement) {
  //   createCustomIntersectionObserver({
  //     el: observerElement,
  //     callback: (cfg) => this.addStickyBehaviour(cfg),
  //     cfg: this.workflowCfg,
  //     options: {
  //       root: null,
  //       rootMargin: '10px',
  //       threshold: [0.1, 0.9],
  //     },
  //   });
  //   createCustomIntersectionObserver({
  //     el: footerElement,
  //     callback: (cfg) => this.toggleWrapperVisibility(cfg),
  //     cfg: {},
  //     options: {
  //       root: null,
  //       rootMargin: '0px',
  //       threshold: [0.0],
  //     },
  //   });
  // }

  // addStickyBehaviour(cfg) {
  //   const dropdown = this.widget.querySelector('.dropdown');
  //   if (cfg.isIntersecting) {
  //     this.widgetWrap.classList.remove('sticky');
  //     dropdown.classList.remove('open-upward');
  //     dropdown.setAttribute('daa-lh', 'Marquee');
  //   } else {
  //     this.widgetWrap.classList.add('sticky');
  //     dropdown.classList.add('open-upward');
  //     dropdown.setAttribute('daa-lh', 'Floating');
  //   }
  // }

  // toggleWrapperVisibility(cfg) {
  //   const wrapper = this.target.querySelector('.ex-unity-wrap');
  //   if (!wrapper) {
  //     return;
  //   }
  //   if (cfg.isIntersecting) {
  //     wrapper.classList.add('hidden');
  //   } else {
  //     wrapper.classList.remove('hidden');
  //   }
  // }

  initIO() {
    const observerEl = this.target.querySelector('#free-ai-image-generator');
    if (!observerEl) return;
    const getFooterEl = () => document.querySelector('.global-footer');
    let footerObs;
    const waitForFooter = () => {
      const footerEl = getFooterEl();
      if (footerEl) {
        this.setupIO(observerEl, footerEl);
        footerObs?.disconnect();
      }
    };
    if (getFooterEl()) {
      waitForFooter();
    } else {
      footerObs = new MutationObserver(waitForFooter);
      footerObs.observe(document.body, { childList: true, subtree: true });
    }
    const checkVisibility = () => {
      const { top, bottom } = observerEl.getBoundingClientRect();
      this.addSticky({ isIntersecting: !(top >= window.innerHeight || bottom <= 0) });
    };
    requestAnimationFrame(() => requestAnimationFrame(checkVisibility));
  }

  setupIO(observerEl, footerEl) {
    createCustomIntersectionObserver({
      el: observerEl,
      callback: (cfg) => this.addSticky(cfg),
      cfg: this.workflowCfg,
      options: { root: null, rootMargin: '10px', threshold: [0.1, 0.9] },
    });

    createCustomIntersectionObserver({
      el: footerEl,
      callback: (cfg) => this.toggleVisibility(cfg),
      cfg: {},
      options: { root: null, rootMargin: '0px', threshold: [0.0] },
    });
  }

  addSticky(cfg) {
    const dropdown = this.widget.querySelector('.drop');
    if (cfg.isIntersecting) {
      this.widgetWrap.classList.remove('sticky');
      dropdown.classList.remove('open-upward');
      dropdown.setAttribute('daa-lh', 'Marquee');
    } else {
      this.widgetWrap.classList.add('sticky');
      dropdown.classList.add('open-upward');
      dropdown.setAttribute('daa-lh', 'Floating');
    }
  }

  toggleVisibility(cfg) {
    const wrapper = this.target.querySelector('.ex-unity-wrap');
    if (!wrapper) return;
    if (cfg.isIntersecting) {
      wrapper.classList.add('hidden');
    } else {
      wrapper.classList.remove('hidden');
    }
  }
}
