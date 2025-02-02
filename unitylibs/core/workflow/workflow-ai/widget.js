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
    this.workflowCfg.placeholder = placeholders;
    const inputWrapper = this.createInpWrap(placeholders);
    const dropdown = this.genDropdown(placeholders);
    comboboxContainer.append(inputWrapper, dropdown);
    this.widget.append(comboboxContainer);
    this.addWidget();
    if (this.workflowCfg.targetCfg.floatPrompt) {
      this.initIO();
    }
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

  createInpWrap(ph) {
    const inpWrap = createTag('div', { class: 'inp-wrap' });
    const actWrap = createTag('div', { class: 'act-wrap' });
    const inpField = createTag('input', {
      id: 'promptInput',
      class: 'inp-field',
      type: 'text',
      placeholder: ph['placeholder-input'],
      'aria-autocomplete': 'list',
      'aria-haspopup': 'listbox',
      'aria-controls': 'prompt-dropdown',
      'aria-expanded': 'false',
      'aria-owns': 'prompt-dropdown',
      'aria-activedescendant': '',
    });
    const surpriseBtn = this.createActBtn(this.el.querySelector('.icon-surpriseMe')?.closest('li'), 'surprise-btn');
    const genBtn = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');
    actWrap.append(surpriseBtn, genBtn);
    inpWrap.append(inpField, actWrap);
    return inpWrap;
  }

  genDropdown(ph) {
    const dd = createTag('ul', {
      id: 'prompt-dropdown',
      class: 'drop hidden',
      'daa-lh': 'Marquee',
      role: 'listbox',
      'aria-labelledby': 'promptInput',
      'aria-hidden': 'true',
    });
    const titleCon = createTag('li', { class: 'drop-title-con', 'aria-labelledby': 'prompt-suggestions' });
    const title = createTag('span', { class: 'drop-title', id: 'prompt-suggestions' }, `${ph['placeholder-prompt']} ${ph['placeholder-suggestions']}`);
    const closeBtn = createTag('button', { class: 'close-btn', 'daa-ll': 'drop-close', 'aria-label': 'Close dropdown' });
    titleCon.append(title, closeBtn);
    dd.append(titleCon);
    const prompts = this.el.querySelectorAll('.icon-prompt');
    prompts.forEach((el, idx) => {
      const item = createTag('li', {
        id: `item-${idx}`,
        class: 'drop-item',
        role: 'option',
        tabindex: '0',
        'aria-label': el.closest('li').innerText,
        'aria-description': `${ph['placeholder-prompt']} ${ph['placeholder-suggestions']}`,
        'daa-ll': `drop-cur-prompt-${idx}|${el.closest('li').innerText}`,
      }, el.closest('li').innerText);
      dd.append(item);
    });
    dd.append(createTag('li', { class: 'drop-sep', role: 'separator' }));
    dd.append(this.createFooter(ph));
    return dd;
  }

  createFooter(ph) {
    const footer = createTag('li', { class: 'drop-footer' });
    const tipEl = this.el.querySelector('.icon-tip')?.closest('li');
    const tipCon = createTag('div', { class: 'tip-con', role: 'note', 'aria-label': `${ph['placeholder-tip']} ${tipEl?.innerText}` });
    const tipText = createTag('span', { class: 'tip-text', id: 'tip-text' }, `${ph['placeholder-tip']}:`);
    const tipDesc = createTag('span', { class: 'tip-desc', id: 'tip-desc' }, tipEl?.innerText || '');
    tipCon.append(tipText, tipDesc);
    const legalEl = this.el.querySelector('.icon-legal')?.closest('li');
    const legalCon = createTag('div', { class: 'legal-con' });
    const legalLink = legalEl?.querySelector('a');
    const legalText = createTag('a', { href: legalLink?.href || '#', class: 'legal-text' }, legalLink?.innerText || 'Legal');
    legalCon.append(legalText);
    footer.append(tipCon, legalCon);
    return footer;
  }

  createActBtn(cfg, cls) {
    if (!cfg) return null;
    const txt = cfg.innerText?.trim();
    const img = cfg.querySelector('img[src*=".svg"]');
    const btn = createTag('a', { href: '#', class: `unity-act-btn ${cls}` });
    if (img) btn.append(createTag('div', { class: 'btn-ico' }, img));
    if (txt) btn.append(createTag('div', { class: 'btn-txt' }, txt.split('\n')[0]));
    return btn;
  }

  createBg() {
    const bgCon = createTag('div', { class: 'widget-bg blur' });
    const bgOne = createTag('div', { class: 'bg-one' });
    const bgTwo = createTag('div', { class: 'bg-two' });
    bgCon.append(bgOne, bgTwo);
    this.widgetWrap.append(bgCon);
  }

  addWidget() {
    // TODO: Inject the widget for a simple use case
    // TODO: Introduce a placeholder for complex use cases
    const interactArea = this.target.querySelector('.text');
    const para = interactArea.querySelector(this.workflowCfg.targetCfg.target);
    this.widgetWrap.append(this.widget);
    if (para) {
      if (this.workflowCfg.targetCfg.insert === 'before') {
        para.before(this.widgetWrap);
      } else {
        para.after(this.widgetWrap);
      }
    } else {
      interactArea.appendChild(this.widgetWrap);
    }
  }

  initIO() {
    const unityWrap = this.target.querySelector('.ex-unity-wrap');
    let obsEl = null;
    if (unityWrap) {
      let sibling = unityWrap.previousElementSibling;
      while (sibling) {
        if (sibling.classList && [...sibling.classList].some((cls) => cls.startsWith('heading-'))) {
          obsEl = sibling;
          break;
        }
        if (sibling.classList && sibling.classList.contains('unity-enabled')) {
          break;
        }
        sibling = sibling.previousElementSibling;
      }
    }
    if (!obsEl) return;
    const getFooterEl = () => document.querySelector('.global-footer');
    let footerObs;
    const waitForFooter = () => {
      const footerEl = getFooterEl();
      if (footerEl) {
        this.setupIO(obsEl, footerEl);
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
      const { top, bottom } = obsEl.getBoundingClientRect();
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
