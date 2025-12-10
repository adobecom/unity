/* eslint-disable class-methods-use-this */

/**
 * Unity Widget - Firefly Prompt Bar Integration
 * 
 * This widget uses the Firefly Platform's prompt-bar-app component
 * instead of a custom implementation.
 */

import { createTag, getConfig, unityConfig } from '../../../scripts/utils.js';

// Base path to prompt-bar assets
const getPromptBarBasePath = () => {
  const { origin, pathname } = window.location;
  
  // For local development, use origin directly
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return `${origin}/unitylibs/core/workflow/workflow-firefly/prompt-bar`;
  }
  
  // For AEM/HLX environments, try to use the same origin first
  // This allows testing on feature branches
  if (origin.includes('.aem.') || origin.includes('.hlx.')) {
    // Use the current origin instead of hardcoding main branch
    return `${origin}/unitylibs/core/workflow/workflow-firefly/prompt-bar`;
  }
  
  // Default fallback
  return `${origin}/unitylibs/core/workflow/workflow-firefly/prompt-bar`;
};

// Module cache
let promptBarModule = null;
let promptBarLoadPromise = null;

/**
 * Load the prompt-bar component module
 */
async function loadPromptBarModule() {
  if (promptBarModule) return promptBarModule;
  if (promptBarLoadPromise) return promptBarLoadPromise;

  const basePath = getPromptBarBasePath();
  // eslint-disable-next-line no-console
  console.log('[Unity] Loading prompt-bar from:', basePath);

  promptBarLoadPromise = (async () => {
    try {
      // Load Lit runtime first
      await import(`${basePath}/runtime.min.js`);
      // Load the main component
      promptBarModule = await import(`${basePath}/prompt-bar-app-lightweight.js`);
      return promptBarModule;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Unity] Failed to load prompt-bar module from:', basePath, error);
      throw error;
    }
  })();

  return promptBarLoadPromise;
}

/**
 * Load locale data
 */
async function loadLocaleData(locale = 'en-US') {
  const basePath = getPromptBarBasePath();
  try {
    const module = await import(`${basePath}/locales/${locale}.js`);
    return module.default;
  } catch (e) {
    console.warn(`Locale ${locale} not found, falling back to en-US`);
    const module = await import(`${basePath}/locales/en-US.js`);
    return module.default;
  }
}

export default class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
    this.spriteCon = spriteCon;
    this.prompts = null;
    this.models = null;
    this.selectedVerbType = 'image'; // Default to image
    this.selectedVerbText = '';
    this.selectedModelModule = '';
    this.selectedModelId = '';
    this.selectedModelText = '';
    this.selectedModelVersion = '';
    this.promptItems = [];
    this.genBtn = null;
    this.hasPromptSuggestions = false;
    this.hasModelOptions = false;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF' };
    this.sound = { audio: null, currentTile: null, currentUrl: '' };
    this.durationCache = new Map();
    
    // Prompt bar specific
    this.promptBarElement = null;
    this.promptBarModule = null;
    this.currentPrompt = '';
  }

  async initWidget() {
    const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
      .map((c) => createTag('div', { class: c }));
    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);
    this.workflowCfg.placeholder = this.popPlaceholders();

    // Check for features from authoring
    const hasPromptPlaceholder = !!this.el.querySelector('.icon-placeholder-prompt');
    const hasSuggestionsPlaceholder = !!this.el.querySelector('.icon-placeholder-suggestions');
    const hasModels = !!this.el.querySelector('[class*="icon-model"]');
    this.hasModelOptions = hasModels;
    this.hasPromptSuggestions = hasPromptPlaceholder && hasSuggestionsPlaceholder;

    // Get verbs configuration
    const verbs = this.el.querySelectorAll('[class*="icon-verb"]');
    if (verbs.length > 0) {
      this.selectedVerbType = verbs[0]?.className.split('-')[2] || 'image';
      this.selectedVerbText = verbs[0]?.nextElementSibling?.textContent.trim() || 'Image';
    }

    // Load models if needed
    if (this.hasModelOptions) await this.getModel();

    // Initialize the prompt bar component
    await this.initPromptBar();

    this.addWidget();

    if (this.workflowCfg.targetCfg.floatPrompt) this.initIO();

    return this.workflowCfg.targetCfg.actionMap;
  }

  /**
   * Initialize the Firefly prompt bar component
   */
  async initPromptBar() {
    try {
      // Load the prompt-bar module
      this.promptBarModule = await loadPromptBarModule();

      // Get exported constants and functions
      const {
        IMAGE_APPLICATION_KEY,
        VIDEO_APPLICATION_KEY,
        SOUND_FX_APPLICATION_KEY,
        promptAdvancedTagName,
        unlocalized,
      } = this.promptBarModule;

      // Store application keys for later use
      this.appKeys = {
        IMAGE_APPLICATION_KEY,
        VIDEO_APPLICATION_KEY,
        SOUND_FX_APPLICATION_KEY,
      };

      // Load localized strings (or use default unlocalized)
      const { locale } = getConfig();
      const localeCode = locale?.ietf || 'en-US';
      let localized;
      try {
        localized = await loadLocaleData(localeCode);
      } catch (e) {
        console.warn('Failed to load locale, using defaults:', e);
        localized = unlocalized;
      }

      // Map Unity verb types to prompt-bar application keys
      const verbToAppKey = {
        image: IMAGE_APPLICATION_KEY,
        video: VIDEO_APPLICATION_KEY,
        sound: SOUND_FX_APPLICATION_KEY,
      };

      // Build application configs based on verbs
      const applicationConfigs = this.buildApplicationConfigs(localized);

      // Create the prompt-advanced element using the exported tag name
      const tagName = promptAdvancedTagName || 'firefly-prompt-advanced';
      this.promptBarElement = document.createElement(tagName);

      // Set properties
      this.promptBarElement.localized = localized;
      this.promptBarElement.config = applicationConfigs;
      this.promptBarElement.selectedApplicationId = verbToAppKey[this.selectedVerbType] || IMAGE_APPLICATION_KEY;
      this.promptBarElement.prompt = '';
      this.promptBarElement.selectedSettings = {};
      this.promptBarElement.isGenerating = false;
      this.promptBarElement.isMoreButtonLoading = false;
      this.promptBarElement.hideMoreButton = !this.workflowCfg.targetCfg?.showMoreButton;

      // Set up event listeners
      this.setupPromptBarEvents();

      // Add to widget
      const promptBarContainer = createTag('div', { class: 'prompt-bar-container' });
      promptBarContainer.appendChild(this.promptBarElement);
      this.widget.appendChild(promptBarContainer);

    } catch (error) {
      console.error('Failed to initialize prompt bar:', error);
      window.lana?.log(`Message: Error initializing prompt bar, Error: ${error}`, this.lanaOptions);
      // Fall back to legacy widget if prompt-bar fails
      await this.initLegacyWidget();
    }
  }

  /**
   * Build application configs for the prompt bar
   */
  buildApplicationConfigs(localized) {
    const configs = [];
    const verbs = this.el.querySelectorAll('[class*="icon-verb"]');
    const ph = this.workflowCfg.placeholder;

    // Map of verb types to their configs
    const verbConfigs = {
      image: () => this.buildImageConfig(localized, ph),
      video: () => this.buildVideoConfig(localized, ph),
      sound: () => this.buildSoundConfig(localized, ph),
    };

    // Build config for each enabled verb
    verbs.forEach((verb) => {
      const verbType = verb.className.split('-')[2];
      if (verbConfigs[verbType]) {
        const config = verbConfigs[verbType]();
        if (config) configs.push(config);
      }
    });

    // If no verbs found, default to image
    if (configs.length === 0) {
      configs.push(this.buildImageConfig(localized, ph));
    }

    return configs;
  }

  /**
   * Build image generation config
   */
  buildImageConfig(localized, ph) {
    const models = this.getModelsForVerb('image');
    
    const modelItems = models.map((model, idx) => ({
      id: model.id,
      label: model.name,
      value: {
        id: model.id,
        name: model.name,
        isThirdParty: false,
      },
      isDefault: idx === 0,
    }));

    return {
      id: 'image-generation',
      name: localized?.imageGeneration?.title || 'Image',
      icon: 'image',
      settings: [
        ...(modelItems.length > 0 ? [{
          id: 'model',
          type: 'picker',
          label: localized?.model?.label || 'Model',
          items: modelItems,
          hide: modelItems.length <= 1,
        }] : []),
        {
          id: 'aspect-ratio',
          type: 'aspect-ratio',
          label: localized?.aspectRatio?.label || 'Aspect Ratio',
          items: [
            { id: 'square', label: '1:1', value: { width: 1024, height: 1024 }, isDefault: true },
            { id: 'landscape', label: '16:9', value: { width: 1024, height: 576 } },
            { id: 'portrait', label: '9:16', value: { width: 576, height: 1024 } },
            { id: 'widescreen', label: '4:3', value: { width: 1024, height: 768 } },
          ],
        },
      ],
      placeholder: ph['placeholder-input'] || localized?.prompt?.placeholder || 'Describe the image you want to create...',
    };
  }

  /**
   * Build video generation config
   */
  buildVideoConfig(localized, ph) {
    const models = this.getModelsForVerb('video');
    
    const modelItems = models.map((model, idx) => ({
      id: model.id,
      label: model.name,
      value: {
        id: model.id,
        name: model.name,
        isThirdParty: false,
      },
      isDefault: idx === 0,
    }));

    return {
      id: 'video-generation',
      name: localized?.videoGeneration?.title || 'Video',
      icon: 'video',
      settings: [
        ...(modelItems.length > 0 ? [{
          id: 'model',
          type: 'picker',
          label: localized?.model?.label || 'Model',
          items: modelItems,
          hide: modelItems.length <= 1,
        }] : []),
      ],
      placeholder: ph['placeholder-input'] || localized?.prompt?.placeholder || 'Describe the video you want to create...',
    };
  }

  /**
   * Build sound effects config
   */
  buildSoundConfig(localized, ph) {
    return {
      id: 'sound-fx-generation',
      name: localized?.soundFxGeneration?.title || 'Sound Effects',
      icon: 'audio',
      settings: [],
      placeholder: ph['placeholder-input'] || 'Describe the sound you want to create...',
    };
  }

  /**
   * Get models for a specific verb type
   */
  getModelsForVerb(verbType) {
    if (!this.models || !Array.isArray(this.models)) return [];
    return this.models.filter((model) => model.module === verbType);
  }

  /**
   * Set up event listeners for the prompt bar
   */
  setupPromptBarEvents() {
    if (!this.promptBarElement) return;

    // Use stored application keys
    const {
      IMAGE_APPLICATION_KEY,
      VIDEO_APPLICATION_KEY,
      SOUND_FX_APPLICATION_KEY,
    } = this.appKeys;

    // Map application keys back to Unity verb types
    const appKeyToVerb = {
      [IMAGE_APPLICATION_KEY]: 'image',
      [VIDEO_APPLICATION_KEY]: 'video',
      [SOUND_FX_APPLICATION_KEY]: 'sound',
    };

    // Generate event - main action
    this.promptBarElement.addEventListener('prompt-advanced-generate', (event) => {
      const applicationId = this.promptBarElement.selectedApplicationId;
      const prompt = this.promptBarElement.prompt || '';
      const settings = this.promptBarElement.selectedSettings || {};

      this.currentPrompt = prompt;
      this.selectedVerbType = appKeyToVerb[applicationId] || 'image';

      // Extract model info from settings if available
      const modelSetting = settings[applicationId]?.model;
      if (modelSetting?.value) {
        this.selectedModelId = modelSetting.value.id || '';
        this.selectedModelText = modelSetting.value.name || '';
      }

      // Update widget wrap attributes for external listeners
      this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
      if (this.selectedModelId) {
        this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
      }

      // Dispatch Unity's custom event for action handlers
      this.widgetWrap.dispatchEvent(new CustomEvent('firefly-generate', {
        detail: {
          prompt,
          verb: this.selectedVerbType,
          applicationId,
          settings,
          modelId: this.selectedModelId,
          modelVersion: this.selectedModelVersion,
        },
        bubbles: true,
      }));

      // Analytics tracking
      this.trackAnalytics('generate', {
        verb: this.selectedVerbType,
        prompt: prompt.slice(0, 50),
        modelId: this.selectedModelId,
      });

      console.log('Generate requested:', { applicationId, prompt, settings });
    });

    // Application change event
    this.promptBarElement.addEventListener('prompt-advanced-application-change', (event) => {
      const { applicationId } = event.detail;
      this.selectedVerbType = appKeyToVerb[applicationId] || 'image';
      this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);

      // Clear model selection when switching apps
      this.selectedModelId = '';
      this.selectedModelVersion = '';
      this.widgetWrap.removeAttribute('data-selected-model-id');
      this.widgetWrap.removeAttribute('data-selected-model-version');

      this.widgetWrap.dispatchEvent(new CustomEvent('firefly-application-change', {
        detail: { applicationId, verb: this.selectedVerbType },
        bubbles: true,
      }));

      this.trackAnalytics('application-change', { verb: this.selectedVerbType });
    });

    // Prompt change event
    this.promptBarElement.addEventListener('prompt-advanced-prompt-change', (event) => {
      const { value } = event.detail;
      this.currentPrompt = value;

      this.widgetWrap.dispatchEvent(new CustomEvent('firefly-prompt-change', {
        detail: { prompt: value },
        bubbles: true,
      }));
    });

    // Setting change event
    this.promptBarElement.addEventListener('prompt-advanced-setting-change', (event) => {
      const { settingId, item } = event.detail;

      // Track model changes
      if (settingId === 'model' && item?.value) {
        this.selectedModelId = item.value.id || '';
        this.selectedModelText = item.value.name || '';
        this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
      }

      this.widgetWrap.dispatchEvent(new CustomEvent('firefly-setting-change', {
        detail: event.detail,
        bubbles: true,
      }));

      this.trackAnalytics('setting-change', { settingId });
    });

    // More button click
    this.promptBarElement.addEventListener('prompt-advanced-more-button-click', (event) => {
      const prompt = this.promptBarElement.prompt || '';

      this.widgetWrap.dispatchEvent(new CustomEvent('firefly-more-click', {
        detail: {
          prompt,
          verb: this.selectedVerbType,
          modelId: this.selectedModelId,
        },
        bubbles: true,
      }));

      this.trackAnalytics('more-click', { verb: this.selectedVerbType });
    });

    // Setting interaction (for analytics)
    this.promptBarElement.addEventListener('prompt-advanced-setting-interact', (event) => {
      const { settingId, type } = event.detail;
      this.trackAnalytics('setting-interact', { settingId, type });
    });
  }

  /**
   * Track analytics events
   */
  trackAnalytics(action, data = {}) {
    // Unity analytics via satellite
    if (window._satellite) {
      window._satellite.track(`firefly-${action}`, {
        ...data,
        verb: this.selectedVerbType,
      });
    }

    // Also dispatch for any external listeners
    this.widgetWrap.dispatchEvent(new CustomEvent('firefly-analytics', {
      detail: { action, ...data },
      bubbles: true,
    }));
  }

  /**
   * Legacy widget initialization (fallback)
   */
  async initLegacyWidget() {
    console.warn('Falling back to legacy widget implementation');
    // Create a simple textarea fallback
    const inputWrapper = this.createLegacyInputWrapper();
    this.widget.appendChild(inputWrapper);
  }

  /**
   * Create legacy input wrapper (fallback)
   */
  createLegacyInputWrapper() {
    const ph = this.workflowCfg.placeholder;
    const inpWrap = createTag('div', { class: 'inp-wrap legacy-fallback' });
    const inpField = createTag('textarea', {
      id: 'promptInput',
      class: 'inp-field',
      placeholder: ph['placeholder-input'] || 'Enter your prompt...',
    });
    const genBtn = createTag('button', {
      class: 'unity-act-btn gen-btn',
      'aria-label': 'Generate',
    }, 'Generate');

    genBtn.addEventListener('click', () => {
      const prompt = inpField.value;
      this.widgetWrap.dispatchEvent(new CustomEvent('firefly-generate', {
        detail: { prompt, verb: this.selectedVerbType },
        bubbles: true,
      }));
    });

    inpWrap.append(inpField, genBtn);
    return inpWrap;
  }

  // ============================================
  // Preserved methods from original widget.js
  // ============================================

  popPlaceholders() {
    return Object.fromEntries(
      [...this.el.querySelectorAll('[class*="placeholder"]')].map((element) => [
        element.classList[1]?.replace('icon-', '') || '',
        element.closest('li')?.innerText || '',
      ]).filter(([key]) => key),
    );
  }

  addWidget() {
    const interactArea = this.target.querySelector('.copy');
    const para = interactArea?.querySelector(this.workflowCfg.targetCfg.target);
    this.widgetWrap.append(this.widget);
    if (para && this.workflowCfg.targetCfg.insert === 'before') para.before(this.widgetWrap);
    else if (para) para.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }

  async loadPrompts() {
    const { locale } = getConfig();
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const promptFile = locale.prefix && locale.prefix !== '/'
      ? `${baseUrl}${locale.prefix}/unity/configs/prompt/firefly-prompt.json`
      : `${baseUrl}/unity/configs/prompt/firefly-prompt.json`;
    const promptRes = await fetch(promptFile);
    if (!promptRes.ok) {
      throw new Error('Failed to fetch prompts.');
    }
    const promptJson = await promptRes.json();
    this.prompts = this.createPromptMap(promptJson?.content?.data);
  }

  async getPrompt(verb) {
    if (!this.hasPromptSuggestions) return [];
    try {
      if (!this.prompts || Object.keys(this.prompts).length === 0) await this.loadPrompts();
      return (this.prompts?.[verb] || []).filter((item) => item.prompt && item.prompt.trim() !== '');
    } catch (e) {
      window.lana?.log(`Message: Error loading prompts, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  async loadModels() {
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const modelFile = `${baseUrl}/unity/configs/prompt/model-picker.json`;
    const results = await fetch(modelFile);
    if (!results.ok) {
      throw new Error('Failed to fetch models.');
    }
    const modelJson = await results.json();
    this.models = modelJson?.content?.data;
  }

  async getModel() {
    if (!this.hasModelOptions) return [];
    try {
      if (!this.models || Object.keys(this.models).length === 0) await this.loadModels();
      return this.models;
    } catch (e) {
      window.lana?.log(`Message: Error loading models, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  createPromptMap(data) {
    const promptMap = {};
    if (Array.isArray(data)) {
      data.forEach((item) => {
        const itemEnv = item.env || 'prod';
        if (item.verb && item.prompt && itemEnv === unityConfig.env) {
          if (!promptMap[item.verb]) promptMap[item.verb] = [];
          let variations = [];
          if (item.verb === 'sound') {
            const ph = this.workflowCfg?.placeholder || {};
            const labels = Object.keys(ph)
              .filter((k) => k.startsWith('placeholder-variation-label-'))
              .map((k) => ({ idx: Number.parseInt(k.split('-').pop(), 10), val: (ph[k] || '').trim() }))
              .filter(({ idx, val }) => Number.isFinite(idx) && val)
              .sort((a, b) => a.idx - b.idx)
              .map(({ val }) => val);
            const urls = (typeof item.variationUrls === 'string' ? item.variationUrls : '')
              .split('||').map((s) => s.trim()).filter((s) => s);
            variations = labels.map((lbl, idx) => ({ label: lbl, url: urls[idx] || '' }));
          }
          promptMap[item.verb].push({ prompt: item.prompt, assetid: item.assetid, variations });
        }
      });
    }
    return promptMap;
  }

  // ============================================
  // Public API for external control
  // ============================================

  /**
   * Set the prompt text programmatically
   */
  setPrompt(text) {
    if (this.promptBarElement) {
      this.promptBarElement.prompt = text;
      this.currentPrompt = text;
    }
  }

  /**
   * Get the current prompt text
   */
  getPrompt() {
    return this.promptBarElement?.prompt || this.currentPrompt || '';
  }

  /**
   * Set generating state
   */
  setGenerating(isGenerating) {
    if (this.promptBarElement) {
      this.promptBarElement.isGenerating = isGenerating;
    }
  }

  /**
   * Set the selected application
   */
  setApplication(applicationId) {
    if (this.promptBarElement) {
      this.promptBarElement.selectedApplicationId = applicationId;
    }
  }

  /**
   * Get the prompt bar element for direct manipulation
   */
  getPromptBarElement() {
    return this.promptBarElement;
  }
}

