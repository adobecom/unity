/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-loop-func */

import { unityConfig, getApiCallOptions } from '../../../scripts/utils.js';
import NetworkUtils from '../../../utils/NetworkUtils.js';
import { createChunkUploadTasks, createChunkAnalyticsData, validateChunkUrls, extractChunkNumber } from '../../../utils/chunkingUtils.js';

const PSD_MIME_TYPE = 'image/vnd.adobe.photoshop';
const CHUNK_CONCURRENCY_LIMITS = { HIGH_END: 10, MID_RANGE: 10, LOW_END: 6 };
const CHUNK_TIMEOUT = 60000;
const CHUNK_MAX_ATTEMPTS = 4;

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

  getChunkConcurrencyLimit() {
    const cores = navigator.hardwareConcurrency || null;
    if (!cores) return CHUNK_CONCURRENCY_LIMITS.MID_RANGE;
    if (cores > 6) return CHUNK_CONCURRENCY_LIMITS.HIGH_END;
    if (cores <= 3) return CHUNK_CONCURRENCY_LIMITS.LOW_END;
    return CHUNK_CONCURRENCY_LIMITS.MID_RANGE;
  }

  createAbortError() {
    const error = new Error('upload cancelled');
    error.name = 'AbortError';
    return error;
  }

  async fetchChunkWithTimeout(storageUrl, blobData, fileType, signal) {
    if (signal.aborted) throw this.createAbortError();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CHUNK_TIMEOUT);
    try {
      return await fetch(storageUrl, {
        method: 'PUT',
        headers: { 'Content-Type': fileType },
        body: blobData,
        signal: controller.signal,
      });
    } catch (error) {
      if (signal.aborted) throw this.createAbortError();
      if (timedOut) {
        const timeoutError = new Error(`Chunk upload timed out after ${CHUNK_TIMEOUT}ms`);
        timeoutError.name = 'TimeoutError';
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }

  async waitForChunkRetry(delay, signal) {
    if (signal.aborted) throw this.createAbortError();
    await new Promise((resolve, reject) => {
      let timeout;
      const abort = () => {
        clearTimeout(timeout);
        reject(this.createAbortError());
      };
      timeout = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, delay);
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  async uploadChunkWithRetry(storageUrl, blobData, fileType, signal) {
    for (let attempt = 1; attempt <= CHUNK_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.fetchChunkWithTimeout(storageUrl, blobData, fileType, signal);
        if (!response.ok) {
          const error = new Error(`Chunk upload failed: ${response.status} ${response.statusText || ''}`);
          error.status = response.status;
          throw error;
        }
        return { response, attempt };
      } catch (error) {
        if (signal.aborted) throw this.createAbortError();
        error.attempt = attempt;
        const retryable = error instanceof TypeError || error.name === 'TimeoutError'
          || error.status === 429 || (error.status >= 500 && error.status < 600);
        if (!retryable || attempt === CHUNK_MAX_ATTEMPTS) throw error;
        await this.waitForChunkRetry(1000 * (2 ** (attempt - 1)), signal);
      }
    }
    throw new Error('Chunk upload exhausted its attempts');
  }

  async uploadChunksWithConcurrency(uploadUrls, file, blockSize, signal, options) {
    if (signal?.aborted) throw this.createAbortError();
    if (!Number.isSafeInteger(blockSize) || blockSize < 1 || file.size < 1) {
      throw new Error('Chunk upload requires a positive integer block size and a nonempty file');
    }
    const totalChunks = Math.ceil(file.size / blockSize);
    validateChunkUrls(uploadUrls, totalChunks);
    const { default: executeInBatches } = await import('../../../utils/executeInBatches.js');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const failedChunks = new Set();
    const attemptMap = new Map();
    try {
      const chunks = Array.from({ length: totalChunks }, (_, index) => index);
      await executeInBatches(chunks, this.getChunkConcurrencyLimit(), async (index) => {
        if (controller.signal.aborted) throw this.createAbortError();
        let chunkNumber = index;
        const start = index * blockSize;
        const chunk = file.slice(start, Math.min(start + blockSize, file.size));
        try {
          const url = uploadUrls[index];
          const storageUrl = typeof url === 'object' ? url.href : url;
          chunkNumber = extractChunkNumber(url, index);
          const result = await this.uploadChunkWithRetry(storageUrl, chunk, options.fileType, controller.signal);
          if (controller.signal.aborted) throw this.createAbortError();
          attemptMap.set(index, result.attempt);
          this.actionBinder.logAnalyticsinSplunk('Chunk Uploaded|UnityWidget', {
            assetId: this.actionBinder.assetId,
            fileMetaData: {
              chunkNumber,
              chunkUploadAttempt: result.attempt,
              size: `${chunk.size}`,
              type: options.fileType,
            },
          });
          options.onChunkComplete?.(index, chunkNumber, result);
        } catch (error) {
          if (!controller.signal.aborted) {
            const chunkInfo = { chunkIndex: index, chunkNumber };
            failedChunks.add(chunkInfo);
            attemptMap.set(index, error.attempt || 1);
            controller.abort();
            this.logError('Upload Chunk Error|UnityWidget', {
              chunkNumber,
              size: chunk.size,
              fileType: options.fileType,
              attempt: error.attempt || 1,
              errorData: { code: 'upload-chunk-error', desc: error.message },
            }, `Chunk ${chunkNumber} upload failed: ${error.message}`);
            options.onChunkError?.(chunkInfo, error);
          }
          throw error;
        }
      });
    } catch (error) {
      if (signal?.aborted) throw this.createAbortError();
      if (failedChunks.size === 0) throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
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
