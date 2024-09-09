/* eslint-disable eqeqeq */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  getGuestAccessToken,
  unityConfig,
} from '../../../scripts/utils.js';

export default class ServiceHandler {
  constructor(renderWidget = false, canvasArea = null) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
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

  async postCallToService(api, options) {
    const postOpts = {
      method: 'POST',
      ...this.getHeaders(),
      ...options,
    };
    try {
      const response = await fetch(api, postOpts);
      if (response.status !== 200) return null;
      const resJson = await response.json();
      return resJson;
    } catch (err) {
      // if (this.renderWidget) await this.errorToast(err);
    }
    return null;
  }

  // TODO: Define PDF chunking function
}
