/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import { unityConfig } from '../../../scripts/utils.js';

export default class UploadHandler {
  constructor(actionBinder, serviceHandler) {
    this.actionBinder = actionBinder;
    this.serviceHandler = serviceHandler;
  }

  static UPLOAD_LIMITS = {
    HIGH_END: { files: 3, chunks: 10 },
    MID_RANGE: { files: 3, chunks: 10 },
    LOW_END: { files: 2, chunks: 6 },
  };

  async createAsset(file, multifile = false, workflowId = null) {
    let assetData = null;
    const data = {
      surfaceId: unityConfig.surfaceId,
      targetProduct: this.actionBinder.workflowCfg.productName,
      name: file.name,
      size: file.size,
      format: file.type,
      ...(multifile && { multifile }),
      ...(workflowId && { workflowId }),
    };
    assetData = await this.serviceHandler.postCallToService(
      this.actionBinder.acrobatApiConfig.acrobatEndpoint.createAsset,
      { body: JSON.stringify(data) },
      { 'x-unity-dc-verb': this.actionBinder.MULTI_FILE ? `${this.actionBinder.workflowCfg.enabledFeatures[0]}MFU` : this.actionBinder.workflowCfg.enabledFeatures[0] },
    );
    return assetData;
  }

  async getBlobData(file) {
    const objUrl = URL.createObjectURL(file);
    const response = await fetch(objUrl);
    if (!response.ok) {
      const error = new Error();
      error.status = response.status;
      throw error;
    }
    const blob = await response.blob();
    URL.revokeObjectURL(objUrl);
    return blob;
  }

  async uploadFileToUnity(storageUrl, blobData, fileType, assetId) {
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
    };
    try {
      const response = await fetch(storageUrl, uploadOptions);
      if (!response.ok) {
        const error = new Error(response.statusText || 'Upload request failed');
        error.status = response.status;
        await this.actionBinder.dispatchErrorToast('verb_upload_error_chunk_upload', response.status, `Failed when uploading chunk to storage; ${response.statusText}, ${assetId}, ${blobData.size} bytes, ${storageUrl}`, true);
        throw error;
      }
      return response;
    } catch (e) {
      if (e instanceof TypeError) {
        e.message = `Network error. Asset ID: ${assetId}, ${blobData.size} bytes, URL: ${storageUrl}`;
        await this.actionBinder.dispatchErrorToast('verb_upload_error_chunk_upload', 0, `Exception raised when uploading chunk to storage; ${e.message}`, true);
      } else if (['Timeout', 'AbortError'].includes(e.name)) await this.actionBinder.dispatchErrorToast('verb_upload_error_chunk_upload', 504, `Timeout when uploading chunk to storage; ${assetId}, ${blobData.size} bytes, ${storageUrl}`, true);
      throw e;
    }
  }

  getDeviceType() {
    const numCores = navigator.hardwareConcurrency || null;
    if (!numCores) return 'MID_RANGE';
    if (numCores > 6) return 'HIGH_END';
    if (numCores <= 3) return 'LOW_END';
    return 'MID_RANGE';
  }

  async executeInBatches(items, batchSize, processFn) {
    const executing = new Set();
    for (const item of items) {
      const p = processFn(item).then(() => executing.delete(p)).catch(() => {
        executing.delete(p);
      });
      executing.add(p);
      if (executing.size >= batchSize) await Promise.race(executing);
    }
    await Promise.all(executing);
  }

  async batchUpload(tasks, batchSize) {
    await this.executeInBatches(tasks, batchSize, async (task) => { await task(); });
  }

  async chunkPdf(assetDataArray, blobDataArray, filetypeArray, batchSize) {
    const uploadTasks = [];
    const failedFiles = new Set();
    assetDataArray.forEach((assetData, fileIndex) => {
      const blobData = blobDataArray[fileIndex];
      const fileType = filetypeArray[fileIndex];
      const totalChunks = Math.ceil(blobData.size / assetData.blocksize);
      if (assetData.uploadUrls.length !== totalChunks) return;
      let fileUploadFailed = false;
      const chunkTasks = Array.from({ length: totalChunks }, (_, i) => {
        const start = i * assetData.blocksize;
        const end = Math.min(start + assetData.blocksize, blobData.size);
        const chunk = blobData.slice(start, end);
        const url = assetData.uploadUrls[i];
        return () => {
          if (fileUploadFailed) return Promise.resolve();
          return this.uploadFileToUnity(url.href, chunk, fileType, assetData.id).catch(async () => {
            failedFiles.add(fileIndex);
            fileUploadFailed = true;
          });
        };
      });
      uploadTasks.push(...chunkTasks);
    });
    await this.batchUpload(uploadTasks, batchSize);
    return failedFiles;
  }

  async verifyContent(assetData) {
    try {
      const finalAssetData = {
        surfaceId: unityConfig.surfaceId,
        targetProduct: this.actionBinder.workflowCfg.productName,
        assetId: assetData.id,
      };
      const finalizeJson = await this.serviceHandler.postCallToServiceWithRetry(
        this.actionBinder.acrobatApiConfig.acrobatEndpoint.finalizeAsset,
        { body: JSON.stringify(finalAssetData), signal: AbortSignal.timeout?.(80000) },
        { 'x-unity-dc-verb': this.actionBinder.MULTI_FILE ? `${this.actionBinder.workflowCfg.enabledFeatures[0]}MFU` : this.actionBinder.workflowCfg.enabledFeatures[0] },
      );
      if (!finalizeJson || Object.keys(finalizeJson).length !== 0) {
        if (this.actionBinder.MULTI_FILE) {
          await this.actionBinder.dispatchErrorToast('verb_upload_error_generic', 500, `Unexpected response from finalize call: ${assetData.id}, ${JSON.stringify(finalizeJson)}`);
          return false;
        }
        await this.actionBinder.showSplashScreen();
        await this.actionBinder.dispatchErrorToast('verb_upload_error_generic', 500, `Unexpected response from finalize call: ${assetData.id}, ${JSON.stringify(finalizeJson)}`);
        this.actionBinder.operations = [];
        return false;
      }
    } catch (e) {
      if (this.actionBinder.MULTI_FILE) {
        await this.actionBinder.dispatchErrorToast('verb_upload_error_generic', e.status || 500, `Exception thrown when verifying content: ${e.message}, ${assetData.id}`, false, e.showError);
        return false;
      }
      await this.actionBinder.showSplashScreen();
      await this.actionBinder.dispatchErrorToast('verb_upload_error_generic', e.status || 500, `Exception thrown when verifying content: ${e.message}, ${assetData.id}`, false, e.showError);
      this.actionBinder.operations = [];
      return false;
    }
    return true;
  }

  async checkPageNumCount(assetData) {
    try {
      const intervalDuration = 500;
      const totalDuration = 5000;
      let metadata = {};
      let intervalId;
      let requestInProgress = false;
      let metadataExists = false;
      return new Promise((resolve) => {
        const handleMetadata = async () => {
          if (this.actionBinder?.limits?.pageLimit?.maxNumPages
            && metadata.numPages > this.actionBinder.limits.pageLimit.maxNumPages
          ) {
            await this.actionBinder.showSplashScreen();
            await this.actionBinder.dispatchErrorToast('verb_upload_error_max_page_count');
            resolve(true);
            return;
          }
          if (this.actionBinder?.limits?.pageLimit?.minNumPages
            && metadata.numPages < this.actionBinder.limits.pageLimit.minNumPages
          ) {
            await this.actionBinder.showSplashScreen();
            await this.actionBinder.dispatchErrorToast('verb_upload_error_min_page_count');
            resolve(true);
            return;
          }
          resolve(false);
        };
        intervalId = setInterval(async () => {
          if (requestInProgress) return;
          requestInProgress = true;
          metadata = await this.serviceHandler.getCallToService(
            this.actionBinder.acrobatApiConfig.acrobatEndpoint.getMetadata,
            { id: assetData.id },
            { 'x-unity-dc-verb': this.actionBinder.MULTI_FILE ? `${this.actionBinder.workflowCfg.enabledFeatures[0]}MFU` : this.actionBinder.workflowCfg.enabledFeatures[0] },
          );
          requestInProgress = false;
          if (metadata?.numPages !== undefined) {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            metadataExists = true;
            await handleMetadata();
          }
        }, intervalDuration);
        const timeoutId = setTimeout(async () => {
          clearInterval(intervalId);
          if (!metadataExists) resolve(false);
          else await handleMetadata();
        }, totalDuration);
      });
    } catch (e) {
      await this.actionBinder.showSplashScreen();
      await this.actionBinder.dispatchErrorToast('verb_upload_error_generic', e.status || 500, `Exception thrown when verifying PDF page count; ${e.message}`, false, e.showError);
      this.actionBinder.operations = [];
      return false;
    }
  }

  async handleValidations(assetData) {
    let validated = true;
    for (const limit of Object.keys(this.actionBinder.limits)) {
      switch (limit) {
        case 'pageLimit': {
          const pageLimitRes = await this.checkPageNumCount(assetData);
          if (pageLimitRes) validated = false;
          break;
        }
        default:
          break;
      }
    }
    if (!validated) this.actionBinder.operations = [];
    return validated;
  }

  async dispatchGenericError(info = null, showError = true) {
    this.actionBinder.operations = [];
    await this.actionBinder.showSplashScreen();
    await this.actionBinder.dispatchErrorToast('verb_upload_error_generic', 500, info, false, showError);
  }

  getConcurrentLimits() {
    const deviceType = this.getDeviceType();
    if (!this.actionBinder.MULTI_FILE) {
      return { maxConcurrentChunks: UploadHandler.UPLOAD_LIMITS[deviceType].chunks };
    }
    return {
      maxConcurrentFiles: UploadHandler.UPLOAD_LIMITS[deviceType].files,
      maxConcurrentChunks: UploadHandler.UPLOAD_LIMITS[deviceType].chunks,
    };
  }

  getGuestConnPayload(feedback) {
    return {
      targetProduct: this.actionBinder.workflowCfg.productName,
      payload: {
        languageRegion: this.actionBinder.workflowCfg.langRegion,
        languageCode: this.actionBinder.workflowCfg.langCode,
        verb: this.actionBinder.workflowCfg.enabledFeatures[0],
        feedback,
      },
    };
  }

  async handleUploadError(e) {
    switch (e.status) {
      case 409:
        await this.actionBinder.dispatchErrorToast('verb_upload_error_duplicate_asset', e.status, e.message, false, e.showError);
        break;
      case 401:
        if (e.message === 'notentitled') await this.actionBinder.dispatchErrorToast('verb_upload_error_no_storage_provision', e.status, e.message, false, e.showError);
        else await this.actionBinder.dispatchErrorToast('verb_upload_error_generic', e.status, e.message, false, e.showError);
        break;
      case 403:
        if (e.message === 'quotaexceeded') await this.actionBinder.dispatchErrorToast('verb_upload_error_max_quota_exceeded', e.status, e.message, false, e.showError);
        else await this.actionBinder.dispatchErrorToast('verb_upload_error_no_storage_provision', e.status, e.message, false, e.showError);
        break;
      default:
        await this.actionBinder.dispatchErrorToast('verb_upload_error_generic', e.status || 500, `Exception raised when uploading file(s): ${e.message}`, false, e.showError);
        break;
    }
  }

  isNonPdf(files) {
    return files.some((file) => file.type !== 'application/pdf');
  }

  async uploadSingleFile(file, fileData, isNonPdf = false) {
    const { maxConcurrentChunks } = this.getConcurrentLimits();
    let cOpts = {};
    const [blobData, assetData] = await Promise.all([
      this.getBlobData(file),
      this.createAsset(file),
    ]);
    cOpts = {
      assetId: assetData.id,
      targetProduct: this.actionBinder.workflowCfg.productName,
      payload: {
        languageRegion: this.actionBinder.workflowCfg.langRegion,
        languageCode: this.actionBinder.workflowCfg.langCode,
        verb: this.actionBinder.workflowCfg.enabledFeatures[0],
        assetMetadata: {
          [assetData.id]: {
            name: file.name,
            size: file.size,
            type: file.type,
          },
        },
        ...(isNonPdf ? { feedback: 'nonpdf' } : {}),
      },
    };
    const redirectSuccess = await this.actionBinder.handleRedirect(cOpts);
    if (!redirectSuccess) return;
    this.actionBinder.dispatchAnalyticsEvent('uploading', fileData);
    const uploadResult = await this.chunkPdf(
      [assetData],
      [blobData],
      [file.type],
      maxConcurrentChunks,
    );
    if (uploadResult.size === 1) {
      await this.dispatchGenericError(`One or more chunks failed to upload for the single file: ${assetData.id}, ${file.size} bytes, ${file.type}`);
      return;
    }
    this.actionBinder.operations.push(assetData.id);
    const verified = await this.verifyContent(assetData);
    if (!verified) return;
    if (!isNonPdf) {
      const validated = await this.handleValidations(assetData);
      if (!validated) return;
    }
    this.actionBinder.dispatchAnalyticsEvent('uploaded', fileData);
  }

  async singleFileGuestUpload(file, fileData) {
    try {
      await this.actionBinder.showSplashScreen(true);
      if (this.isNonPdf([file])) {
        await this.actionBinder.delay(3000);
        const redirectSuccess = await this.actionBinder.handleRedirect(this.getGuestConnPayload('nonpdf'));
        if (!redirectSuccess) return;
        this.actionBinder.redirectWithoutUpload = true;
        return;
      }
      await this.uploadSingleFile(file, fileData);
    } catch (e) {
      await this.actionBinder.showSplashScreen();
      this.actionBinder.operations = [];
      await this.handleUploadError(e);
    }
  }

  async singleFileUserUpload(file, fileData) {
    try {
      await this.actionBinder.showSplashScreen(true);
      await this.uploadSingleFile(file, fileData, this.isNonPdf([file]));
    } catch (e) {
      await this.actionBinder.showSplashScreen();
      this.actionBinder.operations = [];
      await this.handleUploadError(e);
    }
  }

  async uploadMultiFile(files, filesData) {
    const workflowId = crypto.randomUUID();
    const { maxConcurrentFiles, maxConcurrentChunks } = this.getConcurrentLimits();
    const blobDataArray = [];
    const assetDataArray = [];
    const fileTypeArray = [];
    let cOpts = {};
    await this.executeInBatches(files, maxConcurrentFiles, async (file) => {
      try {
        const [blobData, assetData] = await Promise.all([
          this.getBlobData(file),
          this.createAsset(file, true, workflowId),
        ]);
        blobDataArray.push(blobData);
        assetDataArray.push(assetData);
        fileTypeArray.push(file.type);
      } catch (e) {
        await this.handleUploadError(e);
      }
    });
    if (assetDataArray.length === 0) {
      await this.dispatchGenericError(`No assets created for the files: ${JSON.stringify(filesData)}`);
      return;
    }
    this.actionBinder.LOADER_LIMIT = 75;
    this.actionBinder.updateProgressBar(this.actionBinder.splashScreenEl, 75);
    cOpts = {
      targetProduct: this.actionBinder.workflowCfg.productName,
      assetId: assetDataArray[0].id,
      payload: {
        languageRegion: this.actionBinder.workflowCfg.langRegion,
        languageCode: this.actionBinder.workflowCfg.langCode,
        verb: this.actionBinder.workflowCfg.enabledFeatures[0],
        multifile: true,
        workflowId,
      },
    };
    const redirectSuccess = await this.actionBinder.handleRedirect(cOpts);
    if (!redirectSuccess) return;
    this.actionBinder.dispatchAnalyticsEvent('uploading', filesData);
    const uploadResult = await this.chunkPdf(
      assetDataArray,
      blobDataArray,
      fileTypeArray,
      maxConcurrentChunks,
    );
    if (uploadResult.size === files.length) {
      await this.dispatchGenericError(`One or more chunks failed to upload for all ${files.length} files; Workflow: ${workflowId}, Assets: ${assetDataArray.map((a) => a.id).join(', ')}; File types: ${fileTypeArray.join(', ')}`);
      return;
    }
    const uploadedAssets = assetDataArray.filter((_, index) => !uploadResult.has(index));
    this.actionBinder.operations.push(workflowId);
    let allVerified = 0;
    await this.executeInBatches(uploadedAssets, maxConcurrentFiles, async (assetData) => {
      const verified = await this.verifyContent(assetData);
      if (verified) allVerified += 1;
    });
    if (allVerified === 0) return;
    if (files.length !== allVerified) this.actionBinder.multiFileFailure = 'uploaderror';
    this.actionBinder.LOADER_LIMIT = 95;
    this.actionBinder.updateProgressBar(this.actionBinder.splashScreenEl, 95);
  }

  async multiFileGuestUpload(filesData) {
    try {
      await this.actionBinder.showSplashScreen(true);
      await this.actionBinder.delay(3000);
      this.actionBinder.LOADER_LIMIT = 85;
      this.actionBinder.updateProgressBar(this.actionBinder.splashScreenEl, 85);
      const redirectSuccess = await this.actionBinder.handleRedirect(this.getGuestConnPayload('multifile'));
      if (!redirectSuccess) return;
      this.actionBinder.redirectWithoutUpload = true;
      return;
    } catch (e) {
      await this.dispatchGenericError(`Exception raised when uploading multiple files for a guest user; ${e.message}, Files data: ${JSON.stringify(filesData)}`, e.showError);
    }
  }

  async multiFileUserUpload(files, filesData) {
    try {
      await this.actionBinder.showSplashScreen(true);
      await this.uploadMultiFile(files, filesData);
    } catch (e) {
      await this.dispatchGenericError(`Exception raised when uploading multiple files for a signed-in user; ${e.message}, Files data: ${JSON.stringify(filesData)}`, e.showError);
      return;
    }
    this.actionBinder.dispatchAnalyticsEvent('uploaded', filesData);
  }
}
