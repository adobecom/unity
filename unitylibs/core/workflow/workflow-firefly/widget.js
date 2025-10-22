/* eslint-disable class-methods-use-this */

import { createTag, getConfig, unityConfig } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
    this.spriteCon = spriteCon;
    this.prompts = null;
    this.selectedVerbType = '';
    this.selectedVerbText = '';
    this.promptItems = [];
    this.genBtn = null;
    this.hasPromptSuggestions = false;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF' };
  }

  async initWidget() {
    const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
      .map((c) => createTag('div', { class: c }));
    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);
    this.workflowCfg.placeholder = this.popPlaceholders();
    const hasPromptPlaceholder = !!this.el.querySelector('.icon-placeholder-prompt');
    const hasSuggestionsPlaceholder = !!this.el.querySelector('.icon-placeholder-suggestions');
    this.hasPromptSuggestions = hasPromptPlaceholder && hasSuggestionsPlaceholder;
    const inputWrapper = this.createInpWrap(this.workflowCfg.placeholder);
    let dropdown = null;
    if (this.hasPromptSuggestions) dropdown = await this.genDropdown(this.workflowCfg.placeholder);
    const comboboxContainer = createTag('div', { class: 'autocomplete' });
    comboboxContainer.append(inputWrapper);
    if (dropdown) comboboxContainer.append(dropdown);
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
    const menuContainer = selectedElement.parentElement;
    document.querySelectorAll('.verbs-container').forEach((container) => {
      if (container !== menuContainer) {
        container.classList.remove('show-menu');
        container.querySelector('.selected-verb')?.setAttribute('aria-expanded', 'false');
      }
    });
    menuContainer.classList.toggle('show-menu');
    selectedElement.setAttribute('aria-expanded', menuContainer.classList.contains('show-menu') ? 'true' : 'false');
    if (selectedElement.nextElementSibling.hasAttribute('style')) selectedElement.nextElementSibling.removeAttribute('style');
  }

  hidePromptDropdown() {
    const dropdown = this.widget.querySelector('.drop');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
      dropdown.setAttribute('inert', '');
      dropdown.setAttribute('aria-hidden', 'true');
    }
  }

  updateAnalytics(verb) {
    if (this.promptItems && this.promptItems.length > 0) {
      this.promptItems.forEach((item) => {
        const ariaLabel = item.getAttribute('aria-label') || '';
        item.setAttribute('daa-ll', `${ariaLabel.slice(0, 20)}--${verb}--Prompt suggestion`);
      });
    }
    if (this.genBtn) {
      this.genBtn.setAttribute('daa-ll', `Generate--${verb}`);
    }
  }

  handleVerbLinkClick(link, verbList, selectedElement, menuIcon, inputPlaceHolder) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      const verbLinkTexts = [];
      verbList.querySelectorAll('.verb-link').forEach((listLink) => {
        listLink.parentElement.classList.remove('selected');
        listLink.parentElement.setAttribute('aria-label', `${listLink.getAttribute('data-verb-type')} prompt: ${inputPlaceHolder}`);
        const text = listLink.textContent.trim();
        if (text) verbLinkTexts.push(text);
      });
      verbLinkTexts.sort((a, b) => b.length - a.length);
      selectedElement.parentElement.classList.toggle('show-menu');
      selectedElement.setAttribute('aria-expanded', selectedElement.parentElement.classList.contains('show-menu') ? 'true' : 'false');
      link.parentElement.classList.add('selected');
      this.selectedVerbType = link.getAttribute('data-verb-type');
      this.selectedVerbText = link.textContent.trim();
      selectedElement.replaceChildren(this.selectedVerbText, menuIcon);
      selectedElement.dataset.selectedVerb = this.selectedVerbType;
      selectedElement.setAttribute('aria-label', `${this.selectedVerbText} prompt: ${inputPlaceHolder}`);
      selectedElement.focus();
      link.parentElement.setAttribute('aria-label', `${this.selectedVerbText} prompt selected:  ${inputPlaceHolder}`);
      const verbsWithoutPromptSuggestions = this.workflowCfg.targetCfg?.verbsWithoutPromptSuggestions ?? [];
      if (!verbsWithoutPromptSuggestions.includes(this.selectedVerbType)) this.updateDropdownForVerb(this.selectedVerbType);
      else this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
      this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
      this.updateAnalytics(this.selectedVerbType);
      if (this.genBtn) {
        this.genBtn.setAttribute(
          'aria-label',
          (this.genBtn.getAttribute('aria-label') || '').replace(
            new RegExp(`\\b(${verbLinkTexts.join('|')})\\b`),
            this.selectedVerbText,
          ),
        );
      }
    };
  }

  verbDropdown() {
    const verbs = this.el.querySelectorAll('[class*="icon-verb"]');
    const inputPlaceHolder = this.el.querySelector('.icon-placeholder-input').parentElement.textContent;
    const selectedVerbType = verbs[0]?.className.split('-')[2];
    const selectedVerb = verbs[0]?.nextElementSibling;
    const selectedElement = createTag('button', {
      class: 'selected-verb',
      'aria-expanded': 'false',
      'aria-controls': 'prompt-menu',
      'aria-label': `${selectedVerbType} prompt: ${inputPlaceHolder}`,
      'data-selected-verb': selectedVerbType,
    }, `${selectedVerb?.textContent.trim()}`);
    this.selectedVerbType = selectedVerbType;
    this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
    this.selectedVerbText = selectedVerb?.textContent.trim();
    if (verbs.length <= 1) {
      selectedElement.setAttribute('disabled', 'true');
      return [selectedElement];
    }
    this.widgetWrap.classList.add('verb-options');
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const verbList = createTag('ul', { class: 'verb-list', id: 'prompt-menu' });
    verbList.setAttribute('style', 'display: none;');
    selectedElement.append(menuIcon);
    const handleDocumentClick = (e) => {
      const menuContainer = selectedElement.parentElement;
      if (!menuContainer.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        menuContainer.classList.remove('show-menu');
        selectedElement.setAttribute('aria-expanded', 'false');
      }
    };
    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hidePromptDropdown();
      this.showVerbMenu(selectedElement);
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this.hidePromptDropdown();
        this.showVerbMenu(selectedElement);
      }
      if (e.key === 'Escape' || e.code === 27) {
        selectedElement.parentElement.classList?.remove('show-menu');
        selectedElement.focus();
      }
    });
    verbs.forEach((verb, idx) => {
      const name = verb.nextElementSibling?.textContent.trim();
      const verbType = verb.className.split('-')[2];
      const icon = verb.nextElementSibling?.href;
      const item = createTag('li', {
        class: 'verb-item',
        'aria-label': `${name} prompt: ${inputPlaceHolder}`,
      });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const link = createTag('a', {
        href: '#',
        class: 'verb-link',
        'data-verb-type': verbType,
      }, `<img loading="lazy" src="${icon}" alt="" />${name}`);
      if (idx === 0) {
        item.classList.add('selected');
        item.setAttribute('aria-label', `${name} prompt selected: ${inputPlaceHolder}`);
      }
      verbs[0].classList.add('selected');
      link.prepend(selectedIcon);
      item.append(link);
      verbList.append(item);
      link.addEventListener('click', this.handleVerbLinkClick(link, verbList, selectedElement, menuIcon, inputPlaceHolder));
    });
    return [selectedElement, verbList];
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
      'aria-owns': 'prompt-dropdown',
      'aria-activedescendant': '',
    });
    const verbDropdown = this.verbDropdown();
    const genBtn = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');
    actWrap.append(genBtn);
    if (verbDropdown.length > 1) {
      const verbBtn = createTag('div', { class: 'verbs-container', 'aria-label': 'Prompt options' });
      verbBtn.append(...verbDropdown);
      inpWrap.append(verbBtn, inpField, actWrap);
    } else {
      inpWrap.append(inpField, actWrap);
    }
    return inpWrap;
  }

  getLimitedDisplayPrompts(prompts) {
    const shuffled = prompts.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3).map(({ prompt, assetid }) => ({
      prompt,
      assetid,
      displayPrompt: prompt.length > 105 ? `${prompt.slice(0, 105)}…` : prompt,
    }));
  }

  addPromptItemsToDropdown(dropdown, prompts, placeholder) {
    this.promptItems = [];
    prompts.forEach(({ prompt, assetid, displayPrompt }) => {
      const item = createTag('li', {
        id: assetid,
        class: 'drop-item',
        role: 'option',
        tabindex: '0',
        'aria-label': prompt,
        'aria-description': `${placeholder['placeholder-prompt']} ${placeholder['placeholder-suggestions']}`,
        'daa-ll': `${prompt.slice(0, 20)}--${this.selectedVerbType}--Prompt suggestion`,
      }, `<svg><use xlink:href="#unity-prompt-icon"></use></svg> ${displayPrompt}`);
      dropdown.append(item);
      this.promptItems.push(item);
    });
  }

  async genDropdown(ph) {
    if (!this.hasPromptSuggestions) return null;
    const promptDropdownContainer = createTag('div', { class: 'prompt-dropdown-container drop hidden', 'aria-hidden': 'true' });
    const dd = createTag('ul', {
      id: 'prompt-dropdown',
      class: 'prompt-suggestions-list',
      'daa-lh': 'Marquee',
      role: 'listbox',
      'aria-labelledby': 'promptInput',
    });
    const titleCon = createTag('div', { class: 'drop-title-con' });
    const title = createTag('span', { class: 'drop-title', id: 'prompt-suggestions' }, `${ph['placeholder-prompt']} ${ph['placeholder-suggestions']}`);
    titleCon.append(title);
    const prompts = await this.getPrompt(this.selectedVerbType);
    const limited = this.getLimitedDisplayPrompts(prompts);
    this.addPromptItemsToDropdown(dd, limited, ph);
    promptDropdownContainer.append(titleCon, dd, this.createFooter(ph));
    return promptDropdownContainer;
  }

  createFooter(ph) {
    const footer = createTag('div', { class: 'drop-footer' });
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
    const btn = createTag('a', { href: '#', class: `unity-act-btn ${cls}`, 'daa-ll': `Generate--${this.selectedVerbType}`, 'aria-label': `${txt?.split('\n')[0]} ${this.selectedVerbText}` });
    if (img) btn.append(createTag('div', { class: 'btn-ico' }, img));
    if (txt) btn.append(createTag('div', { class: 'btn-txt' }, txt.split('\n')[0]));
    this.genBtn = btn;
    return btn;
  }

  addWidget() {
    const interactArea = this.target.querySelector(this.workflowCfg.targetCfg.selector);
    const para = interactArea?.querySelector(this.workflowCfg.targetCfg.target);
    this.widgetWrap.append(this.widget);
    if (para && this.workflowCfg.targetCfg.insert === 'before') para.before(this.widgetWrap);
    else if (para) para.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
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
    if (!this.hasPromptSuggestions) return [];
    try {
      if (!this.prompts || Object.keys(this.prompts).length === 0) await this.loadPrompts();
      return (this.prompts?.[verb] || []).filter((item) => item.prompt && item.prompt.trim() !== '');
    } catch (e) {
      window.lana?.log(`Message: Error loading promts, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  createPromptMap(data) {
    const promptMap = {};
    if (Array.isArray(data)) {
      data.forEach((item) => {
        const itemEnv = item.env || 'prod';
        if (item.verb && item.prompt && item.assetid && itemEnv === unityConfig.env) {
          if (!promptMap[item.verb]) promptMap[item.verb] = [];
          promptMap[item.verb].push({ prompt: item.prompt, assetid: item.assetid });
        }
      });
    }
    return promptMap;
  }

  async updateDropdownForVerb(verb) {
    if (!this.hasPromptSuggestions) return;
    const dropdown = this.widget.querySelector('#prompt-dropdown');
    if (!dropdown) return;
    dropdown.querySelectorAll('.drop-item').forEach((item) => item.remove());
    const prompts = await this.getPrompt(verb);
    const limited = this.getLimitedDisplayPrompts(prompts);
    this.addPromptItemsToDropdown(dropdown, limited, this.workflowCfg.placeholder);
    this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
  }
}
