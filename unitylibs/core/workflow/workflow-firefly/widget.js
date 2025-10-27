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
    this.sound = { audio: null, currentTile: null, currentUrl: '' };
    this.durationCache = new Map();
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

  hidePromptDropdown(exceptElement = null) {
    const dropdown = this.widget.querySelector('.prompt-dropdown-container');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
      dropdown.setAttribute('inert', '');
      dropdown.setAttribute('aria-hidden', 'true');
    }
    // For sound verb, reset variations, stop audio, and clear expanded UI
    if (this.selectedVerbType === 'sound') {
      this.resetAllSoundVariations(dropdown);
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

  clearSelectedModelState() {
    this.selectedModelId = '';
    this.selectedModelVersion = '';
    this.selectedModelModule = '';
    this.selectedModelText = '';
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
        selectedElement.setAttribute('aria-label', `${this.selectedModelText} prompt: ${inputPlaceHolder}`);
        link.parentElement.setAttribute('aria-label', `${this.selectedModelText} prompt selected:  ${inputPlaceHolder}`);
      } else {
        this.selectedVerbType = link.getAttribute('data-verb-type');
        this.selectedVerbText = link.textContent.trim();
        selectedElement.replaceChildren(this.selectedVerbText, menuIcon);
        selectedElement.dataset.selectedVerb = this.selectedVerbType;
        selectedElement.setAttribute('aria-label', `${this.selectedVerbText} prompt: ${inputPlaceHolder}`);
        link.parentElement.setAttribute('aria-label', `${this.selectedVerbText} prompt selected:  ${inputPlaceHolder}`);
      }
      selectedElement.focus();
      const verbsWithoutPromptSuggestions = this.workflowCfg.targetCfg?.verbsWithoutPromptSuggestions ?? [];
      if (!verbsWithoutPromptSuggestions.includes(this.selectedVerbType)) this.updateDropdownForVerb(this.selectedVerbType);
      else this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
      if (link.getAttribute('data-model-module') !== this.selectedVerbType) {
        const oldModelContainer = this.widget.querySelector('.models-container');
        const modelDropdown = this.modelDropdown();
        if (oldModelContainer) {
          if (modelDropdown.length > 1) {
            const newModelContainer = createTag('div', { class: 'models-container', 'aria-label': 'Prompt options' });
            newModelContainer.append(...modelDropdown);
            oldModelContainer.replaceWith(newModelContainer);
          } else {
            oldModelContainer.remove();
            this.clearSelectedModelState();
          }
        } else if (modelDropdown.length <= 1) {
          this.clearSelectedModelState();
        }
      }
      this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
      if (this.selectedModelId) this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
      else this.widgetWrap.removeAttribute('data-selected-model-id');
      if (this.selectedModelVersion) this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);
      else this.widgetWrap.removeAttribute('data-selected-model-version');
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
        'aria-label': `${name} prompt: ${inputPlaceHolder}`,
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
      this.hidePromptDropdown(selectedElement);
      this.showVerbMenu(selectedElement);
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this.hidePromptDropdown(selectedElement);
        this.showVerbMenu(selectedElement);
      }
      if (e.key === 'Escape' || e.code === 27) {
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
    return [selectedElement, verbList];
  }

  modelDropdown() {
    if (!this.hasModelOptions) return [];
    const models = this.models.filter((obj) => obj.module === this.selectedVerbType);
    if (!Array.isArray(models) || models.length === 0) return [];
    const inputPlaceHolder = this.el.querySelector('.icon-placeholder-input').parentElement.textContent;
    const selectedModelType = models[0].id;
    const selectedModelVersion = models[0].version;
    const selectedModelModule = models[0].module;
    const nameContainer = createTag('span', { class: 'model-name' }, models[0].name.trim());
    const selectedElement = createTag('button', {
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'prompt-menu',
      'aria-label': `${selectedModelType} prompt: ${inputPlaceHolder}`,
      'data-selected-model-id': selectedModelType,
      'data-selected-model-version': selectedModelVersion,
      'data-selected-model-module': selectedModelModule,
    }, `<img src="${models[0].icon}" alt="" />${nameContainer.outerHTML}`);
    this.selectedModelModule = selectedModelModule;
    this.selectedModelId = selectedModelType;
    this.selectedModelVersion = selectedModelVersion;
    this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
    this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);
    this.selectedModelText = models[0].name.trim();
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const listItems = createTag('ul', { class: 'verb-list', id: 'prompt-menu' });
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
      this.showVerbMenu(selectedElement);
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this.hidePromptDropdown(selectedElement);
        this.showVerbMenu(selectedElement);
      }
      if (e.key === 'Escape' || e.code === 27) {
        selectedElement.parentElement.classList?.remove('show-menu');
        selectedElement.focus();
      }
    });
    this.createDropdownItems(models, listItems, selectedElement, menuIcon, inputPlaceHolder, true);
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
    const dropdown = this.widget.querySelector('.prompt-dropdown-container');
    inpField.addEventListener('focus', () => this.resetAllSoundVariations(dropdown));
    inpField.addEventListener('click', () => this.resetAllSoundVariations(dropdown));
    inpField.addEventListener('input', () => this.resetAllSoundVariations(dropdown));
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
    return shuffled.slice(0, 3).map(({ prompt, assetid, variations }) => ({
      prompt,
      assetid,
      variations,
    }));
  }

  addPromptItemsToDropdown(dropdown, prompts, placeholder) {
    this.promptItems = [];
    prompts.forEach(({ prompt, assetid, variations }, idx) => {
      const item = createTag('li', {
        id: assetid,
        class: 'drop-item',
        role: 'option',
        tabindex: '0',
        'aria-label': prompt,
        'aria-description': `${placeholder['placeholder-prompt']} ${placeholder['placeholder-suggestions']}`,
        'daa-ll': `${prompt.slice(0, 20)}--${this.selectedVerbType}--Prompt suggestion`,
      });
      const iconWrap = createTag('span', { class: 'prompt-icon' }, '<svg><use xlink:href="#unity-prompt-icon"></use></svg>');
      const text = createTag('span', { class: 'drop-text' }, prompt);
      item.append(iconWrap, text);
      dropdown.append(item);
      this.promptItems.push(item);

      // Sound: expand details with variations & Use prompt
      if (this.selectedVerbType === 'sound') {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          // prevent ActionBinder's .drop-item listener from firing
          e.stopImmediatePropagation();
          e.stopPropagation();
          this.toggleSoundDetails(dropdown, item, { prompt, variations }, idx + 1);
        });
      }
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
    // Clicking outside the dropdown should reset and hide suggestions (persistent handler)
    if (!this.outsideDropdownHandler) {
      this.outsideDropdownHandler = (ev) => {
        const wrapper = this.widget.querySelector('.autocomplete');
        // Ignore clicks inside the autocomplete wrapper (input/prompt bar)
        if (wrapper && wrapper.contains(ev.target)) return;
        if (promptDropdownContainer && !promptDropdownContainer.classList.contains('hidden') && !promptDropdownContainer.contains(ev.target)) {
          this.hidePromptDropdown();
        }
      };
      setTimeout(() => document.addEventListener('click', this.outsideDropdownHandler, true), 0);
    }
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
    // TODO vipulg: remove draft urls and use production urls
    const promptFile = locale.prefix && locale.prefix !== '/'
      ? `${baseUrl}${locale.prefix}/drafts/vipulg/prompt/firefly-prompt.json`
      : `${baseUrl}/drafts/vipulg/prompt/firefly-prompt.json`;
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
    const { locale } = getConfig();
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const modelFile = locale.prefix && locale.prefix !== '/'
      ? `${baseUrl}${locale.prefix}/unity/configs/prompt/model-picker.json`
      : `${baseUrl}/unity/configs/prompt/model-picker.json`;
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
        if (item.verb && item.prompt && itemEnv === unityConfig.env) {
          if (!promptMap[item.verb]) promptMap[item.verb] = [];
          // Normalize variations: prefer item.variations; else parse delimited columns
          let variations = Array.isArray(item.variations) ? item.variations : null;
          if (!variations) {
            const labelsRaw = typeof item.variationLabels === 'string' ? item.variationLabels : '';
            const urlsRaw = typeof item.variationUrls === 'string' ? item.variationUrls : '';
            const split = (str) => str.split('||').map((s) => s.trim()).filter((s) => s);
            const labels = split(labelsRaw);
            const urls = split(urlsRaw);
            if (labels.length > 0) {
              const max = 4;
              variations = labels.slice(0, max).map((lbl, idx) => ({
                label: (lbl && lbl.trim()) || `Variation ${idx + 1}`,
                url: urls[idx] || '',
              }));
            }
          }
          promptMap[item.verb].push({ prompt: item.prompt, assetid: item.assetid, variations });
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

  resetTileToIdle(tile) {
    if (!tile) return;
    const audioEl = tile.audioRef;
    if (audioEl) {
      tile.dataset.forceIdle = '1';
      try { audioEl.pause(); } catch (e) { /* noop */ }
      try { audioEl.currentTime = 0; } catch (e) { /* noop */ }
    }
    tile.classList.remove('playing', 'selected', 'paused', 'is-active');
    tile.classList.add('is-idle');
    tile.setAttribute('aria-pressed', 'false');
    const pb = tile.querySelector('.pause-btn');
    if (pb) pb.classList.add('hidden');
    const fill = tile.querySelector('.seek-fill');
    if (fill) { fill.style.width = '0%'; fill.style.transform = 'scaleX(0)'; }
    const bar = tile.querySelector('.seek-bar');
    if (bar) { bar.setAttribute('aria-valuenow', '0'); try { bar.style.setProperty('--progress', '0%'); } catch (e) { /* noop */ } }
    const tm = tile.querySelector('.time-el');
    if (tm && audioEl) {
      const fmt = (s) => {
        const d = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
        return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`;
      };
      const setDuration = () => { tm.textContent = fmt(audioEl.duration); };
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) setDuration();
      else audioEl.addEventListener('loadedmetadata', setDuration, { once: true });
    }
  }

  resetAllSoundVariations(rootEl) {
    const root = rootEl || this.widget;
    root.querySelectorAll('.variation-tile').forEach((t) => { this.resetTileToIdle(t); });
    root.querySelectorAll('.sound-details').forEach((d) => d.remove());
    root.querySelectorAll('.drop-item.sound-expanded').forEach((el) => el.classList.remove('sound-expanded'));
    root.querySelectorAll('.drop-item .use-prompt-btn.inline').forEach((b) => b.remove());
  }

  toggleSoundDetails(dropdown, item, promptObj, promptIndex) {
    const next = item.nextElementSibling;
    if (next && next.classList.contains('sound-details')) {
      this.resetAllSoundVariations(dropdown);
      return;
    }
    this.resetAllSoundVariations(dropdown);
    const inlineBtn = createTag('button', {
      class: 'use-prompt-btn inline',
      'data-prompt-index': String(promptIndex),
      'aria-label': `Use prompt ${promptIndex}: ${promptObj.prompt}`,
    }, 'Use prompt');
    inlineBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hidePromptDropdown();
      const btn = this.genBtn;
      if (btn) {
        btn.dataset.soundPrompt = promptObj.prompt;
        btn.click();
      }
    });
    item.classList.add('sound-expanded');
    item.append(inlineBtn);
    const details = this.renderSoundDetails(promptObj);
    item.after(details);
  }

  renderSoundDetails(promptObj) {
    const details = createTag('div', { class: 'sound-details', role: 'region' });
    const strip = createTag('div', { class: 'variation-strip' });
    const vars = Array.isArray(promptObj.variations)
      ? promptObj.variations
      : [];
    vars.forEach((v, i) => {
      const tile = createTag('div', { class: 'variation-tile', role: 'button', tabindex: '0', 'aria-pressed': 'false' });
      const label = createTag('div', { class: 'variation-label inline' }, v.label || `Example ${i + 1}`);
      const audioObj = new Audio(v.url);
      audioObj.preload = 'metadata';
      tile.audioRef = audioObj;
      const player = createTag('div', { class: 'custom-player' });
      const pauseBtn = createTag('button', { class: 'pause-btn hidden', 'aria-label': `Pause ${v.label || `Example ${i + 1}`}` });
      const mouseInside = false;
      const setBtnToPause = () => {
        pauseBtn.innerHTML = '<svg width="20" height="20" aria-hidden="true"><use xlink:href="#unity-pause-icon"></use></svg>';
        pauseBtn.dataset.state = 'pause';
        pauseBtn.setAttribute('aria-label', `Pause ${v.label || `Example ${i + 1}`}`);
      };
      const setBtnToPlay = () => {
        pauseBtn.innerHTML = '<svg width="20" height="20" aria-hidden="true"><use xlink:href="#unity-play-icon"></use></svg>';
        pauseBtn.dataset.state = 'play';
        pauseBtn.setAttribute('aria-label', `Play ${v.label || `Example ${i + 1}`}`);
      };
      setBtnToPlay();
      const cached = this.durationCache.get(v.url);
      const timeEl = createTag('div', { class: 'time-el' }, cached ? `${Math.floor(cached / 60)}:${String(Math.floor(cached % 60)).padStart(2, '0')}` : '0:00');
      const progressBar = createTag('div', {
        class: 'seek-bar',
        role: 'progressbar',
        'aria-label': `Progress ${v.label || `Example ${i + 1}`}`,
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': '0',
        style: 'height:6px;border-radius:3px;overflow:hidden;flex:1;',
      });
      const progressFill = createTag('div', { class: 'seek-fill', style: 'height:100%;width:0%;background:#3B63FB;border-radius:3px;transition:width 100ms linear;' });
      progressBar.append(progressFill);
      player.append(pauseBtn, label, timeEl, progressBar);
      tile.classList.add('is-idle');
      const pauseOthers = () => {
        strip.querySelectorAll('.variation-tile').forEach((t) => {
          if (t !== tile) this.resetTileToIdle(t);
        });
      };
      const fmtTime = (sec) => {
        const s = Math.max(0, Math.floor(sec || 0));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, '0')}`;
      };

      let rafId = null;
      const startRaf = () => {
        if (rafId) cancelAnimationFrame(rafId);
        const tick = () => {
          if (Number.isFinite(audioObj.duration) && audioObj.duration > 0) {
            const pct = (audioObj.currentTime / audioObj.duration) * 100;
            progressFill.style.width = `${pct}%`;
            progressBar.style.setProperty('--progress', `${pct}%`);
            progressBar.setAttribute('aria-valuenow', String(pct));
            timeEl.textContent = fmtTime(audioObj.currentTime);
          }
          if (!audioObj.paused && !audioObj.ended) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      };
      const stopRaf = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } };
      const resetProgress = (durSec = audioObj?.duration) => {
        const dur = Number.isFinite(durSec) && durSec > 0 ? durSec : 0;
        progressFill.style.width = '0%';
        progressBar.style.setProperty('--progress', '0%');
        progressBar.setAttribute('aria-valuenow', '0');
        timeEl.textContent = fmtTime(dur);
      };
      audioObj.addEventListener('loadedmetadata', () => {
        const dur = Number.isFinite(audioObj.duration) && audioObj.duration > 0 ? audioObj.duration : 0;
        if (dur > 0) this.durationCache.set(v.url, dur);
        resetProgress();
      });
      audioObj.addEventListener('timeupdate', () => {
        if (!Number.isFinite(audioObj.duration) || audioObj.duration === 0) return;
        if (tile.classList.contains('playing')) return;
        timeEl.textContent = fmtTime(audioObj.duration);
      });
      audioObj.addEventListener('play', () => {
        pauseOthers();
        if (tile.dataset && tile.dataset.forceIdle) delete tile.dataset.forceIdle;
        tile.classList.add('playing', 'selected', 'is-active');
        tile.classList.remove('paused', 'is-idle');
        tile.setAttribute('aria-pressed', 'true');
        setBtnToPause();
        pauseBtn.classList.remove('hidden');
        startRaf();
        timeEl.textContent = fmtTime(audioObj.currentTime);
      });
      audioObj.addEventListener('pause', () => {
        if (tile.dataset.forceIdle === '1') {
          delete tile.dataset.forceIdle;
          tile.classList.remove('playing', 'selected', 'paused', 'is-active');
          tile.classList.add('is-idle');
          pauseBtn.classList.add('hidden');
          try { audioObj.currentTime = 0; } catch (e) { /* noop */ }
          resetProgress();
          stopRaf();
          return;
        }
        tile.classList.remove('playing');
        tile.classList.add('paused');
        tile.setAttribute('aria-pressed', 'false');
        setBtnToPlay();
        const hasFocus = tile.contains(document.activeElement);
        if (!mouseInside && !hasFocus) pauseBtn.classList.add('hidden');
        timeEl.textContent = fmtTime(audioObj.currentTime);
        stopRaf();
      });
      audioObj.addEventListener('ended', () => {
        tile.classList.remove('playing', 'is-active', 'paused');
        tile.classList.add('is-idle');
        tile.setAttribute('aria-pressed', 'false');
        pauseBtn.classList.add('hidden');
        try { audioObj.currentTime = 0; } catch (e) { /* noop */ }
        resetProgress();
        stopRaf();
      });

      const togglePlayback = () => {
        const isPlaying = !audioObj.paused && !audioObj.ended;
        if (isPlaying) {
          setBtnToPlay();
          audioObj.pause();
        } else {
          setBtnToPause();
          audioObj.play().catch(() => { setBtnToPlay(); });
        }
      };
      const handlePressToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { if ('pointerId' in e && pauseBtn.setPointerCapture) pauseBtn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        togglePlayback();
      };
      pauseBtn.addEventListener('pointerdown', handlePressToggle);
      pauseBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handlePressToggle(e); });
      pauseBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });

      const playIfPaused = () => {
        if (!audioObj.paused) return;
        setBtnToPause();
        pauseBtn.classList.remove('hidden');
        audioObj.play().catch(() => {});
      };
      tile.addEventListener('click', (ev) => {
        if (ev.target.closest && ev.target.closest('.pause-btn')) return; // button handles its own
        ev.preventDefault();
        playIfPaused();
      });
      tile.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          playIfPaused();
        }
      });
      tile.append(player);
      strip.append(tile);
    });
    details.append(strip);
    return details;
  }
}
