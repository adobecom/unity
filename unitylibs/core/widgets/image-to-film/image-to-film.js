/* eslint-disable class-methods-use-this */

import { createTag, unityConfig, getApiCallOptions } from '../../../scripts/utils.js';

const FALLBACK_ASPECT_RATIOS = ['1:1', '4:3', '16:9', '9:16'];

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
    this.selectedModelId = '';
    this.selectedModelVersion = '';
    this.selectedAspectRatio = '';
    this.uploadedFile = null;
    this.errorToastEl = null;
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
    await this.loadModels();

    const dropzone = this.createDropzone();
    const inpWrap = this.createInpWrap();

    this.widget.append(dropzone, inpWrap);
    this.addWidget();
    this.createErrorToast();
    this.bindGenBtn();

    return this.workflowCfg.targetCfg.actionMap;
  }

  popPlaceholders() {
    return Object.fromEntries(
      [...this.el.querySelectorAll('[class*="icon-placeholder-"]')].map((element) => [
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
      const modelFile = `${baseUrl}/unity/configs/prompt/model-picker.json`;
      const results = await fetch(modelFile);
      if (!results.ok) throw new Error('Failed to fetch models.');
      const modelJson = await results.json();
      this.models = modelJson?.content?.data || [];
    } catch (e) {
      window.lana?.log(`Message: Error loading models, Error: ${e}`, this.lanaOptions);
      this.models = [];
    }
  }

  createDropzone() {
    const dropzone = createTag('div', { class: 'itf-dropzone', role: 'button', tabindex: '0', 'aria-label': this.getSlotText('icon-placeholder-dropzone-label') });
    const fileInput = createTag('input', { type: 'file', class: 'itf-file-input', accept: 'image/*', 'aria-hidden': 'true', tabindex: '-1' });
    const skeleton = createTag('div', { class: 'itf-skeleton hidden' });
    const preview = createTag('img', { class: 'itf-preview hidden', alt: '' });
    const label = createTag('p', { class: 'itf-label' }, this.getSlotText('icon-placeholder-dropzone-label'));

    dropzone.append(fileInput, skeleton, preview, label);

    const openFilePicker = () => fileInput.click();
    dropzone.addEventListener('click', (e) => {
      if (e.target === fileInput) return;
      openFilePicker();
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFilePicker();
      }
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('itf-drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('itf-drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('itf-drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.handleFileSelected(file, skeleton, preview, label);
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.handleFileSelected(file, skeleton, preview, label);
    });

    return dropzone;
  }

  handleFileSelected(file, skeleton, preview, label) {
    this.uploadedFile = file;
    skeleton.classList.remove('hidden');
    preview.classList.add('hidden');
    label.classList.add('hidden');
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      skeleton.classList.add('hidden');
      preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  getSlotText(iconClass) {
    const el = this.el.querySelector(`.${iconClass}`);
    return el?.closest('li')?.innerText || '';
  }

  createInpWrap() {
    const inpWrap = createTag('div', { class: 'inp-wrap' });
    const ph = this.workflowCfg.placeholder || {};
    const inpField = createTag('textarea', {
      id: 'itfPromptInput',
      class: 'inp-field',
      placeholder: ph['placeholder-input'] || '',
      'aria-label': ph['placeholder-input'] || '',
    });
    inpField.setAttribute('data-event-bound', 'true');

    const actionContainer = createTag('div', { class: 'action-container' });

    const itfBtnWrap = createTag('div', { class: 'itf-btn-wrap' });
    const moreBtn = this.createMoreBtn();
    const genBtn = this.createGenBtn();
    itfBtnWrap.append(moreBtn, genBtn);

    if (this.models && this.models.length > 0) {
      const modelDropdownEls = this.modelDropdown();
      if (modelDropdownEls.length > 1) {
        const modelsContainer = createTag('div', { class: 'models-container', 'aria-label': 'Model options' });
        modelsContainer.append(...modelDropdownEls);
        actionContainer.append(modelsContainer);
      }

      const aspectRatios = this.getAspectRatiosForCurrentModel();
      if (aspectRatios.length > 0) {
        const aspectContainer = this.createAspectRatioDropdown(aspectRatios);
        actionContainer.append(aspectContainer);
      }
    } else {
      const aspectRatios = FALLBACK_ASPECT_RATIOS;
      const aspectContainer = this.createAspectRatioDropdown(aspectRatios);
      actionContainer.append(aspectContainer);
    }

    actionContainer.append(itfBtnWrap);
    inpWrap.append(inpField, actionContainer);
    return inpWrap;
  }

  getAspectRatiosForCurrentModel() {
    if (!this.models || this.models.length === 0) return FALLBACK_ASPECT_RATIOS;
    const model = this.models.find((m) => m.id === this.selectedModelId) || this.models[0];
    if (model?.aspectRatios) {
      return model.aspectRatios.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return FALLBACK_ASPECT_RATIOS;
  }

  createAspectRatioDropdown(ratios) {
    if (!ratios || ratios.length === 0) return createTag('div', { class: 'aspect-container' });
    const [firstRatio] = ratios;
    this.selectedAspectRatio = firstRatio;
    const aspectContainer = createTag('div', { class: 'aspect-container', style: 'position:relative;' });
    const selectedBtn = createTag('button', {
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-haspopup': 'listbox',
      'aria-label': 'Aspect ratio',
    });
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    selectedBtn.textContent = firstRatio;
    selectedBtn.append(menuIcon);

    const listItems = createTag('ul', { class: 'verb-list', role: 'listbox', 'aria-label': 'Aspect ratio options', style: 'display:none;' });
    ratios.forEach((ratio, idx) => {
      const item = createTag('li', { class: `verb-item${idx === 0 ? ' selected' : ''}`, role: 'presentation' });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const link = createTag('a', {
        href: '#',
        class: 'verb-link',
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      }, ratio);
      link.prepend(selectedIcon);
      item.append(link);
      listItems.append(item);
    });

    const handleDocumentClick = (e) => {
      if (!aspectContainer.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        aspectContainer.classList.remove('show-menu');
        selectedBtn.setAttribute('aria-expanded', 'false');
      }
    };

    selectedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = aspectContainer.classList.toggle('show-menu');
      selectedBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) document.addEventListener('click', handleDocumentClick);
      else document.removeEventListener('click', handleDocumentClick);
    });

    listItems.addEventListener('click', (e) => {
      const link = e.target.closest('.verb-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      listItems.querySelectorAll('.verb-item').forEach((li) => {
        li.classList.remove('selected');
        li.querySelector('.verb-link')?.setAttribute('aria-selected', 'false');
      });
      link.parentElement.classList.add('selected');
      link.setAttribute('aria-selected', 'true');
      this.selectedAspectRatio = link.textContent.trim().replace(/[^\d:]/g, '') || link.textContent.trim();
      selectedBtn.childNodes[0].textContent = link.textContent.replace(/<[^>]*>/g, '').trim().split('\n')[0].trim();
      const textNode = [...selectedBtn.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = this.selectedAspectRatio;
      aspectContainer.classList.remove('show-menu');
      selectedBtn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', handleDocumentClick);
    });

    aspectContainer.append(selectedBtn, listItems);
    return aspectContainer;
  }

  updateAspectRatioForModel() {
    const aspectContainer = this.widget.querySelector('.aspect-container');
    if (!aspectContainer) return;
    const ratios = this.getAspectRatiosForCurrentModel();
    const newContainer = this.createAspectRatioDropdown(ratios);
    aspectContainer.replaceWith(newContainer);
  }

  modelDropdown() {
    if (!this.models || this.models.length === 0) return [];
    const imageToFilmModels = this.models.filter((m) => m.module === 'image-to-film' || m.workflow === 'image-to-film');
    const models = imageToFilmModels.length > 0 ? imageToFilmModels : this.models;
    if (models.length === 0) return [];

    this.selectedModelId = models[0].id;
    this.selectedModelVersion = models[0].version;

    const nameContainer = createTag('span', { class: 'model-name' }, models[0].name?.trim() || '');
    const selectedElement = createTag('button', {
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'itf-model-menu',
      'aria-label': 'model type',
      'aria-haspopup': 'listbox',
      role: 'combobox',
      'data-selected-model-id': models[0].id,
      'data-selected-model-version': models[0].version,
    });
    if (models[0].icon) selectedElement.innerHTML = `<img src="${models[0].icon}" alt="" />`;
    selectedElement.append(nameContainer);

    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const listItems = createTag('ul', { class: 'verb-list', id: 'itf-model-menu', role: 'listbox', style: 'display:none;' });
    selectedElement.append(menuIcon);

    const handleDocumentClick = (e) => {
      const menuContainer = selectedElement.parentElement;
      if (!menuContainer?.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        menuContainer?.classList.remove('show-menu');
        selectedElement.setAttribute('aria-expanded', 'false');
      }
    };

    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuContainer = selectedElement.parentElement;
      const isOpen = menuContainer.classList.toggle('show-menu');
      selectedElement.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) document.addEventListener('click', handleDocumentClick);
      else document.removeEventListener('click', handleDocumentClick);
    });

    models.forEach((model, idx) => {
      const item = createTag('li', { class: `verb-item${idx === 0 ? ' selected' : ''}`, role: 'presentation' });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const link = createTag('a', {
        href: '#',
        class: 'verb-link model-link',
        'data-model-id': model.id,
        'data-model-version': model.version,
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      });
      if (model.icon) link.innerHTML = `<img loading="lazy" src="${model.icon}" alt="" />`;
      const modelNameSpan = createTag('span', { class: 'model-name' }, model.name?.trim() || '');
      link.prepend(selectedIcon);
      link.append(modelNameSpan);
      item.append(link);
      listItems.append(item);
    });

    listItems.addEventListener('click', (e) => {
      const link = e.target.closest('.verb-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      listItems.querySelectorAll('.verb-item').forEach((li) => {
        li.classList.remove('selected');
        li.querySelector('.verb-link')?.setAttribute('aria-selected', 'false');
      });
      link.parentElement.classList.add('selected');
      link.setAttribute('aria-selected', 'true');
      this.selectedModelId = link.getAttribute('data-model-id');
      this.selectedModelVersion = link.getAttribute('data-model-version');
      const newName = link.querySelector('.model-name')?.textContent?.trim() || '';
      const nameEl = selectedElement.querySelector('.model-name');
      if (nameEl) nameEl.textContent = newName;
      const menuContainer = selectedElement.parentElement;
      menuContainer.classList.remove('show-menu');
      selectedElement.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', handleDocumentClick);
      this.updateAspectRatioForModel();
    });

    return [selectedElement, listItems];
  }

  createMoreBtn() {
    const moreEl = this.el.querySelector('.icon-more');
    const moreTxt = moreEl?.closest('li')?.innerText?.trim() || '';
    const productUrlEl = this.el.querySelector('.icon-product-url');
    const productUrl = productUrlEl?.closest('li')?.querySelector('a')?.href || '#';
    const btn = createTag('a', {
      href: productUrl,
      class: 'itf-more-btn',
      target: '_blank',
      rel: 'noopener noreferrer',
    }, moreTxt);
    return btn;
  }

  createGenBtn() {
    const genEl = this.el.querySelector('.icon-generate');
    const genLi = genEl?.closest('li');
    const genTxt = genLi?.innerText?.trim()?.split('\n')[0] || '';
    const genImg = genLi?.querySelector('img[src*=".svg"]');
    const btn = createTag('a', {
      href: '#',
      class: 'unity-act-btn gen-btn',
      'aria-label': genTxt,
    });
    if (genImg) {
      const ico = createTag('div', { class: 'btn-ico' });
      genImg.setAttribute('alt', genTxt);
      ico.append(genImg);
      btn.append(ico);
    }
    if (genTxt) btn.append(createTag('div', { class: 'btn-txt' }, genTxt));
    btn.setAttribute('data-event-bound', 'true');
    return btn;
  }

  createErrorToast() {
    const alertImg = createTag('img', { loading: 'lazy', src: `${window.location.origin}/unitylibs/img/icons/alert.svg` });
    const closeImg = createTag('img', { loading: 'lazy', src: `${window.location.origin}/unitylibs/img/icons/close.svg` });
    const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, ''));
    const alertIcon = createTag('div', { class: 'alert-icon' });
    alertIcon.append(alertImg, alertText);
    const alertClose = createTag('a', { class: 'alert-close', href: '#' });
    alertClose.append(closeImg, createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
    const alertContent = createTag('div', { class: 'alert-content' });
    alertContent.append(alertIcon, alertClose);
    const alertToast = createTag('div', { class: 'alert-toast' }, alertContent);
    const errHolder = createTag('div', { class: 'alert-holder' }, alertToast);
    const closeToast = (e) => {
      e.preventDefault();
      e.stopPropagation();
      errHolder.classList.remove('show');
      if (this.widgetWrap) this.widgetWrap.style.pointerEvents = 'auto';
    };
    alertClose.addEventListener('click', closeToast);
    alertClose.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') closeToast(e);
    });
    this.widgetWrap.prepend(errHolder);
    this.errorToastEl = errHolder;
  }

  showErrorToast(msg) {
    if (!this.errorToastEl) return;
    const alertText = this.errorToastEl.querySelector('.alert-text p');
    if (alertText) alertText.innerText = msg;
    this.errorToastEl.classList.add('show');
    if (this.widgetWrap) this.widgetWrap.style.pointerEvents = 'none';
    const closeBtn = this.errorToastEl.querySelector('.alert-close');
    if (closeBtn) closeBtn.style.pointerEvents = 'auto';
  }

  getErrorText(iconClass) {
    const lang = document.querySelector('html')?.getAttribute('lang');
    const el = this.el.querySelector(`.${iconClass}`);
    if (!el) return '';
    return lang !== 'ja-JP' ? el.nextSibling?.textContent || '' : el.parentElement?.textContent || '';
  }

  async uploadIfNeeded(file) {
    const uploadPayload = {
      targetProduct: 'Firefly',
      payload: {
        workflow: 'image-to-film',
        command: 'upload',
        commandType: 'asset',
        assetData: [{ type: file.type, size: file.size, name: file.name }],
      },
    };
    const opts = await getApiCallOptions('POST', unityConfig.apiKey, {}, { body: JSON.stringify(uploadPayload) });
    const uploadRes = await fetch(`${unityConfig.apiEndPoint}/asset`, opts);
    if (!uploadRes.ok) throw new Error('Asset upload init failed');
    const uploadJson = await uploadRes.json();
    const putHref = uploadJson?.href;
    if (putHref) {
      const putRes = await fetch(putHref, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!putRes.ok) throw new Error('Asset PUT failed');
    }
    return uploadJson?.assetId;
  }

  async postToConnector(payload) {
    const opts = await getApiCallOptions(
      'POST',
      unityConfig.apiKey,
      { 'x-unity-product': 'Firefly', 'x-unity-action': 'generate-image-to-filmGeneration' },
      { body: JSON.stringify(payload) },
    );
    const res = await fetch(unityConfig.connectorApiEndPoint, opts);
    if (!res.ok) {
      const err = new Error('Connector request failed');
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  bindGenBtn() {
    const genBtn = this.widget.querySelector('.gen-btn');
    if (!genBtn) return;
    genBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (genBtn.classList.contains('loading')) return;
      genBtn.classList.add('loading');
      try {
        const inpField = this.widget.querySelector('.inp-field');
        const prompt = inpField?.value?.trim() || '';
        let assetId;
        if (this.uploadedFile) {
          assetId = await this.uploadIfNeeded(this.uploadedFile);
        }
        const payload = {
          targetProduct: 'Firefly',
          payload: {
            workflow: 'image-to-film',
            prompt,
            ...(this.selectedModelId ? { modelId: this.selectedModelId } : {}),
            ...(this.selectedModelVersion ? { modelVersion: this.selectedModelVersion } : {}),
            ...(this.selectedAspectRatio ? { aspectRatio: this.selectedAspectRatio } : {}),
            locale: document.querySelector('html').lang || 'en-US',
            action: 'generate',
          },
          ...(assetId ? { assetId } : {}),
        };
        const { url } = await this.postToConnector(payload);
        if (url) window.location.href = url;
      } catch (err) {
        const msg = this.getErrorText('icon-error-request');
        this.showErrorToast(msg);
        window.lana?.log(`Message: ITF generation failed, Error: ${err}`, this.lanaOptions);
      } finally {
        genBtn.classList.remove('loading');
      }
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
}
