/* eslint-disable class-methods-use-this */


import { createTag } from '../../../scripts/utils.js';
import PromptBarConfigBuilder from './config-builder.js';

export default class UnityWidget {
  static PROMPT_BAR_SCRIPT_URL = 'https://clio-assets.adobe.com/clio-playground/script-cache/127.1.6/prompt-bar-app/dist/main.bundle.js';
  static SPECTRUM_THEME_SCRIPT_URL = 'https://clio-assets.adobe.com/clio-playground/script-cache/116.1.4/spectrum-theme/dist/main.bundle.js';

  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.spriteCon = spriteCon;
    this.widget = null;
    this.widgetWrap = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-ShareablePromptBar' };
    this.promptBarApp = null;
    this.promptBarConfig = null;
    this.configBuilder = new PromptBarConfigBuilder(this.el, this.workflowCfg);
  }

  async initWidget() {
    const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
      .map((c) => createTag('div', { class: c }));

    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);

    try {
      const [, , promptBarConfig] = await Promise.all([
        this.loadScript(UnityWidget.SPECTRUM_THEME_SCRIPT_URL, 'Spectrum theme'),
        this.loadScript(UnityWidget.PROMPT_BAR_SCRIPT_URL, 'Firefly prompt bar'),
        this.configBuilder.build(),
      ]);
      this.promptBarConfig = promptBarConfig;
    } catch (e) {
      window.lana?.log(`Message: Failed to load Firefly prompt bar dependencies, Error: ${e}`, this.lanaOptions);
      return this.workflowCfg?.targetCfg?.actionMap || {};  //check if this is needed
    }

    this.createPromptBarDOM();
    this.setupEvents();

    this.addWidget();
    if (this.workflowCfg.targetCfg?.floatPrompt) this.initIO?.();
    return this.workflowCfg.targetCfg?.actionMap || {};  //check if this is needed
  }

  addWidget() {
    const interactArea = this.target.querySelector('.copy');
    const para = interactArea?.querySelector(this.workflowCfg.targetCfg.target);
    this.widgetWrap.append(this.widget);
    if (para && this.workflowCfg.targetCfg.insert === 'before') para.before(this.widgetWrap);
    else if (para) para.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }

  loadScript(url, name) {
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${url}"]`);
      if (existingScript) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.type = 'module';
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${name} script`));
      document.head.appendChild(script);
    });
  }

  createPromptBarDOM() {
    const spTheme = createTag('sp-theme', {
      theme: 'light',
      scale: 'medium',
      color: 'light',
    });

    const promptBarContainer = createTag('div', {
      id: 'prompt-bar-app-container',
      class: 'prompt-bar-app-container',
    });

    const fireflyPromptBarApp = document.createElement('firefly-prompt-bar-app');
    fireflyPromptBarApp.id = 'prompt-bar-app';
    fireflyPromptBarApp.style.width = '100%';
    fireflyPromptBarApp.style.height = '100%';

    const { environment, settingsConfig, additionalQueryParams } = this.promptBarConfig;
    Object.assign(fireflyPromptBarApp, {
      environment,
      settingsConfig,
      additionalQueryParams,
    });
    this.promptBarApp = fireflyPromptBarApp;

    promptBarContainer.appendChild(fireflyPromptBarApp);
    spTheme.appendChild(promptBarContainer);
    this.widget.appendChild(spTheme);
  }

  setupEvents() {
    this.promptBarApp.addEventListener('prompt-bar-app-setting-interact', (e) => {
      this.handleSettingInteract(e);
    });

    this.promptBarApp.addEventListener('prompt-advanced-generate', (e) => {
      this.widgetWrap.dispatchEvent(new CustomEvent('firefly-prompt-generate', {
        detail: { prompt: e.detail?.prompt, originalEvent: e },
      }));
    }, { capture: true });
  }

  handleSettingInteract(e) {
    const { detail } = e;
    if (detail?.settingId === 'prompt') {
      if (detail?.type === 'focus') {
        this.promptBarApp?.classList.add('prompt-focused');
      } else if (detail?.type === 'blur') {
        this.promptBarApp?.classList.remove('prompt-focused');
      }
    }
  }
}

