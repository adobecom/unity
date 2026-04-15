/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-loop-func */

import { unityConfig, getApiCallOptions } from '../../../scripts/utils.js';
import NetworkUtils from '../../../utils/NetworkUtils.js';
import { createChunkUploadTasks, createChunkAnalyticsData } from '../../../utils/chunkingUtils.js';

export default class UploadHandler {
  constructor(actionBinder, serviceHandler) {
    this.actionBinder = actionBinder;
    this.serviceHandler = serviceHandler;
    this.networkUtils = new NetworkUtils();
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
    const onError = (error, attempt) => {
      if (error.name !== 'AbortError') {
        const isFinalAttempt = attempt >= retryConfig.retryParams.maxRetries;
        const eventName = isFinalAttempt ? 'Upload Chunk Error|UnityWidget' : 'Upload Chunk Warn|UnityWidget';
        const code = isFinalAttempt ? 'upload-error-chunk-upload' : 'upload-warn-chunk-upload';
        this.logError(eventName, {
          chunkNumber,
          size: blobData.size,
          fileType,
          errorData: {
            code,
            subCode: error.status ?? (error.name === 'TimeoutError' ? 504 : 0),
            desc: `Exception during chunk ${chunkNumber} upload (attempt ${attempt}): ${error.message}`,
          },
        }, `Message: Exception raised when uploading chunk to Unity, Error: ${error.message}, Asset ID: ${assetId}, ${blobData.size} bytes`);
        if (isFinalAttempt) {
          this.chunkAbortController?.abort();
          throw error;
        }
      } else {
        throw error;
      }
    };
    return this.networkUtils.fetchFromServiceWithRetry(storageUrl, uploadOptions, retryConfig, onSuccess, onError);
  }

  async uploadChunksToUnity(uploadUrls, file, blockSize, signal = null) {
    this.chunkAbortController = new AbortController();
    const mergedSignal = signal
      ? AbortSignal.any([signal, this.chunkAbortController.signal])
      : this.chunkAbortController.signal;
    const options = {
      assetId: this.actionBinder.assetId,
      fileType: file.type,
    };
    const result = await createChunkUploadTasks(
      uploadUrls,
      file,
      blockSize,
      this.uploadFileToUnity.bind(this),
      mergedSignal,
      options,
    );
    this.chunkAbortController = null;
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
