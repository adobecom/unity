/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs
} from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea;
    this.operations = [];
    this.query = '';
    this.expressApiConfig = this.getExpressApiConfig();
    this.serviceHandler = null;
  }

  getExpressApiConfig() {
    unityConfig.expressEndpoint = {
      autoComplete: `${unityConfig.apiEndPoint}/api/v1/providers/AutoComplete`
    };
    return unityConfig;
  }

  async expressActionMaps(values, el = null) {
    const { default: ServiceHandler } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`);
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
    );
    for (const value of values) {
      switch (true) {
        case value.actionType === 'autocomplete':
          await this.fetchAutocompleteSuggestions();
          break;
        case value.actionType === 'surprise':
          await this.surpriseMe();
          break;
        case value.actionType === 'generate':
          await this.generate();
          break;
        case value.actionType === 'getPromptValue':
          this.getPromptValue(el);
          break;
        default:
          break;
      }
    }
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    let debounceTimer;
    for (const [key, values] of Object.entries(actMap)) {
      const elem = b.querySelectorAll(key);
      elem.forEach((el) => {
        switch (true) {
          case el.nodeName === 'A':
            el.addEventListener('click', async (e) => {
              e.preventDefault();
              await this.expressActionMaps(values);
            });
            break;
          case el.nodeName === 'INPUT':
            el.addEventListener('input', (e) => {
              this.query = e.target.value.trim();
              clearTimeout(debounceTimer);
              if (this.query.length >= 3 || e.inputType === 'insertText' || e.data === ' ') {
                debounceTimer = setTimeout(async () => {
                  await this.expressActionMaps(values);
                }, 1000);
              }
            });
            el.addEventListener('keydown', (e) => {
              this.addAccessibilityFeatures(e,el);
            });
            break;
          case el.nodeName === 'LI':
            el.addEventListener('click', async () => {
              await this.expressActionMaps(values, el);
            });
            break;
          default:
            break;
        }
      });
    }
  }

  async fetchAutocompleteSuggestions() {
    let suggestions = null;
    try {
      const data = { query: this.query, targetProduct: this.workflowCfg.productName };
      suggestions = await this.serviceHandler.postCallToService(
        this.expressApiConfig.expressEndpoint.autoComplete,
        { body: JSON.stringify(data) },
      );
      if (!suggestions) return;
      displaySuggestions(suggestions.completions); // to be implemented
    } catch (e) {
      console.log('Error fetching autocomplete suggestions:', e);
    }
  }

  async surpriseMe() {
    const prompts = this.workflowCfg.supportedTexts.prompt;
    if (!prompts) return;
    const randomIndex = Math.floor(Math.random() * prompts.length);
    this.query = prompts[randomIndex];
    return this.generate();
  }

  async generate() {
    try {
      const cOpts = { query: this.query, targetProduct: this.workflowCfg.productName };
      const connector = await this.serviceHandler.postCallToService(
        this.expressApiConfig.connectorApiEndPoint,
        { body: JSON.stringify(cOpts) },
      );
      window.location.href = connector.url;
    } catch (e) {
      console.log('Error fetching connector URL to express:', e);
    }
  }

  getPromptValue(el) {
    const input = this.block.querySelector('.input-class');
    const promptText = el.textContent.trim();
    input.value = promptText;
    input.focus();
  }

  addAccessibilityFeatures(e, input) {
    const dropdownItems = this.block.querySelectorAll('.dropdown-item');
    let activeIndex = -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % dropdownItems.length;
      this.updateActiveDescendant(dropdownItems, activeIndex, input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + dropdownItems.length) % dropdownItems.length;
      this.updateActiveDescendant(dropdownItems, activeIndex, input);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      dropdownItems[activeIndex].click();
    }
  }

  updateActiveDescendant(items, index, input) {
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', item.id || `dropdown-item-${i}`);
      } else {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }
}
