/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  getLibs,
  unityConfig,
  getUnityLibs,
  createTag,
  localizeLink,
  priorityLoad
} from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea;
    this.operations = [];
    this.acrobatApiConfig = this.getAcrobatApiConfig();
    this.serviceHandler = null;
    this.splashScreenEl = null;
  }

  getAcrobatApiConfig() {
    unityConfig.acrobatEndpoint = {
      createAsset: `${unityConfig.apiEndPoint}/asset`,
      finalizeAsset: `${unityConfig.apiEndPoint}/asset/finalize`,
    };
    return unityConfig;
  }

  async handlePreloads(params) {
    const parr = [`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`]
    if (params[0].showSplashScreen) {
      parr.push(
        `${getLibs()}/blocks/fragment/fragment.js`,
        `${getUnityLibs()}/core/styles/splash-screen.css`)
    }
    await priorityLoad(parr);
  }

  async acrobatActionMaps(values, e) {
    await this.handlePreloads(values);
    const { default: ServiceHandler } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`);
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
    );
    for (const value of values) {
      switch (true) {
        case value.actionType == 'upload':
          await this.userPdfUpload(value, e);
          break;
        case value.actionType == 'continueInApp':
          await this.continueInApp();
          break;
        default:
          break;
      }
    }
  }

  initActionListeners() {
    for (const [key, values] of Object.entries(this.actionMap)) {
      const el = this.block.querySelector(key);
      if (!el) return;
      switch (true) {
        case el.nodeName === 'A':
          el.href = '#';
          el.addEventListener('click', async (e) => {
            await this.acrobatActionMaps(values, e);
          });
          break;
        case el.nodeName === 'INPUT':
          el.addEventListener('change', async (e) => {
            await this.acrobatActionMaps(values, e);
          });
          break;
        default:
          break;
      }
    }
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
    await Promise.all(uploadPromises);
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
    const response = await this.serviceHandler.postCallToService(
      this.acrobatApiConfig.connectorApiEndPoint,
      { body: JSON.stringify(cOpts) },
    );
    if (!response) return await this.handleSplashScreen(params);
    // console.log(response.url);
    window.location.href = response.url;
  }

  async handleSplashScreen(params) {
    if (!params.showSplashScreen) return;
    if (this.splashScreenEl) {
      if (this.splashScreenEl.classList.contains('show')) this.splashScreenEl.classList.remove('show');
      else this.splashScreenEl.classList.add('show');
      return;
    }
    const { default: init} = await import(`${getLibs()}/blocks/fragment/fragment.js`);
    const fragmentLink = localizeLink(`${window.location.origin}${params.splashScreenConfig.fragmentLink}`);
    const a = createTag('a', { href: fragmentLink, class: 'splash-loader'}, fragmentLink);
    const splashDiv = document.querySelector(params.splashScreenConfig.parentSelector);
    splashDiv.append(a);
    await init(a);
    const sel = splashDiv.querySelector(`.fragment[data-path*="${params.splashScreenConfig.fragmentLink}"`);
    const pbarPlaceholder = sel.querySelector('.icon-progress-bar');
    if (pbarPlaceholder) {
      await priorityLoad([
        `${getUnityLibs()}/core/features/progress-bar/progress-bar.css`,
        `${getUnityLibs()}/core/features/progress-bar/progress-bar.js`
      ]);
      const { default: createProgressBar } = await import(`${getUnityLibs()}/core/features/progress-bar/progress-bar.js`);
      const pb = createProgressBar();
      pbarPlaceholder.replaceWith(pb);
    }
    const hasCancel = sel.querySelector('a.con-button[href*="#_cancel"]');
    if (hasCancel) {
      hasCancel.href = '#'
      hasCancel.addEventListener('click', (e) => {
        e.preventDefault();
        e.target.closest('.splash-loader').classList.remove('show');
        console.log(this.unityEl);
      });
    }
    this.splashScreenEl = sel;
    this.splashScreenEl.classList.add('splash-loader', 'show');
  }

  async userPdfUpload(params, e) {
    const files = e.target.files;
    if (!files || files.length > params.maxFileCount) return;
    const file = files[0];
    if (!file) return;
    if (file.type != 'application/pdf') return;
    const [minsize, maxsize] = params.allowedFileSize;
    if (!((file.size > minsize) && (file.size <= maxsize))) return;
    await this.handleSplashScreen(params);
    const blobData = await this.getBlobData(file);
    const data = {
      surfaceId: this.workflowCfg.productName,
      name: file.name,
      size: file.size,
      format: file.type,
    };
    const assetData = await this.serviceHandler.postCallToService(
      this.acrobatApiConfig.acrobatEndpoint.createAsset,
      { body: JSON.stringify(data) },
    );
    if (!assetData) return await this.handleSplashScreen(params);
    await this.chunkPdf(assetData, blobData, file.type);
    const operationItem = {
      assetId: assetData.id,
      filename: file.name,
      filesize: file.size,
      filetype: file.type,
    };
    this.operations.push(operationItem);
    const finalAssetData = {
      surfaceId: this.workflowCfg.productName,
      assetId: assetData.id,
    };
    this.serviceHandler.postCallToService(
      this.acrobatApiConfig.acrobatEndpoint.finalizeAsset,
      { body: JSON.stringify(finalAssetData) },
    );
  }
}
