import { unityConfig, sendAnalyticsEvent } from '../../../scripts/utils.js';

// Helper function for headers
async function getHeaders(apiKey, additionalHeaders = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };
  return Object.keys(additionalHeaders).length > 0
    ? { ...defaultHeaders, ...additionalHeaders }
    : defaultHeaders;
}

export default class SharedServiceHandler {
  constructor(renderWidget = false, canvasArea = null, unityEl = null, workflowCfg = {}) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
  }

  async fetchFromService(url, options) {
    try {
      const response = await fetch(url, options);
      if (response.status !== 200) {
        const error = new Error('Service request failed');
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        error.status = 504;
      }
      throw error;
    }
  }

  async postCallToService(api, options, additionalHeaders = {}) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey, {
        'x-unity-product': this.workflowCfg?.productName,
        'x-unity-action': this.workflowCfg?.supportedFeatures?.values()?.next()?.value,
        ...additionalHeaders,
      }),
      ...options,
    };
    return this.fetchFromService(api, postOpts);
  }

  async getCallToService(api, params = {}, additionalHeaders = {}) {
    const url = new URL(api);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    
    const getOpts = {
      method: 'GET',
      headers: await getHeaders(unityConfig.apiKey, additionalHeaders),
    };
    return this.fetchFromService(url.toString(), getOpts);
  }

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    sendAnalyticsEvent(new CustomEvent(`Upload ${errorType} error|UnityWidget`));
    if (!errorCallbackOptions?.errorToastEl) return;
    
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.closest('li')?.textContent?.trim();
    this.canvasArea.forEach((element) => {
      element.style.pointerEvents = 'none';
      const errorToast = element.querySelector('.alert-holder');
      if (!errorToast) return;
      const closeBtn = errorToast.querySelector('.alert-close');
      if (closeBtn) closeBtn.style.pointerEvents = 'auto';
      const alertText = errorToast.querySelector('.alert-text p');
      if (!alertText) return;
      alertText.innerText = msg;
      errorToast.classList.add('show');
    });
    window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, lanaOptions);
  }

  async fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const mergedOptions = { ...options, signal: controller.signal };
    
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

  async fetchFromServiceWithRetry(url, options, maxRetryDelay = 300) {
    let timeLapsed = 0;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        return await this.fetchFromService(url, options);
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) throw error;
        
        const delay = Math.min(maxRetryDelay, Math.pow(2, retryCount) * 1000);
        timeLapsed += delay;
        
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    }
  }
} 