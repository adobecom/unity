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
    const { default: ServiceHandler } = await import(
      `${getUnityLibs()}/core/workflow/${
        this.workflowCfg.name
      }/service-handler.js`
    );
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
    if (response.status != 200) {
      // unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { msg: eft } }));
      // return;
    }
  }

  async chunkPdf(assetData, blobData, filetype) {
    const totalChunks = Math.ceil(blobData.size / assetData.blocksize);
    if (assetData.uploadUrls.length !== totalChunks) {
      // handle error incorrect temp url to upload chunk
      return;
    }
    const uploadPromises = Array.from({ length: totalChunks }, (_, i) => {
      const start = i * assetData.blocksize;
      const end = Math.min(start + assetData.blocksize, blobData.size);
      const chunk = blobData.slice(start, end);

      const url = assetData.uploadUrls[i];
      return this.uploadFileToUnity(url.href, chunk, filetype);
    });
    // Wait for all uploads to complete
    await Promise.all(uploadPromises);
  }

  async continueInApp(assetId, filename, filesize, filetype) {
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
    return response;
  }

  isEmpty = (obj) => Object.keys(obj).length === 0;

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
    const blobData = await this.getBlobData(file);
    // Create asset
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
    if (this.isEmpty(assetData)) {
      return;
    }
    // Chunk PDF and upload
    await this.chunkPdf(assetData, blobData, file.type);

    // Finalize asset
    const finalAssetData = {
      surfaceId: this.workflowCfg.productName,
      assetId: assetData.id,
    };
    const finalizeResp = await this.serviceHandler.postCallToService(
      this.acrobatApiConfig.acrobatEndpoint.finalizeAsset,
      { body: JSON.stringify(finalAssetData) },
    );
    if (finalizeResp?.status !== 200) {
      // return;
    }
    // Redirect to Acrobat Product
    const continueResp = await this.continueInApp(
      assetData.id,
      file.name,
      file.size,
      file.type,
    );
    if (this.isEmpty(continueResp)) {
      // Handle error
    }
    window.location.href = continueResp.url;
  }
}
