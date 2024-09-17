/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  getLibs,
  unityConfig,
  getUnityLibs,
  createTag,
  localizeLink,
  priorityLoad,
  loadArea
} from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}, limits = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.limits = limits;
    this.canvasArea = canvasArea;
    this.operations = [];
    this.acrobatApiConfig = this.getAcrobatApiConfig();
    this.serviceHandler = null;
    this.splashScreenEl = null;
    this.promiseStack = [];
    this.LOADER_DELAY = 800;
    this.LOADER_INCREMENT = 30;
  }

  getAcrobatApiConfig() {
    unityConfig.acrobatEndpoint = {
      createAsset: `${unityConfig.apiEndPoint}/asset`,
      finalizeAsset: `${unityConfig.apiEndPoint}/asset/finalize`,
    };
    return unityConfig;
  }

  async handlePreloads() {
    const parr = [`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`];
    if (this.workflowCfg.targetCfg.showSplashScreen) {
      this.splashFragmentLink = localizeLink(`${window.location.origin}${this.workflowCfg.targetCfg.splashScreenConfig.fragmentLink}`);
      parr.push(
        `${getLibs()}/blocks/fragment/fragment.js`,
        `${getLibs()}/blocks/text/text.js`,
        `${getLibs()}/blocks/text/text.css`,
        `${getLibs()}/blocks/video/video.js`,
        `${getLibs()}/blocks/video/video.css`,
        `${getUnityLibs()}/core/styles/splash-screen.css`,
        `${this.splashFragmentLink}.plain.html`);
    }
    await priorityLoad(parr);
  }
  
  updateProgressBar(layer, percentage) {
    const p = Math.min(percentage, 100);
    const spb = layer.querySelector('.spectrum-ProgressBar');
    spb.setAttribute('value', p);
    spb.setAttribute('aria-valuenow', p);
    layer.querySelector('.spectrum-ProgressBar-percentage').innerHTML = `${p}%`;
    layer.querySelector('.spectrum-ProgressBar-fill').style.width = `${p}%`;
  }

  createProgressBar() {
    const pdom = `<div class="spectrum-ProgressBar spectrum-ProgressBar--sizeM spectrum-ProgressBar--sideLabel" value="0" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
    <div class="spectrum-FieldLabel spectrum-FieldLabel--sizeM spectrum-ProgressBar-label"></div>
    <div class="spectrum-FieldLabel spectrum-FieldLabel--sizeM spectrum-ProgressBar-percentage">0%</div>
    <div class="spectrum-ProgressBar-track">
      <div class="spectrum-ProgressBar-fill" style="width: 0%;"></div>
    </div>
    </div>`;
    const layer = createTag('div', { class: 'progress-holder' }, pdom);
    return layer;
  }

  async acrobatActionMaps(values, files) {
    const { default: ServiceHandler } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`);
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
    );
    for (const value of values) {
      switch (true) {
        case value.actionType == 'upload' || value.actionType == 'drop':
          this.promiseStack = [];
          await this.userPdfUpload(value, files);
          break;
        case value.actionType == 'continueInApp':
          await this.continueInApp();
          break;
        case value.actionType == 'interrupt':
          await this.cancelAcrobatOperation();
        default:
          break;
      }
    }
  }

  initActionListeners(b = this.block, actMap = this.actionMap) {
    for (const [key, values] of Object.entries(actMap)) {
      const el = b.querySelector(key);
      if (!el) return;
      switch (true) {
        case el.nodeName === 'A':
          el.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.acrobatActionMaps(values);
          });
          break;
        case el.nodeName === 'DIV':
          el.addEventListener('dragenter', async (ev) => {
            await this.handlePreloads();
          }, { once: true });
          el.addEventListener('drop', async (e) => {
            e.preventDefault();
            this.block.dispatchEvent(new CustomEvent(unityConfig.trackAnalyticsEvent, { detail: { event: 'drop' } }));
            const files = this.extractFiles(e);
            await this.acrobatActionMaps(values, files);
          });
          break;
        case el.nodeName === 'INPUT':
          el.addEventListener('click', async (ev) => {
            await this.handlePreloads();
          }, { once: true });
          el.addEventListener('change', async (e) => {
            this.block.dispatchEvent(new CustomEvent(unityConfig.trackAnalyticsEvent, { detail: { event: 'change' } }));
            const files = this.extractFiles(e);
            await this.acrobatActionMaps(values, files);
            e.target.value = '';
          });
          break;
        default:
          break;
      }
    }
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

  async getBlobData(file) {
    const objUrl = URL.createObjectURL(file);
    const response = await fetch(objUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    const blob = await response.blob();
    URL.revokeObjectURL(objUrl);
    return blob;
  }

  async uploadFileToUnity(storageUrl, blobData, fileType) {
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
    };
    const response = await fetch(storageUrl, uploadOptions);
    return response;
  }

  async chunkPdf(assetData, blobData, filetype) {
    const totalChunks = Math.ceil(blobData.size / assetData.blocksize);
    if (assetData.uploadUrls.length !== totalChunks) return;
    const uploadPromises = Array.from({ length: totalChunks }, (_, i) => {
      const start = i * assetData.blocksize;
      const end = Math.min(start + assetData.blocksize, blobData.size);
      const chunk = blobData.slice(start, end);
      const url = assetData.uploadUrls[i];
      return this.uploadFileToUnity(url.href, chunk, filetype);
    });
    this.promiseStack.push(...uploadPromises);
    await Promise.all(this.promiseStack);
  }

  async continueInApp() {
    if (!this.operations.length) return;
    const { assetId, filename, filesize, filetype } = this.operations[this.operations.length - 1];
    const cOpts = {
      assetId,
      targetProduct: this.workflowCfg.productName,
      payload: {
        languageRegion: this.workflowCfg.langRegion,
        languageCode: this.workflowCfg.langCode,
        verb: this.workflowCfg.enabledFeatures[0],
        assetMetadata: {
          [assetId]: {
            name: filename,
            size: filesize,
            type: filetype,
          },
        },
      },
    };
    this.promiseStack.push(
      this.serviceHandler.postCallToService(
        this.acrobatApiConfig.connectorApiEndPoint,
        { body: JSON.stringify(cOpts) },
    ));
    await Promise.all(this.promiseStack)
    .then((resArr) => {
      const response = resArr[resArr.length - 1];
      if (!response?.url) throw new Error("Error connecting to App");
      window.location.href = response.url;
    })
    .catch(() => {
      this.handleSplashScreen();
      throw new Error("Error connecting to App");
    });
  }

  async cancelAcrobatOperation() {
    await this.handleSplashScreen();
    const cancelPromise = Promise.reject(new Error('Operation termination requested.'));
    this.promiseStack.unshift(cancelPromise);
  }

  progressBarHandler(s, delay, i, initialize = false) {
    if (!s) return;
    delay = Math.min(delay + 100, 2000);
    i = Math.max(i - 5, 5);
    const progressBar = s.querySelector('.spectrum-ProgressBar');
    if (!initialize && progressBar?.getAttribute('value') == 100) return;
    if (initialize) this.updateProgressBar(s, 0);
    setTimeout(() => {
      let v = initialize ? 0 : parseInt(progressBar.getAttribute('value'));
      this.updateProgressBar(s, v + i);
      this.progressBarHandler(s, delay, i);
    }, delay);
  }

  splashVisibilityController(displayOn) {
    if (this.splashScreenEl.classList.contains('show')) {
      this.splashScreenEl.classList.remove('show');
    } else if (displayOn) {
      this.progressBarHandler(this.splashScreenEl, this.LOADER_DELAY, this.LOADER_INCREMENT, true);
      this.splashScreenEl.classList.add('show');
    }
  }

  async loadSplashFragment() {
    const resp = await fetch(`${this.splashFragmentLink}.plain.html`);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sections = doc.querySelectorAll('body > div');
    const f = createTag('div', { class: 'fragment splash-loader'});
    f.append(...sections);
    const splashDiv = document.querySelector(this.workflowCfg.targetCfg.splashScreenConfig.splashScreenParent);
    splashDiv.append(f);
    await loadArea(f);
    return f;
  }

  async handleSplashProgressBar() {
    const pb = this.createProgressBar();
    this.splashScreenEl.querySelector('.icon-progress-bar').replaceWith(pb);
    this.progressBarHandler(this.splashScreenEl, this.LOADER_DELAY, this.LOADER_INCREMENT, true);
  }

  handleSplashCancel() {
    const actMap = {
      'a.con-button[href*="#_cancel"]': [
        {
          "actionType": "interrupt"
        }
      ]
    }
    this.initActionListeners(this.splashScreenEl, actMap);
  }

  async handleSplashScreen(displayOn = false) {
    if (!this.splashScreenEl && !this.workflowCfg.targetCfg.showSplashScreen) return;
    if (this.splashScreenEl) return this.splashVisibilityController(displayOn);
    this.splashScreenEl = await this.loadSplashFragment();
    if (this.splashScreenEl.querySelector('.icon-progress-bar')) await this.handleSplashProgressBar();
    if (this.splashScreenEl.querySelector('a.con-button[href*="#_cancel"]')) this.handleSplashCancel();
    this.splashScreenEl.classList.add('splash-loader', 'show');
  }

  verifyContent(assetData) {
    const finalAssetData = {
      surfaceId: unityConfig.surfaceId, 
      targetProduct: this.workflowCfg.productName,
      assetId: assetData.id,
    };
    this.serviceHandler.postCallToService(
      this.acrobatApiConfig.acrobatEndpoint.finalizeAsset,
      { body: JSON.stringify(finalAssetData) },
      false
    );
  }

  async userPdfUpload(params, files) {
    await this.handleSplashScreen(true);
    return;
    if (!files || files.length > this.limits.maxNumFiles) return;
    const file = files[0];
    if (!file) return;
    if (file.type != 'application/pdf') return;
    const [minsize, maxsize] = this.limits.allowedFileSize;
    if (!((file.size > minsize) && (file.size <= maxsize))) return;
    let assetData = null;
    try {
      await this.handleSplashScreen(true);
      const blobData = await this.getBlobData(file);
      const data = {
        surfaceId: unityConfig.surfaceId, 
        targetProduct: this.workflowCfg.productName,
        name: file.name,
        size: file.size,
        format: file.type,
      };
      assetData = await this.serviceHandler.postCallToService(
        this.acrobatApiConfig.acrobatEndpoint.createAsset,
        { body: JSON.stringify(data) },
      );
      await this.chunkPdf(assetData, blobData, file.type);
      const operationItem = {
        assetId: assetData.id,
        filename: file.name,
        filesize: file.size,
        filetype: file.type,
      };
      this.operations.push(operationItem);
    } catch (e) {
      await this.handleSplashScreen();
    }
    this.verifyContent(assetData);
  }
}
