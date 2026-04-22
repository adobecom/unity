/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs,
  createTag,
  getLibs,
  getApiCallOptions,
  sendAnalyticsEvent,
} from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actions = actionMap;
    const commonLimits = workflowCfg.targetCfg.limits || {};
    const productLimits = workflowCfg.targetCfg[`limits-${workflowCfg.productName.toLowerCase()}`] || {};
    this.limits = { ...commonLimits, ...productLimits };
    this.uploadedFile = null;
    this.uploadedAssetId = null;
    this.errorToastEl = null;
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-PBU' };
    this.networkUtils = null;
    this.selectedModelId = '';
    this.selectedModelVersion = '';
    this.selectedAspectRatio = '';
    this.aspectRatiosCache = {};
    this.sendAnalyticsToSplunk = null;
    this.analyticsModule = null;
  }

  async getNetworkUtils() {
    if (this.networkUtils) return this.networkUtils;
    const { default: NetworkUtils } = await import(`${getUnityLibs()}/utils/NetworkUtils.js`);
    this.networkUtils = new NetworkUtils();
    return this.networkUtils;
  }

  extractFiles(e) {
    const files = [];
    if (e.dataTransfer?.items) {
      [...e.dataTransfer.items].forEach((item) => {
        if (item.kind === 'file') files.push(item.getAsFile());
      });
    } else if (e.dataTransfer?.files) {
      [...e.dataTransfer.files].forEach((file) => files.push(file));
    } else if (e.target?.files) {
      [...e.target.files].forEach((file) => files.push(file));
    }
    return files;
  }

  validateFile(file) {
    if (!this.limits.allowedFileTypes || !this.limits.allowedFileTypes.includes(file.type)) {
      return { isValid: false, errorType: '.icon-error-filetype' };
    }
    if (this.limits.maxFileSize && file.size > this.limits.maxFileSize) {
      return { isValid: false, errorType: '.icon-error-filesize' };
    }
    return { isValid: true, errorType: '' };
  }

  showDropzoneLoader() {
    const overlay = this.block.querySelector('.pbu-dropzone .pbu-loader-overlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  hideDropzoneLoader() {
    const overlay = this.block.querySelector('.pbu-dropzone .pbu-loader-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  renderPreviewInDropzone(file) {
    const dropzoneInner = this.block.querySelector('.pbu-dropzone-inner');
    if (!dropzoneInner) return;
    const objectUrl = URL.createObjectURL(file);
    const img = createTag('img', { class: 'preview', src: objectUrl, alt: '' });
    img.addEventListener('load', () => URL.revokeObjectURL(objectUrl), { once: true });
    dropzoneInner.innerHTML = '';
    dropzoneInner.append(img);
  }

  async handleDropzoneFile(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const { isValid, errorType } = this.validateFile(file);
    if (!isValid) {
      if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
      this.showErrorToast({ errorToastEl: this.errorToastEl, errorType }, 'client');
      return;
    }
    this.showDropzoneLoader();
    await this.uploadAsset(file);
    this.renderPreviewInDropzone(file);
    this.hideDropzoneLoader();
  }

  async uploadAsset(file) {
    try {
      const assetDetails = {
        targetProduct: this.workflowCfg.productName,
        name: file.name,
        size: file.size,
        format: file.type,
      };
      const postOpts = await getApiCallOptions(
        'POST',
        unityConfig.apiKey,
        {
          'x-unity-product': this.workflowCfg.productName,
          'x-unity-action': 'asset-upload',
        },
        { body: JSON.stringify(assetDetails) },
      );
      const networkUtils = await this.getNetworkUtils();
      const resJson = await networkUtils.fetchFromService(
        `${unityConfig.apiEndPoint}/asset`,
        postOpts,
        async (response) => {
          if (response.status !== 200) {
            const error = new Error('Asset upload failed');
            error.status = response.status;
            throw error;
          }
          return response.json();
        },
      );
      const { id, href, blocksize, uploadUrls } = resJson;
      this.uploadedAssetId = id;
      const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
      const uploadHandler = new UploadHandler(this, null);
      if (blocksize && uploadUrls && Array.isArray(uploadUrls)) {
        await uploadHandler.uploadChunksToUnity(uploadUrls, file, blocksize, null);
      } else if (href) {
        const uploadOptions = {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        };
        await fetch(href, uploadOptions);
      }
      this.uploadedFile = file;
    } catch (e) {
      if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
      this.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, e, this.lanaOptions);
      window.lana?.log(`Message: Asset upload failed, Error: ${e}`, this.lanaOptions);
    }
  }

  async generateContent() {
    await this.initAnalytics();
    const promptEl = this.block.querySelector('.inp-field');
    const prompt = promptEl?.value?.trim() || '';
    const modelId = this.block.querySelector('.models-container .selected-model')?.dataset?.selectedModelId || this.selectedModelId;
    const modelVersion = this.block.querySelector('.models-container .selected-model')?.dataset?.selectedModelVersion || this.selectedModelVersion;
    const aspectRatio = this.workflowCfg.targetCfg.selectedAspectRatio || this.selectedAspectRatio;
    const payload = {
      targetProduct: this.workflowCfg.productName,
      payload: {
        workflow: 'image-to-animation',
        ...(modelId ? { modelId } : {}),
        ...(modelVersion ? { modelVersion } : {}),
        ...(aspectRatio ? { aspectRatio } : {}),
      },
      ...(this.uploadedAssetId ? { assetId: this.uploadedAssetId } : { query: prompt }),
    };
    if (!this.uploadedAssetId && prompt) payload.query = prompt;
    try {
      const postOpts = await getApiCallOptions(
        'POST',
        unityConfig.apiKey,
        {
          'x-unity-product': this.workflowCfg.productName,
          'x-unity-action': 'generate-image-to-animation',
        },
        { body: JSON.stringify(payload) },
      );
      const networkUtils = await this.getNetworkUtils();
      const { url } = await networkUtils.fetchFromService(
        unityConfig.connectorApiEndPoint,
        postOpts,
        async (response) => {
          if (response.status !== 200) {
            const error = new Error('Generate content failed');
            error.status = response.status;
            throw error;
          }
          return response.json();
        },
      );
      if (url) window.location.href = url;
    } catch (err) {
      if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
      this.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, err, this.lanaOptions);
      window.lana?.log(`Message: Content generation failed, Error: ${err}`, this.lanaOptions);
    }
  }

  async handleMoreClick() {
    const productUrl = this.workflowCfg.placeholder?.['placeholder-product-url'] || 'https://firefly.adobe.com';
    window.location.href = productUrl;
  }

  async loadAspectRatios(modelId) {
    if (this.aspectRatiosCache[modelId]) return this.aspectRatiosCache[modelId];
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
      const ratios = data
        .filter((row) => row.model === modelId)
        .map((row) => ({ label: row.label, value: row.value }));
      this.aspectRatiosCache[modelId] = ratios;
      return ratios;
    } catch (e) {
      window.lana?.log(`Message: Error loading aspect ratios, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  async rerenderAspectRatioDropdown(modelId) {
    const container = this.block.querySelector('.aspect-ratios-container');
    if (!container) return;
    container.innerHTML = '';
    const ratios = await this.loadAspectRatios(modelId);
    if (!ratios || ratios.length === 0) return;
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const firstRatio = ratios[0];
    this.workflowCfg.targetCfg.selectedAspectRatio = firstRatio?.value || '';
    this.selectedAspectRatio = firstRatio?.value || '';
    const selectedElement = createTag('button', {
      class: 'selected-aspect-ratio',
      'aria-expanded': 'false',
      'aria-controls': 'aspect-ratio-menu',
      'aria-label': 'aspect ratio',
      'aria-haspopup': 'listbox',
      role: 'combobox',
    }, `${firstRatio?.label || ''}`);
    selectedElement.append(menuIcon);
    const listItems = createTag('ul', {
      class: 'aspect-ratio-list verb-list',
      id: 'aspect-ratio-menu',
      role: 'listbox',
    });
    listItems.setAttribute('style', 'display: none;');
    const handleDocumentClick = (e) => {
      if (!container.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        container.classList.remove('show-menu');
        selectedElement.setAttribute('aria-expanded', 'false');
      }
    };
    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      container.classList.toggle('show-menu');
      selectedElement.setAttribute('aria-expanded', container.classList.contains('show-menu') ? 'true' : 'false');
      if (container.classList.contains('show-menu')) document.addEventListener('click', handleDocumentClick);
    }, true);
    ratios.forEach((ratio, idx) => {
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
      listItems.append(listItem);
    });
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
      this.workflowCfg.targetCfg.selectedAspectRatio = ratioValue;
      this.selectedAspectRatio = ratioValue;
      const cloned = link.cloneNode(true);
      cloned.querySelector('.selected-icon')?.remove();
      selectedElement.replaceChildren(cloned.textContent, menuIcon);
      container.classList.remove('show-menu');
      selectedElement.setAttribute('aria-expanded', 'false');
      selectedElement.focus();
    });
    container.append(selectedElement, listItems);
  }

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    sendAnalyticsEvent(new CustomEvent(`PBU Generate ${errorType} error|UnityWidget`));
    if (!errorCallbackOptions?.errorToastEl) return;
    const lang = document.querySelector('html').getAttribute('lang');
    const msg = lang !== 'ja-JP'
      ? this.unityEl.querySelector(errorCallbackOptions.errorType)?.nextSibling?.textContent
      : this.unityEl.querySelector(errorCallbackOptions.errorType)?.parentElement?.textContent;
    const promptBarEl = this.block.querySelector('.ex-unity-wrap');
    if (!promptBarEl) return;
    promptBarEl.style.pointerEvents = 'none';
    const errorToast = promptBarEl.querySelector('.alert-holder');
    if (!errorToast) return;
    const closeBtn = errorToast.querySelector('.alert-close');
    if (closeBtn) closeBtn.style.pointerEvents = 'auto';
    const alertText = errorToast.querySelector('.alert-text p');
    if (!alertText) return;
    alertText.innerText = msg;
    errorToast.classList.add('show');
    window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, lanaOptions || this.lanaOptions);
  }

  async createErrorToast() {
    try {
      const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
      const alertImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/alert.svg` });
      const closeImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/close.svg` });
      const promptBarEl = this.block.querySelector('.ex-unity-wrap');
      if (!promptBarEl) return null;
      const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, 'Alert Text'));
      const alertIcon = createTag('div', { class: 'alert-icon' });
      alertIcon.append(alertImg, alertText);
      const alertClose = createTag('a', { class: 'alert-close', href: '#' });
      alertClose.append(closeImg, createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
      const alertContent = createTag('div', { class: 'alert-content' });
      alertContent.append(alertIcon, alertClose);
      const alertToast = createTag('div', { class: 'alert-toast' }, alertContent);
      const errholder = createTag('div', { class: 'alert-holder' }, alertToast);
      const closeToast = (e) => {
        e.preventDefault();
        e.stopPropagation();
        errholder.classList.remove('show');
        if (promptBarEl) promptBarEl.style.pointerEvents = 'auto';
      };
      alertClose.addEventListener('click', closeToast);
      alertClose.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') closeToast(e);
      });
      decorateDefaultLinkAnalytics(errholder);
      promptBarEl.prepend(errholder);
      return promptBarEl.querySelector('.alert-holder');
    } catch (e) {
      window.lana?.log(`Message: Error creating error toast, Error: ${e}`, this.lanaOptions);
      return null;
    }
  }

  async initAnalytics() {
    if (this.analyticsModule) return;
    this.analyticsModule = await import(`${getUnityLibs()}/scripts/analytics.js`);
    if (this.workflowCfg.targetCfg.sendSplunkAnalytics) {
      this.sendAnalyticsToSplunk = this.analyticsModule.default;
    }
  }

  async initActionListeners() {
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    Object.entries(this.actions).forEach(([selector, actionsList]) => {
      this.block.querySelectorAll(selector).forEach((el) => {
        if (!el.hasAttribute('data-event-bound')) {
          this.addEventListeners(el, actionsList);
          el.setAttribute('data-event-bound', 'true');
        }
      });
    });
    const dropzone = this.block.querySelector('.pbu-dropzone');
    if (dropzone && !dropzone.hasAttribute('data-event-bound')) {
      dropzone.setAttribute('data-event-bound', 'true');
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
        const files = this.extractFiles(e);
        await this.handleDropzoneFile(files);
      });
      dropzone.addEventListener('click', (e) => {
        if (e.target.closest('img.preview')) return;
        const fileInput = this.block.querySelector('#pbu-file-input');
        if (fileInput) fileInput.click();
      });
    }
    const fileInput = this.block.querySelector('#pbu-file-input');
    if (fileInput && !fileInput.hasAttribute('data-event-bound')) {
      fileInput.setAttribute('data-event-bound', 'true');
      fileInput.addEventListener('change', async (e) => {
        const files = this.extractFiles(e);
        await this.handleDropzoneFile(files);
        e.target.value = '';
      });
    }
    const modelsContainer = this.block.querySelector('.models-container');
    if (modelsContainer && !modelsContainer.hasAttribute('data-ar-bound')) {
      modelsContainer.setAttribute('data-ar-bound', 'true');
      modelsContainer.addEventListener('click', async (e) => {
        const link = e.target.closest('.model-link');
        if (!link) return;
        const newModelId = link.getAttribute('data-model-id');
        if (newModelId) await this.rerenderAspectRatioDropdown(newModelId);
      });
    }
  }

  addEventListeners(el, actionsList) {
    const handleClick = async (event) => {
      event.preventDefault();
      const { actionType } = actionsList;
      if (actionType === 'generate') await this.generateContent();
      else if (actionType === 'redirect') await this.handleMoreClick();
    };
    el.addEventListener('click', handleClick);
  }
}
