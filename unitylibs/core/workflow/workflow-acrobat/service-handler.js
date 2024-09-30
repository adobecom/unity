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
    const response = await fetch(api, postOpts);
    const error = new Error();
    if (response.status !== 200) {
      error.status = response.status;
      throw error;
    }
    const resJson = await response.json();
    return resJson;
  }
}
