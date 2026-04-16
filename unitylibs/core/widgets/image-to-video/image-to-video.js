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
    this.aspectRatios = null;
    this.selectedModelId = '';
    this.selectedModelVersion = '';
    this.selectedAspectRatio = '';
    this.uploadedFile = null;
    this.genBtn = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF' };
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

  async loadAspectRatios() {
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const arFile = `${baseUrl}/unity/configs/prompt/aspect-ratio.json`;
    const results = await fetch(arFile);
    if (!results.ok) {
      throw new Error('Failed to fetch aspect ratios.');
    }
    const arJson = await results.json();
    this.aspectRatios = arJson?.content?.data;
  }

  handleFileSelected(file) {
    this.uploadedFile = file;
    const objectUrl = URL.createObjectURL(file);
    const thumb = this.widgetWrap.querySelector('.itv-dz-thumb');
    if (thumb) {
      thumb.style.backgroundImage = `url(${objectUrl})`;
    }
    this.widgetWrap.dataset.itvHasUpload = 'true';
  }

  buildDropzone() {
    const labelText = this.el.querySelector('.icon-placeholder-input')?.closest('li')?.innerText || 'Upload image';
    const dropzone = createTag('div', { class: 'itv-dropzone' });
    const label = createTag('label', { class: 'itv-dz-label' }, labelText);
    const thumb = createTag('div', { class: 'itv-dz-thumb' });
    thumb.innerHTML = '<svg><use xlink:href="#unity-upload-icon"></use></svg>';
    const fileInput = createTag('input', { type: 'file', accept: 'image/*', style: 'display:none' });

    thumb.addEventListener('click', () => fileInput.click());

    thumb.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    thumb.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        this.handleFileSelected(file);
      }
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file && file.type.startsWith('image/')) {
        this.handleFileSelected(file);
      }
    });

    dropzone.append(label, thumb, fileInput);
    return dropzone;
  }

  buildPromptField() {
    const promptDiv = createTag('div', { class: 'itv-prompt' });
    const hasPromptLabel = this.el.querySelector('.icon-placeholder-prompt-label');
    const labelText = hasPromptLabel ? hasPromptLabel.closest('li')?.innerText : 'Prompt';
    const label = createTag('label', {}, labelText || 'Prompt');
    const placeholderText = this.el.querySelector('.icon-placeholder-input')?.closest('li')?.innerText || '';
    const textarea = createTag('textarea', { class: 'inp-field', placeholder: placeholderText });
    promptDiv.append(label, textarea);
    return promptDiv;
  }

  buildModelSelector() {
    if (!this.models || this.models.length === 0) return createTag('div', { class: 'itv-model-container' });

    const firstModel = this.models[0];
    this.selectedModelId = firstModel.id;
    this.selectedModelVersion = firstModel.version;
    this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);

    const container = createTag('div', { class: 'itv-model-container' });
    const modelsContainer = createTag('div', { class: 'models-container' });

    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const selectedBtn = createTag('button', { class: 'selected-model' }, firstModel.name);
    selectedBtn.append(menuIcon);

    const verbList = createTag('ul', { class: 'verb-list' });

    this.models.forEach((model) => {
      const li = createTag('li', { class: 'verb-item' });
      li.textContent = model.name;
      li.addEventListener('click', () => {
        this.selectedModelId = model.id;
        this.selectedModelVersion = model.version;
        this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
        this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);
        selectedBtn.textContent = model.name;
        selectedBtn.append(menuIcon);
        modelsContainer.classList.remove('show-menu');
        this.updateAspectRatios(model.id);
      });
      verbList.append(li);
    });

    const handleDocumentClick = (e) => {
      if (!modelsContainer.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        modelsContainer.classList.remove('show-menu');
      }
    };

    selectedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideAllDropdowns();
      modelsContainer.classList.toggle('show-menu');
      if (modelsContainer.classList.contains('show-menu')) {
        document.addEventListener('click', handleDocumentClick);
      }
    });

    modelsContainer.append(selectedBtn, verbList);
    container.append(modelsContainer);
    return container;
  }

  buildAspectRatioSelector() {
    const container = createTag('div', { class: 'itv-aspect-container' });

    const firstModelId = this.models?.[0]?.id || '';
    const filtered = (this.aspectRatios || []).filter((item) => item.model === firstModelId);
    this.selectedAspectRatio = filtered[0]?.ratio || '';
    this.widgetWrap.dataset.selectedAspectRatio = this.selectedAspectRatio;

    const firstLabel = filtered[0]?.label || '';
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const selectedBtn = createTag('button', { class: 'selected-aspect' }, firstLabel);
    selectedBtn.append(menuIcon);

    const aspectList = createTag('ul', { class: 'aspect-list' });

    filtered.forEach((item) => {
      const li = createTag('li', {});
      li.textContent = item.label;
      li.addEventListener('click', () => {
        this.selectedAspectRatio = item.ratio;
        this.widgetWrap.dataset.selectedAspectRatio = this.selectedAspectRatio;
        selectedBtn.textContent = item.label;
        selectedBtn.append(menuIcon);
        container.classList.remove('show-menu');
      });
      aspectList.append(li);
    });

    const handleDocumentClick = (e) => {
      if (!container.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        container.classList.remove('show-menu');
      }
    };

    selectedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideAllDropdowns();
      container.classList.toggle('show-menu');
      if (container.classList.contains('show-menu')) {
        document.addEventListener('click', handleDocumentClick);
      }
    });

    container.append(selectedBtn, aspectList);
    return container;
  }

  updateAspectRatios(modelId) {
    const filtered = (this.aspectRatios || []).filter((item) => item.model === modelId);
    this.selectedAspectRatio = filtered[0]?.ratio || '';
    this.widgetWrap.dataset.selectedAspectRatio = this.selectedAspectRatio;

    const container = this.widgetWrap.querySelector('.itv-aspect-container');
    if (!container) return;

    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const firstLabel = filtered[0]?.label || '';
    const selectedBtn = createTag('button', { class: 'selected-aspect' }, firstLabel);
    selectedBtn.append(menuIcon);

    const aspectList = createTag('ul', { class: 'aspect-list' });

    filtered.forEach((item) => {
      const li = createTag('li', {});
      li.textContent = item.label;
      li.addEventListener('click', () => {
        this.selectedAspectRatio = item.ratio;
        this.widgetWrap.dataset.selectedAspectRatio = this.selectedAspectRatio;
        selectedBtn.textContent = item.label;
        selectedBtn.append(menuIcon);
        container.classList.remove('show-menu');
      });
      aspectList.append(li);
    });

    const handleDocumentClick = (e) => {
      if (!container.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        container.classList.remove('show-menu');
      }
    };

    selectedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideAllDropdowns();
      container.classList.toggle('show-menu');
      if (container.classList.contains('show-menu')) {
        document.addEventListener('click', handleDocumentClick);
      }
    });

    container.replaceChildren(selectedBtn, aspectList);
  }

  buildMoreButton() {
    const moreUrl = this.el.querySelector('.icon-more-url')?.closest('li')?.innerText?.trim() || 'https://firefly.adobe.com';
    this.widgetWrap.dataset.moreFiltersUrl = moreUrl;
    const btn = createTag('a', { class: 'itv-more-btn', href: moreUrl });
    const moreEl = this.el.querySelector('.icon-more-url')?.closest('li');
    btn.textContent = moreEl?.querySelector('a')?.textContent?.trim() || 'More';
    return btn;
  }

  buildGenerateBtn() {
    const cfg = this.el.querySelector('.icon-generate')?.closest('li');
    return this.createActBtn(cfg, 'gen-btn');
  }

  createActBtn(cfg, cls) {
    if (!cfg) return null;
    const txt = cfg.innerText?.trim();
    const img = cfg.querySelector('img[src*=".svg"]');
    const btn = createTag('a', { href: '#', class: `unity-act-btn ${cls}` });
    if (img) btn.append(createTag('div', { class: 'btn-ico' }, img));
    if (txt) btn.append(createTag('div', { class: 'btn-txt' }, txt.split('\n')[0]));
    this.genBtn = btn;
    return btn;
  }

  showVerbMenu(selectedElement) {
    const menuContainer = selectedElement.parentElement;
    document.querySelectorAll('.models-container').forEach((container) => {
      if (container !== menuContainer) container.classList.remove('show-menu');
    });
    menuContainer.classList.toggle('show-menu');
  }

  hideAllDropdowns() {
    this.widgetWrap?.querySelectorAll('.models-container.show-menu, .itv-aspect-container.show-menu').forEach((el) => {
      el.classList.remove('show-menu');
    });
  }

  addWidget() {
    const interactArea = this.target.querySelector('.copy');
    const para = interactArea?.querySelector(this.workflowCfg.targetCfg.target);
    this.widgetWrap.append(this.widget);
    if (para && this.workflowCfg.targetCfg.insert === 'before') para.before(this.widgetWrap);
    else if (para) para.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }

  async initWidget() {
    const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
      .map((c) => createTag('div', { class: c }));
    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);

    await this.loadModels();
    await this.loadAspectRatios();

    const dropzone = this.buildDropzone();
    const promptField = this.buildPromptField();
    const modelSelector = this.buildModelSelector();
    const aspectRatioSelector = this.buildAspectRatioSelector();
    const moreBtn = this.buildMoreButton();
    const generateBtn = this.buildGenerateBtn();

    const divider = createTag('div', { class: 'itv-divider' });
    const footer = createTag('div', { class: 'itv-footer' });
    footer.append(modelSelector, aspectRatioSelector, moreBtn);
    if (generateBtn) footer.append(generateBtn);

    const contentStack = createTag('div', { class: 'itv-content-stack' });
    contentStack.append(promptField, footer);

    const panel = createTag('div', { class: 'itv-panel' });
    panel.append(dropzone, divider, contentStack);

    this.widget.append(panel);
    this.widgetWrap.append(this.widget);
    this.addWidget();

    return this.workflowCfg.targetCfg.actionMap;
  }
}
