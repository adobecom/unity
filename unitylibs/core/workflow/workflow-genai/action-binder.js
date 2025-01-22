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
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.activeIndex = -1;
    this.suggestion = [];
  }

  initializeApiConfig() {
    unityConfig.expressEndpoint = { autoComplete: `${unityConfig.apiEndPoint}/api/v1/providers/AutoComplete` };
    return unityConfig;
  }

  async initActionListeners() {
    Object.entries(this.actions).forEach(([selector, actionsList]) => {
      const elements = this.block.querySelectorAll(selector);
      elements.forEach((el) => {
        if (!el.hasAttribute('data-event-bound')) {
          this.addEventListeners(el, actionsList);
          el.setAttribute('data-event-bound', 'true');
        }
      });
    });
  }

  addEventListeners(el, actionsList) {
    const handleClick = async (event) => {
      event.preventDefault();
      await this.executeActions(actionsList, el);
    };
    switch (el.nodeName) {
      case 'A':
      case 'BUTTON':
        el.addEventListener('click', handleClick);
        break;
      case 'LI':
        el.addEventListener('mousedown', (event) => event.preventDefault());
        el.addEventListener('click', handleClick);
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
        debounceTimer = setTimeout(async () => this.executeActions(actionsList), 1000);
      }
    });
    el.addEventListener('focus', () => {
      this.showDropdown();
      if (this.sendAnalyticsOnFocus) {
        sendAnalyticsEvent(new Event('promptOpen'));
        this.sendAnalyticsOnFocus = false;
      }
    });
    el.addEventListener('blur', (event) => {
      if (!this.dropdown.contains(event.relatedTarget)) this.hideDropdown();
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
      case 'refreshSuggestion':
        await this.refreshSuggestions();
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

  async fetchAutocompleteSuggestions(fetchType = 'default') {
    try {
      if (fetchType === 'refresh') {
        this.maxResults *= 2;
      } else {
        if (this.query) {
          const promptEvent = new Event('promptValue');
          promptEvent.data = { query: this.query };
          sendAnalyticsEvent(promptEvent);
        }
        this.maxResults = 12;
      }
      const data = {
        query: this.query,
        targetProduct: this.apiConfig.productName,
        maxResults: this.maxResults,
      };
      const response = await this.serviceHandler.postCallToService(
        this.apiConfig.expressEndpoint.autoComplete,
        { body: JSON.stringify(data) },
      );
      if (response?.completions) {
        this.suggestion = fetchType === 'refresh'
          ? response.completions.slice(this.maxResults / 2)
          : response.completions;
        this.displaySuggestions();
        this.inputField.focus();
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
    }
  }

  async refreshSuggestions() {
    if (this.suggestion.length > 0) {
      this.displaySuggestions();
      this.inputField.focus();
    } else {
      await this.fetchAutocompleteSuggestions('refresh');
    }
  }

  displaySuggestions() {
    this.clearDropdown();
    this.toggleDefaultItems(false);
    const dynamicHeader = this.createDynamicHeader();
    this.dropdown.insertBefore(dynamicHeader, this.dropdown.firstChild);
    const latestSuggestions = this.suggestion.splice(0, 3);
    if (latestSuggestions.length === 0) {
      this.displayNoSuggestionsMessage(dynamicHeader);
    } else {
      this.addSuggestionItems(latestSuggestions, dynamicHeader);
    }
    this.dropdown.classList.remove('hidden');
    console.log('displaySuggestions');
    this.initActionListeners();
    this.addAccessibility();
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

  toggleDefaultItems(show = true) {
    const defaultItems = this.dropdown.querySelectorAll('.dropdown-item, .dropdown-title-con');
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
      }, this.workflowCfg.placeholder['placeholder-no-suggestions']);
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
    const header = createTag('li', { class: 'dropdown-title-con dynamic' });
    elements.forEach(({ tag, attributes, content = '' }) => {
      const element = createTag(tag, attributes, content);
      header.appendChild(element);
    });
    return header;
  }

  setPromptValue(el) {
    const promptText = el.textContent.trim();
    this.inputField.value = promptText;
    this.query = promptText;
    this.inputField.focus();
    this.toggleSurpriseButton();
  }

  addKeyDownListener() {
    this.removeKeyDownListener();
    this.block.addEventListener('keydown', this.boundHandleKeyDown);
  }

  removeKeyDownListener() {
    this.block.removeEventListener('keydown', this.boundHandleKeyDown);
  }

  addAccessibility() {
    this.addKeyDownListener();
  }

  handleKeyDown(event) {
    const validKey = ['Tab', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key);
    if (!validKey) return;
    console.log('handleKeyDown', event.key);
    let dropdownItems = Array.from(this.dropdown.querySelectorAll('.dropdown-item.dynamic'));
    let focusableElements = [];

    if (dropdownItems.length > 0) {
      focusableElements = Array.from(this.block.querySelectorAll('.input-field, .refresh-btn, .close-btn:nth-of-type(1), .legal-text'));
    } else {
      dropdownItems = Array.from(this.dropdown.querySelectorAll('.dropdown-item'));
      focusableElements = Array.from(this.block.querySelectorAll('.input-field, .close-btn:nth-of-type(1), .legal-text'));
    }
    console.log('focusableElements', focusableElements);
    if (!dropdownItems.length) return;
    const isDropdownVisible = !this.dropdown.classList.contains('hidden');
    if (!focusableElements.length) return;
    let currentIndex = 0;
    let prevIndex = 0;
    switch (event.key) {
      case 'Tab':
        if (!isDropdownVisible) return;
        event.preventDefault();
        currentIndex = focusableElements.indexOf(document.activeElement);

        if (event.shiftKey) {
          prevIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
          focusableElements[prevIndex].focus();
        } else {
          const nextIndex = (currentIndex + 1) % focusableElements.length;
          focusableElements[nextIndex].focus();
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex = (this.activeIndex + 1) % dropdownItems.length;
        this.setActiveItem(dropdownItems, this.activeIndex, this.inputField);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + dropdownItems.length) % dropdownItems.length;
        this.setActiveItem(dropdownItems, this.activeIndex, this.inputField);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.activeIndex >= 0 && dropdownItems[this.activeIndex]) {
          dropdownItems[this.activeIndex].click();
          dropdownItems[this.activeIndex].classList.remove('active');
        }
        this.activeIndex = -1;
        break;
      case 'Escape':
        this.hideDropdown();
        break;
      default:
        break;
    }
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

  clearDropdown() {
    this.dropdown.querySelectorAll('.dropdown-item.dynamic, .dropdown-title-con.dynamic, .dropdown-empty-message').forEach((el) => el.remove());
    this.dropdown.classList.add('hidden');
    this.addAccessibility();
  }

  showDropdown() {
    this.dropdown.classList.remove('hidden');
    this.dropdown.setAttribute('aria-hidden', 'false');
    this.inputField.setAttribute('aria-expanded', 'true');
  }

  hideDropdown() {
    this.dropdown.classList.add('hidden');
    this.dropdown.setAttribute('aria-hidden', 'true');
    this.inputField.setAttribute('aria-expanded', 'false');
  }

  toggleSurpriseButton() {
    this.surpriseBtn.classList.toggle('hidden', this.query.length > 0);
    if (!this.query) this.resetDropdown();
  }

  resetDropdown() {
    this.inputField.focus();
    this.inputField.value = '';
    this.query = '';
    this.surpriseBtn.classList.remove('hidden');
    this.clearDropdown();
    this.toggleDefaultItems();
    this.hideDropdown();
  }
}
