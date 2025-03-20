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
      if (!this.renderWidget) return {};
      this.showErrorToast(errorCallbackOptions);
      throw Error('Operation failed');
    }
  }

  showErrorToast(errorCallbackOptions) {
    //this.canvasArea?.querySelector('.progress-circle')?.classList.remove('show');
    if (!errorCallbackOptions.errorToastEl) return;
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.nextSibling.textContent;
    this.canvasArea.forEach((element) => {
      // Temporarily disable click events on canvasArea
      element.style.pointerEvents = 'none';
      const errorToast = element.querySelector('.alert-holder');
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
    // Bind the method to preserve this context
    this.initActionListeners = this.initActionListeners.bind(this);
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

  async cancelAcrobatOperation() {
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    await this.transitionScreen.showSplashScreen();
    //this.dispatchAnalyticsEvent('cancel');
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

  getImageBlobData(url) {
    return new Promise((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'blob';
      xhr.onload = () => {
        if (xhr.status === 200) res(xhr.response);
        else rej(xhr.status);
      };
      xhr.send();
    });
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

  async uploadAsset(imgUrl) {
    const resJson = await this.serviceHandler.postCallToService(
      this.psApiConfig.psEndPoint.assetUpload,
      {},
      {
        errorToastEl: this.errorToastEl,
        errorType: '.icon-error-request',
      },
    );

    const { id, href } = resJson;
    const blobData = await this.getImageBlobData(imgUrl);
    const fileType = this.getFileType();
    const assetId = await this.uploadImgToUnity(href, id, blobData, fileType);
    const { origin } = new URL(imgUrl);
    if ((imgUrl.startsWith('blob:')) || (origin != window.location.origin)) this.scanImgForSafety(assetId);
    return assetId;
  }

  async createErrorToast() {
    const [alertImg, closeImg] = await Promise.all([
      fetch(`${getUnityLibs()}/img/icons/alert.svg`).then((res) => res.text()),
      fetch(`${getUnityLibs()}/img/icons/close.svg`).then((res) => res.text()),
    ]);
    const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
    // Create and append error holder to each element
    this.canvasArea.forEach((element) => {
      // Create new alert content for each holder
      const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, 'Alert Text'));
      const alertIcon = createTag(
        'div',
        { class: 'alert-icon' },
      );
      alertIcon.innerHTML = alertImg;
      alertIcon.append(alertText);
      const alertClose = createTag(
        'a',
        { class: 'alert-close', href: '#' },
      );
      alertClose.innerHTML = closeImg;
      alertClose.append(createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
      const alertContent = createTag('div', { class: 'alert-content' });
      alertContent.append(alertIcon, alertClose);

      const errholder = createTag('div', { class: 'alert-holder' }, createTag('div', { class: 'alert-toast' }, alertContent));
      alertClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent event from bubbling to canvasArea
        errholder.classList.remove('show');
        element.style.pointerEvents = 'auto'; // Re-enable click events
      }); // Remove listener after first use
      decorateDefaultLinkAnalytics(errholder);
      element.append(errholder);
    });
    // Return the first error holder for reference
    return this.canvasArea[0]?.querySelector('.alert-holder');
  }

  async continueInApp() {
    const cOpts = {
      targetProduct: this.workflowCfg.productName,
      payload: {
        locale: getLocale(),
        operations: this.operations,
      },
    };
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, 95);
    try {
      const { url } = await this.serviceHandler.postCallToService(
        this.psApiConfig.connectorApiEndPoint,
        { body: JSON.stringify(cOpts) },
        {
          errorToastEl: this.errorToastEl,
          errorType: '.icon-error-request',
        },
      );
      window.location.href = url;
    } catch (e) {
      await this.transitionScreen.showSplashScreen();
    }
  }

  checkImageDimensions(objectUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        URL.revokeObjectURL(objectUrl);
        if (width > 8000 || height > 8000) {
          this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filetype' });
          reject(new Error('Unable to process the file type!'));
        } else {
          resolve({ width, height });
        }
      };
      img.onerror = () => {
        // Clean up the object URL on error too
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      img.src = objectUrl;
    });
  }

  async uploadImage(files) {
    if (!files) return;
    if (files.length > 1) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filecount' });
      throw new Error('Only one file allowed!!');
    }
    if (['image/jpeg', 'image/png', 'image/jpg'].indexOf(files[0].type) == -1) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filetype' });
      throw new Error('File format not supported!!');
    }
    if (files[0].size > 40000000) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filesize' });
      throw new Error('File too large!!');
    }
    const objectUrl = URL.createObjectURL(files[0]);
    await this.checkImageDimensions(objectUrl);
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    await this.transitionScreen.showSplashScreen(true);
    try {
      const assetId = await this.uploadAsset(objectUrl);
      const operationItem = {
        operationType: 'upload',
        fileType: files[0].type,
      };
      this.operations.push(operationItem);
    } catch (e) {
      await this.transitionScreen.showSplashScreen();
    }
  }

  async photoshopActionMaps(value, files) {
    await this.handlePreloads();
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    switch (value) {
      case 'upload':
        this.promiseStack = [];
        if (this.workflowCfg.supportedFeatures.size === 0) await this.uploadImage(files);
        else if (this.workflowCfg.supportedFeatures.size === 1) await this.uploadImage(files);
        break;
      case 'interrupt':
        await this.cancelAcrobatOperation();
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
            el.addEventListener('drop', async (e) => {
              e.preventDefault();
              const files = this.extractFiles(e);
              await this.photoshopActionMaps(value, files);
            });
            break;
          case el.nodeName === 'INPUT':
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
