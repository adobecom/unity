/* eslint-disable eqeqeq */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  getGuestAccessToken,
} from '../../../scripts/utils.js';

export default class ServiceHandler {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
  }

  getHeaders() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: getGuestAccessToken(),
        'x-api-key': this.apiKey,
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
      if (response.status !== 200) {
        //dipatchEvent to DC for error handling
        return {};
      }
      const resJson = await response.json();
      return resJson;
    } catch (err) {
      // if (this.renderWidget) await this.errorToast(err);
    }
    return {};
  }
}
