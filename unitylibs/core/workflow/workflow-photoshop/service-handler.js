/* eslint-disable eqeqeq */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  getGuestAccessToken,
  unityConfig,
} from '../../../scripts/utils.js';

export default class ServiceHandler {
  constructor(renderWidget = false, canvasArea = null, unityEl = null) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
  }

  getHeaders() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: getGuestAccessToken(),
        'x-api-key': unityConfig.apiKey,
      },
    };
  }

  async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
    const postOpts = {
      method: 'POST',
      ...this.getHeaders(),
      ...options,
    };
    try {
      let terminateOperation = false;
      if (this.renderWidget) {
        this.unityEl.addEventListener('unity:refreshrequested', () => {
          terminateOperation = true;
        });
      }
      const response = await fetch(api, postOpts);
      if (failOnError && response.status != 200) throw Error('Operation failed');
      if ((!failOnError) || terminateOperation) return response;
      const resJson = await response.json();
      return resJson;
    } catch (err) {
      if (this.renderWidget) {
        this.showErrorToast(errorCallbackOptions);
        this.canvasArea?.querySelector('.progress-circle').classList.remove('show');
        throw Error('Operation failed');
      }
    }
    return {};
  }

  showErrorToast(errorCallbackOptions) {
    if (!errorCallbackOptions.errorToastEl) return;
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.nextSibling.textContent;
    errorCallbackOptions.errorToastEl.querySelector('.alert-text p').innerText = msg;
    errorCallbackOptions.errorToastEl.classList.add('show');
  }
}
