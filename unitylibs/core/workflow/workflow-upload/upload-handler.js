/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-loop-func */

import { unityConfig, getHeaders } from '../../../scripts/utils.js';
import NetworkUtils from '../../../utils/NetworkUtils.js';

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

  handleAbortedRequest(url, options) {
    try {
      this.networkUtils.handleAbortedRequest(url, options);
    } catch (error) {
      this.logError('Upload Aborted|UnityWidget', {
        url,
        errorData: {
          code: 'upload-aborted',
          desc: `Request aborted for URL: ${url}`,
        },
      }, `Message: Request aborted for URL: ${url}`);
      throw error;
    }
  }

  async fetchWithTimeout(url, options, timeout = 60000) {
    try {
      return await this.networkUtils.fetchWithTimeout(url, options, timeout);
    } catch (error) {
      this.logError('Upload Network Error|UnityWidget', {
        url,
        errorType: error.name,
        errorData: {
          code: 'upload-network-error',
          desc: `Network error: ${error.message} for URL: ${url}`,
        },
      }, `Message: Network error for URL: ${url}, Error: ${error.message}`);

      throw error;
    }
  }

  async fetchFromService(url, options) {
    const onSuccess = async (response) => {
      const contentLength = response.headers.get('Content-Length');
      if (response.status === 202) return { status: 202, headers: response.headers };
      if (response.status !== 200) {
        this.logError('Upload HTTP Error|UnityWidget', {
          url,
          status: response.status,
          errorData: {
            code: 'upload-http-error',
            subCode: response.status,
            desc: `HTTP ${response.status} error for URL: ${url}`,
          },
        }, `Message: HTTP error ${response.status} for URL: ${url}`);
        const errorMessage = `Error fetching from service. URL: ${url}`;
        const error = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }
      if (contentLength === '0') return {};
      return response.json();
    };

    const onError = async (error) => {
      this.logError('Upload Service Error|UnityWidget', {
        url,
        errorData: {
          code: 'upload-service-error',
          desc: `Service error: ${error.message} for URL: ${url}`,
        },
      }, `Message: Service error for URL: ${url}, Error: ${error.message}`);
    };

    return this.networkUtils.fetchFromService(url, options, onSuccess, onError);
  }

  async fetchFromServiceWithRetry(url, options, maxRetryDelay = 300) {
    const retryConfig = {
      retryType: 'polling',
      retryParams: {
        maxRetryDelay: maxRetryDelay * 1000,
        defaultRetryDelay: 5000,
      },
    };

    const onSuccess = (response) => response;

    const onError = async (error) => {
      this.logError('Upload Service Retry Error|UnityWidget', {
        url,
        errorData: {
          code: 'upload-service-retry-error',
          desc: `Retry error: ${error.message} for URL: ${url}`,
        },
      }, `Message: Service retry error for URL: ${url}, Error: ${error.message}`);
    };

    return this.networkUtils.fetchFromServiceWithRetry(url, options, retryConfig, onSuccess, onError);
  }

  async postCallToServiceWithRetry(api, options, errorCallbackOptions = {}) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey, {
        'x-unity-product': this.actionBinder.workflowCfg?.productName,
        'x-unity-action': this.actionBinder.workflowCfg?.supportedFeatures?.values()?.next()?.value,
      }),
      ...options,
    };
    try {
      return await this.fetchFromServiceWithRetry(api, postOpts);
    } catch (err) {
      this.serviceHandler.showErrorToast(errorCallbackOptions, err, this.actionBinder.lanaOptions);
      throw err;
    }
  }

  async uploadFileToUnityWithRetry(url, blobData, fileType, assetId, signal, chunkNumber = 0) {
    let retryDelay = 1000;
    const maxRetries = 4;
    let error = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.uploadFileToUnity(url, blobData, fileType, assetId, signal, chunkNumber);
        if (response.ok) {
          this.actionBinder.logAnalyticsinSplunk('Chunk Uploaded|UnityWidget', {
            chunkUploadAttempt: attempt,
            assetId,
            chunkNumber,
            size: `${blobData.size}`,
            type: `${fileType}`,
          });
          return { response, attempt };
        }
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        error = err;
      }
      if (attempt < maxRetries) {
        const delay = retryDelay;
        await new Promise((resolve) => { setTimeout(resolve, delay); });
        retryDelay *= 2;
      }
    }
    if (error) error.message += ', Max retry delay exceeded during upload';
    else error = new Error('Max retry delay exceeded during upload');
    throw error;
  }

  async uploadFileToUnity(storageUrl, blobData, fileType, assetId, signal, chunkNumber = 'unknown') {
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
      signal,
    };
    try {
      const response = await fetch(storageUrl, uploadOptions);
      if (!response.ok) {
        this.logError('Upload Chunk Failed|UnityWidget', {
          chunkNumber,
          status: response.status,
          size: blobData.size,
          fileType,
          errorData: {
            code: 'upload-chunk-failed',
            subCode: response.status,
            desc: `Failed to upload chunk ${chunkNumber}: ${response.statusText}`,
          },
        }, `Message: Failed to upload chunk ${chunkNumber} to Unity, Error: ${response.status}`);
        const error = new Error(response.statusText || 'Upload request failed');
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (e) {
      if (e.name === 'AbortError') {
        this.logError('Upload Chunk Aborted|UnityWidget', {
          chunkNumber,
          size: blobData.size,
          fileType,
          errorData: {
            code: 'upload-chunk-aborted',
            desc: `Chunk ${chunkNumber} upload aborted`,
          },
        });
        throw e;
      } else if (e instanceof TypeError) {
        const errorMessage = `Network error. Asset ID: ${assetId}, ${blobData.size} bytes; Error message: ${e.message}`;
        this.logError('Upload Chunk Network Error|UnityWidget', {
          chunkNumber,
          size: blobData.size,
          fileType,
          errorData: {
            code: 'upload-chunk-network-error',
            desc: `Network error during chunk ${chunkNumber} upload: ${e.message}`,
          },
        }, `Message: Network error during chunk upload, Error: ${errorMessage}`);
      } else if (['Timeout'].includes(e.name)) {
        this.logError('Upload Chunk Timeout|UnityWidget', {
          chunkNumber,
          size: blobData.size,
          fileType,
          errorData: {
            code: 'upload-chunk-timeout',
            desc: `Timeout during chunk ${chunkNumber} upload`,
          },
        }, `Message: Timeout when uploading chunk to Unity, Asset ID: ${assetId}, ${blobData.size} bytes`);
      } else {
        this.logError('Upload Chunk Error|UnityWidget', {
          chunkNumber,
          size: blobData.size,
          fileType,
          errorData: {
            code: 'upload-chunk-error',
            desc: `Exception during chunk ${chunkNumber} upload: ${e.message}`,
          },
        }, `Message: Exception raised when uploading chunk to Unity, Error: ${e.message}, Asset ID: ${assetId}, ${blobData.size} bytes`);
      }
      throw e;
    }
  }

  async uploadChunksToUnity(uploadUrls, file, blockSize, signal = null) {
    const totalChunks = Math.ceil(file.size / blockSize);
    if (uploadUrls.length !== totalChunks) {
      throw new Error(`Mismatch between number of chunks (${totalChunks}) and upload URLs (${uploadUrls.length})`);
    }
    const failedChunks = new Set();
    const attemptMap = new Map();
    let maxAttempts = 0;
    const uploadPromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, file.size);
      const chunk = file.slice(start, end);
      const url = uploadUrls[i];
      const uploadPromise = (async () => {
        if (signal?.aborted) return;
        const urlString = typeof url === 'object' ? url.href : url;
        const urlObj = new URL(urlString);
        const chunkNumber = urlObj.searchParams.get('partNumber') || i;
        try {
          const { attempt } = await this.uploadFileToUnityWithRetry(urlString, chunk, file.type, this.actionBinder.assetId, signal, parseInt(chunkNumber, 10));
          if (attempt > maxAttempts) maxAttempts = attempt;
          attemptMap.set(i, maxAttempts);
        } catch (err) {
          failedChunks.add({ chunkIndex: i, chunkNumber });
          throw err;
        }
      })();
      uploadPromises.push(uploadPromise);
    }
    if (signal?.aborted) return { failedChunks, attemptMap };
    try {
      await Promise.all(uploadPromises);
      this.actionBinder.logAnalyticsinSplunk('Chunked Upload Completed|UnityWidget', { assetId: this.actionBinder.assetId, chunkCount: totalChunks });
    } catch (error) {
      this.actionBinder.logAnalyticsinSplunk('Chunked Upload Failed|UnityWidget', { assetId: this.actionBinder.assetId, error: error.message, failedChunks: failedChunks.size });
      throw error;
    }
    return { failedChunks, attemptMap };
  }

  async scanImgForSafetyWithRetry(assetId) {
    const assetData = { assetId, targetProduct: this.actionBinder.workflowCfg.productName };
    const optionsBody = { body: JSON.stringify(assetData) };
    await this.postCallToServiceWithRetry(
      this.actionBinder.psApiConfig.psEndPoint.acmpCheck,
      optionsBody,
      { errorToastEl: this.actionBinder.errorToastEl, errorType: '.icon-error-request' },
    );
  }
}
