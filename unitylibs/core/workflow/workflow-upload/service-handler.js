import {
  unityConfig,
  sendAnalyticsEvent,
} from '../../../scripts/utils.js';

// Helper function for headers (moved from utils.js dependency)
async function getHeaders(apiKey, additionalHeaders = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };
  return Object.keys(additionalHeaders).length > 0
    ? { ...defaultHeaders, ...additionalHeaders }
    : defaultHeaders;
}

export default class ServiceHandler {
  constructor(renderWidget = false, canvasArea = null, unityEl = null, workflowCfg = {}) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
  }

  async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey, {
        'x-unity-product': this.workflowCfg?.productName,
        'x-unity-action': this.workflowCfg?.supportedFeatures?.values()?.next()?.value,
      }),
      ...options,
    };
    try {
      const response = await fetch(api, postOpts);
      if (failOnError && response.status !== 200) {
        const error = new Error('Operation failed');
        error.status = response.status;
        throw error;
      }
      if (!failOnError) return response;
      return await response.json();
    } catch (err) {
      this.showErrorToast(errorCallbackOptions, err, this.lanaOptions);
      throw err;
    }
  }

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    sendAnalyticsEvent(new CustomEvent(`Upload ${errorType} error|UnityWidget`));
    if (!errorCallbackOptions.errorToastEl) return;
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
} 