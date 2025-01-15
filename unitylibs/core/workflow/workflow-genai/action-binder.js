import { unityConfig, createTag, getUnityLibs, sendAnalyticsEvent } from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actions = actionMap;
    this.query = '';
    this.maxResults = 0;
    this.serviceHandler = null;
    this.sendAnalyticsOnFocus = true;
    this.apiConfig = this.initializeApiConfig();
    this.inputField = this.block.querySelector('.input-field');
    this.dropdown = this.block.querySelector('.dropdown');
    this.surpriseBtn = this.block.querySelector('.surprise-btn');
  }

  initializeApiConfig() {
    unityConfig.expressEndpoint = { autoComplete: `${unityConfig.apiEndPoint}/api/v1/providers/AutoComplete` };
    return unityConfig;
  }

  async initActionListeners() {
    Object.entries(this.actions).forEach(([selector, actionsList]) => {
      const elements = this.block.querySelectorAll(selector);
      elements.forEach((el) => {
        if (el.hasAttribute('data-event-bound')) return;
        this.addEventListeners(el, actionsList);
        el.setAttribute('data-event-bound', 'true');
      });
    });
    this.addAccessibilityFeatures();
  }

  addEventListeners(el, actionsList) {
    switch (el.nodeName) {
      case 'A':
      case 'BUTTON':
        el.addEventListener('click', async (event) => {
          event.preventDefault();
          await this.executeActions(actionsList, el);
        });
        break;
      case 'LI':
        el.addEventListener('mousedown', (event) => {
          event.preventDefault();
        });
        el.addEventListener('click', async (event) => {
          event.preventDefault();
          await this.executeActions(actionsList, el);
        });
        break;
      case 'INPUT':
        this.addInputEventListeners(el, actionsList);
        break;
      default:
        break;
    }
  }

  addInputEventListeners(el, actionsList) {
    let debounceTimer;
    el.addEventListener('input', (event) => {
      clearTimeout(debounceTimer);
      this.query = event.target.value.trim();
      this.toggleSurpriseButton();
      if (this.query.length >= 3) {
        debounceTimer = setTimeout(async () => {
          await this.executeActions(actionsList);
        }, 1000);
      }
    });
    el.addEventListener('focus', () => {
      this.dropdown.classList.remove('hidden');
      if (this.sendAnalyticsOnFocus) {
        sendAnalyticsEvent(new Event('promptOpen'));
        this.sendAnalyticsOnFocus = false;
      }
    });
    el.addEventListener('blur', (event) => {
      const { relatedTarget } = event;
      if (relatedTarget && this.dropdown.contains(relatedTarget)) {
        return;
      }
      this.dropdown.classList.add('hidden');
    });
  }

  async executeActions(actionsList, el = null) {
    const { default: ServiceHandler } = await import(
      `${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`
    );
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
    );
    for (const action of actionsList) {
      await this.handleAction(action, el);
    }
  }

  async handleAction(action, el) {
    switch (action.actionType) {
      case 'autocomplete':
        await this.fetchAutocompleteSuggestions();
        break;
      case 'surprise':
        await this.triggerSurpriseMe();
        break;
      case 'generate':
        await this.generateContent();
        break;
      case 'setPromptValue':
        this.setPromptValue(el);
        break;
      case 'closeDropdown':
        this.resetDropdown();
        break;
      default:
        break;
    }
  }

  async fetchAutocompleteSuggestions() {
    try {
      if (this.query) {
        const promptEvent = new Event('promptValue');
        promptEvent.data = { query: this.query };
        sendAnalyticsEvent(promptEvent);
      }
      const data = {
        query: this.query,
        targetProduct: this.workflowConfig.productName,
        maxResults: (this.maxResults += 3),
      };
      const response = await this.serviceHandler.postCallToService(
        this.apiConfig.expressEndpoint.autoComplete,
        { body: JSON.stringify(data) },
      );
      if (response?.completions) {
        this.displaySuggestions(response.completions);
        this.inputField.focus();
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
    }
  }

  displaySuggestions(suggestions) {
    this.clearDropdown();
    this.toggleDefaultItems(false);
    const dynamicHeader = this.createDynamicHeader();
    this.dropdown.insertBefore(dynamicHeader, this.dropdown.firstChild);
    const latestSuggestions = suggestions.slice(-3);
    if (latestSuggestions.length === 0) {
      this.displayNoSuggestionsMessage(dynamicHeader);
    } else {
      this.addSuggestionItems(latestSuggestions, dynamicHeader);
    }
    this.dropdown.classList.remove('hidden');
    this.initActionListeners();
  }

  clearDropdown() {
    this.dropdown.querySelectorAll('.dropdown-item.dynamic, .dropdown-title.dynamic, .dropdown-empty-message').forEach((el) => el.remove());
    this.dropdown.classList.add('hidden');
    this.addAccessibilityFeatures();
  }

  toggleDefaultItems(show = true) {
    const defaultItems = this.dropdown.querySelectorAll('.dropdown-item, .dropdown-title');
    defaultItems.forEach((item) => {
      item.classList.toggle('hidden', !show);
    });
  }

  displayNoSuggestionsMessage(dynamicHeader) {
    const emptyMessage = this.dropdown.querySelector('.dropdown-empty-message');
    if (!emptyMessage) {
      const noSuggestions = createTag('li', {
        class: 'dropdown-empty-message',
        role: 'presentation',
      }, 'No suggestions available');
      this.dropdown.insertBefore(noSuggestions, dynamicHeader.nextSibling);
    }
  }

  addSuggestionItems(suggestions, dynamicHeader) {
    suggestions.forEach((suggestion, index) => {
      const item = createTag('li', {
        id: `item-${index}`,
        class: 'dropdown-item dynamic',
        'daa-ll': `prompt-API-powered|${suggestion}`,
        role: 'option',
      }, suggestion);
      const referenceNode = dynamicHeader.nextSibling;
      this.dropdown.insertBefore(item, referenceNode);
    });
  }

  createDynamicHeader() {
    const elements = [
      { tag: 'span', attributes: { class: 'title-text' }, content: `${this.workflowCfg.placeholder['placeholder-suggestions']} (English ${this.workflowCfg.placeholder['placeholder-only']})` },
      { tag: 'button', attributes: { class: 'refresh-btn dynamic', 'daa-ll': 'prompt-dropdown-refresh', 'aria-label': 'Refresh suggestions' } },
      { tag: 'button', attributes: { class: 'close-btn dynamic', 'daa-ll': 'prompt-dropdown-close', 'aria-label': 'Close dropdown' } },
    ];
    const header = createTag('li', { class: 'dropdown-title dynamic' });
    elements.forEach(({ tag, attributes, content = '' }) => {
      const element = createTag(tag, attributes, content);
      header.appendChild(element);
    });
    return header;
  }

  resetDropdown() {
    this.inputField.value = '';
    this.surpriseBtn.classList.remove('hidden');
    this.query = '';
    this.clearDropdown();
    this.toggleDefaultItems();
    this.dropdown.classList.add('hidden');
  }

  toggleSurpriseButton() {
    this.surpriseBtn.classList.toggle('hidden', this.query.length > 0);
    if (!this.query) this.resetDropdown();
  }

  setPromptValue(el) {
    const promptText = el.textContent.trim();
    this.inputField.value = promptText;
    this.query = promptText;
    this.inputField.focus();
    this.toggleSurpriseButton();
  }

  addAccessibilityFeatures() {
    let dropdownItems = Array.from(this.dropdown.querySelectorAll('.dropdown-item.dynamic'));
    if (!dropdownItems.length) {
      dropdownItems = Array.from(this.dropdown.querySelectorAll('.dropdown-item'));
    }
    let activeIndex = -1;
    this.inputField.addEventListener('keydown', (event) => {
      if (!dropdownItems.length) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          activeIndex = (activeIndex + 1) % dropdownItems.length;
          this.setActiveItem(dropdownItems, activeIndex, this.inputField);
          break;
        case 'ArrowUp':
          event.preventDefault();
          activeIndex = (activeIndex - 1 + dropdownItems.length) % dropdownItems.length;
          this.setActiveItem(dropdownItems, activeIndex, this.inputField);
          break;
        case 'Enter':
          event.preventDefault();
          dropdownItems[activeIndex]?.click();
          break;
        case 'Escape':
          this.dropdown.classList.add('hidden');
          this.inputField.setAttribute('aria-expanded', 'false');
          activeIndex = -1;
          break;
        default:
          break;
      }
    });
  }

  setActiveItem(items, index, input) {
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('active');
        input.setAttribute('aria-activedescendant', item.id);
      } else {
        item.classList.remove('active');
      }
    });
  }

  async triggerSurpriseMe() {
    const { prompt: prompts = [] } = this.workflowCfg.supportedTexts || {};
    if (prompts.length === 0) return;
    this.query = prompts[Math.floor(Math.random() * prompts.length)];
    await this.generateContent();
  }

  async generateContent() {
    try {
      const payload = { query: this.query, targetProduct: this.workflowCfg.productName };
      const response = await this.serviceHandler.postCallToService(
        this.apiConfig.connectorApiEndPoint,
        { body: JSON.stringify(payload) },
      );
      if (!response.url) return;
      window.location.href = response.url;
    } catch (error) {
      console.error('Error generating content:', error);
    }
  }
}
