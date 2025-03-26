/* eslint-disable consistent-return */
/* eslint-disable max-classes-per-file */
/* eslint-disable eqeqeq */
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
      if (failOnError && response.status != 200) throw Error('Operation failed');
      if (!failOnError) return response;
      const resJson = await response.json();
      return resJson;
    } catch (err) {
      await this.transitionScreen.showSplashScreen();
      this.showErrorToast(errorCallbackOptions);
      throw Error('Operation failed');
    }
  }

  showErrorToast(errorCallbackOptions) {
    /* this.canvasArea?.querySelector('.progress-circle')?.classList.remove('show'); */
    if (!errorCallbackOptions.errorToastEl) return;
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.nextSibling.textContent;
    this.canvasArea.forEach((element) => {
      element.style.pointerEvents = 'none';
      const errorToast = element.querySelector('.alert-holder');
      const closeBtn = errorToast.querySelector('.alert-close');
      closeBtn.style.pointerEvents = 'auto';
      if (!errorToast) return;
      const alertText = errorToast.querySelector('.alert-text p');
      if (!alertText) return;
      alertText.innerText = msg;
      errorToast.classList.add('show');
    });
  }
}

export default class ActionBinder {
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea;
    this.operations = [];
    this.errorToastEl = null;
    this.psApiConfig = this.getPsApiConfig();
    this.serviceHandler = null;
    this.splashScreenEl = null;
    this.transitionScreen = null;
    this.LOADER_LIMIT = 95;
    this.limits = workflowCfg.targetCfg.limits;
    this.promiseStack = [];

    // Bind methods to preserve context
    this.initActionListeners = this.initActionListeners.bind(this);
    //this.cancelUploadOperation = this.cancelUploadOperation.bind(this);
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
        `${this.splashFragmentLink}.plain.html`,
      );
    }
    await priorityLoad(parr);
  }

  async cancelUploadOperation() {
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    const e = new Error();
    e.message = 'Operation termination requested.';
    e.showError = false;
    const cancelPromise = Promise.reject(e);
    this.promiseStack.unshift(cancelPromise);
  }

  extractFiles(e) {
    const files = [];
    if (e.dataTransfer?.items) {
      [...e.dataTransfer.items].forEach((item) => {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          files.push(file);
        }
      });
    } else if (e.target?.files) {
      [...e.target.files].forEach((file) => {
        files.push(file);
      });
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
    if (response.status != 200) return '';
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
      setTimeout(() => { this.scanImgForSafety(); }, 1000);
    }
  }

  async uploadAsset(file) {
    try {
      const resJson = await this.serviceHandler.postCallToService(
        this.psApiConfig.psEndPoint.assetUpload,
        {},
        {
          errorToastEl: this.errorToastEl,
          errorType: '.icon-error-request',
        },
      );
      const { id, href } = resJson;
      const assetId = await this.uploadImgToUnity(href, id, file, file.type);
      this.scanImgForSafety(assetId);
      return assetId;
    } catch (e) {
      await this.transitionScreen.showSplashScreen();
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' });
    }
  }

  async createErrorToast() {
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
        element.style.pointerEvents = 'auto';
        e.preventDefault();
        e.stopPropagation();
        errholder.classList.remove('show');
      }, { once: true });

      decorateDefaultLinkAnalytics(errholder);
      element.append(errholder);
    });
    return this.canvasArea[0]?.querySelector('.alert-holder');
  }

  async continueInApp() {
    const cOpts = {
      targetProduct: this.workflowCfg.productName,
      workflow: this.workflowCfg.supportedFeatures[0],
      payload: { locale: getLocale() },
    };
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, 100);
    try {
      const { url } = await this.serviceHandler.postCallToService(
        this.psApiConfig.connectorApiEndPoint,
        { body: JSON.stringify(cOpts) },
        {
          errorToastEl: this.errorToastEl,
          errorType: '.icon-error-request',
        },
      );
      //window.location.href = url;
    } catch (e) {
      await this.transitionScreen.showSplashScreen();
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' });
    }
  }

  checkImageDimensions(objectUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        URL.revokeObjectURL(objectUrl);
        if (width > this.limits.maxWidth || height > this.limits.maxHeight) {
          this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filetype' });
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

  async uploadImage(files) {
    if (!files) return;
    if (this.limits.maxNumFiles !== files.length) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filecount' });
      throw new Error('Only one file allowed!!');
    }
    const file = files[0];
    if (!this.limits.allowedFileTypes.includes(file.type)) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filetype' });
      throw new Error('File format not supported!!');
    }
    if (this.limits.maxFileSize < file.size) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filesize' });
      throw new Error('File too large!!');
    }
    const objectUrl = URL.createObjectURL(file);
    await this.checkImageDimensions(objectUrl);
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    await this.transitionScreen.showSplashScreen(true);
    const assetId = await this.uploadAsset(file);
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
    await this.continueInApp();
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
      this.unityEl,
    );
    for (const [key, value] of Object.entries(actMap)) {
      const elements = b.querySelectorAll(key);
      if (!elements || elements.length === 0) return;
      elements.forEach((el) => {
        switch (true) {
          case el.nodeName === 'A':
            el.addEventListener('click', async (e) => {
              e.preventDefault();
              await this.photoshopActionMaps(value);
            });
            break;
          case el.nodeName === 'DIV':
            el.addEventListener('dragover', (e) => {
              e.preventDefault();
              e.stopPropagation();
            });
            el.addEventListener('dragenter', (e) => {
              e.preventDefault();
              e.stopPropagation();
            });
            el.addEventListener('drop', async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = this.extractFiles(e);
              await this.photoshopActionMaps(value, files);
            });
            break;
          case el.nodeName === 'INPUT':
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
              await this.photoshopActionMaps(value, files);
              e.target.value = '';
            });
            break;
          default:
            break;
        }
      });
    }
    if (b === this.block) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(this.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
      await this.transitionScreen.delayedSplashLoader();
    }
  }
}
