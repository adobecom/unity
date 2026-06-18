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

function normalizeToArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value.forEach === 'function' && typeof value.length === 'number') {
    try { return [...value]; } catch { return [value]; }
  }
  return [value];
}

class ServiceHandler {
  constructor(renderWidget = false, canvasArea = null, unityEl = null, workflowCfg = {}, getAdditionalHeaders = null) {
    this.renderWidget = renderWidget;
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

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    sendAnalyticsEvent(new CustomEvent(`Upload ${errorType} error|UnityWidget|${errorCallbackOptions.errorCode || ''}|${JSON.stringify(errorCallbackOptions.fileMetaData) || ''}`));
    if (!errorCallbackOptions.errorToastEl) return;
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.closest('li')?.textContent?.trim();
    this.canvasArea.forEach((element) => {
      element.style.pointerEvents = 'none';
      const errorToast = element.querySelector('.alert-holder');
      if (!errorToast) return;
      const closeBtn = errorToast.querySelector('.alert-close');
      if (closeBtn) closeBtn.style.pointerEvents = 'auto';
      const alertText = errorToast.querySelector('.alert-text p');
      if (!alertText) return;
      alertText.innerText = msg;
      errorToast.classList.add('show');
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
    this.promiseStack = [];
    this.desktop = false;
    this.toastCanvasAreas = normalizeToArray(canvasArea);
    this.apiConfig = this.getApiConfig();
    this.verb = this.getVerbFromDom();
    this.initActionListeners = this.initActionListeners.bind(this);
    const searchRoot = canvasArea || block;
    this.widgetWrap = searchRoot?.querySelector?.('.ex-unity-wrap') ?? searchRoot;
    this.inputField = searchRoot?.querySelector?.('.inp-field');
    this.limits = workflowCfg.targetCfg?.limits || {};
    const productTag = workflowCfg.targetCfg?.[`productTag-${workflowCfg.productName?.toLowerCase()}`] || 'FF';
    this.lanaOptions = { sampleRate: 1, tags: `Unity-${productTag}-PBU` };
  }

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
    if (verbEl) {
      const verbClass = Array.from(verbEl.classList).find((cls) => cls.startsWith('icon-operation-'));
      const fromDom = verbClass?.slice('icon-operation-'.length);
      if (fromDom) return fromDom;
    }
    return this.workflowCfg?.enabledFeatures?.[0];
  }

  async initAnalytics() {
    if (this.analyticsModule) return;
    this.analyticsModule = await import(`${getUnityLibs()}/scripts/analytics.js`);
    if (this.workflowCfg.targetCfg?.sendSplunkAnalytics) {
      this.sendAnalyticsToSplunk = this.analyticsModule.default;
    }
  }

  logAnalyticsinSplunk(eventName, data = {}) {
    this.sendAnalyticsToSplunk?.(
      eventName,
      this.workflowCfg.productName,
      { ...data,
        operation: this.verb,
        action: 'upload-generate' },
      `${unityConfig.apiEndPoint}/log`,
      true,
    );
  }

  resetUploadedAssetState({ dropPendingImage = false } = {}) {
    this.uploadAbortController?.abort();
    this.uploadAbortController = null;
    this.assetId = null;
    if (dropPendingImage) {
      this.pendingFile = null;
      this.filesData = {};
    }
  }

  async createErrorToast() {
    try {
      const [alertImg, closeImg] = await Promise.all([
        fetch(`${getUnityLibs()}/img/icons/alert.svg`).then((res) => res.text()),
        fetch(`${getUnityLibs()}/img/icons/close.svg`).then((res) => res.text()),
      ]);
      const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
      this.toastCanvasAreas.forEach((canvasEl) => {
        const mount = canvasEl.querySelector('.pbu-main') || canvasEl;
        const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, 'Alert Text'));
        const alertIcon = createTag('div', { class: 'alert-icon' });
        alertIcon.innerHTML = alertImg;
        alertIcon.append(alertText);
        const alertClose = createTag('a', { class: 'alert-close', href: '#' });
        alertClose.innerHTML = closeImg;
        alertClose.append(createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
        const alertContent = createTag('div', { class: 'alert-content' });
        alertContent.append(alertIcon, alertClose);
        const alertToast = createTag('div', { class: 'alert-toast' }, alertContent);
        const errholder = createTag('div', { class: 'alert-holder' }, alertToast);
        alertClose.addEventListener('click', (e) => {
          this.preventDefault(e);
          errholder.classList.remove('show');
          canvasEl.style.pointerEvents = 'auto';
        });
        decorateDefaultLinkAnalytics(errholder);
        mount.append(errholder);
      });
      return this.toastCanvasAreas[0]?.querySelector('.pbu-main .alert-holder')
        || this.toastCanvasAreas[0]?.querySelector('.alert-holder');
    } catch (e) {
      window.lana?.log(`Message: Error creating error toast, Error: ${e}`, this.lanaOptions);
      return null;
    }
  }

  extractFiles(e) {
    const files = [];
    if (e.dataTransfer?.items) {
      [...e.dataTransfer.items].forEach((item) => { if (item.kind === 'file') files.push(item.getAsFile()); });
    } else if (e.target?.files) {
      [...e.target.files].forEach((file) => files.push(file));
    }
    return files;
  }

  handleClientError(errorTypeSelector, errorCode, message = '') {
    this.serviceHandler.showErrorToast(
      {
        errorToastEl: this.errorToastEl,
        errorType: errorTypeSelector,
        errorCode,
        fileMetaData: this.filesData,
      },
      message,
      this.lanaOptions,
      'client',
    );
    this.logAnalyticsinSplunk('Upload client error|UnityWidget', { errorData: { code: errorCode }, fileMetaData: this.filesData });
  }

  setSelectSpinnerVisible(visible) {
    const wrap = this.widgetWrap?.querySelector('.pbu-drop-zone-wrap');
    const el = wrap?.querySelector('.pbu-select-spinner');
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    wrap?.classList.toggle('pbu-select-processing', !!visible);
  }

  async validateAndStoreFile(files) {
    this.setSelectSpinnerVisible(true);
    try {
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
      this.resetUploadedAssetState();
      this.pendingFile = file;
      this.widgetWrap?.dispatchEvent(new CustomEvent('pbu-image-selected', { detail: { file } }));
      return true;
    } finally {
      this.setSelectSpinnerVisible(false);
    }
  }

  async uploadImgToUnity(storageUrl, _id, blobData, fileType, signal) {
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
        this.apiConfig.endPoint.assetUpload,
        { body: JSON.stringify(assetDetails) },
      );
      if (signal.aborted) return false;
      const { id, href, blocksize, uploadUrls } = resJson;
      this.assetId = id;
      this.logAnalyticsinSplunk('Asset Created|UnityWidget', { assetId: this.assetId });
      const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
      const uploadHandler = new UploadHandler(this, this.serviceHandler);
      if (blocksize && uploadUrls && Array.isArray(uploadUrls)) {
        const { failedChunks, attemptMap } = await uploadHandler.uploadChunksToUnity(uploadUrls, file, blocksize, signal);
        if (failedChunks?.size > 0) {
          if (signal.aborted) return false;
          const error = new Error(`One or more chunks failed for asset: ${id}`);
          error.status = 504;
          this.logAnalyticsinSplunk('Chunked Upload Failed|UnityWidget', {
            assetId: this.assetId,
            failedChunks: failedChunks.size,
            maxRetryCount: Math.max(...Array.from(attemptMap.values())),
          });
          throw error;
        }
        await uploadHandler.scanImgForSafetyWithRetry(this.assetId, signal);
        const { createChunkAnalyticsData } = await import(`${getUnityLibs()}/utils/chunkingUtils.js`);
        const totalChunks = Math.ceil(file.size / blocksize);
        this.logAnalyticsinSplunk(
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
        this.logAnalyticsinSplunk('Upload Completed|UnityWidget', { assetId: this.assetId });
      }
      return true;
    } catch (e) {
      if (signal.aborted || e.name === 'AbortError') {
        window.lana?.log(`Message: Upload aborted, Error: ${e.message}`, this.lanaOptions);
        return false;
      }
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, e, this.lanaOptions);
      this.logAnalyticsinSplunk('Upload server error|UnityWidget', {
        errorData: {
          code: 'error-request',
          subCode: `uploadAsset ${e.status}`,
          desc: e.message || undefined,
        },
        assetId: this.assetId,
      });
      return false;
    }
  }

  validateInput(query) {
    const maxCharLimit = this.limits?.['max-char-limit'] ?? 1024;
    if (query.length > maxCharLimit) {
      this.handleClientError('.icon-error-max-length', 'max-prompt-characters-exceeded', 'Prompt too long');
      return false;
    }
    return true;
  }

  async trackUploadFileAttempt(uploadMethod) {
    try {
      if (!this.analyticsModule) await this.initAnalytics();
      const eventName = this.analyticsModule.PROMPT_BAR_EVENTS.UPLOAD_FILE_ATTEMPT;
      sendAnalyticsEvent(new CustomEvent(eventName));
      this.logAnalyticsinSplunk(eventName, { action: uploadMethod });
    } catch (e) {
      window.lana?.log(`Message: Upload file attempt analytics failed, Error: ${e}`, this.lanaOptions);
    }
  }

  async ensureTransitionScreen() {
    if (!this.transitionScreen) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(null, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
    }
    if (!this.transitionScreen.splashScreenEl) {
      await this.transitionScreen.loadSplashFragment();
    }
  }

  async handleGenerate(isGenerateCta = true) {
    this.promiseStack = [];
    if (!this.analyticsModule) await this.initAnalytics();
    const pbuEvents = this.analyticsModule.PROMPT_BAR_EVENTS;
    const query = this.inputField?.value?.trim() || '';
    if (!this.validateInput(query)) return;

    const selectedModelId = this.widgetWrap?.getAttribute('data-selected-model-id') || '';
    const selectedAspectRatio = this.widgetWrap?.getAttribute('data-selected-aspect-ratio') || '';
    const selectedModelName = this.widgetWrap?.getAttribute('data-selected-model-name') || selectedModelId;
    const ctaEventName = isGenerateCta ? pbuEvents.GENERATE_CTA : pbuEvents.MORE;
    sendAnalyticsEvent(new CustomEvent(pbuEvents.UPLOAD_STARTED));
    sendAnalyticsEvent(new CustomEvent(ctaEventName));
    if (selectedModelName) sendAnalyticsEvent(new CustomEvent(pbuEvents.generateModel(selectedModelName)));
    if (selectedAspectRatio) sendAnalyticsEvent(new CustomEvent(pbuEvents.ratioSelect(selectedAspectRatio)));
    this.logAnalyticsinSplunk(pbuEvents.UPLOAD_STARTED, { fileMetaData: this.filesData });
    this.logAnalyticsinSplunk(ctaEventName, {
      ...(selectedModelName && {
        modelGenEventName: pbuEvents.generateModel(selectedModelName),
      }),
      assetId: this.assetId,
      aspectRatio: selectedAspectRatio,
      hasImage: !!this.pendingFile,
    });
    const searchRoot = this.canvasArea || this.block;
    const interactiveShell = searchRoot?.querySelector?.('.interactive-area');
    this.workflowCfg.theme = interactiveShell?.classList.contains('dark') ? 'dark' : null;

    await this.ensureTransitionScreen();
    await this.transitionScreen.showSplashScreen(true);

    if (this.pendingFile && !this.assetId) {
      const uploadOk = await this.uploadAsset(this.pendingFile);
      if (!uploadOk) {
        await this.transitionScreen.showSplashScreen();
        return;
      }
    }
    await this.continueInApp(query, selectedModelId, selectedAspectRatio);
  }

  async continueInApp(query, modelId, aspectRatio) {
    const { getCgenQueryParams } = await import(`${getUnityLibs()}/utils/cgen-utils.js`);
    const queryParams = getCgenQueryParams(this.unityEl);
    const modelVersion = this.widgetWrap?.getAttribute('data-selected-model-version') || '';
    const selectedWidth = Number(this.widgetWrap?.getAttribute('data-selected-width')) || null;
    const selectedHeight = Number(this.widgetWrap?.getAttribute('data-selected-height')) || null;
    const size = (selectedWidth && selectedHeight) ? { width: selectedWidth, height: selectedHeight } : null;

    const connectorBody = {
      targetProduct: this.workflowCfg.productName,
      additionalQueryParams: queryParams,
      ...(this.assetId && { assetId: this.assetId }),
      ...(query && { query }),
      payload: {
        workflow: this.workflowCfg.supportedFeatures.values().next().value,
        verb: this.verb,
        action: 'asset-upload',
        locale: getLocale(),
        size,
        ...(modelId && { modelId }),
        ...(modelVersion && { modelVersion }),
        ...(aspectRatio && { aspectRatio }),
        generate: false,
      },
    };
    try {
      const headerExtras = this.getAdditionalHeaders();
      const postOpts = await getApiCallOptions(
        'POST',
        unityConfig.apiKey,
        headerExtras,
        { body: JSON.stringify(connectorBody) },
      );
      const { default: NetworkUtils } = await import(`${getUnityLibs()}/utils/NetworkUtils.js`);
      const networkUtils = new NetworkUtils();
      const { url } = await networkUtils.fetchFromService(
        this.apiConfig.connectorApiEndPoint,
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
      if (this.promiseStack.length > 0) return;
      this.logAnalyticsinSplunk('Generate Complete|UnityWidget', { assetId: this.assetId });
      this.LOADER_LIMIT = 100;
      if (this.transitionScreen?.splashScreenEl) {
        this.transitionScreen.LOADER_LIMIT = 100;
        this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, 100);
      }
      if (url) window.location.href = url;
    } catch (err) {
      if (err.message === 'Operation termination requested.') return;
      await this.transitionScreen?.showSplashScreen();
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, err, this.lanaOptions);
      this.logAnalyticsinSplunk('Upload server error|UnityWidget', {
        errorData: {
          code: 'error-request',
          subCode: `continueInApp ${err.status}`,
          desc: err.message || undefined,
        },
        assetId: this.assetId,
      });
      window.lana?.log(`Message: Connector call failed, Error: ${err}`, this.lanaOptions);
    }
  }

  async handlePreloads() {
    const parr = [];
    if (this.workflowCfg.targetCfg?.showSplashScreen) {
      parr.push(`${getUnityLibs()}/core/styles/splash-screen.css`);
    }
    if (parr.length) await priorityLoad(parr);
  }

  isStringActionMap(actMap) {
    return actMap && typeof actMap === 'object' && Object.keys(actMap).length > 0
      && Object.values(actMap).every((v) => typeof v === 'string');
  }

  async cancelUploadOperation() {
    try {
      this.uploadAbortController?.abort();
      this.uploadAbortController = null;
      sendAnalyticsEvent(new CustomEvent('Cancel|UnityWidget'));
      this.logAnalyticsinSplunk('Cancel|UnityWidget', { assetId: this.assetId });
      this.assetId = null;
      await this.ensureTransitionScreen();
      await this.transitionScreen.showSplashScreen();
      const e = new Error('Operation termination requested.');
      const cancelPromise = Promise.reject(e);
      cancelPromise.catch(() => {});
      this.promiseStack.unshift(cancelPromise);
    } catch (error) {
      await this.transitionScreen?.showSplashScreen();
      window.lana?.log(`Message: Error cancelling upload operation, Error: ${error}`, this.lanaOptions);
      throw error;
    }
  }

  async executeActionMaps(value) {
    await this.handlePreloads();
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    if (value === 'interrupt') await this.cancelUploadOperation();
  }

  async bindStringActionMap(b, actMap) {
    const actions = {
      A: (el, key) => {
        el.addEventListener('click', async (e) => {
          const action = actMap[key];
          if (action !== 'redirect') e.preventDefault();
          await this.executeActionMaps(action);
        });
      },
      DIV: (el, key) => {
        el.addEventListener('drop', async (e) => {
          sendAnalyticsEvent(new CustomEvent('Drag and drop|UnityWidget'));
          this.preventDefault(e);
          const extracted = this.extractFiles(e);
          this.filesData = { count: extracted.length, size: extracted[0]?.size, type: extracted[0]?.type };
          this.logAnalyticsinSplunk('Drag and drop|UnityWidget', { assetId: this.assetId, fileMetaData: this.filesData });
          await this.executeActionMaps(actMap[key], extracted);
        });
        el.addEventListener('click', () => {
          sendAnalyticsEvent(new CustomEvent('Click Drag and drop|UnityWidget'));
        });
      },
      INPUT: (el, key) => {
        el.addEventListener('click', () => {
          this.toastCanvasAreas.forEach((element) => {
            const errHolder = element.querySelector('.alert-holder');
            if (errHolder?.classList.contains('show')) {
              element.style.pointerEvents = 'auto';
              errHolder.classList.remove('show');
            }
          });
        });
        el.addEventListener('change', async (e) => {
          const extracted = this.extractFiles(e);
          this.filesData = { count: extracted.length, size: extracted[0]?.size, type: extracted[0]?.type };
          this.logAnalyticsinSplunk('Click Drag and drop|UnityWidget', { assetId: this.assetId, fileMetaData: this.filesData });
          await this.executeActionMaps(actMap[key], extracted);
          e.target.value = '';
        });
      },
    };
    for (const [key] of Object.entries(actMap)) {
      const elements = b.querySelectorAll(key);
      if (elements?.length) {
        elements.forEach((el) => {
          const actionType = el.nodeName;
          if (actions[actionType]) actions[actionType](el, key);
        });
      }
    }
  }

  setupServiceHandler() {
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg?.renderWidget,
      this.toastCanvasAreas,
      this.unityEl,
      this.workflowCfg,
      this.getAdditionalHeaders.bind(this),
    );
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    const searchRoot = this.canvasArea || this.block;
    this.widgetWrap = searchRoot?.querySelector?.('.ex-unity-wrap') || this.widgetWrap;

    this.setupServiceHandler();
    await this.initAnalytics();

    if (this.isStringActionMap(actMap)) {
      await this.bindStringActionMap(b, actMap);
      return;
    }
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    await this.handlePreloads();
    this.inputField = this.widgetWrap?.querySelector('#pbuPromptInput')
      || this.widgetWrap?.querySelector('.inp-field')
      || this.inputField;
    for (const [selector, actionsList] of Object.entries(actMap)) {
      const elements = (this.widgetWrap || searchRoot)?.querySelectorAll(selector);
      if (!elements?.length) continue;
      elements.forEach((el) => {
        if (el.dataset.pbuBound) return;
        el.dataset.pbuBound = 'true';
        this.bindElement(el, actionsList);
      });
    }
    this.inputField?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        (this.widgetWrap || searchRoot)?.querySelector('.gen-btn')?.click();
      }
    });

    const pbuEvents = this.analyticsModule.PROMPT_BAR_EVENTS;
    this.bindWidgetInteractionEvent('pbu-enter-prompt', pbuEvents.ENTER_PROMPT, 'enter-prompt');
    this.bindWidgetInteractionEvent('pbu-model-dropdown-open', pbuEvents.MODEL_SELECT_DROPDOWN, 'open');
    this.bindWidgetInteractionEvent('pbu-ratio-dropdown-open', pbuEvents.RATIO_DROPDOWN, 'open');
    this.widgetWrap?.addEventListener('pbu-delete-image', () => this.resetUploadedAssetState({ dropPendingImage: true }));
    this.bindOuterMarqueeDropTarget();
  }

  bindOuterMarqueeDropTarget() {
    const outerMarquee = this.block?.querySelector('.upload-marquee-layout') || this.block;
    const dropZone = this.widgetWrap?.querySelector('.drop-zone');
    if (!outerMarquee || outerMarquee.dataset.pbuOuterDropBound === 'true') return;
    outerMarquee.dataset.pbuOuterDropBound = 'true';

    let dragDepth = 0;
    const hasFilePayload = (e) => !!e?.dataTransfer?.types
      && Array.from(e.dataTransfer.types).includes('Files');
    const setDropzoneHighlight = (isOn) => dropZone?.classList.toggle('drag-over', !!isOn);

    outerMarquee.addEventListener('dragenter', (e) => {
      if (!hasFilePayload(e)) return;
      e.preventDefault();
      dragDepth += 1;
      setDropzoneHighlight(true);
    });

    outerMarquee.addEventListener('dragover', (e) => {
      if (!hasFilePayload(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDropzoneHighlight(true);
    });

    outerMarquee.addEventListener('dragleave', (e) => {
      if (!hasFilePayload(e)) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDropzoneHighlight(false);
    });

    outerMarquee.addEventListener('drop', async (e) => {
      if (!hasFilePayload(e)) return;
      e.preventDefault();
      dragDepth = 0;
      setDropzoneHighlight(false);
      void this.trackUploadFileAttempt('drop');
      sendAnalyticsEvent(new CustomEvent('Drag and drop|UnityWidget'));
      const files = this.extractFiles(e);
      await this.executeAction('file-selected', outerMarquee, files);
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
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', async (e) => {
          e.preventDefault();
          el.classList.remove('drag-over');
          void this.trackUploadFileAttempt('drop');
          sendAnalyticsEvent(new CustomEvent('Drag and drop|UnityWidget'));
          const files = this.extractFiles(e);
          await this.executeAction(primaryAction, el, files);
        });
        el.addEventListener('click', () => {
          void this.trackUploadFileAttempt('drop-zone-click');
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
          await this.handleGenerate(true);
          break;
        case 'more':
          await this.handleGenerate(false);
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

  bindWidgetInteractionEvent(domEventName, analyticsEventName, action) {
    this.widgetWrap?.addEventListener(domEventName, () => {
      sendAnalyticsEvent(new CustomEvent(analyticsEventName));
      this.logAnalyticsinSplunk(analyticsEventName, { action });
    });
  }

  preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }
}
