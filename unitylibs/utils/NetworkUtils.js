export default class NetworkUtils {
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

    async afterFetchFromService(url, response) {
        const contentLength = response.headers.get('Content-Length');
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
        return response;
      }

    async getResponseJson(response, fallbackValue = {}) {
        if (!response.body || response.headers?.get('Content-Length') === '0') return fallbackValue;
        try {
            return await response.json();
        } catch (e) {
            return fallbackValue;
        }
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
            else if (response.status === 202 || (response.status >= 500 && response.status < 600) || response.status === 429) return response;
            else return await this.afterFetchFromService(url, response);
        } catch (e) {
            if (onError) await onError(e);
            else await this.errorAfterFetchFromService(url, options, e);
        }
    }

    async fetchFromServiceWithRetry(url, options, retryConfig={ retryType: 'exponential', retryParams: { maxRetries: 4, retryDelay: 1000 } }, onSuccess, onError) {
        if (retryConfig.retryType === 'exponential') {
            return await this.fetchFromServiceWithExponentialRetry(url, options, retryConfig, onSuccess, onError);
        } else if (retryConfig.retryType === 'polling') {
            return await this.fetchFromServiceWithServerPollingRetry(url, options, retryConfig, onSuccess, onError);
        }
    }

    async fetchFromServiceWithExponentialRetry(url, options, retryConfig, onSuccess, onError) {
        const maxRetries = retryConfig.retryParams?.maxRetries || 4;
        let retryDelay = retryConfig.retryParams?.retryDelay || 1000;
        try {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const onSuccessWithAttempt = onSuccess ? (response) => onSuccess(response, attempt) : null;
                const onErrorWithAttempt = onError ? (error) => onError(error, attempt) : null;
                let response = await this.fetchFromService(url, options, onSuccessWithAttempt, onErrorWithAttempt);
                const customRetryCheckResult = retryConfig.extraRetryCheck && await retryConfig.extraRetryCheck(response);
                if ((customRetryCheckResult || response.status === 202 || (response.status >= 500 && response.status < 600) || response.status === 429)) {
                    if (attempt < maxRetries) {
                    const delay = retryDelay;
                        await new Promise((resolve) => { setTimeout(resolve, delay); });
                        retryDelay *= 2;
                        continue;
                    } else {
                        response = await this.afterFetchFromService(url, response);
                    }
                };
                const responseData = await this.getResponseJson(response, response);
                return { response: responseData, attempt };
            } 
        } catch (error) {
            if (error) error.message += ', Max retry delay exceeded for URL: ' + url;
            else error = new Error('Max retry delay exceeded for URL: ' + url);
            throw error;
        }
    }
    
    async fetchFromServiceWithServerPollingRetry(url, options, retryConfig, onSuccess, onError) {
        const maxRetryDelay = retryConfig.retryParams?.maxRetryDelay || 300;
        let timeLapsed = 0;
        let response;
        try {
            while (timeLapsed < maxRetryDelay) {
                this.handleAbortedRequest(url, options);
                response = await this.fetchFromService(url, options, null, onError);
                const {status, headers} = response;
                const responseJson = await this.getResponseJson(response);
                const customRetryCheckResult = retryConfig.extraRetryCheck && await retryConfig.extraRetryCheck(status,responseJson);
                if (customRetryCheckResult || status === 202 || (status >= 500 && status < 600) || status === 429) {
                    const retryDelay = parseInt(headers.get('retry-after'), 10) || retryConfig.retryParams?.defaultRetryDelay || 5;
                    await new Promise((resolve) => { setTimeout(resolve, retryDelay ); });
                    timeLapsed += retryDelay;
                } else {
                    return onSuccess ? await onSuccess(responseJson) : response;
                }
            } 
            return await this.afterFetchFromService(url, response);
        } catch (error) {
            if (error) error.message += ', Max retry delay exceeded for URL: ' + url;
            else error = new Error('Max retry delay exceeded for URL: ' + url);
            throw error;
        }
    }
  }