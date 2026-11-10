/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-loop-func */

import { unityConfig, getApiCallOptions } from '../../../scripts/utils.js';
import NetworkUtils from '../../../utils/NetworkUtils.js';
import {
  createFileChunks,
  createChunkUploadTasks,
  createChunkAnalyticsData,
  validateChunkUrls,
  extractChunkNumber,
} from '../../../utils/chunkingUtils.js';

const PSD_MIME_TYPE = 'image/vnd.adobe.photoshop';

export default class UploadHandler {
  constructor(actionBinder, serviceHandler) {
    this.actionBinder = actionBinder;
    this.serviceHandler = serviceHandler;
    this.networkUtils = new NetworkUtils();
  }

  getUploadLimits() {
    return this.actionBinder.workflowCfg.targetCfg.uploadLimits;
  }

  logError(eventName, errorData, debugMessage) {
    if (debugMessage) {
      window.lana?.log(debugMessage, this.actionBinder.lanaOptions);
    }
    this.actionBinder.logAnalyticsinSplunk(eventName, {
      ...errorData,
      assetId: this.actionBinder.assetId,
    });
  }

  async uploadFileToUnity(storageUrl, blobData, fileType, assetId, signal, chunkNumber = 'unknown') {
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
      signal,
    };
    const retryConfig = {
      retryType: 'exponential',
      retryParams: {
        maxRetries: 4,
        retryDelay: 1000,
      },
    };
    const onSuccess = (response) => {
      if (response.ok) {
        return response;
      }
      const error = new Error(response.statusText || 'Upload request failed');
      error.status = response.status;
      throw error;
    };
    const onError = (error) => {
      if (error.name !== 'AbortError') {
        this.logError('Upload Chunk Error|UnityWidget', {
          chunkNumber,
          size: blobData.size,
          fileType,
          errorData: {
            code: 'upload-chunk-error',
            desc: `Exception during chunk ${chunkNumber} upload: ${error.message}`,
          },
        }, `Message: Exception raised when uploading chunk to Unity, Error: ${error.message}, Asset ID: ${assetId}, ${blobData.size} bytes`);
      }
      throw error;
    };
    return this.networkUtils.fetchFromServiceWithRetry(storageUrl, uploadOptions, retryConfig, onSuccess, onError);
  }

  async uploadChunksToUnity(uploadUrls, file, blockSize, signal = null, callbacks = {}) {
    const options = {
      assetId: this.actionBinder.assetId,
      fileType: file.type,
      ...callbacks,
    };
    const useBoundedChunkUpload = this.actionBinder.workflowCfg.name === 'workflow-upload'
      && this.actionBinder.workflowCfg.productName?.toLowerCase() === 'photoshop'
      && file.type === PSD_MIME_TYPE;
    const result = useBoundedChunkUpload
      ? await this.uploadChunksWithConcurrency(uploadUrls, file, blockSize, signal, options)
      : await createChunkUploadTasks(
        uploadUrls,
        file,
        blockSize,
        this.uploadFileToUnity.bind(this),
        signal,
        options,
      );
    const { failedChunks, attemptMap } = result;
    const totalChunks = Math.ceil(file.size / blockSize);
    if (failedChunks.size > 0 && !signal?.aborted) {
      this.actionBinder.logAnalyticsinSplunk(
        'Chunked Upload Failed|UnityWidget',
        createChunkAnalyticsData('Chunked Upload Failed|UnityWidget', {
          assetId: this.actionBinder.assetId,
          error: 'One or more chunks failed',
          failedChunks: failedChunks.size,
          totalChunks,
        }),
      );
    }
    return { failedChunks, attemptMap };
  }

  getDeviceType() {
    const numCores = navigator.hardwareConcurrency || null;
    if (!numCores) return 'MID_RANGE';
    if (numCores > 6) return 'HIGH_END';
    if (numCores <= 3) return 'LOW_END';
    return 'MID_RANGE';
  }

  getConcurrentLimits() {
    const deviceType = this.getDeviceType();
    const limits = this.getUploadLimits();
    return { maxConcurrentChunks: limits[deviceType].chunks };
  }

  createAbortError() {
    const error = new Error('upload cancelled');
    error.name = 'AbortError';
    return error;
  }

  async afterUploadFileToUnity(uploadParams) {
    if (uploadParams.response.ok) {
      this.actionBinder.logAnalyticsinSplunk('Chunk Uploaded|UnityWidget', {
        assetId: uploadParams.assetId,
        fileMetaData: {
          chunkNumber: uploadParams.chunkNumber,
          chunkUploadAttempt: uploadParams.attempt,
          size: `${uploadParams.blobData.size}`,
          type: uploadParams.fileType,
        },
      });
      return uploadParams.response;
    }
    const error = new Error(uploadParams.response.statusText || 'Upload request failed');
    error.status = uploadParams.response.status;
    error.attempt = uploadParams.attempt;
    this.logError('Upload Chunk Error|UnityWidget', {
      chunkNumber: uploadParams.chunkNumber,
      size: uploadParams.blobData.size,
      fileType: uploadParams.fileType,
      attempt: uploadParams.attempt,
      errorData: { code: 'upload-chunk-error', desc: error.message },
    }, `Failed when uploading chunk to storage; ${error.message}, ${uploadParams.assetId}, ${uploadParams.blobData.size} bytes`);
    if (uploadParams.attempt < this.actionBinder.workflowCfg.targetCfg.fetchApiConfig.default.retryParams.maxRetries) return uploadParams.response;
    throw error;
  }

  async errorAfterUploadFileToUnity(uploadParams) {
    if (uploadParams.error.name === 'AbortError') throw uploadParams.error;
    this.logError('Upload Chunk Error|UnityWidget', {
      chunkNumber: uploadParams.chunkNumber,
      size: uploadParams.blobData.size,
      fileType: uploadParams.fileType,
      attempt: uploadParams.attempt,
      errorData: { code: 'upload-chunk-error', desc: uploadParams.error.message },
    }, `Exception raised when uploading chunk to storage; ${uploadParams.error.message}, ${uploadParams.assetId}, ${uploadParams.blobData.size} bytes`);
    throw uploadParams.error;
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

  async uploadChunksWithConcurrency(uploadUrls, file, blockSize, signal, options) {
    if (signal?.aborted) throw this.createAbortError();
    if (!Number.isSafeInteger(blockSize) || blockSize < 1 || file.size < 1) {
      throw new Error('Chunk upload requires a positive integer block size and a nonempty file');
    }
    const chunks = createFileChunks(file, blockSize);
    validateChunkUrls(uploadUrls, chunks.length);
    const failedChunks = new Set();
    const attemptMap = new Map();
    const { maxConcurrentChunks } = this.getConcurrentLimits();
    if (!Number.isInteger(maxConcurrentChunks) || maxConcurrentChunks < 1) {
      throw new RangeError('Concurrency must be a positive integer');
    }
    let fileUploadFailed = false;
    const chunkTasks = chunks.map((chunk, index) => {
      const url = uploadUrls[index];
      return async () => {
        if (fileUploadFailed || signal?.aborted) return;
        let chunkNumber = index;
        let lastAttempt = 1;
        try {
          const storageUrl = typeof url === 'object' ? url.href : url;
          chunkNumber = extractChunkNumber(url, index);
          const putOpts = {
            method: 'PUT',
            headers: { 'Content-Type': options.fileType },
            body: chunk,
            signal,
          };
          const modifiedRetryConfig = { ...this.actionBinder.workflowCfg.targetCfg.fetchApiConfig.default };
          modifiedRetryConfig.extraRetryCheck = async (response) => !response.ok;
          const chunkContext = {
            assetId: options.assetId,
            blobData: chunk,
            chunkNumber,
            fileType: options.fileType,
          };
          const result = await this.networkUtils.fetchFromServiceWithRetry(
            storageUrl,
            putOpts,
            modifiedRetryConfig,
            (response, attempt) => {
              lastAttempt = attempt;
              return this.afterUploadFileToUnity({ ...chunkContext, response, attempt });
            },
            (error, attempt) => {
              lastAttempt = attempt;
              error.attempt = attempt;
              return this.errorAfterUploadFileToUnity({ ...chunkContext, error, attempt });
            },
          );
          attemptMap.set(index, result.attempt);
          options.onChunkComplete?.(index, chunkNumber, result);
        } catch (error) {
          fileUploadFailed = true;
          if (!signal?.aborted) {
            const chunkInfo = { chunkIndex: index, chunkNumber };
            failedChunks.add(chunkInfo);
            attemptMap.set(index, lastAttempt);
            options.onChunkError?.(chunkInfo, error);
          }
        }
      };
    });
    await this.batchUpload(chunkTasks, maxConcurrentChunks);
    if (signal?.aborted) throw this.createAbortError();
    return { failedChunks, attemptMap };
  }

  async scanImgForSafetyWithRetry(assetId, signal = null) {
    const assetData = { assetId, targetProduct: this.actionBinder.workflowCfg.productName };
    const postOpts = await getApiCallOptions(
      'POST',
      unityConfig.apiKey,
      this.actionBinder.getAdditionalHeaders() || {},
      { body: JSON.stringify(assetData), ...(signal && { signal }) },
    );
    const retryConfig = {
      retryType: 'polling',
      retryParams: {
        maxRetryDelay: 300000,
        defaultRetryDelay: 5000,
      },
    };
    return this.networkUtils.fetchFromServiceWithRetry(
      this.actionBinder.apiConfig.endPoint.acmpCheck,
      postOpts,
      retryConfig,
    );
  }
}
