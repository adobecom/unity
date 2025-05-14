import { createTag } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
    this.spriteCon = spriteCon;
    this.prompts = null;
  }

  async initWidget() {
    const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
      .map((c) => createTag('div', { class: c }));
    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);
    this.createBg();
    this.workflowCfg.placeholder = this.popPlaceholders();
    const inputWrapper = this.createInpWrap(this.workflowCfg.placeholder);
    const dropdown = this.genDropdown(this.workflowCfg.placeholder);
    const comboboxContainer = createTag('div', { class: 'autocomplete', role: 'combobox' });
    comboboxContainer.append(inputWrapper, dropdown);
    this.widget.append(comboboxContainer);
    this.addWidget();
    if (this.workflowCfg.targetCfg.floatPrompt) this.initIO();
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

  showVerbMenu(selectedElement) {
    selectedElement.parentElement.classList.toggle('show-menu');
    selectedElement.setAttribute('aria-expanded', selectedElement.parentElement.classList.contains('show-menu') ? 'true' : 'false');
  }

  verbDropdown() {
    const verbs = this.el.querySelectorAll('[class*="icon-verb"]');
    const selectedVerbType = verbs[0]?.className.split('-')[2];
    const selectedVerb = verbs[0].nextElementSibling;
    const { href } = selectedVerb;
    const selectedElement = createTag('button', {
      class: 'selected-verb',
      'aria-expanded': 'false',
      'aria-controls': 'prompt-menu',
      'data-selected-verb': selectedVerbType,
    }, `<img src="${href}" alt="${selectedVerbType}" />${selectedVerbType}`);
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    selectedElement.append(menuIcon);

    if (verbs.length <= 1) {
      selectedElement.setAttribute('disabled', 'true');
      return [selectedElement];
    }

    const verbList = createTag('ul', { class: 'verb-list', id: 'prompt-menu' });
    selectedElement.addEventListener('click', () => this.showVerbMenu(selectedElement), true);

    verbs.forEach((verb) => {
      const name = verb.nextElementSibling.textContent.trim();
      const verbType = verb.className.split('-')[2];
      const icon = verb.nextElementSibling.href;
      const item = createTag('li', { class: 'verb-item' });
      const link = createTag('a', {
        href: '#',
        class: 'verb-link',
        'data-verb-type': verbType,
      }, `<img src="${icon}" alt="${name}" />${name}`);
      item.append(link);
      verbList.append(item);

      link.addEventListener('click', (e) => {
        e.preventDefault();
        selectedElement.parentElement.classList.toggle('show-menu');
        selectedElement.setAttribute('aria-expanded', selectedElement.parentElement.classList.contains('show-menu') ? 'true' : 'false');
        link.classList.toggle('selected');

        const copiedNodes = e.target.cloneNode(true).childNodes;
        selectedElement.replaceChildren(...copiedNodes, menuIcon);
        selectedElement.dataset.selectedVerb = e.target.getAttribute('data-verb-type');
        updateDropdownForVerb(e.target.getAttribute('data-verb-type'));
      });
    });
    return [selectedElement, verbList];
  }

  createInpWrap(ph) {
    const inpWrap = createTag('div', { class: 'inp-wrap' });
    const actWrap = createTag('div', { class: 'act-wrap' });
    const verbBtn = createTag('div', { class: 'verbs-container', 'aria-label': 'Prompt options' });
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
    const genBtn = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');
    const verbDropdown = this.verbDropdown();
    actWrap.append(genBtn);
    verbBtn.append(...verbDropdown);
    inpWrap.append(verbBtn, inpField, actWrap);
    return inpWrap;
  }

  getLimitedDisplayPrompts(prompts) {
    const shuffled = prompts.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3).map(({ prompt, assetid }) => ({
      prompt,
      assetid,
      displayPrompt: prompt.length > 105 ? prompt.slice(0, 105) + '…' : prompt,
    }));
  }

  addPromptItemsToDropdown(dropdown, prompts, placeholder) {
    prompts.forEach(({ prompt, assetid, displayPrompt }, idx) => {
      const item = createTag('li', {
        id: assetid,
        class: 'drop-item',
        role: 'option',
        tabindex: '0',
        'aria-label': prompt,
        'aria-description': `${placeholder['placeholder-prompt']} ${placeholder['placeholder-suggestions']}`,
        'daa-ll': `drop-cur-prompt|${prompt}`,
      }, `<svg><use xlink:href=\"#unity-prompt-icon\"></use></svg> ${displayPrompt}`);
      dropdown.insertBefore(item, dropdown.children[2 + idx]);
    });
  }

  async genDropdown(ph, verb) {
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
    const closeBtn = createTag('button', { class: 'close-btn', 'daa-ll': 'drop-close', 'aria-label': 'Close dropdown' }, '<svg><use xlink:href="#unity-close-icon"></use></svg>');
    titleCon.append(title, closeBtn);
    dd.append(titleCon);

    const prompts = await this.getPrompt('image');
    const limited = this.getLimitedDisplayPrompts(prompts);
    this.addPromptItemsToDropdown(dd, limited, ph);

    dd.append(createTag('li', { class: 'drop-sep', role: 'separator' }));
    dd.append(this.createFooter(ph));
    return dd;
  }

  createFooter(ph) {
    const footer = createTag('li', { class: 'drop-footer' });
    const tipEl = this.el.querySelector('.icon-tip')?.closest('li');
    const tipCon = createTag('div', { id: 'tip-content', class: 'tip-con', tabindex: '-1', role: 'note', 'aria-label': `${ph['placeholder-tip']} ${tipEl?.innerText}` }, '<svg><use xlink:href="#unity-info-icon"></use></svg>');
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
    const interactArea = this.target.querySelector('.copy');
    const para = interactArea.querySelector(this.workflowCfg.targetCfg.target);
    this.widgetWrap.append(this.widget);
    if (para && this.workflowCfg.targetCfg.insert === 'before') para.before(this.widgetWrap);
    else if (para) para.after(this.widgetWrap);
    else interactArea.appendChild(this.widgetWrap);
  }

  initIO() {
    const unityWrap = this.target.querySelector('.ex-unity-wrap');
    if (!unityWrap) return;
    const obsEl = unityWrap.closest('.unity-enabled')?.querySelector('[class*="heading-"], h1, h2, h3, h4, h5, h6');
    if (!obsEl) return;
    const getFooterEl = () => document.querySelector('.global-footer');
    const waitForFooter = () => {
      const footerEl = getFooterEl();
      if (!footerEl) {
        setTimeout(waitForFooter, 3000);
        return;
      }
      this.setupIO(obsEl, footerEl);
    };
    waitForFooter();
    const checkVisibility = () => {
      const { top, bottom } = obsEl.getBoundingClientRect();
      const isIntersecting = (top === 0 && bottom === 0)
      || (bottom > 0 && top < window.innerHeight);
      this.addSticky({ isIntersecting });
    };
    requestAnimationFrame(() => requestAnimationFrame(checkVisibility));
  }

  setupIO(observerEl, footerEl) {
    this.createCustIntsecObs({
      el: observerEl,
      callback: (cfg) => this.addSticky(cfg),
      cfg: this.workflowCfg,
      options: { root: null, rootMargin: '200px', threshold: [0.1, 0.9] },
    });

    this.createCustIntsecObs({
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
      return;
    }
    this.widgetWrap.classList.add('sticky');
    dropdown.classList.add('open-upward');
    dropdown.setAttribute('daa-lh', 'Floating');
  }

  toggleVisibility(cfg) {
    const wrapper = this.target.querySelector('.ex-unity-wrap');
    if (!wrapper) return;
    wrapper.classList[cfg.isIntersecting ? 'add' : 'remove']('hidden');
  }

  debounce(func, del) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func(...args), del);
    };
  }

  createCustIntsecObs({ el, callback, cfg, options = {} }) {
    const debouncedCallback = this.debounce(callback, 100);
    let lastState = null;
    let lastExecutionTime = 0;
    const MIN_INTERVAL = 200;
    const observerOptions = {
      threshold: [0.1, 0.9],
      ...options,
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const currentState = entry.isIntersecting;
        const now = Date.now();
        if (currentState !== lastState && now - lastExecutionTime >= MIN_INTERVAL) {
          lastState = currentState;
          lastExecutionTime = now;
          cfg.isIntersecting = currentState;
          debouncedCallback(cfg);
        }
      });
    }, observerOptions);
    io.observe(el);
    return io;
  }

  async loadPrompts() {
    const { locale } = getConfig();
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.')) 
    ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
    : origin;
    const promptFile = locale.prefix && locale.prefix !== '/'
      ? `${baseUrl}${locale.prefix}/unity/configs/prompt/firefly-prompt.json`
      : `${baseUrl}/unity/configs/prompt/firefly-prompt.json`;
    const promptRes = await fetch(promptFile);
    if (!promptRes.ok) {
      throw new Error('Failed to fetch prompts.');
    }
    const promptJson = await promptRes.json();
    this.prompts = this.createPromptMap(promptJson?.content?.data);
  }

  async getPrompt(verb) {
    try {
      if (!this.prompts || Object.keys(this.prompts).length === 0) await this.loadPrompts();
      return this.prompts?.[verb] || [];
    } catch (e) {
      return [];
    }
  }

  createPromptMap(data) {
    const promptMap = {};
    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (item.verb && item.prompt && item.assetid) {
          if (!promptMap[item.verb]) promptMap[item.verb] = [];
          promptMap[item.verb].push({ prompt: item.prompt, assetid: item.assetid });
        }
      });
    }
    return promptMap;
  }

  async updateDropdownForVerb(verb) {
    const dropdown = this.widget.querySelector('#prompt-dropdown');
    while (dropdown.children.length > 3) {
      dropdown.removeChild(dropdown.children[1]);
    }
    const prompts = await this.getPrompt(verb);
    const limited = this.getLimitedDisplayPrompts(prompts);
    this.addPromptItemsToDropdown(dropdown, limited, this.workflowCfg.placeholder);
  }
}
