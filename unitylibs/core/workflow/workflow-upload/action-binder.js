/* eslint-disable consistent-return */
/* eslint-disable max-classes-per-file */
/* eslint-disable eqeqeq */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  getGuestAccessToken,
  unityConfig,
  getUnityLibs,
  priorityLoad,
  loadImg,
  createTag,
  getLocale,
  getLibs,
} from '../../../scripts/utils.js';

class ServiceHandler {
  constructor(renderWidget = false, canvasArea = null, unityEl = null) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
  }

  getHeaders() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: getGuestAccessToken(),
        'x-api-key': unityConfig.apiKey,
      },
    };
  }

  async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
    const postOpts = {
      method: 'POST',
      ...this.getHeaders(),
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
    this.canvasArea?.querySelector('.progress-circle')?.classList.remove('show');
    if (!errorCallbackOptions.errorToastEl) return;
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.nextSibling.textContent;
    errorCallbackOptions.errorToastEl.querySelector('.alert-text p').innerText = msg;
    errorCallbackOptions.errorToastEl.classList.add('show');
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
    return files[0];
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
    const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, 'Alert Text'));
    const alertIcon = createTag(
      'div',
      { class: 'alert-icon' },
      '<svg><use xlink:href="#unity-alert-icon"></use></svg>',
    );
    alertIcon.append(alertText);
    const alertClose = createTag(
      'a',
      { class: 'alert-close', href: '#' },
      '<svg><use xlink:href="#unity-close-icon"></use></svg>',
    );
    alertClose.append(createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
    const alertContent = createTag('div', { class: 'alert-content' });
    alertContent.append(alertIcon, alertClose);
    const errholder = createTag('div', { class: 'alert-holder' }, createTag('div', { class: 'alert-toast' }, alertContent));
    alertClose.addEventListener('click', (e) => {
      e.preventDefault();
      e.target.closest('.alert-holder').classList.remove('show');
    });
    const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
    decorateDefaultLinkAnalytics(errholder);
    this.canvasArea.append(errholder);
    return errholder;
  }

  async continueInApp() {
    const cOpts = {
      targetProduct: this.workflowCfg.productName,
      payload: {
        locale: getLocale(),
        operations: this.operations,
      },
    };
    /*const continueOperations = ['removeBackground', 'changeBackground', 'imageAdjustment'];
    this.operations.forEach((op, i) => {
      if (!continueOperations.includes(op.operationType)) return;
      if (!cOpts.assetId && !cOpts.href) {
        if (op.sourceAssetUrl) cOpts.href = op.sourceAssetUrl;
        else if (op.sourceAssetId) cOpts.assetId = op.sourceAssetId;
      }
      let idx = cOpts.payload.operations.length;
      if (idx > 0 && cOpts.payload.operations[idx - 1].name === op.operationType) {
        idx -= 1;
      } else {
        cOpts.payload.operations.push({ name: op.operationType });
      }
      if (op.assetId) {
        cOpts.payload.finalAssetId = op.assetId;
        if (op.operationType == 'changeBackground') cOpts.payload.operations[idx].assetIds = [op.bgId];
      } else if (op.assetUrl) {
        cOpts.payload.finalAssetUrl = op.assetUrl;
        if (op.operationType == 'changeBackground') cOpts.payload.operations[idx].hrefs = [op.backgroundSrc];
      }
      if (op.operationType == 'imageAdjustment' && op.adjustmentType) {
        cOpts.payload.operations[idx][op.adjustmentType] = parseInt(op.filterValue, 10);
      }
    });*/
    
    const { url } = await this.serviceHandler.postCallToService(
      this.psApiConfig.connectorApiEndPoint,
      { body: JSON.stringify(cOpts) },
      {
        errorToastEl: this.errorToastEl,
        errorType: '.icon-error-request',
      },
    );
    window.location.href = url;
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

  async uploadImage(file) {
    if (!file) return;
    if (['image/jpeg', 'image/png', 'image/jpg'].indexOf(file.type) == -1) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filetype' });
      throw new Error('File format not supported!!');
    }
    if (file.size > 40000000) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filesize' });
      throw new Error('File too large!!');
    }
    const objectUrl = URL.createObjectURL(file);
    await this.checkImageDimensions(objectUrl);
    const assetId = await this.uploadAsset(objectUrl);
    const operationItem = {
      operationType: 'upload',
      fileType: file.type,
    };
    this.operations.push(operationItem);
  }

  async photoshopActionMaps(value, file) {
    await this.handlePreloads();
    switch (value) {
      case 'upload':
        this.promiseStack = [];
        if (this.workflowCfg.supportedFeatures.length === 0) await this.uploadImage(file);
        else if (this.workflowCfg.supportedFeatures.length === 1) await this.uploadImage(file);
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
              const file = this.extractFiles(e);
              await this.photoshopActionMaps(value, file);
            });
            break;
          case el.nodeName === 'INPUT':
            el.addEventListener('change', async (e) => {
              const file = this.extractFiles(e);
              await this.photoshopActionMaps(value, file);
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
