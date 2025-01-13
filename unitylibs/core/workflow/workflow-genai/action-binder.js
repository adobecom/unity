import { unityConfig, createTag, getUnityLibs } from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actionMap = actionMap;
    this.query = '';
    this.operations = [];
    this.serviceHandler = null;
    this.apiConfig = this.initializeApiConfig();
    this.inputField = this.block.querySelector('.input-field');
    this.dropdown = this.block.querySelector('.dropdown');
    this.surpriseBtn = this.block.querySelector('.surprise-btn');
  }

  initializeApiConfig() {
    return { autoComplete: `${unityConfig.apiEndPoint}/api/v1/providers/AutoComplete` };
  }

  async initActionListeners(block = this.block, actions = this.actionMap) {
    let debounceTimer;
    for (const [selector, actionsList] of Object.entries(actions)) {
      const elements = block.querySelectorAll(selector);
      elements.forEach((el) => {
        if (el.hasAttribute('data-event-bound')) return;
        this.addEventListeners(el, actionsList, debounceTimer);
        el.setAttribute('data-event-bound', 'true');
      });
    }
    this.addAccessibilityFeatures();
  }

  addEventListeners(el, actionsList, debounceTimer) {
    switch (el.nodeName) {
      case 'A':
      case 'BUTTON':
      case 'LI':
        el.addEventListener('click', async (event) => {
          event.preventDefault();
          await this.handleAction(actionsList, el);
        });
        break;
      case 'INPUT':
        this.addInputEventListeners(el, actionsList, debounceTimer);
        break;
      default:
        break;
    }
  }

  addInputEventListeners(el, actionsList, debounceTimer) {
    el.addEventListener('input', (event) => {
      clearTimeout(debounceTimer);
      this.query = event.target.value.trim();
      this.updateWidgetState(this.query);
      if (this.query.length >= 3) {
        debounceTimer = setTimeout(async () => {
          await this.handleAction(actionsList);
        }, 1000);
      }
    });
    el.addEventListener('focus', () => {
      this.dropdown.classList.remove('hidden');
    });
    el.addEventListener('blur', (event) => {
      const { relatedTarget } = event;
      if (relatedTarget && this.dropdown.contains(relatedTarget)) {
        return;
      }
      this.dropdown.classList.add('hidden');
    });
  }

  async handleAction(actionsList, el = null) {
    const { default: ServiceHandler } = await import(
      `${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`
    );
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
    );
    for (const action of actionsList) {
      await this.executeAction(action, el);
    }
  }

  async executeAction(action, el) {
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
      case 'getPromptValue':
        this.updatePromptValue(el);
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
      const data = {
        query: this.query,
        targetProduct: this.workflowCfg.productName,
        maxResults: 5,
      };
      const suggestions = await this.serviceHandler.postCallToService(
        this.apiConfig.autoComplete,
        { body: JSON.stringify(data) },
      );
      if (suggestions?.completions) {
        this.displaySuggestions(suggestions.completions);
        this.inputField.focus();
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
    }
  }

  displaySuggestions(suggestions) {
    this.clearDynamicItems();
    this.hideDefaultItems();
    let dynamicHeader = this.dropdown.querySelector('.dropdown-title.dynamic');
    if (!dynamicHeader) {
      dynamicHeader = this.createSuggestionHeader();
      this.dropdown.insertBefore(dynamicHeader, this.dropdown.firstChild);
    }
    if (suggestions.length === 0) {
      this.displayNoSuggestionsMessage(dynamicHeader);
    } else {
      this.addSuggestionItems(suggestions, dynamicHeader);
    }
    this.dropdown.classList.remove('hidden');
    this.initActionListeners();
  }

  clearDynamicItems() {
    const dynamicItems = this.dropdown.querySelectorAll('.dropdown-item.dynamic');
    dynamicItems.forEach((el) => el.remove());
    const dynamicHeader = this.dropdown.querySelector('.dropdown-title.dynamic');
    if (dynamicHeader) {
      dynamicHeader.remove();
    }
  }

  hideDefaultItems() {
    const defaultItems = this.dropdown.querySelectorAll('.dropdown-item, .dropdown-title:not(.dynamic)');
    defaultItems.forEach((item) => item.classList.add('hidden'));
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
        id: `dynamic-item-${index}`,
        class: 'dropdown-item dynamic',
        'daa-ll': suggestion,
        role: 'option',
      }, suggestion);
      const referenceNode = dynamicHeader.nextSibling;
      this.dropdown.insertBefore(item, referenceNode);
    });
  }

  createSuggestionHeader() {
    const header = createTag('li', { class: 'dropdown-title dynamic' });
    const titleText = createTag(
      'span',
      { class: 'title-text' },
      `${this.workflowCfg.placeholder['placeholder-suggestions']} (English ${this.workflowCfg.placeholder['placeholder-only']})`
    );
    const refreshBtn = createTag('button', {
      class: 'refresh-btn dynamic',
      'aria-label': 'Refresh suggestions',
    });
    const closeBtn = createTag('button', {
      class: 'close-btn dynamic',
      'aria-label': 'Close dropdown',
    });
    header.append(titleText, refreshBtn, closeBtn);
    return header;
  }

  resetDropdown() {
    this.inputField.value = '';
    this.surpriseBtn.classList.remove('hidden');

    this.clearDynamicItems();
    this.showDefaultItems();
    this.removeEmptyMessage();
    this.dropdown.classList.add('hidden');
  }

  showDefaultItems() {
    const defaultItems = this.dropdown.querySelectorAll('.dropdown-item, .dropdown-title');
    defaultItems.forEach((item) => item.classList.remove('hidden'));
  }

  removeEmptyMessage() {
    const emptyMessage = this.dropdown.querySelector('.dropdown-empty-message');
    if (emptyMessage) {
      emptyMessage.remove();
    }
  }

  updateWidgetState(query) {
    this.surpriseBtn.classList.toggle('hidden', query.length > 0);

    if (query.length === 0) {
      this.resetDropdown();
    }
  }

  updatePromptValue(el) {
    const promptText = el.textContent.trim();
    this.inputField.value = promptText;
    this.inputField.focus();
    this.surpriseBtn.classList.add('hidden');
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
    const prompts = this.workflowCfg.supportedTexts.prompt;
    if (!prompts) return;
    this.query = prompts[Math.floor(Math.random() * prompts.length)];
    await this.generateContent();
  }

  async generateContent() {
    try {
      const payload = { query: this.query, targetProduct: this.workflowCfg.productName };
      const response = await this.serviceHandler.postCallToService(
        this.apiConfig.autoComplete,
        { body: JSON.stringify(payload) },
      );
      window.location.href = response.url;
    } catch (error) {
      console.error('Error generating content:', error);
    }
  }
}
