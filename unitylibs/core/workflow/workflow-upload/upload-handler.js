/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-loop-func */

import { unityConfig, getHeaders } from '../../../scripts/utils.js';

export default class UploadHandler {
  constructor(actionBinder, serviceHandler) {
    this.actionBinder = actionBinder;
    this.serviceHandler = serviceHandler;
  }

  handleAbortedRequest(url, options) {
    if (!(options?.signal?.aborted)) return;
    const abortError = new Error(`Request aborted for URL: ${url}`);
    abortError.name = 'AbortError';
    throw abortError;
  }

  async fetchWithTimeout(url, options, timeout = 60000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timed out. URL: ${url}`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw error;
    }
  }

  async fetchFromService(url, options, canRetry = true) {
    try {
      if (!options?.signal?.aborted) this.handleAbortedRequest(url, options);
      const response = await this.fetchWithTimeout(url, options, 60000);
      const contentLength = response.headers.get('Content-Length');
      if (response.status === 202) return { status: 202, headers: response.headers };
      if (canRetry && ((response.status >= 500 && response.status < 600) || response.status === 429)) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });
        return this.fetchFromService(url, options, false);
      }
      if (response.status !== 200) {
        const errorMessage = `Error fetching from service. URL: ${url}`;
        const error = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }
      if (contentLength === '0') return {};
      return response.json();
    } catch (e) {
      this.handleAbortedRequest(url, options);
      if (e instanceof TypeError) {
        const error = new Error(`Network error. URL: ${url}; Error message: ${e.message}`);
        error.status = 0;
        throw error;
      } else if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        const error = new Error(`Request timed out. URL: ${url}; Error message: ${e.message}`);
        error.status = 504;
        throw error;
      }
      throw e;
    }
  }

  async fetchFromServiceWithRetry(url, options, maxRetryDelay = 300) {
    let timeLapsed = 0;
    while (timeLapsed < maxRetryDelay) {
      this.handleAbortedRequest(url, options);
      const response = await this.fetchFromService(url, options, true);
      if (response.status === 202) {
        const retryDelay = parseInt(response.headers.get('retry-after'), 10) || 5;
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelay * 1000);
        });
        timeLapsed += retryDelay;
      } else {
        return response;
      }
    }
    const timeoutError = new Error(`Max retry delay exceeded for URL: ${url}`);
    timeoutError.status = 504;
    throw timeoutError;
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
        const error = new Error(response.statusText || 'Upload request failed');
        error.status = response.status;
        window.lana?.log(`Message: Failed to upload chunk ${chunkNumber} to Unity, Error: ${response.status}`, this.actionBinder.lanaOptions);
        throw error;
      }
      return response;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      else if (e instanceof TypeError) {
        const errorMessage = `Network error. Asset ID: ${assetId}, ${blobData.size} bytes; Error message: ${e.message}`;
        window.lana?.log(`Message: Network error during chunk upload, Error: ${errorMessage}`, this.actionBinder.lanaOptions);
      } else if (['Timeout'].includes(e.name)) {
        window.lana?.log(`Message: Timeout when uploading chunk to Unity, Asset ID: ${assetId}, ${blobData.size} bytes`, this.actionBinder.lanaOptions);
      } else {
        window.lana?.log(`Message: Exception raised when uploading chunk to Unity, Error: ${e.message}, Asset ID: ${assetId}, ${blobData.size} bytes`, this.actionBinder.lanaOptions);
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
