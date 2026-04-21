/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs,
  priorityLoad,
  createTag,
  getLocale,
  getLibs,
  getHeaders,
  getApiCallOptions,
  sendAnalyticsEvent,
} from '../../../scripts/utils.js';

class ServiceHandler {
  constructor(canvasArea, unityEl, workflowCfg, getAdditionalHeaders) {
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.getAdditionalHeaders = getAdditionalHeaders;
  }

  async postCallToService(api, options, failOnError = true) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey, this.getAdditionalHeaders?.() || {}),
      ...options,
    };
    let response;
    try {
      response = await fetch(api, postOpts);
    } catch (e) {
      if (e instanceof TypeError) {
        const error = new Error(`Network error. URL: ${api}; Error message: ${e.message}`);
        error.status = 0;
        throw error;
      }
      throw e;
    }
    if (failOnError && response.status !== 200) {
      const error = new Error('Operation failed');
      error.status = response.status;
      throw error;
    }
    if (!failOnError) return response;
    return response.json();
  }

  showErrorToast(errorType, error, lanaOptions) {
    sendAnalyticsEvent(new CustomEvent('Upload server error|UnityWidget'));
    const msg = this.unityEl.querySelector(errorType)?.closest('li')?.textContent?.trim();
    if (!msg) return;
    this.canvasArea.forEach((element) => {
      element.style.pointerEvents = 'none';
      const alertText = element.querySelector('.alert-holder .alert-text p');
      if (alertText) alertText.innerText = msg;
      element.querySelector('.alert-holder')?.classList.add('show');
    });
    window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, lanaOptions);
  }
}

export default class ActionBinder {
  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actionMap = actionMap;
    this.errorToastEl = null;
    this.transitionScreen = null;
    this.LOADER_LIMIT = 95;
    this.serviceHandler = null;
    this.uploadAbortController = null;
    this.assetId = null;
    this.pendingFile = null;
    this.filesData = {};
    this.sendAnalyticsToSplunk = null;
    this.analyticsModule = null;
    // The widget renders into canvasArea (interactive-area), not the upstream block element.
    const searchRoot = this.canvasArea || this.block;
    this.widgetWrap = searchRoot?.querySelector?.('.ex-unity-wrap') ?? searchRoot;
    this.inputField = searchRoot?.querySelector?.('.inp-field');
    const commonLimits = workflowCfg.targetCfg?.limits || {};
    const productLimits = workflowCfg.targetCfg?.[`limits-${workflowCfg.productName?.toLowerCase()}`] || {};
    this.limits = { ...commonLimits, ...productLimits };
    const productTag = workflowCfg.targetCfg?.[`productTag-${workflowCfg.productName?.toLowerCase()}`] || 'FF';
    this.lanaOptions = { sampleRate: 1, tags: `Unity-${productTag}-PBU` };
    this.verb = this.getVerbFromDom();
    this.initActionListeners = this.initActionListeners.bind(this);
  }

  // ─── API config ────────────────────────────────────────────────────────────

  getApiConfig() {
    unityConfig.endPoint = {
      assetUpload: `${unityConfig.apiEndPoint}/asset`,
      acmpCheck: `${unityConfig.apiEndPoint}/asset/finalize`,
    };
    return unityConfig;
  }

  getAdditionalHeaders() {
    const baseAction = this.workflowCfg?.supportedFeatures?.values()?.next()?.value;
    const xUnityAction = this.verb ? `${baseAction}-${this.verb}` : baseAction;
    return {
      'x-unity-product': this.workflowCfg?.productName,
      'x-unity-action': xUnityAction,
    };
  }

  getVerbFromDom() {
    const verbEl = this.unityEl?.querySelector('[class*="icon-operation-"]');
    if (!verbEl) return undefined;
    const verbClass = Array.from(verbEl.classList).find((cls) => cls.startsWith('icon-operation-'));
    return verbClass?.slice('icon-operation-'.length);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  async initAnalytics() {
    if (this.analyticsModule) return;
    this.analyticsModule = await import(`${getUnityLibs()}/scripts/analytics.js`);
    if (this.workflowCfg.targetCfg?.sendSplunkAnalytics) {
      this.sendAnalyticsToSplunk = this.analyticsModule.default;
    }
  }

  logAnalytics(eventName, data) {
    this.sendAnalyticsToSplunk?.(
      eventName,
      this.workflowCfg.productName,
      { ...data, operation: this.verb },
      `${unityConfig.apiEndPoint}/log`,
      true,
    );
  }

  // ─── Error toast ───────────────────────────────────────────────────────────

  async createErrorToast() {
    try {
      const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
      const alertImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/alert.svg` });
      const closeImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/close.svg` });
      const widgetWrapEl = this.block?.querySelector('.ex-unity-wrap') || this.block;
      if (!widgetWrapEl) return null;
      const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, ''));
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
        if (widgetWrapEl) widgetWrapEl.style.pointerEvents = 'auto';
      };
      alertClose.addEventListener('click', closeToast);
      alertClose.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') closeToast(e); });
      decorateDefaultLinkAnalytics(errholder);
      widgetWrapEl.prepend(errholder);
      return widgetWrapEl.querySelector('.alert-holder');
    } catch (e) {
      window.lana?.log(`Message: Error creating error toast, Error: ${e}`, this.lanaOptions);
      return null;
    }
  }

  showErrorToast(errorTypeSelector, error, errorType = 'server') {
    sendAnalyticsEvent(new CustomEvent(`FF Generate prompt ${errorType} error|UnityWidget`));
    if (!this.errorToastEl) return;
    const msg = this.unityEl.querySelector(errorTypeSelector)?.closest('li')?.textContent?.trim()
      || this.unityEl.querySelector(errorTypeSelector)?.nextSibling?.textContent?.trim();
    if (!msg) return;
    const widgetWrapEl = this.block?.querySelector('.ex-unity-wrap') || this.block;
    if (widgetWrapEl) widgetWrapEl.style.pointerEvents = 'none';
    const alertText = this.errorToastEl.querySelector('.alert-text p');
    if (alertText) alertText.innerText = msg;
    this.errorToastEl.classList.add('show');
    window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, this.lanaOptions);
  }

  // ─── File validation ───────────────────────────────────────────────────────

  extractFiles(e) {
    const files = [];
    if (e.dataTransfer?.items) {
      [...e.dataTransfer.items].forEach((item) => { if (item.kind === 'file') files.push(item.getAsFile()); });
    } else if (e.target?.files) {
      [...e.target.files].forEach((file) => files.push(file));
    }
    return files;
  }

  handleClientError(errorTypeSelector, errorCode) {
    this.showErrorToast(errorTypeSelector, null, 'client');
    this.logAnalytics('Upload client error|UnityWidget', { errorData: { code: errorCode }, fileMetaData: this.filesData });
  }

  async checkImageDimensions(file) {
    const { getImageDimensions } = await import(`${getUnityLibs()}/utils/FileUtils.js`);
    const { width, height } = await getImageDimensions(file);
    this.filesData = { ...this.filesData, width, height };
    if (this.limits.minWidth && this.limits.minHeight) {
      if (width < this.limits.minWidth || height < this.limits.minHeight) {
        this.handleClientError('.icon-error-filemindimension', 'error-filemindimension');
        throw new Error('Image below minimum dimensions');
      }
    }
  }

  async validateAndStoreFile(files) {
    if (!files?.length) return false;
    if (files.length > (this.limits.maxNumFiles || 1)) {
      this.handleClientError('.icon-error-filecount', 'error-filecount');
      return false;
    }
    const file = files[0];
    this.filesData = { count: files.length, size: file.size, type: file.type };
    if (this.limits.allowedFileTypes && !this.limits.allowedFileTypes.includes(file.type)) {
      this.handleClientError('.icon-error-filetype', 'error-filetype');
      return false;
    }
    if (this.limits.maxFileSize && file.size > this.limits.maxFileSize) {
      this.handleClientError('.icon-error-filesize', 'error-filesize');
      return false;
    }
    try {
      await this.checkImageDimensions(file);
    } catch {
      return false;
    }
    this.pendingFile = file;
    sendAnalyticsEvent(new CustomEvent('Image Selected|UnityWidget'));
    this.logAnalytics('Image Selected|UnityWidget', { fileMetaData: this.filesData });
    this.widgetWrap?.dispatchEvent(new CustomEvent('pbu-image-selected', { detail: { file } }));
    return true;
  }

  // ─── Asset upload (runs at Generate time) ──────────────────────────────────

  async uploadImgToUnity(storageUrl, id, blobData, fileType, signal) {
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
      ...(signal && { signal }),
    };
    let response;
    try {
      response = await fetch(storageUrl, uploadOptions);
    } catch (e) {
      if (e instanceof TypeError) {
        const error = new Error(`Network error. URL: ${storageUrl}; Error message: ${e.message}`);
        error.status = 0;
        throw error;
      }
      throw e;
    }
    if (response.status !== 200) {
      const error = new Error('Failed to upload image to Unity');
      error.status = response.status;
      throw error;
    }
  }

  async uploadAsset(file) {
    const apiConfig = this.getApiConfig();
    const assetDetails = {
      targetProduct: this.workflowCfg.productName,
      name: file.name,
      size: file.size,
      format: file.type,
    };
    this.uploadAbortController = new AbortController();
    const { signal } = this.uploadAbortController;
    try {
      const resJson = await this.serviceHandler.postCallToService(
        apiConfig.endPoint.assetUpload,
        { body: JSON.stringify(assetDetails) },
      );
      const { id, href, blocksize, uploadUrls } = resJson;
      this.assetId = id;
      this.logAnalytics('Asset Created|UnityWidget', { assetId: this.assetId });
      const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
      const uploadHandler = new UploadHandler(this, this.serviceHandler);
      if (blocksize && uploadUrls && Array.isArray(uploadUrls)) {
        const { failedChunks, attemptMap } = await uploadHandler.uploadChunksToUnity(uploadUrls, file, blocksize, signal);
        if (failedChunks?.size > 0) {
          if (signal.aborted) return false;
          const error = new Error(`One or more chunks failed for asset: ${id}`);
          error.status = 504;
          this.logAnalytics('Chunked Upload Failed|UnityWidget', {
            assetId: this.assetId,
            failedChunks: failedChunks.size,
            maxRetryCount: Math.max(...Array.from(attemptMap.values())),
          });
          throw error;
        }
        await uploadHandler.scanImgForSafetyWithRetry(this.assetId, signal);
        const { createChunkAnalyticsData } = await import(`${getUnityLibs()}/utils/chunkingUtils.js`);
        const totalChunks = Math.ceil(file.size / blocksize);
        this.logAnalytics(
          'Chunked Upload Completed|UnityWidget',
          createChunkAnalyticsData('Chunked Upload Completed|UnityWidget', {
            assetId: this.assetId,
            chunkCount: totalChunks,
            totalFileSize: file.size,
            fileType: file.type,
          }),
        );
      } else {
        await this.uploadImgToUnity(href, id, file, file.type, signal);
        await uploadHandler.scanImgForSafetyWithRetry(this.assetId, signal);
        this.logAnalytics('Upload Completed|UnityWidget', { assetId: this.assetId });
      }
      return true;
    } catch (e) {
      if (signal.aborted || e.name === 'AbortError') {
        window.lana?.log(`Message: Upload aborted, Error: ${e.message}`, this.lanaOptions);
        return false;
      }
      this.showErrorToast('.icon-error-request', e);
      this.logAnalytics('Upload server error|UnityWidget', {
        errorData: { code: 'error-request', subCode: `uploadAsset ${e.status}`, desc: e.message },
        assetId: this.assetId,
      });
      return false;
    }
  }

  // ─── Delete (local state reset + placeholder backend call) ─────────────────

  resetImageState() {
    if (this.uploadAbortController) {
      this.uploadAbortController.abort();
      this.uploadAbortController = null;
    }
    if (this.assetId) {
      this.deleteAsset(this.assetId);
    }
    this.assetId = null;
    this.pendingFile = null;
    this.filesData = {};
    this.widgetWrap?.dispatchEvent(new CustomEvent('pbu-image-deleted'));
    sendAnalyticsEvent(new CustomEvent('Image Deleted|UnityWidget'));
    this.logAnalytics('Image Deleted|UnityWidget', {});
  }

  deleteAsset(assetId) {
    // TODO: Replace with actual DELETE endpoint when available
    window.lana?.log(`Message: Asset delete not yet implemented, assetId: ${assetId}`, this.lanaOptions);
  }

  // ─── Generate flow ─────────────────────────────────────────────────────────

  validatePrompt(query) {
    if (!query && !this.pendingFile) {
      this.showErrorToast('.icon-error-request', 'No prompt or image', 'client');
      return false;
    }
    if (query.length > 750) {
      this.showErrorToast('.icon-error-max-length', 'Prompt too long', 'client');
      this.logAnalytics('generate', { errorData: { code: 'max-prompt-characters-exceeded' } });
      return false;
    }
    return true;
  }

  async handleGenerate() {
    await this.initAnalytics();
    const query = this.inputField?.value?.trim() || '';
    if (!this.validatePrompt(query)) return;

    const selectedModelId = this.widgetWrap?.getAttribute('data-selected-model-id') || '';
    const selectedAspectRatio = this.widgetWrap?.getAttribute('data-selected-aspect-ratio') || '';

    this.logAnalytics('Generate CTA|UnityWidget', {
      verb: `image-to-${this.verb || 'video'}`,
      action: 'generate',
      hasImage: !!this.pendingFile,
      modelId: selectedModelId,
      aspectRatio: selectedAspectRatio,
    });

    if (!this.transitionScreen) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(null, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, false);
    }
    await this.transitionScreen.showSplashScreen(true);

    // Upload image first if one is pending
    if (this.pendingFile && !this.assetId) {
      const uploadOk = await this.uploadAsset(this.pendingFile);
      if (!uploadOk) {
        await this.transitionScreen.showSplashScreen();
        return;
      }
    }

    // Call Firefly connector with prompt + assetId
    await this.callConnector(query, selectedModelId, selectedAspectRatio);
  }

  async callConnector(query, modelId, aspectRatio) {
    const { getCgenQueryParams } = await import(`${getUnityLibs()}/utils/cgen-utils.js`);
    const queryParams = getCgenQueryParams(this.unityEl);
    const payload = {
      targetProduct: this.workflowCfg.productName,
      additionalQueryParams: queryParams,
      payload: {
        workflow: `image-to-${this.verb || 'video'}`,
        locale: getLocale(),
        action: 'generate',
        ...(modelId && { modelId }),
        ...(aspectRatio && { aspectRatio }),
        ...(query && { query }),
      },
      ...(this.assetId ? { assetId: this.assetId } : {}),
    };
    try {
      const postOpts = await getApiCallOptions(
        'POST',
        unityConfig.apiKey,
        {
          'x-unity-product': this.workflowCfg.productName,
          'x-unity-action': `generate-image-to-${this.verb || 'video'}`,
        },
        { body: JSON.stringify(payload) },
      );
      const { default: NetworkUtils } = await import(`${getUnityLibs()}/utils/NetworkUtils.js`);
      const networkUtils = new NetworkUtils();
      const apiConfig = this.getApiConfig();
      const { url } = await networkUtils.fetchFromService(
        apiConfig.connectorApiEndPoint,
        postOpts,
        async (response) => {
          if (response.status !== 200) {
            const error = new Error('Connector call failed');
            error.status = response.status;
            throw error;
          }
          return response.json();
        },
      );
      this.logAnalytics('Generate Complete|UnityWidget', { assetId: this.assetId });
      if (url) window.location.href = url;
    } catch (err) {
      await this.transitionScreen?.showSplashScreen();
      this.showErrorToast('.icon-error-request', err);
      this.logAnalytics('Generate Error|UnityWidget', {
        errorData: { code: 'request-failed', subCode: err.status, desc: err.message },
        assetId: this.assetId,
      });
      window.lana?.log(`Message: Connector call failed, Error: ${err}`, this.lanaOptions);
    }
  }

  // ─── Preloads ──────────────────────────────────────────────────────────────

  async handlePreloads() {
    const parr = [];
    if (this.workflowCfg.targetCfg?.showSplashScreen) {
      parr.push(`${getUnityLibs()}/core/styles/splash-screen.css`);
    }
    if (parr.length) await priorityLoad(parr);
  }

  // ─── Action listeners ──────────────────────────────────────────────────────

  async initActionListeners() {
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    await this.handlePreloads();

    this.serviceHandler = new ServiceHandler(
      Array.isArray(this.canvasArea) ? this.canvasArea : [this.canvasArea],
      this.unityEl,
      this.workflowCfg,
      this.getAdditionalHeaders.bind(this),
    );

    // Re-query widgetWrap and inputField in case widget was re-rendered
    const searchRoot = this.canvasArea || this.block;
    this.widgetWrap = searchRoot?.querySelector?.('.ex-unity-wrap') || this.widgetWrap;
    this.inputField = searchRoot?.querySelector?.('.inp-field') || this.inputField;

    const actMap = this.actionMap;
    for (const [selector, actionsList] of Object.entries(actMap)) {
      const elements = (this.widgetWrap || searchRoot)?.querySelectorAll(selector);
      if (!elements?.length) continue;
      elements.forEach((el) => {
        if (el.dataset.pbuBound) return;
        el.dataset.pbuBound = 'true';
        this.bindElement(el, actionsList);
      });
    }

    // Listen for delete events from widget
    this.widgetWrap?.addEventListener('pbu-delete-image', () => this.resetImageState());

    // Enter key on textarea triggers generate
    this.inputField?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        (this.widgetWrap || searchRoot)?.querySelector('.gen-btn')?.click();
      }
    });
  }

  bindElement(el, actionsList) {
    const actions = Array.isArray(actionsList) ? actionsList : [actionsList];
    const primaryAction = actions[0]?.actionType;

    switch (el.nodeName) {
      case 'A':
      case 'BUTTON':
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.executeAction(primaryAction, el);
        });
        break;
      case 'DIV':
        // Drop zone: drag-and-drop
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', async (e) => {
          e.preventDefault();
          el.classList.remove('drag-over');
          sendAnalyticsEvent(new CustomEvent('Drag and drop|UnityWidget'));
          const files = this.extractFiles(e);
          await this.executeAction(primaryAction, el, files);
        });
        el.addEventListener('click', () => {
          this.block?.querySelector('#file-upload')?.click();
        });
        break;
      case 'INPUT':
        el.addEventListener('change', async (e) => {
          const files = this.extractFiles(e);
          await this.executeAction(primaryAction, el, files);
          e.target.value = '';
        });
        break;
      default:
        break;
    }
  }

  async executeAction(actionType, el, files) {
    try {
      switch (actionType) {
        case 'generate':
          await this.handleGenerate();
          break;
        case 'file-selected':
          await this.validateAndStoreFile(files);
          break;
        default:
          break;
      }
    } catch (err) {
      window.lana?.log(`Message: Action "${actionType}" failed, Error: ${err}`, this.lanaOptions);
    }
  }
}
