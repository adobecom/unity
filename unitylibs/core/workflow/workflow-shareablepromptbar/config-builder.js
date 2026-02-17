/* eslint-disable class-methods-use-this */
import { getConfig, unityConfig } from '../../../scripts/utils.js';

export default class PromptBarConfigBuilder {
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

  getAdditionalQueryParams() {
    const cgenEl =
      this.widgetWrap?.querySelector('.icon-cgen')
      || this.unityEl?.querySelector('.icon-cgen')
      || document.querySelector('.icon-cgen');

    const cgen = cgenEl?.parentElement?.textContent?.trim();

    const queryParams = {};
    if (cgen) {
      cgen.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        if (key && value) queryParams[key] = value;
      });
    }
    return queryParams;
  }

  async getPromptBarSettingsConfig() {
    const config = {
      openTarget: this.workflowCfg.targetCfg.openTarget,
      hideMoreButton: this.workflowCfg.targetCfg.hideMoreButton,
    };
    const placeholderEl = this.el.querySelector('.icon-placeholder-input');
    const placeholder = placeholderEl?.parentElement?.textContent?.trim();

    const verbIcons = Array.from(this.el.querySelectorAll('[class*="icon-verb-"]'))
      .filter((icon) => icon.className.includes('icon-verb-') && !icon.className.includes('icon-default-verb-'));
    const enabledApps = new Set();
    verbIcons.forEach((icon) => {
      const match = icon.className.match(/icon-verb-([a-z-]+)/);
      if (match) {
        const appId = match[1]; // e.g., "image-generation", "vector-generation"
        enabledApps.add(appId);
      }
    });

    const defaultIcon = this.el.querySelector('[class*="icon-default-verb-"]');
    if (defaultIcon) {
      const match = defaultIcon.className.match(/icon-default-verb-([a-z-]+)/);
      if (match) {
        const [, defaultAppId] = match;
        config.defaultApplicationId = defaultAppId;
      }
    }
    const { hideModelPicker, modelsConfigByApp, allApplicationIds = [] } = await this.getModelsConfig();
    allApplicationIds.forEach((appId) => {
      if (!enabledApps.has(appId)) {
        config[appId] = {
          disabled: true,
        };
      } else {
        config[appId] = {
          placeholder,
          hideModelPicker,
          highlightModelPicker: this.workflowCfg.targetCfg.highlightModelPicker,
          settings: this.workflowCfg.targetCfg.settings,
        };

        if (modelsConfigByApp) {
          if (typeof modelsConfigByApp === 'string') {
            config[appId]['models'] = modelsConfigByApp;
          } else if (modelsConfigByApp[appId]) {
            const appModelsConfig = modelsConfigByApp[appId];
            if (appModelsConfig.models && appModelsConfig.models.length > 0) {
              config[appId]['models'] = appModelsConfig.models;
              if (appModelsConfig.defaultModelId) {
                config[appId]['defaultModelId'] = appModelsConfig.defaultModelId;
              }
            }
          }
        }
      }
    });
    return config;
  }

  async getModelsConfig() {
    const showModels = this.el.querySelector('.icon-show-models');
    const showModelsWithSuffix = this.el.querySelector('[class*="icon-show-models-"]');
    const hideModelPicker = !(showModels || showModelsWithSuffix);

    let allApplicationIds = [];
    let modelJson = null;
    try {
      const { origin } = window.location;
      const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
        ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
        : origin;
      const modelFile = `${baseUrl}/unity/configs/prompt/model-picker-shared.json`;
      const results = await fetch(modelFile);
      if (results.ok) {
        modelJson = await results.json();
        const verbsData = modelJson?.verbs?.data || [];
        if (Array.isArray(verbsData)) {
          const collected = [];
          verbsData.forEach((entry) => {
            const sv = entry.supportedVerbs;
            if (Array.isArray(sv)) {
              collected.push(...sv);
            } else if (sv != null && sv !== '') {
              collected.push(sv);
            }
          });
          allApplicationIds = [...new Set(collected)];
        }
      }
    } catch (e) {
      window.lana?.log(`Message: Error loading models config, Error: ${e}`, this.lanaOptions);
    }

    if (showModelsWithSuffix) {
      const match = showModelsWithSuffix.className.match(/icon-show-models-([a-z-]+)/);
      return { hideModelPicker, modelsConfigByApp: match ? match[1] : null, allApplicationIds };
    }
    if (showModels && modelJson) {
      const modelsData = modelJson?.content?.data || [];
      const modelsConfigByApp = {};
      if (Array.isArray(modelsData) && modelsData.length > 0) {
        modelsData.forEach((entry) => {
          const { module: appId, model, default: isDefault } = entry;
          if (appId && model) {
            if (!modelsConfigByApp[appId]) {
              modelsConfigByApp[appId] = {
                models: [],
                defaultModelId: null,
              };
            }
            modelsConfigByApp[appId].models.push(model);
            if ((isDefault === 'true' || isDefault === true) && !modelsConfigByApp[appId].defaultModelId) {
              modelsConfigByApp[appId].defaultModelId = model;
            }
          }
        });
        Object.keys(modelsConfigByApp).forEach((appId) => {
          if (modelsConfigByApp[appId].models.length > 0 && !modelsConfigByApp[appId].defaultModelId) {
            modelsConfigByApp[appId].defaultModelId = modelsConfigByApp[appId].models[0];
          }
        });
      }
      return { hideModelPicker, modelsConfigByApp, allApplicationIds };
    }
    return { hideModelPicker, modelsConfigByApp: null, allApplicationIds };
  }

  async build(options = {}) {
    const [environment, settingsConfig] = await Promise.all([
      Promise.resolve(this.buildEnvironmentConfig()),
      this.getPromptBarSettingsConfig(options),
    ]);

    return {
      environment,
      settingsConfig,
      additionalQueryParams: this.getAdditionalQueryParams(),
    };
  }
}
