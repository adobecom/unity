/* eslint-disable eqeqeq */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs,
} from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea;
    this.operations = [];
    this.acrobatApiConfig = this.getAcrobatApiConfig();
    this.serviceHandler = null;
  }

  getAcrobatApiConfig() {
    unityConfig.acrobatEndpoint = {
      createAsset: `${unityConfig.apiEndPoint}/asset`,
      finalizeAsset: `${unityConfig.apiEndPoint}/asset/finalize`,
    };
    return unityConfig;
  }

  async acrobatActionMaps(values, e) {
    const { default: ServiceHandler } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`);
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
    );
    for (const value of values) {
      switch (true) {
        case value.actionType == 'upload':
          this.userPdfUpload(value, e);
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

  async userPdfUpload(params, e) {
    const files = e.target.files;
    if (!files || files.length !== 1) {
      // unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { msg: 'Only one file can be uploaded at a time.' } }));
      // return;
    }
    // TODO: check acrobat verb limitations
    const file = files[0];
    if (!file) return;
    const MAX_FILE_SIZE = 1000000000;
    if (file.size == 0) {
      // unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { msg: File is empty. } }));
      // return;
    } else if (file.size > MAX_FILE_SIZE) {
      // unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { msg: 'File too large.' } }));
      // return;
    }
    if (file.type != 'application/pdf') {
      // unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { msg: 'Unsupported file type' } }));
      // return;
    }
    // Create asset
    const assetData = await this.serviceHandler.postCallToService(
      this.acrobatApiConfig.acrobatEndpoint.createAsset,
      {
        'surfaceId': 'acrobat',
        'name': file.name,
        'size': file.size,
        'format': file.type
      }
    );
    if (assetData?.status !== 200) {
      // unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { msg: 'Unable to process the request' } }));
      // return;
    }
    // Chunk PDF and upload
    const pdfUpload = chunkPdf(assetData);
    if (pdfUpload?.status !== 200) {
      // unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { msg: 'Unable to process the request' } }));
      // return;
    }
    // Finalize asset
    const finalizeAsset = await this.serviceHandler.postCallToService(
      this.acrobatApiConfig.acrobatEndpoint.finalizeAsset,
      {
        'surfaceId': 'acrobat',
        'assetId': assetData.id
      }
    );
    if (finalizeAsset?.status !== 200) {
      // unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { msg: 'Unable to process the request' } }));
      // return;
    }
    // TODO: Redirect to Acrobat Product
  }
}
