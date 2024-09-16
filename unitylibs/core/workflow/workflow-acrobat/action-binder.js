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

  async handlePreloads(params) {
    const parr = [`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`]
    if (params[0].showSplashScreen) {
      parr.push(
        `${getLibs()}/blocks/fragment/fragment.js`,
        `${getUnityLibs()}/core/styles/splash-screen.css`,
        `${getUnityLibs()}/core/features/progress-bar/progress-bar.css`,
        `${getUnityLibs()}/core/features/progress-bar/progress-bar.js`)
    }
    await priorityLoad(parr);
  }

  async acrobatActionMaps(values, files) {
    await this.handlePreloads(values);
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
          await this.cancelAcrobatOperation(values);
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
          el.addEventListener('drop', async (e) => {
            e.preventDefault();
            const files = this.extractFiles(e);
            await this.acrobatActionMaps(values, files);
          });
          break;
        case el.nodeName === 'INPUT':
          el.addEventListener('change', async (e) => {
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
    .then(() => {
      this.progressUpdater(this.splashScreenEl, 100);
      const response = this.promiseStack[this.promiseStack.length - 1];
      window.location.href = response.url;
    })
    .catch(() => {
      this.handleSplashScreen(params);
    });
  }

  async cancelAcrobatOperation(params) {
    await this.handleSplashScreen(params);
    const cancelPromise = Promise.reject(new Error('Operation termination requested.'));
    this.promiseStack.unshift(cancelPromise);
  }

  progressBarHandler(s, delay, i, initialize = false) {
    if (!s) return;
    delay = Math.min(delay + 100, 2000);
    i = Math.max(i - 5, 5);
    const progressBar = s.querySelector('.spectrum-ProgressBar');
    if (!initialize && progressBar?.getAttribute('value') == 100) return;
    if (initialize) this.progressUpdater(s, 0);
    setTimeout(() => {
      let v = initialize ? 0 : parseInt(progressBar.getAttribute('value'));
      this.progressUpdater(s, v + i);
      this.progressBarHandler(s, delay, i);
    }, delay);
  }

  async handleSplashScreen(params) {
    if (!params.showSplashScreen) return;
    if (this.splashScreenEl) {
      if (this.splashScreenEl.classList.contains('show')) {
        this.splashScreenEl.classList.remove('show');
      } else {
        this.progressBarHandler(this.splashScreenEl, this.LOADER_DELAY, this.LOADER_INCREMENT, true);
        this.splashScreenEl.classList.add('show');
      }
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
      const { default: createProgressBar, updateProgressBar: updateProgressBar} = await import(`${getUnityLibs()}/core/features/progress-bar/progress-bar.js`);
      this.progressUpdater = updateProgressBar;
      const pb = createProgressBar();
      pbarPlaceholder.replaceWith(pb);
      this.progressBarHandler(sel, this.LOADER_DELAY, this.LOADER_INCREMENT, true);
    }
    const hasCancel = sel.querySelector('a.con-button[href*="#_cancel"]');
    if (hasCancel) {
      const actMap = {
        'a.con-button[href*="#_cancel"]': [
          {
            "actionType": "interrupt"
          }
        ]
      }
      this.initActionListeners(sel, actMap);
    }
    this.splashScreenEl = sel;
    this.splashScreenEl.classList.add('splash-loader', 'show');
  }

  async userPdfUpload(params, files) {
    if (!files || files.length > this.limits.maxNumFiles) return;
    const file = files[0];
    if (!file) return;
    if (file.type != 'application/pdf') return;
    const [minsize, maxsize] = this.limits.allowedFileSize;
    if (!((file.size > minsize) && (file.size <= maxsize))) return;
    let assetData = null;
    try {
      await this.handleSplashScreen(params);
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
      await this.handleSplashScreen(params);
    }
    try {
      const finalAssetData = {
        surfaceId: unityConfig.surfaceId, 
        targetProduct: this.workflowCfg.productName,
        assetId: assetData.id,
      };
      this.serviceHandler.postCallToService(
        this.acrobatApiConfig.acrobatEndpoint.finalizeAsset,
        { body: JSON.stringify(finalAssetData) },
      );
    } catch (e) {
      // Failed in finalize
    }
  }
}
