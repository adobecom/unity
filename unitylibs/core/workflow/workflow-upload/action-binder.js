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
  sendAnalyticsEvent,
} from '../../../scripts/utils.js';

class ServiceHandler {
  constructor(renderWidget = false, canvasArea = null, unityEl = null, workflowCfg = {}, getAdditionalHeaders = null) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.getAdditionalHeaders = getAdditionalHeaders;
  }

  async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey, this.getAdditionalHeaders?.() || {}),
      ...options,
    };
    const response = await fetch(api, postOpts);
    if (failOnError && response.status !== 200) {
      const error = new Error('Operation failed');
      error.status = response.status;
      throw error;
    }
    if (!failOnError) return response;
    return await response.json();
  }

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    const isLightroomServerError = this.workflowCfg.productName.toLowerCase() === 'lightroom' && errorType === 'server';
    if (isLightroomServerError) sendAnalyticsEvent(new CustomEvent('Upload or Transition error|UnityWidget'));
    else sendAnalyticsEvent(new CustomEvent(`Upload ${errorType} error|UnityWidget|${errorCallbackOptions.errorCode || ''}|${errorCallbackOptions.fileMetaData || ''}`));
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
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea;
    this.errorToastEl = null;
    this.apiConfig = this.getApiConfig();
    this.serviceHandler = null;
    this.splashScreenEl = null;
    this.transitionScreen = null;
    this.LOADER_LIMIT = 95;
    const commonLimits = workflowCfg.targetCfg.limits || {};
    const productLimits = workflowCfg.targetCfg[`limits-${workflowCfg.productName.toLowerCase()}`] || {};
    this.limits = { ...commonLimits, ...productLimits };
    this.promiseStack = [];
    this.initActionListeners = this.initActionListeners.bind(this);
    const productTag = workflowCfg.targetCfg[`productTag-${workflowCfg.productName.toLowerCase()}`] || 'UNKNOWN';
    this.lanaOptions = { sampleRate: 100, tags: `Unity-${productTag}-Upload` };
    this.desktop = false;
    this.sendAnalyticsToSplunk = null;
    this.assetId = null;
  }

  getApiConfig() {
    unityConfig.endPoint = {
      assetUpload: `${unityConfig.apiEndPoint}/asset`,
      acmpCheck: `${unityConfig.apiEndPoint}/asset/finalize`,
    };
    return unityConfig;
  }

  getAdditionalHeaders() {
    return {
      'x-unity-product': this.workflowCfg?.productName,
      'x-unity-action': this.workflowCfg?.supportedFeatures?.values()?.next()?.value,
    };
  }

  async handlePreloads() {
    const parr = [];
    if (this.workflowCfg.targetCfg.showSplashScreen) {
      parr.push(
        `${getUnityLibs()}/core/styles/splash-screen.css`,
      );
    }
    await priorityLoad(parr);
  }

  async cancelUploadOperation() {
    try {
      sendAnalyticsEvent(new CustomEvent('Cancel|UnityWidget'));
      this.logAnalyticsinSplunk('Cancel|UnityWidget', { assetId: this.assetId });
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
      await this.transitionScreen.showSplashScreen();
      const e = new Error('Operation termination requested.');
      const cancelPromise = Promise.reject(e);
      this.promiseStack.unshift(cancelPromise);
    } catch (error) {
      await this.transitionScreen?.showSplashScreen();
      window.lana?.log(`Message: Error cancelling upload operation, Error: ${error}`, this.lanaOptions);
      throw error;
    }
  }

  extractFiles(e) {
    const files = [];
    if (e.dataTransfer?.items) {
      [...e.dataTransfer.items].forEach((item) => {
        if (item.kind === 'file') files.push(item.getAsFile());
      });
    } else if (e.target?.files) {
      [...e.target.files].forEach((file) => files.push(file));
    }
    return files;
  }

  async uploadImgToUnity(storageUrl, id, blobData, fileType) {
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
    };
    const response = await fetch(storageUrl, uploadOptions);
    if (response.status !== 200) {
      window.lana?.log(`Message: Failed to upload image to Unity, Error: ${response.status}`, this.lanaOptions);
      const error = new Error('Failed to upload image to Unity');
      error.status = response.status;
      throw error;
    }
    this.logAnalyticsinSplunk('Upload Completed|UnityWidget', { assetId: this.assetId });
  }

  async scanImgForSafety(assetId) {
    const assetData = { assetId, targetProduct: this.workflowCfg.productName };
    const optionsBody = { body: JSON.stringify(assetData) };
    const res = await this.serviceHandler.postCallToService(
      this.apiConfig.endPoint.acmpCheck,
      optionsBody,
      {},
      false,
    );
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      setTimeout(() => { this.scanImgForSafety(assetId); }, 1000);
    }
  }

  async uploadAsset(file) {
    const assetDetails = {
      targetProduct: this.workflowCfg.productName,
      name: file.name,
      size: file.size,
      format: file.type,
    };
    try {
      const resJson = await this.serviceHandler.postCallToService(
        this.apiConfig.endPoint.assetUpload,
        { body: JSON.stringify(assetDetails) },
        { errorToastEl: this.errorToastEl, errorType: '.icon-error-request' },
      );
      const { id, href, blocksize, uploadUrls } = resJson;
      this.assetId = id;
      this.logAnalyticsinSplunk('Asset Created|UnityWidget', { assetId: this.assetId });
      if (blocksize && uploadUrls && Array.isArray(uploadUrls)) {
        const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
        const uploadHandler = new UploadHandler(this, this.serviceHandler);
        const { failedChunks, attemptMap } = await uploadHandler.uploadChunksToUnity(uploadUrls, file, blocksize);
        if (failedChunks && failedChunks.size > 0) {
          const error = new Error(`One or more chunks failed to upload for asset: ${id}, ${file.size} bytes, ${file.type}`);
          error.status = 504;
          this.logAnalyticsinSplunk('Chunked Upload Failed|UnityWidget', {
            assetId: this.assetId,
            failedChunks: failedChunks.size,
            maxRetryCount: Math.max(...Array.from(attemptMap.values())),
          });
          throw error;
        }
        await uploadHandler.scanImgForSafetyWithRetry(this.assetId);
      } else {
        await this.uploadImgToUnity(href, id, file, file.type);
        this.scanImgForSafety(this.assetId);
      }
      return true;
    } catch (e) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
      await this.transitionScreen.showSplashScreen();
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

  async createErrorToast() {
    try {
      const [alertImg, closeImg] = await Promise.all([
        fetch(`${getUnityLibs()}/img/icons/alert.svg`).then((res) => res.text()),
        fetch(`${getUnityLibs()}/img/icons/close.svg`).then((res) => res.text()),
      ]);
      const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
      this.canvasArea.forEach((element) => {
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
          element.style.pointerEvents = 'auto';
        });
        decorateDefaultLinkAnalytics(errholder);
        element.append(errholder);
      });
      return this.canvasArea[0]?.querySelector('.alert-holder');
    } catch (e) {
      window.lana?.log(`Message: Error creating error toast, Error: ${e}`, this.lanaOptions);
      return null;
    }
  }

  async continueInApp(assetId, file) {
    const cgen = this.unityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
    const queryParams = {};
    if (cgen) {
      cgen.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        if (key && value) {
          queryParams[key] = value;
        }
      });
    }
    const payload = {
      locale: getLocale(),
      additionalQueryParams: queryParams,
      workflow: this.workflowCfg.supportedFeatures.values().next().value,
      type: file.type,
    };
    if (this.workflowCfg.productName.toLowerCase() === 'firefly') {
      payload.action = 'asset-upload';
    }
    if (this.workflowCfg.productName.toLowerCase() === 'photoshop') {
      payload.referer = window.location.href;
      payload.desktopDevice = this.desktop;
    }
    const cOpts = {
      assetId,
      targetProduct: this.workflowCfg.productName,
      payload,
    };
    try {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.LOADER_LIMIT = 100;
      this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
      this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, 100);
      const servicePromise = this.serviceHandler.postCallToService(
        this.apiConfig.connectorApiEndPoint,
        { body: JSON.stringify(cOpts) },
        { errorToastEl: this.errorToastEl, errorType: '.icon-error-request' },
      );
      this.promiseStack.push(servicePromise);
      const response = await servicePromise;
      if (!response?.url) {
        const error = new Error('Error connecting to App');
        error.status = response.status;
        throw error;
      }
      const finalResults = await Promise.allSettled(this.promiseStack);
      if (finalResults.some((result) => result.status === 'rejected')) return;
      window.location.href = response.url;
    } catch (e) {
      if (e.message === 'Operation termination requested.') return;
      await this.transitionScreen.showSplashScreen();
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, e, this.lanaOptions);
      this.logAnalyticsinSplunk('Upload server error|UnityWidget', {
        errorData: {
          code: 'error-request',
          subCode: `continueInApp ${e.status}`,
          desc: e.message || undefined,
        },
        assetId: this.assetId,
      });
      throw e;
    }
  }

  async checkImageDimensions(file) {
    const { getImageDimensions } = await import(`${getUnityLibs()}/utils/FileUtils.js`);
    const { width, height } = await getImageDimensions(file);
    const isMaxLimits = this.limits.maxWidth && this.limits.maxHeight;
    const isMinLimits = this.limits.minWidth && this.limits.minHeight;
    if (isMaxLimits && (width > this.limits.maxWidth || height > this.limits.maxHeight)) {
      this.handleClientUploadError('.icon-error-filedimension', 'error-filedimension', `${width}x${height}`, 'Unable to process the file type!');
      throw new Error('Unable to process the file type!');
    }
    if (isMinLimits && (width < this.limits.minWidth || height < this.limits.minHeight)) {
      this.handleClientUploadError('.icon-error-filemindimension', 'error-filemindimension', `${width}x${height}`, 'Unable to process the file type!');
      throw new Error('Unable to process the file type!');
    }
    return { width, height };
  }

  async initAnalytics() {
    if (!this.sendAnalyticsToSplunk && this.workflowCfg.targetCfg.sendSplunkAnalytics) {
      this.sendAnalyticsToSplunk = (await import(`${getUnityLibs()}/scripts/splunk-analytics.js`)).default;
    }
  }

  logAnalyticsinSplunk(eventName, data) {
    if (this.sendAnalyticsToSplunk) {
      this.sendAnalyticsToSplunk(eventName, this.workflowCfg.productName, data, `${unityConfig.apiEndPoint}/log`);
    }
  }

  handleClientUploadError(errorTypeSelector, errorCode, fileMetaData = {}, message = '') {
    this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: errorTypeSelector, errorCode: errorCode, fileMetaData }, message, this.lanaOptions, 'client');
    this.logAnalyticsinSplunk('Upload client error|UnityWidget', { errorData: { code: errorCode, fileMetaData } });
  }

  async uploadImage(files) {
    if (!files) return;
    await this.initAnalytics();
    const file = files[0];
    if (this.limits.maxNumFiles !== files.length) {
      this.handleClientUploadError('.icon-error-filecount', 'error-filecount', files.length, '');
      return;
    }
    if (!this.limits.allowedFileTypes.includes(file.type)) {
      this.handleClientUploadError('.icon-error-filetype', 'error-filetype', file.type, '');
      return;
    }
    if (this.limits.maxFileSize < file.size) {
      this.handleClientUploadError('.icon-error-filesize', 'error-filesize', file.size, '');
      return;
    }
    try { await this.checkImageDimensions(file); } catch (error) {
      window.lana?.log(`Message: Error checking image dimensions, Error: ${error}`, this.lanaOptions);
      return;
    }
    sendAnalyticsEvent(new CustomEvent('Uploading Started|UnityWidget'));
    this.logAnalyticsinSplunk('Uploading Started|UnityWidget');
    if (this.workflowCfg.pswFeature) {
      const { default: isDesktop } = await import(`${getUnityLibs()}/utils/device-detection.js`);
      this.desktop = isDesktop();
    }
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
    await this.transitionScreen.showSplashScreen(true);
    const uploadSuccess = await this.uploadAsset(file);
    if (uploadSuccess) await this.continueInApp(this.assetId, file);
  }

  async loadTransitionScreen() {
    if (!this.transitionScreen) {
      try {
        const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
        this.transitionScreen = new TransitionScreen(this.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
        await this.transitionScreen.delayedSplashLoader();
      } catch (error) {
        window.lana?.log(`Message: Error loading transition screen, Error: ${error}`, this.lanaOptions);
        throw error;
      }
    }
  }

  async executeActionMaps(value, files) {
    await this.loadTransitionScreen();
    await this.handlePreloads();
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    switch (value) {
      case 'upload':
        this.promiseStack = [];
        await this.uploadImage(files);
        break;
      case 'interrupt':
        await this.cancelUploadOperation();
        break;
      default:
        break;
    }
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
      this.unityEl,
      this.workflowCfg,
      this.getAdditionalHeaders.bind(this),
    );
    const actions = {
      A: (el, key) => {
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.executeActionMaps(actMap[key]);
        });
      },
      DIV: (el, key) => {
        el.addEventListener('drop', async (e) => {
          sendAnalyticsEvent(new CustomEvent('Drag and drop|UnityWidget'));
          this.preventDefault(e);
          const files = this.extractFiles(e);
          await this.executeActionMaps(actMap[key], files);
        });
        el.addEventListener('click', () => {
          sendAnalyticsEvent(new CustomEvent('Click Drag and drop|UnityWidget'));
        });
      },
      INPUT: (el, key) => {
        el.addEventListener('click', () => {
          this.canvasArea.forEach((element) => {
            const errHolder = element.querySelector('.alert-holder');
            if (errHolder?.classList.contains('show')) {
              element.style.pointerEvents = 'auto';
              errHolder.classList.remove('show');
            }
          });
        });
        el.addEventListener('change', async (e) => {
          const files = this.extractFiles(e);
          await this.executeActionMaps(actMap[key], files);
          e.target.value = '';
        });
      },
    };
    for (const [key] of Object.entries(actMap)) {
      const elements = b.querySelectorAll(key);
      if (elements && elements.length > 0) {
        elements.forEach(async (el) => {
          const actionType = el.nodeName;
          if (actions[actionType]) {
            await actions[actionType](el, key);
          }
        });
      }
    }
    if (b === this.block) {
      this.loadTransitionScreen();
    }
    window.addEventListener('pageshow', (event) => {
      const navigationEntries = window.performance.getEntriesByType('navigation');
      const historyTraversal = event.persisted
        || (typeof window.performance !== 'undefined'
          && navigationEntries.length > 0
          && navigationEntries[0].type === 'back_forward');
      if (historyTraversal) {
        window.location.reload();
      }
    });
    window.addEventListener('dragover', this.preventDefault.bind(this), false);
    window.addEventListener('drop', this.preventDefault.bind(this), false);
  }

  preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }
}
