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
    this.models = null;
    this.selectedVerbType = '';
    this.selectedVerbText = '';
    this.selectedModelModule = '';
    this.selectedModelId = '';
    this.selectedModelText = '';
    this.selectedModelVersion = '';
    this.promptItems = [];
    this.genBtn = null;
    this.hasPromptSuggestions = false;
    this.hasModelOptions = false;
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
    const hasModels = !!this.el.querySelector('[class*="icon-model"]');
    this.hasModelOptions = hasModels;
    this.hasPromptSuggestions = hasPromptPlaceholder && hasSuggestionsPlaceholder;
    if (this.hasModelOptions) await this.getModel();
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

  showMenu(selectedElement) {
    const menuContainer = selectedElement.parentElement;
    document.querySelectorAll('.verbs-container, .models-container').forEach((container) => {
      if (container !== menuContainer) {
        container.classList.remove('show-menu');
        container.querySelector('.selected-verb')?.setAttribute('aria-expanded', 'false');
        container.querySelector('.selected-model')?.setAttribute('aria-expanded', 'false');
        container.querySelectorAll('.verb-link').forEach((lnk) => lnk.removeAttribute('tabindex'));
      }
    });
    menuContainer.classList.toggle('show-menu');
    selectedElement.setAttribute('aria-expanded', menuContainer.classList.contains('show-menu') ? 'true' : 'false');
    const links = menuContainer.querySelectorAll('.verb-link');
    if (menuContainer.classList.contains('show-menu')) links.forEach((lnk) => lnk.setAttribute('tabindex', '-1'));
    else links.forEach((lnk) => lnk.removeAttribute('tabindex'));
    if (menuContainer.classList.contains('show-menu')) {
      const first = links && links[0];
      if (first) {
        try {
          first.setAttribute('tabindex', '0');
          requestAnimationFrame(() => { requestAnimationFrame(() => first.focus()); });
        } catch (e) { /* noop */ }
      }
    }
    if (selectedElement.nextElementSibling.hasAttribute('style')) selectedElement.nextElementSibling.removeAttribute('style');
  }

  hidePromptDropdown(exceptElement = null) {
    const dropdown = this.widget.querySelector('.drop');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
      dropdown.setAttribute('inert', '');
      dropdown.setAttribute('aria-hidden', 'true');
    }
    const modelDropdown = this.widget.querySelector('.models-container');
    const modelButton = modelDropdown?.querySelector('.selected-model');
    if (modelDropdown && modelDropdown.classList.contains('show-menu') && modelButton !== exceptElement) {
      modelDropdown.classList.remove('show-menu');
      modelButton?.setAttribute('aria-expanded', 'false');
    }
    const verbDropdown = this.widget.querySelector('.verbs-container');
    const verbButton = verbDropdown?.querySelector('.selected-verb');
    if (verbDropdown && verbDropdown.classList.contains('show-menu') && verbButton !== exceptElement) {
      verbDropdown.classList.remove('show-menu');
      verbButton?.setAttribute('aria-expanded', 'false');
    }
  }

  attachListboxNav(listEl, itemSelector = '.verb-link') {
    listEl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = Array.from(listEl.querySelectorAll(itemSelector));
      if (!items.length) return;
      const current = e.target && e.target.closest ? e.target.closest(itemSelector) : null;
      let i = items.indexOf(current);
      if (i === -1) i = e.key === 'ArrowDown' ? 0 : items.length - 1;
      else i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      try { items[i].focus(); } catch (err) { /* noop */ }
    });
  }

  attachListboxActions(listEl, triggerBtn, activateHandler) {
    listEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const link = e.target && e.target.closest ? e.target.closest('.verb-link') : null;
        if (!link) return;
        e.preventDefault();
        activateHandler(link, e);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Escape') {
        const menuContainer = triggerBtn.parentElement;
        if (menuContainer && menuContainer.classList.contains('show-menu')) {
          e.preventDefault();
          e.stopPropagation();
          menuContainer.classList.remove('show-menu');
          triggerBtn.setAttribute('aria-expanded', 'false');
          try { triggerBtn.focus(); } catch (err) { /* noop */ }
        }
      }
    });
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

  handleVerbLinkClick(link, verbList, selectedElement, menuIcon, inputPlaceHolder, modelList) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      const verbLinkTexts = [];
      verbList.querySelectorAll('.verb-link').forEach((listLink) => {
        listLink.parentElement.classList.remove('selected');
        if (modelList) {
          listLink.parentElement.setAttribute('aria-label', `${listLink.getAttribute('data-model-type')} prompt: ${inputPlaceHolder}`);
        } else {
          listLink.parentElement.setAttribute('aria-label', `${listLink.getAttribute('data-verb-type')} prompt: ${inputPlaceHolder}`);
        }
        const text = listLink.textContent.trim();
        if (text) verbLinkTexts.push(text);
      });
      verbLinkTexts.sort((a, b) => b.length - a.length);
      selectedElement.parentElement.classList.toggle('show-menu');
      selectedElement.setAttribute('aria-expanded', selectedElement.parentElement.classList.contains('show-menu') ? 'true' : 'false');
      link.parentElement.classList.add('selected');
      if (modelList) {
        this.selectedModelId = link.getAttribute('data-model-id');
        this.selectedModelVersion = link.getAttribute('data-model-version');
        this.selectedModelModule = link.getAttribute('data-model-module');
        this.selectedModelText = link.textContent.trim();
        const copiedNodes = link.cloneNode(true).childNodes;
        copiedNodes[0].remove();
        selectedElement.replaceChildren(...copiedNodes, menuIcon);
        selectedElement.dataset.selectedModelId = this.selectedModelId;
        selectedElement.dataset.selectedModelVersion = this.selectedModelVersion;
        selectedElement.setAttribute('aria-label', `Select model, current: ${this.selectedModelText}`);
        link.parentElement.setAttribute('aria-label', `${this.selectedModelText} prompt selected:  ${inputPlaceHolder}`);
      } else {
        this.selectedVerbType = link.getAttribute('data-verb-type');
        this.selectedVerbText = link.textContent.trim();
        selectedElement.replaceChildren(this.selectedVerbText, menuIcon);
        selectedElement.dataset.selectedVerb = this.selectedVerbType;
        selectedElement.setAttribute('aria-label', `Select verb, current: ${this.selectedVerbText}`);
        link.parentElement.setAttribute('aria-label', `${this.selectedVerbText} prompt selected:  ${inputPlaceHolder}`);
      }
      selectedElement.focus();
      const verbsWithoutPromptSuggestions = this.workflowCfg.targetCfg?.verbsWithoutPromptSuggestions ?? [];
      if (!verbsWithoutPromptSuggestions.includes(this.selectedVerbType)) this.updateDropdownForVerb(this.selectedVerbType);
      else this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
      if (link.getAttribute('data-model-module') !== this.selectedVerbType) {
        const oldModelContainer = this.widget.querySelector('.models-container');
        if (oldModelContainer) {
          const modelDropdown = this.modelDropdown();
          if (modelDropdown.length > 1) {
            const newModelContainer = createTag('div', { class: 'models-container', 'aria-label': 'Prompt options' });
            newModelContainer.append(...modelDropdown);
            oldModelContainer.replaceWith(newModelContainer);
          }
        }
      }
      this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
      this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
      this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);
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

  createDropdownItems(items, listContainer, selectedElement, menuIcon, inputPlaceHolder, isModelList) {
    const fragment = document.createDocumentFragment();
    items.forEach((item, idx) => {
      const {
        name,
        type,
        icon,
        module,
        id,
        version,
      } = item;
      const listItem = createTag('li', {
        class: 'verb-item',
        role: 'option',
        'aria-label': `${name}`,
      });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const nameContainer = isModelList && createTag('span', { class: 'model-name' }, name.trim());
      const link = createTag('a', {
        href: '#',
        class: isModelList ? 'verb-link model-link' : 'verb-link',
        ...(!isModelList && { 'data-verb-type': type }),
        ...(isModelList && { 'data-model-module': module }),
        ...(isModelList && { 'data-model-id': id }),
        ...(isModelList && { 'data-model-version': version }),
      }, `<img loading="lazy" src="${icon}" alt="" />${nameContainer ? nameContainer.outerHTML : name}`);
      if (idx === 0) {
        listItem.classList.add('selected');
        listItem.setAttribute('aria-label', `${name} prompt selected: ${inputPlaceHolder}`);
      }
      link.prepend(selectedIcon);
      listItem.append(link);
      fragment.append(listItem);
    });
    listContainer.append(fragment);
    listContainer.addEventListener('click', (e) => {
      const link = e.target.closest('.verb-link');
      if (!link) return;
      this.handleVerbLinkClick(link, listContainer, selectedElement, menuIcon, inputPlaceHolder, isModelList)(e);
    });
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
      'aria-haspopup': 'listbox',
      'aria-label': `Select verb, current: ${selectedVerb?.textContent.trim()}`,
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
    const verbList = createTag('ul', { class: 'verb-list', id: 'prompt-menu', role: 'listbox', 'aria-label': 'Verb options' });
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
      this.hidePromptDropdown(selectedElement);
      this.showMenu(selectedElement);
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.hidePromptDropdown(selectedElement);
        this.showMenu(selectedElement);
        document.addEventListener('click', handleDocumentClick);
        return;
      }
      if (e.key === 'Escape') {
        selectedElement.parentElement.classList?.remove('show-menu');
        selectedElement.focus();
      }
    });
    verbs[0]?.classList.add('selected');
    const verbsData = Array.from(verbs).map((verb) => ({
      name: verb.nextElementSibling?.textContent.trim(),
      type: verb.classList[1].split('-')[2],
      icon: verb.nextElementSibling?.href,
    }));
    this.createDropdownItems(verbsData, verbList, selectedElement, menuIcon, inputPlaceHolder, false);
    this.attachListboxNav(verbList);
    this.attachListboxActions(verbList, selectedElement, (link, ev) => this.handleVerbLinkClick(link, verbList, selectedElement, menuIcon, inputPlaceHolder, false)(ev));
    return [selectedElement, verbList];
  }

  modelDropdown() {
    if (!this.hasModelOptions) return [];
    const models = this.models.filter((obj) => obj.module === this.selectedVerbType);
    const inputPlaceHolder = this.el.querySelector('.icon-placeholder-input').parentElement.textContent;
    const selectedModelType = models[0].id;
    const selectedModelVersion = models[0].version;
    const selectedModelModule = models[0].module;
    const nameContainer = createTag('span', { class: 'model-name' }, models[0].name.trim());
    const selectedElement = createTag('button', {
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'prompt-menu',
      'aria-haspopup': 'listbox',
      'aria-label': `Select model, current: ${models[0].name.trim()}`,
      'data-selected-model-id': selectedModelType,
      'data-selected-model-version': selectedModelVersion,
      'data-selected-model-module': selectedModelModule,
    }, `<img src="${models[0].icon}" alt="" />${nameContainer.outerHTML}`);
    this.selectedModelModule = selectedModelModule;
    this.selectedModelId = selectedModelType;
    this.selectedModelVersion = selectedModelVersion;
    this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);
    this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
    this.selectedModelText = models[0].name.trim();
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const listItems = createTag('ul', { class: 'verb-list', id: 'prompt-menu', role: 'listbox', 'aria-label': 'Model options' });
    listItems.setAttribute('style', 'display: none;');
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
      this.hidePromptDropdown(selectedElement);
      this.showMenu(selectedElement);
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.hidePromptDropdown(selectedElement);
        this.showMenu(selectedElement);
        document.addEventListener('click', handleDocumentClick);
        return;
      }
      if (e.key === 'Escape') {
        selectedElement.parentElement.classList?.remove('show-menu');
        selectedElement.focus();
      }
    });
    this.createDropdownItems(models, listItems, selectedElement, menuIcon, inputPlaceHolder, true);
    this.attachListboxNav(listItems);
    this.attachListboxActions(listItems, selectedElement, (link, ev) => this.handleVerbLinkClick(link, listItems, selectedElement, menuIcon, inputPlaceHolder, true)(ev));
    return [selectedElement, listItems];
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
      'aria-activedescendant': '',
    });
    const verbDropdown = this.verbDropdown();
    const modelDropdown = this.modelDropdown();
    const genBtn = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');
    actWrap.append(genBtn);
    const actionContainer = createTag('div', { class: 'action-container' });
    if (verbDropdown.length > 1) {
      const verbBtn = createTag('div', { class: 'verbs-container', 'aria-label': 'Prompt options' });
      verbBtn.append(...verbDropdown);
      actionContainer.append(verbBtn);
      inpWrap.append(actionContainer, inpField, actWrap);
    } else {
      inpWrap.append(inpField, actWrap);
    }
    if (modelDropdown.length > 1) {
      const modelBtn = createTag('div', { class: 'models-container', 'aria-label': 'Prompt options' });
      modelBtn.append(...modelDropdown);
      actionContainer.append(modelBtn);
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
    const interactArea = this.target.querySelector('.copy');
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

  async loadModels() {
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const modelFile = `${baseUrl}/unity/configs/prompt/model-picker.json`;
    const results = await fetch(modelFile);
    if (!results.ok) {
      throw new Error('Failed to fetch models.');
    }
    const modelJson = await results.json();
    this.models = modelJson?.content?.data;
  }

  async getModel() {
    if (!this.hasModelOptions) return [];
    try {
      if (!this.models || Object.keys(this.models).length === 0) await this.loadModels();
      return this.models;
    } catch (e) {
      window.lana?.log(`Message: Error loading models, Error: ${e}`, this.lanaOptions);
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

  createModelMap(data) {
    const modelMap = {};
    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (item.type) {
          if (!modelMap[item.module]) modelMap[item.module] = [];
          modelMap[item.module].push({ name: item.name, id: item.id, version: item.version, icon: item.icon });
        }
      });
    }
    return modelMap;
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
