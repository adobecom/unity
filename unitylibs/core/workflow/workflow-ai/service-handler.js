/* eslint-disable eqeqeq */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import { unityConfig, getGuestAccessToken } from '../../../scripts/utils.js';
export default class ServiceHandler {
  constructor(renderWidget = false, canvasArea = null) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
  }

  async getHeaders() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: await getGuestAccessToken(),
        'x-api-key': unityConfig.apiKey,
      },
    };
  }

  async fetchFromService(url, options) {
    try {
      const response = await fetch(url, options);
      const error = new Error();
      if (response.status !== 200) {
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

  async postCallToService(api, options) {
    const headers = await this.getHeaders();
    const postOpts = {
      method: 'POST',
      ...headers,
      ...options,
    };
    return this.fetchFromService(api, postOpts);
  }
}
