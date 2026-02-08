/* eslint-disable class-methods-use-this */

import { getConfig, unityConfig } from '../../../scripts/utils.js';

/**
 * PromptBarConfigBuilder - Builds configuration for the shareable prompt bar component
 *
 * Configuration Sources:
 * 1. Static defaults (defined in this file)
 * 2. Environment detection (stage/prod based on hostname)
 * 3. Models from SharePoint (/unity/configs/prompt/model-picker.json)
 * 4. Authored content from document (placeholders, query params, enabled verbs)
 */
export default class PromptBarConfigBuilder {
  static STATIC_CONFIG = {
    hideMoreButton: true,
    openTarget: '_self',
    autoFocus: false,
    settings: ['model'],
    highlightModelPicker: false,
  };

  constructor(el, workflowCfg) {
    this.el = el;
    this.workflowCfg = workflowCfg;
    this.models = null;
    this.authoredConfig = {};
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF-Config' };
  }

  buildEnvironmentConfig() {
    const { locale } = getConfig();
    const localeCode = locale?.ietf || 'en-US';

    const envTypeMap = {
      prod: 'production',
      stage: 'stage',
    };

    const envType = envTypeMap[unityConfig.env] || 'development';

    return {
      type: envType,
      localeCode,
    };
  }

  async fetchModels() {
    if (this.models) return this.models;
    try {
      const { origin } = window.location;
      const baseUrl = this.getBaseUrl(origin);
      const modelFile = `${baseUrl}/unity/configs/prompt/shareable-promptbar-models.json`;
      const response = await fetch(modelFile);
      if (!response.ok) { throw new Error(response.status); }
      const modelJson = await response.json();
      this.models = modelJson?.content?.data || [];
      return this.models;
    } catch (e) {
      window.lana?.log(`Message: Failed to fetch models, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  getBaseUrl(origin) {
    if (origin.includes('.aem.') || origin.includes('.hlx.')) {
      const env = origin.includes('.hlx.') ? 'hlx' : 'aem';
      return `https://main--unity--adobecom.${env}.live`;
    }
    return origin;
  }

  getDefaultModelId() {
    
  }

  extractAuthoredConfig() {
    const config = {};
    config.enabledVerbs = this.extractEnabledVerbs();
    config.placeholders = this.extractPlaceholders();
    config.additionalQueryParams = this.extractQueryParams();
    config.authoredSettings = this.extractAuthoredSettings();

    this.authoredConfig = config;
    return config;
  }

  extractEnabledVerbs() {
    //TODO: implement this
  }

  extractPlaceholders() {
    //TODO: implement this
  }

  getAdditionalQueryParams() {
    const cgen = this.el.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
    const queryParams = {};
    if (cgen) {
      cgen.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        if (key && value) queryParams[key] = value;
      });
    }
    return queryParams;
  }

  extractAuthoredSettings() {
    //TODO: implement this for hide model picker, highlight model picker, default model id
  }

  async buildSettingsConfig(options = {}) {
    // combine all the settings from the authored config + static config + models data

    return {
      hideMoreButton: true,
      openTarget: '_self',
      'image-generation': {
        placeholder: 'Describe the image you want to generate',
        hideModelPicker: true,
        settings: ['model'],
      },
      'video-generation': {
        placeholder: 'Describe the video you want to generate',
        hideModelPicker: true,
        settings: ['model'],
      },
      'sound-fx-generation': {
        disabled: true,
      },
      'vector-generation': {
        disabled: true,
      },
    };
  }

  async build(options = {}) {
    this.extractAuthoredConfig();

    const [environment, settings] = await Promise.all([
      Promise.resolve(this.buildEnvironmentConfig()),
      this.buildSettingsConfig(options),
    ]);

    return {
      environment,
      settings,
      additionalQueryParams: this.getAdditionalQueryParams(),
    };
  }
}