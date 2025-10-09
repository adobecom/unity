/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-loop-func */

import { unityConfig, getHeaders } from '../../../scripts/utils.js';
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

  async postCallToServiceWithRetry(api, options, errorCallbackOptions = {}, retryConfig = null) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey, {
        'x-unity-product': this.actionBinder.workflowCfg?.productName,
        'x-unity-action': this.actionBinder.workflowCfg?.supportedFeatures?.values()?.next()?.value,
      }),
      ...options,
    };
    try {
      return await this.networkUtils.fetchFromServiceWithRetry(api, postOpts, retryConfig);
    } catch (err) {
      this.serviceHandler.showErrorToast(errorCallbackOptions, err, this.actionBinder.lanaOptions);
      throw err;
    }
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
        this.actionBinder.logAnalyticsinSplunk('Chunk Uploaded|UnityWidget', {
          assetId,
          chunkNumber,
          size: `${blobData.size}`,
          type: `${fileType}`,
        });
        return response;
      }
      const error = new Error(response.statusText || 'Upload request failed');
      error.status = response.status;
      throw error;
    };
    const onError = (error) => {
      this.logError('Upload Chunk Error|UnityWidget', {
        chunkNumber,
        size: blobData.size,
        fileType,
        errorData: {
          code: 'upload-chunk-error',
          desc: `Exception during chunk ${chunkNumber} upload: ${error.message}`,
        },
      }, `Message: Exception raised when uploading chunk to Unity, Error: ${error.message}, Asset ID: ${assetId}, ${blobData.size} bytes`);
    };
    return this.networkUtils.fetchFromServiceWithRetry(storageUrl, uploadOptions, retryConfig, onSuccess, onError);
  }

  async uploadChunksToUnity(uploadUrls, file, blockSize, signal = null) {
    const options = {
      assetId: this.actionBinder.assetId,
      fileType: file.type,
    };
    const result = await createChunkUploadTasks(
      uploadUrls,
      file,
      blockSize,
      this.uploadFileToUnity.bind(this),
      signal,
      options,
    );
    const { failedChunks, attemptMap } = result;
    const totalChunks = Math.ceil(file.size / blockSize);
    if (failedChunks.size === 0) {
      this.actionBinder.logAnalyticsinSplunk(
        'Chunked Upload Completed|UnityWidget',
        createChunkAnalyticsData('Chunked Upload Completed|UnityWidget', {
          assetId: this.actionBinder.assetId,
          chunkCount: totalChunks,
        }),
      );
    } else {
      this.actionBinder.logAnalyticsinSplunk(
        'Chunked Upload Failed|UnityWidget',
        createChunkAnalyticsData('Chunked Upload Failed|UnityWidget', {
          assetId: this.actionBinder.assetId,
          error: 'One or more chunks failed',
          failedChunks: failedChunks.size,
        }),
      );
    }
    return { failedChunks, attemptMap };
  }

  async scanImgForSafetyWithRetry(assetId) {
    const assetData = { assetId, targetProduct: this.actionBinder.workflowCfg.productName };
    const optionsBody = { body: JSON.stringify(assetData) };
    const retryConfig = {
      retryType: 'polling',
      retryParams: {
        maxRetryDelay: 300000,
        defaultRetryDelay: 5000,
      },
    };
    await this.postCallToServiceWithRetry(
      this.actionBinder.psApiConfig.psEndPoint.acmpCheck,
      optionsBody,
      { errorToastEl: this.actionBinder.errorToastEl, errorType: '.icon-error-request' },
      retryConfig,
    );
  }
}
