/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import { unityConfig, getUnityLibs, getFlatObject, getApiCallOptions } from '../../../scripts/utils.js';

export default class UploadHandler {
  constructor(actionBinder, networkUtils) {
    this.actionBinder = actionBinder;
    this.networkUtils = networkUtils;
  }

  getUploadLimits() {
    return this.actionBinder.workflowCfg.targetCfg.uploadLimits;
  }

  async createAsset(file, multifile = false, workflowId = null) {
    const data = {
      surfaceId: unityConfig.surfaceId,
      targetProduct: this.actionBinder.workflowCfg.productName,
      name: file.name,
      size: file.size,
      format: file.type,
      ...(multifile && { multifile }),
      ...(workflowId && { workflowId }),
    };
    const getOpts = await getApiCallOptions('POST', unityConfig.apiKey, this.actionBinder.getAdditionalHeaders() || {}, { body: JSON.stringify(data) });
    const { response } = await this.networkUtils.fetchFromServiceWithRetry(
      this.actionBinder.acrobatApiConfig.acrobatEndpoint.createAsset,
      getOpts
    );
    console.log("Asset create : ", response);
    return response;
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

  async afterUploadFileToUnity(assetId, blobData, chunkNumber, fileType, response, attempt) {
    if (response.ok) {
      this.actionBinder.dispatchAnalyticsEvent('chunk_uploaded', {
        chunkUploadAttempt: attempt,
        assetId,
        chunkNumber,
        size: `${blobData.size}`,
        type: `${fileType}`,
      });
      return response;
    }
    const error = new Error(response.statusText || 'Upload request failed');
    error.status = response.status;
    await this.actionBinder.dispatchErrorToast('upload_warn_chunk_upload', response.status, `Failed when uploading chunk to storage; ${response.statusText}, ${assetId}, ${blobData.size} bytes`, true, true, {
      code: 'upload_warn_chunk_upload',
      subCode: chunkNumber,
      desc: `Failed when uploading chunk to storage; ${response.statusText}, ${assetId}, ${blobData.size} bytes; status: ${response.status}`,
    });
    if (attempt < this.actionBinder.workflowCfg.targetCfg.fetchApiConfig.default.retryParams.maxRetries) return response;
    throw error;
  }

  async errorAfterUploadFileToUnity(assetId, blobData, chunkNumber, e) {
    if (e.name === 'AbortError') throw e;
    else if (e instanceof TypeError) {
      const errorMessage = `Network error. Asset ID: ${assetId}, ${blobData.size} bytes;  Error message: ${e.message}`;
      await this.actionBinder.dispatchErrorToast('upload_warn_chunk_upload', 0, `Exception raised when uploading chunk to storage; ${errorMessage}`, true, true, {
        code: 'upload_warn_chunk_upload',
        subCode: chunkNumber,
        desc: `Exception raised when uploading chunk to storage; ${errorMessage}; status: ${e.status}`,
      });
    } else if (['Timeout'].includes(e.name)) {
      await this.actionBinder.dispatchErrorToast('upload_warn_chunk_upload', 504, `Timeout when uploading chunk to storage; ${assetId}, ${blobData.size} bytes`, true, true, {
        code: 'upload_warn_chunk_upload',
        subCode: chunkNumber,
        desc: `Timeout when uploading chunk to storage; ${assetId}, ${blobData.size} bytes; status: ${e.status}`,
      });
    } else {
      await this.actionBinder.dispatchErrorToast('upload_warn_chunk_upload', e.status || 500, `Exception raised when uploading chunk to storage; ${e.message}, ${assetId}, ${blobData.size} bytes`, true, true, {
        code: 'upload_warn_chunk_upload',
        subCode: chunkNumber,
        desc: `Exception raised when uploading chunk to storage; ${e.message}, ${assetId}, ${blobData.size} bytes; status: ${e.status}`,
      });
    }
    throw e;
  }

  getDeviceType() {
    const numCores = navigator.hardwareConcurrency || null;
    if (!numCores) return 'MID_RANGE';
    if (numCores > 6) return 'HIGH_END';
    if (numCores <= 3) return 'LOW_END';
    return 'MID_RANGE';
  }

  async executeInBatches(items, maxConcurrent, processFn) {
    const executing = new Set();
    for (const item of items) {
      const promise = processFn(item)
        .then(() => { executing.delete(promise); })
        .catch(() => { executing.delete(promise); });
      executing.add(promise);
      if (executing.size >= maxConcurrent) await Promise.any(executing);
    }
    if (executing.size > 0) {
      await Promise.all(executing);
    }
  }

  async batchUpload(tasks, batchSize) {
    await this.executeInBatches(tasks, batchSize, async (task) => { await task(); });
  }

  async chunkPdf(assetDataArray, blobDataArray, filetypeArray, batchSize, signal) {
    const uploadTasks = [];
    const failedFiles = new Set();
    const attemptMap = new Map();
    assetDataArray.forEach((assetData, fileIndex) => {
      if (signal?.aborted) return;
      const blobData = blobDataArray[fileIndex];
      const fileType = filetypeArray[fileIndex];
      const totalChunks = Math.ceil(blobData.size / assetData.blocksize);
      if (assetData.uploadUrls.length !== totalChunks) return;
      let fileUploadFailed = false;
      let maxAttempts = 0;
      const chunkTasks = Array.from({ length: totalChunks }, (_, i) => {
        const start = i * assetData.blocksize;
        const end = Math.min(start + assetData.blocksize, blobData.size);
        const chunk = blobData.slice(start, end);
        const url = assetData.uploadUrls[i];
        return async () => {
          if (fileUploadFailed || signal?.aborted) return;
          const urlObj = new URL(url.href);
          const chunkNumber = urlObj.searchParams.get('partNumber') || 0;
          try {
            const putOpts = {
              method: 'PUT',
              headers: { 'Content-Type': fileType },
              body: chunk,
              signal,
            };
            const chunkNumberInt = parseInt(chunkNumber, 10);
            const modifiedRetryConfig = {...this.actionBinder.workflowCfg.targetCfg.fetchApiConfig.default}
            modifiedRetryConfig.extraRetryCheck = async(response) => {
                if(!response.ok) return true;
                return false;
            }
            const { attempt } = await this.networkUtils.fetchFromServiceWithRetry(
              url.href,
              putOpts,
              modifiedRetryConfig,
              this.afterUploadFileToUnity.bind(this, assetData.id, chunk, chunkNumberInt, fileType),
              this.errorAfterUploadFileToUnity.bind(this, assetData.id, chunk, chunkNumberInt)
            );
            if (attempt > maxAttempts) maxAttempts = attempt;
            attemptMap.set(fileIndex, maxAttempts);
          } catch (err) {
            failedFiles.add({ fileIndex, chunkNumber });
            fileUploadFailed = true;
          }
        };
      });
      uploadTasks.push(...chunkTasks);
    });
    if (signal?.aborted) return { failedFiles, attemptMap };
    await this.batchUpload(uploadTasks, batchSize);
    return { failedFiles, attemptMap };
  }

  async verifyContent(assetData, signal) {
    try {
      const finalAssetData = {
        surfaceId: unityConfig.surfaceId,
        targetProduct: this.actionBinder.workflowCfg.productName,
        assetId: assetData.id,
      };
      const finalizeOpts = await getApiCallOptions(
        'POST', 
        unityConfig.apiKey, 
        this.actionBinder.getAdditionalHeaders() || {}, 
        { body: JSON.stringify(finalAssetData), signal }
      );
      const finalizeJson = await this.networkUtils.fetchFromServiceWithRetry(
        this.actionBinder.acrobatApiConfig.acrobatEndpoint.finalizeAsset, 
        finalizeOpts,
        this.actionBinder.workflowCfg.targetCfg.fetchApiConfig.finalizeAsset
      );
      if (!finalizeJson || Object.keys(finalizeJson).length !== 0) {
        if (this.actionBinder.MULTI_FILE) {
          await this.actionBinder.dispatchErrorToast('upload_error_finalize_asset', 500, `Unexpected response from finalize call: ${assetData.id}, ${JSON.stringify(finalizeJson || {})}`, false, true, {
            code: 'upload_error_finalize_asset',
            desc: `Unexpected response from finalize call: ${assetData.id}, ${JSON.stringify(finalizeJson || {})}`,
          });
          return false;
        }
        await this.showSplashScreen();
        await this.actionBinder.dispatchErrorToast('upload_error_finalize_asset', 500, `Unexpected response from finalize call: ${assetData.id}, ${JSON.stringify(finalizeJson)}`, false, true, {
          code: 'upload_error_finalize_asset',
          desc: `Unexpected response from finalize call: ${assetData.id}, ${JSON.stringify(finalizeJson)}`,
        });
        this.actionBinder.operations = [];
        return false;
      }
    } catch (e) {
      if (e.name === 'AbortError') return false;
      if (this.actionBinder.MULTI_FILE) {
        await this.actionBinder.dispatchErrorToast('upload_error_finalize_asset', e.status || 500, `Exception thrown when verifying content: ${e.message}, ${assetData.id}`, false, e.showError, {
          code: 'upload_error_finalize_asset',
          subCode: e.status,
          desc: `Exception thrown when verifying content: ${e.message}, ${assetData.id}`,
        });
        return false;
      }
      await this.showSplashScreen();
      await this.actionBinder.dispatchErrorToast('upload_error_finalize_asset', e.status || 500, `Exception thrown when verifying content: ${e.message}, ${assetData.id}`, false, e.showError, {
        code: 'upload_error_finalize_asset',
        subCode: e.status,
        desc: `Exception thrown when verifying content: ${e.message}, ${assetData.id}`,
      });
      this.actionBinder.operations = [];
      return false;
    }
    return true;
  }

  async checkPageNumCount(assetData, isMultiFile = false) {
    try {
      const handleMetadata = async (metadata) => {
        console.log(metadata);
        if (this.actionBinder?.limits?.pageLimit?.maxNumPages
          && metadata.numPages > this.actionBinder.limits.pageLimit.maxNumPages
        ) {
          if (!isMultiFile) {
            await this.showSplashScreen();
            await this.actionBinder.dispatchErrorToast('upload_validation_error_max_page_count');
          }
          return true;
        }
        if (this.actionBinder?.limits?.pageLimit?.minNumPages
          && metadata.numPages < this.actionBinder.limits.pageLimit.minNumPages
        ) {
          await this.showSplashScreen();
          await this.actionBinder.dispatchErrorToast('upload_validation_error_min_page_count');
          return true; 
        }
        return false;
      };
      const queryString = new URLSearchParams({ id: assetData.id }).toString();
      const url = `${this.actionBinder.acrobatApiConfig.acrobatEndpoint.getMetadata}?${queryString}`;
      const getOpts = await getApiCallOptions('GET', unityConfig.apiKey, this.actionBinder.getAdditionalHeaders() || {});
      
      const modifiedRetryConfig = {...this.actionBinder.workflowCfg.targetCfg.fetchApiConfig.getMetadata}
      modifiedRetryConfig.extraRetryCheck = async(responseStatus,responseJson) => {
        const {numPages} = responseJson;
        if (responseStatus === 200 && !numPages) return true;
        return false;
      }
      return await this.networkUtils.fetchFromServiceWithRetry(url, getOpts, modifiedRetryConfig, handleMetadata);
    } catch (e) {
      await this.showSplashScreen();
      await this.actionBinder.dispatchErrorToast('upload_validation_error_verify_page_count', e.status || 500, `Exception thrown when verifying PDF page count; ${e.message}`, false, e.showError, {
        code: 'upload_validation_error_verify_page_count',
        subCode: e.status,
        message: `Exception thrown when verifying PDF page count; ${e.message}`,
      });
      this.actionBinder.operations = [];
      return false;
    }
  }

  async handleValidations(assetData, isMultiFile = false) {
    let validated = true;
    for (const limit of Object.keys(this.actionBinder.limits)) {
      switch (limit) {
        case 'pageLimit': {
          const pageLimitRes = await this.checkPageNumCount(assetData, isMultiFile);
          if (pageLimitRes) {
            validated = false;
            if (!isMultiFile) {
              this.actionBinder.operations = [];
            }
          }
          break;
        }
        default:
          break;
      }
    }
    return validated;
  }

  async dispatchGenericError(info = null, showError = true) {
    this.actionBinder.operations = [];
    await this.showSplashScreen();
    await this.actionBinder.dispatchErrorToast('error_generic', 500, info, false, showError);
  }

  getConcurrentLimits() {
    const deviceType = this.getDeviceType();
    const limits = this.getUploadLimits();
    if (!this.actionBinder.MULTI_FILE) {
      return { maxConcurrentChunks: limits[deviceType].chunks };
    }
    return {
      maxConcurrentFiles: limits[deviceType].files,
      maxConcurrentChunks: limits[deviceType].chunks,
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

  async handleUploadError(e, errorCode = 'error_generic') {
    switch (e.status) {
      case 409:
        await this.actionBinder.dispatchErrorToast('upload_validation_error_duplicate_asset', e.status, e.message, false, e.showError, {
          code: errorCode,
          subCode: 'upload_validation_error_duplicate_asset',
          desc: `Exception raised when uploading file(s): ${e.message}`,
        });
        break;
      case 401:
        if (e.message === 'notentitled') {
          await this.actionBinder.dispatchErrorToast('upload_error_no_storage_provision', e.status, e.message, false, e.showError, {
            code: errorCode,
            subCode: 'upload_error_no_storage_provision',
            desc: `Exception raised when uploading file(s): ${e.message}`,
          });
        } else {
          await this.actionBinder.dispatchErrorToast('error_generic', e.status, e.message, false, e.showError, {
            code: errorCode,
            subCode: e.status,
            desc: `Exception raised when uploading file(s): ${e.message}`,
          });
        }
        break;
      case 403:
        if (e.message === 'quotaexceeded') {
          await this.actionBinder.dispatchErrorToast('upload_error_max_quota_exceeded', e.status, e.message, false, e.showError, {
            code: errorCode,
            subCode: 'upload_error_max_quota_exceeded',
            desc: `Exception raised when uploading file(s): ${e.message}`,
          });
        } else {
          await this.actionBinder.dispatchErrorToast('upload_error_no_storage_provision', e.status, e.message, false, e.showError, {
            code: errorCode,
            subCode: 'upload_error_no_storage_provision',
            desc: `Exception raised when uploading file(s): ${e.message}`,
          });
        }
        break;
      default:
        await this.actionBinder.dispatchErrorToast('error_generic', e.status || 500, `Exception raised when uploading file(s): ${e.message}`, false, e.showError, {
          code: errorCode,
          subCode: e.status,
          desc: `Exception raised when uploading file(s): ${e.message}`,
        });
        break;
    }
  }

  isPdf(file) {
    return file.type === 'application/pdf';
  }

  async uploadSingleFile(file, fileData, isPdf = true) {
    const { maxConcurrentChunks } = this.getConcurrentLimits();
    const abortSignal = this.actionBinder.getAbortSignal();
    let cOpts = {};
    let blobData; let assetData;
    try {
      [blobData, assetData] = await Promise.all([
        this.getBlobData(file),
        this.createAsset(file),
      ]);
    } catch (error) {
      this.initSplashScreen();
      await this.transitionScreen.showSplashScreen();
      this.handleUploadError(error, 'pre_upload_error_create_asset');
      return;
    }
    fileData.assetId = assetData.id;
    this.actionBinder.setAssetId(assetData.id);
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
        ...(!isPdf ? { feedback: 'nonpdf' } : {}),
      },
    };
    const redirectSuccess = await this.actionBinder.handleRedirect(cOpts, fileData);
    if (!redirectSuccess) return;
    this.actionBinder.dispatchAnalyticsEvent('uploading', fileData);
    this.actionBinder.setIsUploading(true);
    let failedFiles; let attemptMap;
    try {
      ({ failedFiles, attemptMap } = await this.chunkPdf(
        [assetData],
        [blobData],
        [file.type],
        maxConcurrentChunks,
        abortSignal,
      ));
    } catch (error) {
      await this.actionBinder.dispatchErrorToast('upload_error_chunk_upload', error.status || 500, `Error during chunk upload: ${error.message}`, false, true, {
        code: 'upload_error_chunk_upload',
        subCode: error.status,
        desc: `Error during chunk upload: ${error.message}`,
      });
      return;
    }
    if (abortSignal.aborted) return;
    if (failedFiles?.size === 1) {
      await this.showSplashScreen();
      await this.actionBinder.dispatchErrorToast('upload_error_chunk_upload', 504, `One or more chunks failed to upload for the single file: ${assetData.id}, ${file.size} bytes, ${file.type}`, false, true, {
        code: 'upload_error_chunk_upload',
        desc: `${Array.from(failedFiles)[0]?.chunkNumber || 'unknown'}`,
      });
      return;
    }
    this.actionBinder.operations.push(assetData.id);
    const verified = await this.verifyContent(assetData);
    if (!verified || abortSignal.aborted) return;
    if (isPdf) {
      const validated = await this.handleValidations(assetData);
      if (!validated) return;
    }
    this.actionBinder.uploadTimestamp = Date.now();
    this.actionBinder.dispatchAnalyticsEvent('uploaded', { ...fileData, assetId: assetData.id, maxRetryCount: attemptMap?.get(0) || 0 });
  }

  async singleFileGuestUpload(file, fileData) {
    try {
      await this.showSplashScreen(true);
      const nonpdfSfuProductScreenVerbs = this.actionBinder.workflowCfg.targetCfg.nonpdfSfuProductScreen.includes(this.actionBinder.workflowCfg.enabledFeatures[0]);
      if (this.isPdf(file) || nonpdfSfuProductScreenVerbs) { await this.uploadSingleFile(file, fileData); } else {
        await this.actionBinder.delay(3000);
        const redirectSuccess = await this.actionBinder.handleRedirect(this.getGuestConnPayload('nonpdf'), fileData);
        if (redirectSuccess) this.actionBinder.redirectWithoutUpload = true;
      }
    } catch (e) {
      await this.showSplashScreen();
      this.actionBinder.operations = [];
      await this.handleUploadError(e);
    }
  }

  async singleFileUserUpload(file, fileData) {
    try {
      await this.showSplashScreen(true);
      await this.uploadSingleFile(file, fileData, this.isPdf(file));
    } catch (e) {
      await this.showSplashScreen();
      this.actionBinder.operations = [];
      await this.handleUploadError(e);
    }
  }

  async uploadMultiFile(files, filesData) {
    const workflowId = crypto.randomUUID();
    const { maxConcurrentFiles, maxConcurrentChunks } = this.getConcurrentLimits();
    try {
      const { blobDataArray, assetDataArray, fileTypeArray } = await this.createInitialAssets(files, workflowId, maxConcurrentFiles);
      if (assetDataArray.length === 0) {
        await this.actionBinder.dispatchErrorToast('pre_upload_error_create_asset', 500, 'Error during asset creation or blob retrieval', false, true, { code: 'pre_upload_error_create_asset' });
        return;
      }
      this.actionBinder.LOADER_LIMIT = 75;
      this.initSplashScreen();
      this.transitionScreen.updateProgressBar(this.actionBinder.transitionScreen.splashScreenEl, 75);
      const redirectSuccess = await this.handleFileUploadRedirect(assetDataArray[0].id, filesData, workflowId);
      if (!redirectSuccess) return;
      this.actionBinder.dispatchAnalyticsEvent('uploading', filesData);
      this.actionBinder.setIsUploading(true);
      let failedFiles; let attemptMap;
      try {
        // eslint-disable-next-line no-unused-vars
        ({ failedFiles, attemptMap } = await this.chunkPdf(
          assetDataArray,
          blobDataArray,
          fileTypeArray,
          maxConcurrentChunks,
        ));
      } catch (error) {
        await this.actionBinder.dispatchErrorToast('upload_warn_chunk_upload_exception', error.status || 500, `Error during chunk upload: ${error.message}`, false, true, {
          code: 'upload_warn_chunk_upload_exception',
          subCode: error.status,
          desc: `Exception during chunk upload: ${error.message}`,
        });
      }
      if (failedFiles.size === files.length) {
        const flattenObject = await getFlatObject();
        await this.actionBinder.dispatchErrorToast('upload_error_chunk_upload', 504, `One or more chunks failed to upload for all ${files.length} files; Workflow: ${workflowId}, Assets: ${assetDataArray.map((a) => a.id).join(', ')}; File types: ${fileTypeArray.join(', ')}`, false, true, { code: 'upload_error_chunk_upload', desc: flattenObject([...failedFiles]) });
        return;
      }
      const uploadedAssets = assetDataArray.filter((_, index) => !(failedFiles && [...failedFiles].some((failed) => failed.fileIndex === index)));
      this.actionBinder.operations.push(workflowId);
      const { verifiedAssets, assetsToDelete } = await this.processUploadedAssets(uploadedAssets);
      await this.deleteFailedAssets(assetsToDelete);
      if (verifiedAssets.length === 0) {
        await this.transitionScreen.showSplashScreen();
        await this.actionBinder.dispatchErrorToast('upload_validation_error_max_page_count_multi');
        return;
      }
      if (files.length !== verifiedAssets.length) this.actionBinder.multiFileFailure = 'uploaderror';
      this.actionBinder.LOADER_LIMIT = 95;
      this.transitionScreen.updateProgressBar(this.actionBinder.transitionScreen.splashScreenEl, 95);
      this.actionBinder.dispatchAnalyticsEvent('uploaded', filesData);
    } catch (error) {
      await this.transitionScreen.showSplashScreen();
      await this.actionBinder.dispatchErrorToast('error_generic', error.code, 'Exception in uploading one or more files', true, true);
    }
  }

  async createInitialAssets(files, workflowId, maxConcurrentFiles) {
    const blobDataArray = [];
    const assetDataArray = [];
    const fileTypeArray = [];
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
        this.handleUploadError(e, 'pre_upload_error_create_asset');
      }
    });
    return { blobDataArray, assetDataArray, fileTypeArray };
  }

  async handleFileUploadRedirect(firstAssetId, filesData, workflowId) {
    const cOpts = {
      targetProduct: this.actionBinder.workflowCfg.productName,
      assetId: firstAssetId,
      payload: {
        languageRegion: this.actionBinder.workflowCfg.langRegion,
        languageCode: this.actionBinder.workflowCfg.langCode,
        verb: this.actionBinder.workflowCfg.enabledFeatures[0],
        multifile: true,
        workflowId,
      },
    };
    return this.actionBinder.handleRedirect(cOpts, filesData);
  }

  async processUploadedAssets(uploadedAssets) {
    const assetsToDelete = [];
    await this.executeInBatches(uploadedAssets, this.getConcurrentLimits().maxConcurrentFiles, async (assetData) => {
      const verified = await this.verifyContent(assetData);
      if (verified) {
        const validated = await this.handleValidations(assetData, true);
        if (!validated) assetsToDelete.push(assetData);
      } else assetsToDelete.push(assetData);
    });
    const verifiedAssets = uploadedAssets.filter((asset) => !assetsToDelete.some((deletedAsset) => deletedAsset.id === asset.id));
    return { verifiedAssets, assetsToDelete };
  }

  async deleteFailedAssets(assetsToDelete) {
    if (assetsToDelete.length === 0) return;
    try {
      await Promise.all(assetsToDelete.map(async (asset) => {
        const url = `${this.actionBinder.acrobatApiConfig.acrobatEndpoint.createAsset}?id=${asset.id}`;
        const deleteOpts = await getApiCallOptions('DELETE', unityConfig.apiKey, this.actionBinder.getAdditionalHeaders() || {});
        return this.networkUtils.fetchFromServiceWithRetry(url, deleteOpts);
      }));
    } catch (error) {
      await this.actionBinder.dispatchErrorToast('upload_warn_delete_asset', 0, 'Failed to delete one or all assets', true, true, {
        code: 'upload_warn_delete_asset',
        subCode: error.code,
      });
    }
  }

  async initSplashScreen() {
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.actionBinder.transitionScreen.splashScreenEl, this.actionBinder.initActionListeners, this.actionBinder.LOADER_LIMIT, this.actionBinder.workflowCfg);
  }

  async showSplashScreen(displayOn = false) {
    await this.initSplashScreen();
    await this.transitionScreen.showSplashScreen(displayOn);
  }

  async multiFileGuestUpload(files, filesData) {
    try {
      await this.showSplashScreen(true);
      const nonpdfMfuFeedbackScreenTypeNonpdf = this.actionBinder.workflowCfg.targetCfg.nonpdfMfuFeedbackScreenTypeNonpdf.includes(this.actionBinder.workflowCfg.enabledFeatures[0]);
      if (nonpdfMfuFeedbackScreenTypeNonpdf) {
        const allNonPdf = files.every((file) => !this.isPdf(file));
        if (allNonPdf) {
          const redirectSuccess = await this.actionBinder.handleRedirect(this.getGuestConnPayload('nonpdf'), filesData);
          if (!redirectSuccess) return;
          this.actionBinder.redirectWithoutUpload = true;
          return;
        }
      }
      if (this.actionBinder.workflowCfg.targetCfg.mfuUploadAllowed.includes(this.actionBinder.workflowCfg.enabledFeatures[0])) {
        if (this.actionBinder.workflowCfg.targetCfg.mfuUploadOnlyPdfAllowed.includes(this.actionBinder.workflowCfg.enabledFeatures[0])) {
          const pdfFiles = files.filter((file) => this.isPdf(file));
          this.actionBinder.showInfoToast = pdfFiles.length < files.length;
          const fileData = { type: 'mixed', size: filesData.size, count: pdfFiles.length, uploadType: 'mfu' };
          await this.uploadMultiFile(pdfFiles, fileData);
          return;
        }
        await this.uploadMultiFile(files, filesData);
        return;
      }
      await this.actionBinder.delay(3000);
      this.actionBinder.LOADER_LIMIT = 85;
      this.transitionScreen.updateProgressBar(this.actionBinder.transitionScreen.splashScreenEl, 85);
      const redirectSuccess = await this.actionBinder.handleRedirect(this.getGuestConnPayload('multifile'), filesData);
      if (!redirectSuccess) return;
      this.actionBinder.redirectWithoutUpload = true;
      return;
    } catch (e) {
      await this.dispatchGenericError(`Exception raised when uploading multiple files for a guest user; ${e.message}, Files data: ${JSON.stringify(filesData)}`, e.showError);
    }
  }

  async multiFileUserUpload(files, filesData) {
    try {
      await this.showSplashScreen(true);
      await this.uploadMultiFile(files, filesData);
    } catch (e) {
      await this.dispatchGenericError(`Exception raised when uploading multiple files for a signed-in user; ${e.message}, Files data: ${JSON.stringify(filesData)}`, e.showError);
      return;
    }
    this.actionBinder.uploadTimestamp = Date.now();
    this.actionBinder.dispatchAnalyticsEvent('uploaded', filesData);
  }
}
