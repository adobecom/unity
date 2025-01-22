import {
  unityConfig,
  createTag,
  getUnityLibs,
  sendAnalyticsEvent,
  defineDeviceByScreenSize,
} from '../../../scripts/utils.js';

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
    this.inputField = this.getElement('.input-field');
    this.dropdown = this.getElement('.dropdown');
    this.surpriseBtn = this.getElement('.surprise-btn');
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.activeIndex = -1;
    this.suggestion = [];
    this.viewport = defineDeviceByScreenSize();
    this.init();
  }

  init() {
    this.addAccessibility();
  }

  initializeApiConfig() {
    return {
      ...unityConfig,
      expressEndpoint: { autoComplete: `${unityConfig.apiEndPoint}/api/v1/providers/AutoComplete` },
    };
  }

  getElement(selector) {
    const element = this.block.querySelector(selector);
    if (!element) console.warn(`Element with selector "${selector}" not found.`);
    return element;
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
        debounceTimer = setTimeout(() => this.executeActions(actionsList), 1000);
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
    if (!this.serviceHandler) {
      const { default: ServiceHandler } = await import(
        `${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`
      );
      this.serviceHandler = new ServiceHandler(
        this.workflowCfg.targetCfg.renderWidget,
        this.canvasArea
      );
    }

    for (const action of actionsList) {
      await this.handleAction(action, el);
    }
  }

  async handleAction(action, el) {
    const actionMap = {
      autocomplete: () => this.fetchAutocompleteSuggestions(),
      refreshSuggestion: () => this.refreshSuggestions(),
      surprise: () => this.triggerSurpriseMe(),
      generate: () => this.generateContent(),
      setPromptValue: () => this.setPromptValue(el),
      closeDropdown: () => this.resetDropdown(),
    };

    const execute = actionMap[action.actionType];
    if (execute) await execute();
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

  addAccessibility() {
    this.addKeyDownListener();
  }

  addKeyDownListener() {
    this.removeKeyDownListener();
    this.block.addEventListener('keydown', this.boundHandleKeyDown);
  }

  removeKeyDownListener() {
    this.block.removeEventListener('keydown', this.boundHandleKeyDown);
  }

  handleKeyDown(event) {
    const validKeys = ['Tab', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
    if (!validKeys.includes(event.key)) return;

    const dropdownItems = this.getDropdownItems();
    const focusableElements = this.getFocusableElements(dropdownItems.length > 0);
    const currentIndex = focusableElements.indexOf(document.activeElement);

    switch (event.key) {
      case 'Tab':
        this.handleTab(event, focusableElements, currentIndex);
        break;
      case 'ArrowDown':
        this.handleArrowDown(event, dropdownItems);
        break;
      case 'ArrowUp':
        this.handleArrowUp(event, dropdownItems);
        break;
      case 'Enter':
        this.handleEnter(event, dropdownItems, focusableElements, currentIndex);
        break;
      case 'Escape':
        this.hideDropdown();
        break;
      default:
        break;
    }
  }

  getDropdownItems() {
    const dynamicItems = Array.from(this.dropdown.querySelectorAll('.dropdown-item.dynamic'));
    return dynamicItems.length > 0
      ? dynamicItems
      : Array.from(this.dropdown.querySelectorAll('.dropdown-item'));
  }

  getFocusableElements(isDynamic) {
    let closeBtnSelector = this.block.querySelector('.close-btn.dynamic') ? '.close-btn.dynamic' : '.close-btn';
    if (this.viewport !== 'MOBILE') {
      closeBtnSelector = `${closeBtnSelector}, .legal-text`;
    }
    const selector = isDynamic
      ? `.input-field, .refresh-btn, ${closeBtnSelector}`
      : `.input-field, ${closeBtnSelector}`;
    return Array.from(this.block.querySelectorAll(selector));
  }

  isDropdownVisible() {
    return !this.dropdown.classList.contains('hidden');
  }

  handleTab(event, focusableElements, currentIndex) {
    if (!focusableElements.length) return;
    event.preventDefault();
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusableElements.length) % focusableElements.length
      : (currentIndex + 1) % focusableElements.length;
    focusableElements[nextIndex].focus();
  }

  handleArrowDown(event, dropdownItems) {
    event.preventDefault();
    this.activeIndex = (this.activeIndex + 1) % dropdownItems.length;
    this.setActiveItem(dropdownItems, this.activeIndex, this.inputField);
  }

  handleArrowUp(event, dropdownItems) {
    event.preventDefault();
    this.activeIndex = (this.activeIndex - 1 + dropdownItems.length) % dropdownItems.length;
    this.setActiveItem(dropdownItems, this.activeIndex, this.inputField);
  }

  handleEnter(event, dropdownItems, focusableElements, currentIndex) {
    event.preventDefault();
    if (this.activeIndex >= 0 && dropdownItems[this.activeIndex]) {
      dropdownItems[this.activeIndex].click();
      dropdownItems[this.activeIndex].classList.remove('active');
      this.activeIndex = -1;
      return;
    }
    if (currentIndex !== -1) {
      focusableElements[currentIndex].click();
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
