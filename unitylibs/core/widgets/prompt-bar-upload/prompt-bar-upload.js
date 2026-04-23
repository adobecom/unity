/* eslint-disable class-methods-use-this */

import { createTag, getUnityLibs } from '../../../scripts/utils.js';

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
    this.selectedModelId = '';
    this.selectedModelVersion = '';
    this.selectedModelText = '';
    this.selectedAspectRatio = '';
    this.selectedAspectRatioLabel = '';
    this.genBtn = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF' };
    this.uploadedImageAssetId = null;
    this.hasModelOptions = false;
    this.hasAspectRatioOptions = false;
  }

  async initWidget() {
    const widgetWrap = createTag('div', { class: 'ex-unity-wrap' });
    const widget = createTag('div', { class: 'ex-unity-widget' });
    const unitySprite = createTag('div', { class: 'unity-sprite-container' });
    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);

    const ph = this.popPlaceholders();

    this.hasModelOptions = !!this.el.querySelector('[class*="icon-model"]');
    if (this.hasModelOptions) await this.getModel();

    this.hasAspectRatioOptions = !!this.el.querySelector('[class*="icon-aspect"]');
    const firstModelId = this.selectedModelId;
    if (this.hasAspectRatioOptions) await this.getAspectRatios(firstModelId);

    const content = createTag('div', { class: 'ex-pbu-content' });
    const dropzone = this.createDropzone(ph);
    const divider = createTag('div', { class: 'ex-pbu-divider' });
    const right = createTag('div', { class: 'ex-pbu-right' });
    const promptSection = this.createPromptSection(ph);
    const footer = this.createFooterActions(ph);
    right.append(promptSection, footer);
    content.append(dropzone, divider, right);

    const errorHolder = this.createErrorToastShell();

    this.widget.append(content, errorHolder);
    this.widgetWrap.append(this.widget);

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

  async loadAspectRatios() {
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const aspectFile = `${baseUrl}/unity/configs/prompt/aspect-ratio.json`;
    const results = await fetch(aspectFile);
    if (!results.ok) throw new Error('Failed to fetch aspect ratios.');
    const json = await results.json();
    this.aspectRatios = json?.content?.data;
  }

  async getAspectRatios(modelId) {
    if (!this.hasAspectRatioOptions) return [];
    try {
      if (!this.aspectRatios || this.aspectRatios.length === 0) await this.loadAspectRatios();
      const id = modelId || this.selectedModelId;
      return id
        ? (this.aspectRatios || []).filter((item) => item.model === id)
        : (this.aspectRatios || []);
    } catch (e) {
      window.lana?.log(`Message: Error loading aspect ratios, Error: ${e}`, this.lanaOptions);
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
    if (!results.ok) throw new Error('Failed to fetch models.');
    const modelJson = await results.json();
    this.models = modelJson?.content?.data;
  }

  async getModel() {
    if (!this.hasModelOptions) return [];
    try {
      if (!this.models || this.models.length === 0) await this.loadModels();
      if (this.models && this.models.length > 0) {
        const first = this.models[0];
        this.selectedModelId = first.id || '';
        this.selectedModelVersion = first.version || '';
        this.selectedModelText = first.name?.trim() || '';
      }
      return this.models;
    } catch (e) {
      window.lana?.log(`Message: Error loading models, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  createDropzone(ph) {
    const dropzone = createTag('div', {
      class: 'ex-pbu-dropzone',
      role: 'button',
      tabindex: '0',
      'aria-label': ph['placeholder-upload-label'] || 'Upload image',
    });

    const labelRow = createTag('div', { class: 'ex-pbu-dropzone-label' });
    const labelText = createTag('span', { class: 'ex-pbu-dropzone-label-text' });
    labelText.textContent = this.el.querySelector('.icon-upload-label')?.closest('li')?.innerText
      || ph['placeholder-upload-label']
      || 'Upload image';
    const infoIcon = createTag('span', { class: 'ex-pbu-info-icon', 'aria-hidden': 'true' }, '<svg><use xlink:href="#unity-info-icon"></use></svg>');
    labelRow.append(labelText, infoIcon);

    const thumbnail = createTag('div', { class: 'ex-pbu-thumbnail' });
    const uploadBtn = createTag('button', {
      class: 'ex-pbu-upload-btn',
      type: 'button',
      'aria-label': ph['placeholder-upload-label'] || 'Upload image',
    }, '<svg><use xlink:href="#unity-upload-icon"></use></svg>');

    const spinner = createTag('div', { class: 'ex-pbu-spinner', 'aria-hidden': 'true' });
    thumbnail.append(uploadBtn, spinner);

    const fileInput = createTag('input', {
      type: 'file',
      id: 'pbu-file-input',
      accept: 'image/jpeg,image/png,image/webp',
      class: 'ex-pbu-file-input',
      'aria-hidden': 'true',
      tabindex: '-1',
    });

    const triggerUpload = () => fileInput.click();

    uploadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerUpload();
    });
    dropzone.addEventListener('click', (e) => {
      if (e.target === uploadBtn || uploadBtn.contains(e.target)) return;
      triggerUpload();
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerUpload();
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.handleFileSelected(file, dropzone);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.handleFileSelected(file, dropzone);
      fileInput.value = '';
    });

    dropzone.append(labelRow, thumbnail, fileInput);
    return dropzone;
  }

  handleFileSelected(file, dropzone) {
    const thumbnail = dropzone.querySelector('.ex-pbu-thumbnail');
    if (!thumbnail) return;
    thumbnail.classList.add('loading');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = createTag('img', {
        src: ev.target.result,
        alt: '',
        class: 'ex-pbu-preview-img',
      });
      img.onload = () => {
        thumbnail.classList.remove('loading');
        thumbnail.classList.add('has-image');
        const existing = thumbnail.querySelector('.ex-pbu-preview-img');
        if (existing) existing.remove();
        thumbnail.append(img);
        const mockAssetId = `local-${Date.now()}`;
        dropzone.setAttribute('data-asset-id', mockAssetId);
        this.uploadedImageAssetId = mockAssetId;
      };
    };
    reader.readAsDataURL(file);
  }

  createPromptSection(ph) {
    const promptSection = createTag('div', { class: 'ex-pbu-prompt' });
    const label = createTag('label', {
      for: 'pbu-prompt-input',
      class: 'ex-pbu-prompt-label',
    });
    label.textContent = ph['placeholder-prompt'] || 'Prompt';

    const textarea = createTag('textarea', {
      id: 'pbu-prompt-input',
      class: 'inp-field',
      placeholder: ph['placeholder-input'] || '',
      'aria-label': ph['placeholder-prompt'] || 'Prompt',
      rows: '3',
    });

    promptSection.append(label, textarea);
    return promptSection;
  }

  createFooterActions(ph) {
    const footer = createTag('div', { class: 'ex-pbu-footer' });
    const footerLeft = createTag('div', { class: 'ex-pbu-footer-left' });
    const footerRight = createTag('div', { class: 'ex-pbu-footer-right' });

    if (this.hasModelOptions) {
      const modelContainer = createTag('div', { class: 'models-container', 'aria-label': 'Model options' });
      const modelItems = this.modelDropdown();
      if (modelItems.length > 0) modelContainer.append(...modelItems);
      footerLeft.append(modelContainer);
    }

    if (this.hasAspectRatioOptions) {
      const aspectContainer = createTag('div', { class: 'verbs-container', 'aria-label': 'Aspect ratio options', 'data-aspect-container': 'true' });
      const aspectItems = this.aspectRatioDropdown();
      if (aspectItems.length > 0) aspectContainer.append(...aspectItems);
      footerLeft.append(aspectContainer);
    }

    const moreBtn = this.createMoreBtn(ph);
    const genBtnEl = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');

    footerRight.append(moreBtn, genBtnEl);
    footer.append(footerLeft, footerRight);
    return footer;
  }

  modelDropdown() {
    if (!this.hasModelOptions || !this.models || this.models.length === 0) return [];
    const { models } = this;
    const [first] = models;
    const nameContainer = createTag('span', { class: 'model-name' }, first.name?.trim() || '');
    const selectedElement = createTag('button', {
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'pbu-model-menu',
      'aria-label': 'model type',
      'aria-haspopup': 'listbox',
      role: 'combobox',
      'aria-labelledby': 'listbox-label',
      'data-selected-model-id': first.id || '',
      'data-selected-model-version': first.version || '',
    });
    if (first.icon) selectedElement.append(createTag('img', { src: first.icon, alt: '' }));
    selectedElement.append(nameContainer);
    this.selectedModelId = first.id || '';
    this.selectedModelVersion = first.version || '';
    this.selectedModelText = first.name?.trim() || '';
    this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);

    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    selectedElement.append(menuIcon);

    if (models.length <= 1) {
      selectedElement.setAttribute('disabled', 'true');
      return [selectedElement];
    }

    const listItems = createTag('ul', {
      class: 'verb-list',
      id: 'pbu-model-menu',
      role: 'listbox',
      'aria-labelledby': 'listbox-label',
      style: 'display: none;',
    });

    this.buildDropdownItems(models, listItems, selectedElement, menuIcon, false);

    const handleDocumentClick = (e) => {
      const menuContainer = selectedElement.parentElement;
      if (!menuContainer?.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        this.closeVerbOrModelMenu(selectedElement);
      }
    };

    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideAllMenus(selectedElement);
      this.showVerbMenu(selectedElement);
      document.addEventListener('click', handleDocumentClick);
    }, true);

    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.hideAllMenus(selectedElement);
        this.showVerbMenu(selectedElement);
      }
      if (e.key === 'Escape') {
        this.closeVerbOrModelMenu(selectedElement);
        selectedElement.focus();
      }
    });

    return [selectedElement, listItems];
  }

  aspectRatioDropdown() {
    if (!this.hasAspectRatioOptions) return [];
    const ratios = (this.aspectRatios || []).filter((item) => !this.selectedModelId || item.model === this.selectedModelId);
    if (ratios.length === 0) return [];

    const first = ratios[0];
    this.selectedAspectRatio = first.id || '';
    this.selectedAspectRatioLabel = first.label || first.id || '';
    this.widgetWrap?.setAttribute('data-selected-aspect-ratio', this.selectedAspectRatio);

    const selectedElement = createTag('button', {
      class: 'selected-verb',
      'aria-expanded': 'false',
      'aria-controls': 'pbu-aspect-menu',
      'aria-label': 'aspect ratio',
      'aria-haspopup': 'listbox',
      role: 'combobox',
      'data-selected-aspect': this.selectedAspectRatio,
    });
    if (first.icon) selectedElement.append(createTag('img', { src: first.icon, alt: '' }));
    selectedElement.append(document.createTextNode(this.selectedAspectRatioLabel));

    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    selectedElement.append(menuIcon);

    if (ratios.length <= 1) {
      selectedElement.setAttribute('disabled', 'true');
      return [selectedElement];
    }

    const listItems = createTag('ul', {
      class: 'verb-list',
      id: 'pbu-aspect-menu',
      role: 'listbox',
      'aria-labelledby': 'listbox-label',
      style: 'display: none;',
    });

    this.buildDropdownItems(ratios, listItems, selectedElement, menuIcon, true);

    const handleDocumentClick = (e) => {
      const menuContainer = selectedElement.parentElement;
      if (!menuContainer?.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        this.closeVerbOrModelMenu(selectedElement);
      }
    };

    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideAllMenus(selectedElement);
      this.showVerbMenu(selectedElement);
      document.addEventListener('click', handleDocumentClick);
    }, true);

    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.hideAllMenus(selectedElement);
        this.showVerbMenu(selectedElement);
      }
      if (e.key === 'Escape') {
        this.closeVerbOrModelMenu(selectedElement);
        selectedElement.focus();
      }
    });

    return [selectedElement, listItems];
  }

  buildDropdownItems(items, listContainer, selectedElement, menuIcon, isAspect) {
    const fragment = document.createDocumentFragment();
    items.forEach((item, idx) => {
      const listItem = createTag('li', { class: 'verb-item', role: 'presentation' });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const link = createTag('a', {
        href: '#',
        class: isAspect ? 'verb-link' : 'verb-link model-link',
        'data-id': item.id || '',
        ...(isAspect
          ? { 'data-aspect-label': item.label || item.id || '' }
          : {
            'data-model-id': item.id || '',
            'data-model-version': item.version || '',
          }),
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      });
      if (item.icon) link.append(createTag('img', { loading: 'lazy', src: item.icon, alt: '' }));
      const labelText = isAspect ? (item.label || item.id || '') : (item.name?.trim() || '');
      if (!isAspect) {
        link.append(createTag('span', { class: 'model-name' }, labelText));
      } else {
        link.append(document.createTextNode(labelText));
      }
      if (idx === 0) listItem.classList.add('selected');
      link.prepend(selectedIcon);
      listItem.append(link);
      fragment.append(listItem);
    });
    listContainer.append(fragment);

    listContainer.addEventListener('click', (e) => {
      const link = e.target.closest('.verb-link');
      if (!link) return;
      this.handleDropdownItemClick(link, listContainer, selectedElement, menuIcon, isAspect)(e);
    });
  }

  handleDropdownItemClick(link, container, selectedElement, menuIcon, isAspect) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.querySelectorAll('.verb-link').forEach((l) => {
        l.parentElement.classList.remove('selected');
        l.setAttribute('aria-selected', 'false');
      });
      link.parentElement.classList.add('selected');
      link.setAttribute('aria-selected', 'true');
      this.closeVerbOrModelMenu(selectedElement);

      if (isAspect) {
        this.selectedAspectRatio = link.getAttribute('data-id') || '';
        this.selectedAspectRatioLabel = link.getAttribute('data-aspect-label') || this.selectedAspectRatio;
        selectedElement.setAttribute('data-selected-aspect', this.selectedAspectRatio);
        const copiedNodes = [];
        const imgEl = link.querySelector('img');
        if (imgEl) copiedNodes.push(imgEl.cloneNode(true));
        copiedNodes.push(document.createTextNode(this.selectedAspectRatioLabel));
        selectedElement.replaceChildren(...copiedNodes, menuIcon);
        this.widgetWrap?.setAttribute('data-selected-aspect-ratio', this.selectedAspectRatio);
      } else {
        const newModelId = link.getAttribute('data-model-id') || '';
        const newModelVersion = link.getAttribute('data-model-version') || '';
        const newModelName = link.querySelector('.model-name')?.textContent?.trim() || '';
        this.selectedModelId = newModelId;
        this.selectedModelVersion = newModelVersion;
        this.selectedModelText = newModelName;
        selectedElement.setAttribute('data-selected-model-id', newModelId);
        selectedElement.setAttribute('data-selected-model-version', newModelVersion);
        const imgEl = link.querySelector('img');
        const newNodes = [];
        if (imgEl) newNodes.push(imgEl.cloneNode(true));
        newNodes.push(createTag('span', { class: 'model-name' }, newModelName));
        selectedElement.replaceChildren(...newNodes, menuIcon);
        this.widgetWrap?.setAttribute('data-selected-model-id', newModelId);
        this.widgetWrap?.setAttribute('data-selected-model-version', newModelVersion);
        this.updateAspectRatioDropdown();
      }
      selectedElement.focus();
    };
  }

  updateAspectRatioDropdown() {
    if (!this.widgetWrap) return;
    const aspectContainer = this.widgetWrap.querySelector('[data-aspect-container="true"]');
    if (!aspectContainer) return;
    const newItems = this.aspectRatioDropdown();
    aspectContainer.replaceChildren(...newItems);
  }

  showVerbMenu(selectedElement) {
    const menuContainer = selectedElement.parentElement;
    this.widgetWrap?.querySelectorAll('.verbs-container, .models-container').forEach((container) => {
      if (container !== menuContainer) {
        container.classList.remove('show-menu');
        container.querySelector('.selected-verb, .selected-model')?.setAttribute('aria-expanded', 'false');
      }
    });
    menuContainer.classList.toggle('show-menu');
    selectedElement.setAttribute('aria-expanded', menuContainer.classList.contains('show-menu') ? 'true' : 'false');
    if (selectedElement.nextElementSibling?.hasAttribute('style')) {
      selectedElement.nextElementSibling.removeAttribute('style');
    }
  }

  closeVerbOrModelMenu(selectedElement) {
    const menuContainer = selectedElement.parentElement;
    if (!menuContainer) return;
    menuContainer.classList.remove('show-menu');
    selectedElement.setAttribute('aria-expanded', 'false');
  }

  hideAllMenus(exceptEl) {
    if (!this.widgetWrap) return;
    this.widgetWrap.querySelectorAll('.verbs-container, .models-container').forEach((container) => {
      const btn = container.querySelector('.selected-verb, .selected-model');
      if (btn && btn !== exceptEl) {
        container.classList.remove('show-menu');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  createMoreBtn(ph) {
    const moreLi = this.el.querySelector('.icon-more')?.closest('li');
    const moreUrl = moreLi?.querySelector('a')?.href || 'https://firefly.adobe.com';
    const moreText = moreLi?.querySelector('a')?.innerText?.trim()
      || moreLi?.innerText?.trim()
      || ph['placeholder-more']
      || 'More';
    const btn = createTag('a', {
      href: moreUrl,
      class: 'unity-act-btn ex-pbu-more-btn',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    btn.textContent = moreText;
    return btn;
  }

  createActBtn(cfg, cls) {
    if (!cfg) return createTag('a', { href: '#', class: `unity-act-btn ${cls}` });
    const txt = cfg.innerText?.trim();
    const img = cfg.querySelector('img[src*=".svg"]');
    const btn = createTag('a', {
      href: '#',
      class: `unity-act-btn ${cls}`,
      'daa-ll': 'Generate',
      'aria-label': txt?.split('\n')[0] || 'Generate',
    });
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

  createErrorToastShell() {
    const errorHolder = createTag('div', { class: 'ex-pbu-error-holder' });
    const alertImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/alert.svg` });
    const closeImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/close.svg` });
    const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, ''));
    const alertIcon = createTag('div', { class: 'alert-icon' });
    alertIcon.append(alertImg, alertText);
    const alertClose = createTag('a', { class: 'alert-close', href: '#' });
    alertClose.append(closeImg, createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
    const alertContent = createTag('div', { class: 'alert-content' });
    alertContent.append(alertIcon, alertClose);
    const alertToast = createTag('div', { class: 'alert-toast' }, alertContent);
    errorHolder.append(alertToast);

    const closeToast = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideErrorToast();
    };
    alertClose.addEventListener('click', closeToast);
    alertClose.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') closeToast(e);
    });

    return errorHolder;
  }

  showErrorToast(errorType, err) {
    if (!this.widget) return;
    const errorHolder = this.widget.querySelector('.ex-pbu-error-holder');
    if (!errorHolder) return;
    const lang = document.querySelector('html').getAttribute('lang');
    const msgEl = lang !== 'ja-JP'
      ? this.el.querySelector(errorType)?.nextSibling
      : this.el.querySelector(errorType)?.parentElement;
    const msg = msgEl?.textContent || '';
    const alertText = errorHolder.querySelector('.alert-text p');
    if (alertText) alertText.textContent = msg;
    errorHolder.classList.add('show');
    if (err) window.lana?.log(`Message: ${msg}, Error: ${err}`, this.lanaOptions);
  }

  hideErrorToast() {
    if (!this.widget) return;
    const errorHolder = this.widget.querySelector('.ex-pbu-error-holder');
    errorHolder?.classList.remove('show');
  }
}
