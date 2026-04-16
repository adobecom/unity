import { createTag } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.spriteCon = spriteCon;
    this.widget = null;
    this.widgetWrap = null;
    this.actionMap = {};
    this.models = null;
    this.aspectRatios = null;
    this.selectedModel = '';
    this.selectedModelVersion = '';
    this.selectedAspectRatio = '';
    this.uploadedFile = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-IV' };
  }

  async initWidget() {
    const widgetWrap = createTag('div', { class: 'ex-unity-wrap' });
    const widget = createTag('div', { class: 'ex-unity-widget iv-widget' });
    this.widgetWrap = widgetWrap;
    this.widget = widget;

    this.workflowCfg.placeholder = this.popPlaceholders();
    const ph = this.workflowCfg.placeholder;

    const hasModels = !!this.el.querySelector('[class*="icon-model"]');
    const hasAspectRatios = !!this.el.querySelector('.icon-aspect-ratio');

    if (hasModels) await this.loadModels();
    if (hasAspectRatios) await this.loadAspectRatios();

    const dropzone = this.buildDropzone(ph);
    const promptBar = this.buildPromptBar(ph);

    const selectorsRow = createTag('div', { class: 'iv-selectors-row' });
    if (this.models && this.models.length > 0) {
      const modelSelector = this.buildModelSelector();
      selectorsRow.append(modelSelector);
    }
    if (this.aspectRatios && this.aspectRatios.length > 0) {
      const firstModelId = this.selectedModel || (this.models?.[0]?.id ?? '');
      const arSelector = this.buildAspectRatioSelector(firstModelId);
      selectorsRow.append(arSelector);
    }

    const actionRow = this.buildActionRow(ph);

    widget.append(dropzone, promptBar, selectorsRow, actionRow);
    widgetWrap.append(widget);

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

  async loadModels() {
    try {
      const { origin } = window.location;
      const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
        ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
        : origin;
      const modelEl = this.el.querySelector('[class*="icon-model"]');
      const modelHref = modelEl?.querySelector('a')?.href;
      const modelUrl = modelHref || `${baseUrl}/unity/configs/prompt/model-picker.json`;
      const res = await fetch(modelUrl);
      if (!res.ok) throw new Error('Failed to fetch models.');
      const json = await res.json();
      this.models = json?.content?.data || json?.data || [];
    } catch (e) {
      window.lana?.log(`Message: Error loading models, Error: ${e}`, this.lanaOptions);
      this.models = [];
    }
  }

  async loadAspectRatios() {
    try {
      const arEl = this.el.querySelector('.icon-aspect-ratio');
      const arHref = arEl?.querySelector('a')?.href || arEl?.closest('li')?.querySelector('a')?.href;
      if (!arHref) {
        this.aspectRatios = [];
        return;
      }
      const res = await fetch(arHref);
      if (!res.ok) throw new Error('Failed to fetch aspect ratios.');
      const json = await res.json();
      this.aspectRatios = json?.content?.data || json?.data || [];
    } catch (e) {
      window.lana?.log(`Message: Error loading aspect ratios, Error: ${e}`, this.lanaOptions);
      this.aspectRatios = [];
    }
  }

  buildDropzone(ph) {
    const dropzone = createTag('div', { class: 'iv-dropzone', role: 'button', tabindex: '0', 'aria-label': ph['placeholder-dropzone'] || 'Upload image' });
    const input = createTag('input', { type: 'file', class: 'dz-input', accept: 'image/*', 'aria-hidden': 'true', tabindex: '-1' });
    const uploadIcon = createTag('div', { class: 'dz-icon' }, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true"><path d="M11 14.586V4a1 1 0 0 1 2 0v10.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 1.414-1.414L11 14.586zM20 17a1 1 0 0 1 2 0v2a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-2a1 1 0 0 1 2 0v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2z" fill="currentColor"/></svg>`);
    const placeholderText = createTag('span', { class: 'dz-text' }, ph['placeholder-dropzone'] || 'Drag and drop or click to upload');
    const loader = createTag('div', { class: 'dz-loader' }, '<div class="dz-spinner"></div>');
    const preview = createTag('img', { class: 'dz-preview', alt: '' });

    dropzone.append(input, uploadIcon, placeholderText, loader, preview);

    const processFile = (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      this.uploadedFile = file;
      if (this.widgetWrap) this.widgetWrap._ivUploadedFile = file;
      dropzone.classList.add('loading');
      dropzone.classList.remove('drag-over', 'preview-ready');
      const url = URL.createObjectURL(file);
      preview.onload = () => {
        dropzone.classList.remove('loading');
        dropzone.classList.add('preview-ready');
        preview.src = url;
      };
      preview.src = url;
    };

    dropzone.addEventListener('click', (e) => {
      if (e.target === input) return;
      input.click();
    });

    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });

    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = '';
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) processFile(file);
    });

    return dropzone;
  }

  buildPromptBar(ph) {
    const promptBar = createTag('div', { class: 'iv-prompt-bar' });
    const textarea = createTag('textarea', {
      class: 'inp-field',
      placeholder: ph['placeholder-input'] || 'Describe your animation',
      'aria-label': ph['placeholder-input'] || 'Describe your animation',
      rows: '3',
    });
    promptBar.append(textarea);
    return promptBar;
  }

  buildModelSelector() {
    if (!this.models || this.models.length === 0) return createTag('div', { class: 'iv-model-selector' });

    const firstModel = this.models[0];
    this.selectedModel = firstModel.id || '';
    this.selectedModelVersion = firstModel.version || '';
    this.widgetWrap.dataset.selectedModelId = this.selectedModel;
    this.widgetWrap.dataset.selectedModelVersion = this.selectedModelVersion;

    const container = createTag('div', { class: 'iv-model-selector models-container', 'aria-label': 'Model options' });
    const nameSpan = createTag('span', { class: 'model-name' }, firstModel.name?.trim() || '');
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6" width="10" height="10" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>');
    const selectedBtn = createTag('button', {
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'iv-model-menu',
      'aria-label': 'model type',
      'aria-haspopup': 'listbox',
      role: 'combobox',
      'data-selected-model-id': this.selectedModel,
      'data-selected-model-version': this.selectedModelVersion,
    });
    if (firstModel.icon) selectedBtn.append(createTag('img', { src: firstModel.icon, alt: '', loading: 'lazy', width: '22', height: '22' }));
    selectedBtn.append(nameSpan, menuIcon);

    const list = createTag('ul', {
      class: 'verb-list',
      id: 'iv-model-menu',
      role: 'listbox',
      'aria-labelledby': 'iv-model-menu',
      style: 'display:none',
    });

    this.models.forEach((model, idx) => {
      const li = createTag('li', { class: `verb-item${idx === 0 ? ' selected' : ''}`, role: 'presentation' });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 10" width="12" height="12" aria-hidden="true"><path d="M1 5l4 4L11 1" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      const modelName = createTag('span', { class: 'model-name' }, model.name?.trim() || '');
      const link = createTag('a', {
        href: '#',
        class: 'verb-link model-link',
        'data-model-id': model.id || '',
        'data-model-version': model.version || '',
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      });
      if (model.icon) link.append(createTag('img', { src: model.icon, alt: '', loading: 'lazy', width: '22', height: '22' }));
      link.append(selectedIcon, modelName);
      li.append(link);
      list.append(li);
    });

    const handleDocumentClick = (e) => {
      if (!container.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        container.classList.remove('show-menu');
        selectedBtn.setAttribute('aria-expanded', 'false');
      }
    };

    selectedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = container.classList.toggle('show-menu');
      selectedBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) document.addEventListener('click', handleDocumentClick);
      else document.removeEventListener('click', handleDocumentClick);
    });

    selectedBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectedBtn.click();
      }
      if (e.key === 'Escape') {
        container.classList.remove('show-menu');
        selectedBtn.setAttribute('aria-expanded', 'false');
        selectedBtn.focus();
      }
    });

    list.addEventListener('click', (e) => {
      const link = e.target.closest('.verb-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();

      list.querySelectorAll('.verb-item').forEach((item) => {
        item.classList.remove('selected');
        item.querySelector('.verb-link')?.setAttribute('aria-selected', 'false');
      });
      link.closest('.verb-item').classList.add('selected');
      link.setAttribute('aria-selected', 'true');

      const modelId = link.dataset.modelId;
      const modelVersion = link.dataset.modelVersion;
      const modelObj = this.models.find((m) => m.id === modelId);

      this.selectedModel = modelId;
      this.selectedModelVersion = modelVersion;
      this.widgetWrap.dataset.selectedModelId = modelId;
      this.widgetWrap.dataset.selectedModelVersion = modelVersion;

      selectedBtn.dataset.selectedModelId = modelId;
      selectedBtn.dataset.selectedModelVersion = modelVersion;

      const newName = createTag('span', { class: 'model-name' }, modelObj?.name?.trim() || '');
      selectedBtn.innerHTML = '';
      if (modelObj?.icon) selectedBtn.append(createTag('img', { src: modelObj.icon, alt: '', loading: 'lazy', width: '22', height: '22' }));
      selectedBtn.append(newName, menuIcon);

      container.classList.remove('show-menu');
      selectedBtn.setAttribute('aria-expanded', 'false');
      selectedBtn.focus();

      this.updateAspectRatiosForModel(modelId);
    });

    container.append(selectedBtn, list);
    return container;
  }

  buildAspectRatioSelector(modelId) {
    const container = createTag('div', { class: 'iv-ar-selector' });
    const options = this.getAspectRatiosForModel(modelId);
    if (options.length > 0) {
      this.selectedAspectRatio = options[0].value || options[0].label || '';
      this.widgetWrap.dataset.selectedAspectRatio = this.selectedAspectRatio;
    }
    this.renderAspectRatioOptions(container, options);
    return container;
  }

  getAspectRatiosForModel(modelId) {
    if (!this.aspectRatios || this.aspectRatios.length === 0) return [];
    return this.aspectRatios.filter((ar) => !ar.model || ar.model === modelId);
  }

  renderAspectRatioOptions(container, options) {
    container.innerHTML = '';
    options.forEach((ar, idx) => {
      const value = ar.value || ar.label || '';
      const label = ar.label || ar.value || '';
      const btn = createTag('button', {
        class: `iv-ar-option${idx === 0 ? ' selected' : ''}`,
        'data-value': value,
        'aria-pressed': idx === 0 ? 'true' : 'false',
        type: 'button',
      }, label);
      btn.addEventListener('click', () => {
        container.querySelectorAll('.iv-ar-option').forEach((b) => {
          b.classList.remove('selected');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        this.selectedAspectRatio = value;
        this.widgetWrap.dataset.selectedAspectRatio = value;
      });
      container.append(btn);
    });
  }

  updateAspectRatiosForModel(modelId) {
    const arSelector = this.widget.querySelector('.iv-ar-selector');
    if (!arSelector) return;
    const options = this.getAspectRatiosForModel(modelId);
    if (options.length > 0) {
      this.selectedAspectRatio = options[0].value || options[0].label || '';
      this.widgetWrap.dataset.selectedAspectRatio = this.selectedAspectRatio;
    } else {
      this.selectedAspectRatio = '';
      delete this.widgetWrap.dataset.selectedAspectRatio;
    }
    this.renderAspectRatioOptions(arSelector, options);
  }

  buildActionRow(ph) {
    const row = createTag('div', { class: 'iv-action-row' });

    const moreFiltersBtn = createTag('button', {
      class: 'more-filters-btn',
      type: 'button',
    }, ph['placeholder-more-filters'] || ph['more-filters'] || 'More filters');

    const generateBtn = createTag('a', {
      href: '#',
      class: 'gen-btn unity-act-btn',
    }, ph['placeholder-generate'] || ph['generate'] || 'Generate');

    row.append(moreFiltersBtn, generateBtn);
    return row;
  }

  addWidget() {
    const targetCfg = this.workflowCfg.targetCfg;
    const interactArea = this.target.querySelector('.copy') || this.target;
    const para = interactArea?.querySelector(targetCfg.target);
    if (para && targetCfg.insert === 'before') para.before(this.widgetWrap);
    else if (para && targetCfg.insert === 'after') para.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }
}
