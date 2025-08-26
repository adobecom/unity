export const RETRY_CONFIG = {
    finalizePolling: {
      retryParams: {
        maxRetryDelay: 300,
        defaultRetryDelay: 5,
      },
    },
    metadataPolling: {
      retryParams: {
        maxRetryDelay: 5000,
        defaultRetryDelay: 500,
      }
    },
    default: {
        retryParams: {
          maxRetries: 4,
          retryDelay: 1000
        },
    },
};

export const HTTP_METHODS = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE',
};

export const HTTP_STATUS_CODES = {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
};

export const HTTP_ERROR_CODES = {
    QUOTA_EXCEEDED: 'quotaexceeded',
    NOT_ENTITLED: 'notentitled',
};

export default class HttpUtils {

    handleAbortedRequest(url, options) {
        if (!(options?.signal?.aborted)) return;
        const error = new Error(`Request to ${url} aborted by user.`);
        error.name = 'AbortError';
        error.status = 0;
        throw error;
    }
  
    async fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const passedSignal = options.signal || controller.signal;
        const mergedOptions = { ...options, signal: passedSignal };
        try {
            const response = await fetch(url, mergedOptions);
            clearTimeout(timeout);
            return response;
        } catch (e) {
            clearTimeout(timeout);
            if (e.name === 'AbortError') {
            const error = new Error(`Request timed out after ${timeoutMs}ms`);
            error.name = 'TimeoutError';
            throw error;
            }
            throw e;
        }
    }

    async afterFetchFromService(response) {
        const contentLength = response.headers.get('Content-Length');
        if (response.status === 202 || (response.status >= 500 && response.status < 600) || response.status === 429) return { status: response.status, headers: response.headers };
        if (response.status !== 200) {
          let errorMessage = `Error fetching from service. URL: ${url}`;
          if (contentLength !== '0') {
            try {
              const responseJson = await response.json();
              ['quotaexceeded', 'notentitled'].forEach((errorType) => {
                if (responseJson.reason?.includes(errorType)) errorMessage = errorType;
              });
            } catch {
              errorMessage = `Failed to parse JSON response. URL: ${url}`;
            }
          }
          const error = new Error(errorMessage);
          error.status = response.status;
          throw error;
        }
        if (contentLength === '0') return {};
        return response.json();
      }

    async errorAfterFetchFromService(url, options, e) {
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
  
    async fetchFromService(url, options, onSuccess, onError) {
        try {
            if (!options?.signal?.aborted) this.handleAbortedRequest(url, options);
            const response = await this.fetchWithTimeout(url, options, 60000);
            if (onSuccess) return await onSuccess(response);
            else return await this.afterFetchFromService(response);
            // if (response.status !== 200) {
            //     const error = new Error();
            //     error.status = response.status;
            //     throw error;
            // }
            // return response;
        } catch (e) {
            if (onError) await onError(e);
            else await this.errorAfterFetchFromService(url, options, e);
        }
    }

    async fetchFromServiceWithExponentialRetry(url, options, retryConfig=RETRY_CONFIG.default, onSuccess, onError) {
        const maxRetries = retryConfig.retryParams?.maxRetries || 4;
        const retryDelay = retryConfig.retryParams?.retryDelay || 1000;
        let error = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const onSuccessWithAttempt = onSuccess ? (response) => onSuccess(response, attempt) : null;
            const onErrorWithAttempt = onError ? (error) => onError(error, attempt) : null;
            const response = await this.fetchFromService(url, options, onSuccessWithAttempt, onErrorWithAttempt);
            if (response.status === 202 || (response.status >= 500 && response.status < 600) || response.status === 429) continue;
            return { response, attempt };
          } catch (err) {
           // if (err.name === 'AbortError') throw err;
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
    
    async fetchFromServiceWithServerPollingRetry(url, options, retryConfig, onSuccess, onError) {
        const maxRetryDelay = retryConfig.retryParams?.maxRetryDelay || 300;
        let timeLapsed = 0;
        while (timeLapsed < maxRetryDelay) {
            this.handleAbortedRequest(url, options);
            const response = await this.fetchFromService(url, options, null, onError);
            const {status, headers} = response;
            const customRetryCheckResult = retryConfig.extraRetryCheck && await retryConfig.extraRetryCheck(response);
            if (status === 202 || (status >= 500 && status < 600) || status === 429 || customRetryCheckResult) {
                const retryDelay = parseInt(headers.get('retry-after'), 10) || retryConfig.retryParams?.defaultRetryDelay || 5;
                await new Promise((resolve) => { setTimeout(resolve, retryDelay * 1000); });
                timeLapsed += retryDelay;
            } else {
                return onSuccess ? await onSuccess(response) : response;
            }
        }
        const timeoutError = new Error(`Max retry delay exceeded for URL: ${url}`);
        timeoutError.status = 504;
        throw timeoutError;
    }
  
    async deleteCallToService(url, accessToken, additionalHeaders = {}) {
      const options = {
        method: 'DELETE',
        headers: {
          ...additionalHeaders,
          Authorization: accessToken,
          'x-api-key': 'unity',
        },
      };
      return this.fetchFromServiceWithExponentialRetry(url, options);
    }
  }