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
  constructor(renderWidget = false, canvasArea = null, unityEl = null) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
  }

  async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey),
      ...options,
    };
    try {
      const response = await fetch(api, postOpts);
      if (failOnError && response.status !== 200) throw new Error('Operation failed');
      if (!failOnError) return response;
      return await response.json();
    } catch (err) {
      this.showErrorToast(errorCallbackOptions, err, this.lanaOptions);
      throw new Error('Operation failed');
    }
  }

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    if (!errorCallbackOptions.errorToastEl) return;
    const errorUpdate = error || '';
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.nextSibling.textContent;
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
    if (errorType === 'client') sendAnalyticsEvent(new CustomEvent('Upload client error|UnityWidget'));
    else sendAnalyticsEvent(new CustomEvent('Upload server error|UnityWidget'));
    window.lana?.log(`Message: ${msg}, Error: ${errorUpdate}`, lanaOptions);
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
    this.psApiConfig = this.getPsApiConfig();
    this.serviceHandler = null;
    this.splashScreenEl = null;
    this.transitionScreen = null;
    this.LOADER_LIMIT = 95;
    this.limits = workflowCfg.targetCfg.limits;
    this.promiseStack = [];
    this.initActionListeners = this.initActionListeners.bind(this);
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-PS-Upload' };
    this.desktop = false;
    this.sendAnalyticsToSplunk = null;
    this.file = null;
  }

  getPsApiConfig() {
    unityConfig.psEndPoint = {
      assetUpload: `${unityConfig.apiEndPoint}/asset`,
      acmpCheck: `${unityConfig.apiEndPoint}/asset/finalize`,
    };
    return unityConfig;
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
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
      await this.transitionScreen.showSplashScreen();
      const e = new Error('Operation termination requested.');
      const cancelPromise = Promise.reject(e);
      this.promiseStack.unshift(cancelPromise);
    } catch (error) {
      sendAnalyticsEvent(new CustomEvent('Upload server error|UnityWidget'));
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
      throw new Error('Failed to upload image to Unity');
    }
    return id;
  }

  async scanImgForSafety(assetId) {
    const assetData = { assetId, targetProduct: this.workflowCfg.productName };
    const optionsBody = { body: JSON.stringify(assetData) };
    const res = await this.serviceHandler.postCallToService(
      this.psApiConfig.psEndPoint.acmpCheck,
      optionsBody,
      {},
      false,
    );
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      setTimeout(() => { this.scanImgForSafety(assetId); }, 1000);
    }
  }

  async uploadAsset(file) {
    try {
      const resJson = await this.serviceHandler.postCallToService(
        this.psApiConfig.psEndPoint.assetUpload,
        {},
        { errorToastEl: this.errorToastEl, errorType: '.icon-error-request' },
      );
      const { id, href } = resJson;
      const assetId = await this.uploadImgToUnity(href, id, file, file.type);
      this.scanImgForSafety(assetId);
      return assetId;
    } catch (e) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
      await this.transitionScreen.showSplashScreen();
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, e, this.lanaOptions);
      this.logAnalyticsinSplunk('Error|UnityWidget', {
        errorData: {
          code: 'error-request',
          subCode: `uploadAsset ${e.status}`,
          desc: e.message || undefined,
        },
      });
      throw e;
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
          e.preventDefault();
          e.stopPropagation();
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

  async continueInApp(assetId) {
    const cgen = this.unityEl.querySelector('.icon-cgen')?.nextSibling.textContent;
    const queryParams = {};
    if (cgen) {
      const params = cgen.split('&');
      params.forEach((param) => {
        const [key, value] = param.split('=');
        if (key && value) {
          queryParams[key] = value;
        }
      });
    }
    const cOpts = {
      assetId,
      targetProduct: this.workflowCfg.productName,
      payload: {
        locale: getLocale(),
        workflow: this.workflowCfg.supportedFeatures.values().next().value,
        referer: window.location.href,
        desktopDevice: this.desktop,
        additionalQueryParams: queryParams,
      },
    };
    try {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.LOADER_LIMIT = 100;
      this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
      this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, 100);
      const servicePromise = this.serviceHandler.postCallToService(
        this.psApiConfig.connectorApiEndPoint,
        { body: JSON.stringify(cOpts) },
        { errorToastEl: this.errorToastEl, errorType: '.icon-error-request' },
      );
      this.promiseStack.push(servicePromise);
      const response = await servicePromise;
      if (!response?.url) throw new Error('Error connecting to App');
      const finalResults = await Promise.allSettled(this.promiseStack);
      if (finalResults.some((result) => result.status === 'rejected')) return;
      this.logAnalyticsinSplunk('Redirecting to App|UnityWidget', { redirectUrl: response.url });
      window.location.href = response.url;
    } catch (e) {
      if (e.message === 'Operation termination requested.') return;
      await this.transitionScreen.showSplashScreen();
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, e, this.lanaOptions);
      this.logAnalyticsinSplunk('Error|UnityWidget', {
        errorData: {
          code: 'error-request',
          subCode: `continueInApp ${e.status}`,
          desc: e.message || undefined,
        },
      });
      throw e;
    }
  }

  async checkImageDimensions(objectUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        const { naturalWidth: width, naturalHeight: height } = img;
        URL.revokeObjectURL(objectUrl);
        if (width > this.limits.maxWidth || height > this.limits.maxHeight) {
          this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filedimension' }, 'Unable to process the file type!', this.lanaOptions, 'client');
          this.logAnalyticsinSplunk('Upload client error|UnityWidget', { errorData: { code: 'error-filedimension' } });
          reject(new Error('Unable to process the file type!'));
        } else {
          resolve({ width, height });
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      img.src = objectUrl;
    });
  }

  async initAnalytics() {
    if (this.workflowCfg.targetCfg.sendSplunkAnalytics) {
      const module = await import(`${getUnityLibs()}/scripts/lana-analytics.js`);
      this.sendAnalyticsToSplunk = module.default;
    }
  }

  logAnalyticsinSplunk(eventName, data) {
    if (this.sendAnalyticsToSplunk) {
      this.sendAnalyticsToSplunk(eventName, {
        eventName,
        ...data,
      }, `${unityConfig.apiEndPoint}/log`);
    }
  }

  async uploadImage(files) {
    if (!files) return;
    await this.initAnalytics();
    const file = files[0];
    if (this.limits.maxNumFiles !== files.length) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filecount' }, '', this.lanaOptions, 'client');
      this.logAnalyticsinSplunk('Upload client error|UnityWidget', { errorData: { code: 'error-filecount' } });
      return;
    }
    if (!this.limits.allowedFileTypes.includes(file.type)) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filetype' }, '', this.lanaOptions, 'client');
      this.logAnalyticsinSplunk('Upload client error|UnityWidget', { errorData: { code: 'error-filetype' } });
      return;
    }
    if (this.limits.maxFileSize < file.size) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filesize' }, '', this.lanaOptions, 'client');
      this.logAnalyticsinSplunk('Upload client error|UnityWidget', { errorData: { code: 'error-filesize' } });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    await this.checkImageDimensions(objectUrl);
    sendAnalyticsEvent(new CustomEvent('Uploading Started|UnityWidget'));
    this.logAnalyticsinSplunk('Uploading Started|UnityWidget');
    const { default: isDesktop } = await import(`${getUnityLibs()}/scripts/device-detection.js`);
    this.desktop = isDesktop();
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
    await this.transitionScreen.showSplashScreen(true);
    const assetId = await this.uploadAsset(file);
    this.file = file;
    await this.continueInApp(assetId);
  }

  async photoshopActionMaps(value, files) {
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
    );
    const actions = {
      A: (el, key) => {
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.photoshopActionMaps(actMap[key]);
        });
      },
      DIV: (el, key) => {
        el.addEventListener('drop', async (e) => {
          sendAnalyticsEvent(new CustomEvent('Drag and drop|UnityWidget'));
          e.preventDefault();
          e.stopPropagation();
          const files = this.extractFiles(e);
          await this.photoshopActionMaps(actMap[key], files);
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
          await this.photoshopActionMaps(actMap[key], files);
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
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(this.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
      await this.transitionScreen.delayedSplashLoader();
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
  }

  preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }
}
