/* eslint-disable class-methods-use-this */

import { createTag } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
    this.spriteCon = spriteCon;
    this.models = null;
    this.selectedModelId = '';
    this.selectedModelVersion = '';
    this.selectedModelModule = '';
    this.hasModelOptions = false;
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-PBU' };
  }

  async initWidget() {
    const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
      .map((c) => createTag('div', { class: c }));
    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);
    this.workflowCfg.placeholder = this.popPlaceholders();
    const hasModels = !!this.el.querySelector('[class*="icon-model"]');
    this.hasModelOptions = hasModels;
    if (this.hasModelOptions) await this.getModel();
    const defaultModelId = this.selectedModelId;
    let aspects = [];
    if (defaultModelId) aspects = await this.loadAspectRatios(defaultModelId);
    const dropzone = this.buildDropzone();
    const promptWrap = this.buildPromptWrap();
    const actionRow = this.buildActionRow(aspects);
    this.widget.append(dropzone, promptWrap, actionRow);
    this.addWidget();
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

  buildDropzone() {
    const ph = this.workflowCfg.placeholder;
    const dropzone = createTag('div', { class: 'pbu-dropzone', role: 'button', tabindex: '0', 'aria-label': ph['placeholder-dropzone-label'] || 'Upload image' });
    const inner = createTag('div', { class: 'pbu-dropzone-inner' });
    const label = createTag('span', { class: 'pbu-dropzone-label' }, ph['placeholder-dropzone-label'] || '');
    const fileInput = createTag('input', {
      type: 'file',
      id: 'pbu-file-input',
      accept: 'image/*',
      class: 'pbu-file-input',
      'aria-hidden': 'true',
      tabindex: '-1',
    });
    const loaderOverlay = createTag('div', { class: 'pbu-loader-overlay hidden', 'aria-hidden': 'true' });
    inner.append(label);
    dropzone.append(inner, fileInput, loaderOverlay);
    return dropzone;
  }

  buildPromptWrap() {
    const ph = this.workflowCfg.placeholder;
    const promptWrap = createTag('div', { class: 'pbu-prompt-wrap' });
    const inpField = createTag('textarea', {
      id: 'pbuPromptInput',
      class: 'inp-field',
      placeholder: ph['placeholder-prompt'] || '',
      'aria-label': ph['placeholder-prompt'] || 'Enter prompt',
    });
    promptWrap.append(inpField);
    return promptWrap;
  }

  buildActionRow(aspects) {
    const ph = this.workflowCfg.placeholder;
    const actionRow = createTag('div', { class: 'pbu-action-row' });
    const modelDropdownItems = this.modelDropdown();
    if (modelDropdownItems.length > 1) {
      const modelsContainer = createTag('div', { class: 'models-container', 'aria-label': 'Model options' });
      modelsContainer.append(...modelDropdownItems);
      actionRow.append(modelsContainer);
    }
    const aspectContainer = createTag('div', { class: 'aspect-ratios-container', 'aria-label': 'Aspect ratio options' });
    if (aspects && aspects.length > 0) {
      const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
      const firstRatio = aspects[0];
      if (this.workflowCfg.targetCfg) this.workflowCfg.targetCfg.selectedAspectRatio = firstRatio.value;
      const selectedElement = createTag('button', {
        class: 'selected-aspect-ratio',
        'aria-expanded': 'false',
        'aria-controls': 'aspect-ratio-menu',
        'aria-label': 'aspect ratio',
        'aria-haspopup': 'listbox',
        role: 'combobox',
      }, `${firstRatio.label}`);
      selectedElement.append(menuIcon);
      const listItems = createTag('ul', {
        class: 'aspect-ratio-list verb-list',
        id: 'aspect-ratio-menu',
        role: 'listbox',
      });
      listItems.setAttribute('style', 'display: none;');
      const handleDocumentClick = (e) => {
        if (!aspectContainer.contains(e.target)) {
          document.removeEventListener('click', handleDocumentClick);
          aspectContainer.classList.remove('show-menu');
          selectedElement.setAttribute('aria-expanded', 'false');
        }
      };
      selectedElement.addEventListener('click', (e) => {
        e.stopPropagation();
        aspectContainer.classList.toggle('show-menu');
        selectedElement.setAttribute('aria-expanded', aspectContainer.classList.contains('show-menu') ? 'true' : 'false');
        if (aspectContainer.classList.contains('show-menu')) document.addEventListener('click', handleDocumentClick);
      }, true);
      const fragment = document.createDocumentFragment();
      aspects.forEach((ratio, idx) => {
        const listItem = createTag('li', { class: idx === 0 ? 'verb-item selected' : 'verb-item', role: 'presentation' });
        const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
        const link = createTag('a', {
          href: '#',
          class: 'verb-link',
          'aria-selected': idx === 0 ? 'true' : 'false',
          role: 'option',
          'data-ratio-value': ratio.value,
        }, ratio.label);
        link.prepend(selectedIcon);
        listItem.append(link);
        fragment.append(listItem);
      });
      listItems.append(fragment);
      listItems.addEventListener('click', (e) => {
        const link = e.target.closest('.verb-link');
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        listItems.querySelectorAll('.verb-item').forEach((item) => {
          item.classList.remove('selected');
          item.querySelector('.verb-link')?.setAttribute('aria-selected', 'false');
        });
        link.parentElement.classList.add('selected');
        link.setAttribute('aria-selected', 'true');
        const ratioValue = link.getAttribute('data-ratio-value');
        if (this.workflowCfg.targetCfg) this.workflowCfg.targetCfg.selectedAspectRatio = ratioValue;
        const cloned = link.cloneNode(true);
        cloned.querySelector('.selected-icon')?.remove();
        selectedElement.replaceChildren(cloned.textContent, menuIcon.cloneNode(true));
        aspectContainer.classList.remove('show-menu');
        selectedElement.setAttribute('aria-expanded', 'false');
        selectedElement.focus();
      });
      aspectContainer.append(selectedElement, listItems);
    }
    actionRow.append(aspectContainer);
    const moreBtn = createTag('a', {
      href: '#',
      class: 'unity-act-btn more-btn',
      'aria-label': ph['placeholder-more-btn'] || 'More',
    }, ph['placeholder-more-btn'] || 'More');
    const genBtn = createTag('a', {
      href: '#',
      class: 'unity-act-btn gen-btn',
      'aria-label': ph['placeholder-generate'] || 'Generate',
    });
    const genBtnTxt = createTag('div', { class: 'btn-txt' }, ph['placeholder-generate'] || 'Generate');
    genBtn.append(genBtnTxt);
    actionRow.append(moreBtn, genBtn);
    return actionRow;
  }

  async loadModels() {
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const modelFile = `${baseUrl}/unity/configs/prompt/model-picker.json`;
    const results = await fetch(modelFile);
    if (!results.ok) throw new Error('Failed to fetch models.');
    const modelJson = await results.json();
    this.models = modelJson?.content?.data;
  }

  async getModel() {
    if (!this.hasModelOptions) return [];
    try {
      if (!this.models || Object.keys(this.models).length === 0) await this.loadModels();
      if (this.models && this.models.length > 0) {
        const firstModel = this.models[0];
        this.selectedModelId = firstModel.id;
        this.selectedModelVersion = firstModel.version;
        this.selectedModelModule = firstModel.module;
      }
      return this.models;
    } catch (e) {
      window.lana?.log(`Message: Error loading models, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  async loadAspectRatios(modelId) {
    try {
      const { origin } = window.location;
      const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
        ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
        : origin;
      const aspectFile = `${baseUrl}/unity/configs/prompt/aspect-ratio.json`;
      const results = await fetch(aspectFile);
      if (!results.ok) throw new Error('Failed to fetch aspect ratios.');
      const json = await results.json();
      const data = json?.content?.data || [];
      return data
        .filter((row) => row.model === modelId)
        .map((row) => ({ label: row.label, value: row.value }));
    } catch (e) {
      window.lana?.log(`Message: Error loading aspect ratios, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  modelDropdown() {
    if (!this.hasModelOptions || !this.models) return [];
    const { models } = this;
    if (!Array.isArray(models) || models.length === 0) return [];
    const selectedModelType = models[0].id;
    const selectedModelVersion = models[0].version;
    const selectedModelModule = models[0].module;
    const nameContainer = createTag('span', { class: 'model-name' }, models[0].name.trim());
    const selectedElement = createTag('button', {
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'model-menu',
      'aria-label': 'model type',
      'aria-haspopup': 'listbox',
      role: 'combobox',
      'aria-labelledby': 'listbox-label',
      'data-selected-model-id': selectedModelType,
      'data-selected-model-version': selectedModelVersion,
      'data-selected-model-module': selectedModelModule,
    }, `<img src="${models[0].icon}" alt="" />${nameContainer.outerHTML}`);
    this.selectedModelModule = selectedModelModule;
    this.selectedModelId = selectedModelType;
    this.selectedModelVersion = selectedModelVersion;
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const listItems = createTag('ul', { class: 'verb-list', id: 'model-menu', role: 'listbox', 'aria-labelledby': 'listbox-label' });
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
      const menuContainer = selectedElement.parentElement;
      menuContainer.classList.toggle('show-menu');
      selectedElement.setAttribute('aria-expanded', menuContainer.classList.contains('show-menu') ? 'true' : 'false');
      if (menuContainer.classList.contains('show-menu')) document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const menuContainer = selectedElement.parentElement;
        menuContainer.classList.toggle('show-menu');
        selectedElement.setAttribute('aria-expanded', menuContainer.classList.contains('show-menu') ? 'true' : 'false');
      }
      if (e.key === 'Escape') {
        selectedElement.parentElement.classList?.remove('show-menu');
        selectedElement.focus();
      }
    });
    const fragment = document.createDocumentFragment();
    models.forEach((model, idx) => {
      const listItem = createTag('li', { class: idx === 0 ? 'verb-item selected' : 'verb-item', role: 'presentation' });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const modelName = createTag('span', { class: 'model-name' }, model.name.trim());
      const link = createTag('a', {
        href: '#',
        class: 'verb-link model-link',
        'data-model-module': model.module,
        'data-model-id': model.id,
        'data-model-version': model.version,
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      }, `<img loading="lazy" src="${model.icon}" alt="" />${modelName.outerHTML}`);
      link.prepend(selectedIcon);
      listItem.append(link);
      fragment.append(listItem);
    });
    listItems.append(fragment);
    listItems.addEventListener('click', (e) => {
      const link = e.target.closest('.model-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      listItems.querySelectorAll('.verb-item').forEach((item) => {
        item.classList.remove('selected');
        item.querySelector('.verb-link')?.setAttribute('aria-selected', 'false');
      });
      link.parentElement.classList.add('selected');
      link.setAttribute('aria-selected', 'true');
      this.selectedModelId = link.getAttribute('data-model-id');
      this.selectedModelVersion = link.getAttribute('data-model-version');
      this.selectedModelModule = link.getAttribute('data-model-module');
      selectedElement.dataset.selectedModelId = this.selectedModelId;
      selectedElement.dataset.selectedModelVersion = this.selectedModelVersion;
      const cloned = link.cloneNode(true);
      cloned.querySelector('.selected-icon')?.remove();
      selectedElement.replaceChildren(...cloned.childNodes, menuIcon.cloneNode(true));
      const menuContainer = selectedElement.parentElement;
      menuContainer.classList.remove('show-menu');
      selectedElement.setAttribute('aria-expanded', 'false');
      selectedElement.focus();
    });
    return [selectedElement, listItems];
  }

  addWidget() {
    const interactArea = this.target.querySelector('.copy') || this.target;
    const targetEl = interactArea?.querySelector(this.workflowCfg.targetCfg.target);
    this.widgetWrap.append(this.widget);
    if (targetEl && this.workflowCfg.targetCfg.insert === 'before') targetEl.before(this.widgetWrap);
    else if (targetEl) targetEl.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }
}
