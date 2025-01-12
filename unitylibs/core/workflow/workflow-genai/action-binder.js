import {
  unityConfig,
  getUnityLibs,
  createTag,
} from '../../../scripts/utils.js';

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
            el.addEventListener('input', (event) => {
              this.handleInputChange(event, actionsList, debounceTimer);
            });
            break;

          default:
            break;
        }

        el.setAttribute('data-event-bound', 'true');
      });
    }

    this.setupAccessibility();
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
  }

  handleInputChange(event, actionsList, debounceTimer) {
    let dTime = debounceTimer;
    this.query = event.target.value.trim();
    this.updateWidgetState(this.query);

    clearTimeout(dTime);

    if (
      this.query.length >= 3
      && ['insertText', 'insertFromPaste'].includes(event.inputType)
    ) {
      dTime = setTimeout(() => {
        this.handleAction(actionsList);
      }, 1000);
    }
  }

  async fetchAutocompleteSuggestions() {
    try {
      const requestBody = {
        query: this.query,
        targetProduct: this.workflowCfg.productName,
        maxResults: 5,
      };

      const suggestions = await this.serviceHandler.postCallToService(
        this.apiConfig.autoComplete,
        { body: JSON.stringify(requestBody) },
      );

      if (suggestions?.completions) {
        this.displaySuggestions(suggestions.completions);
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
    }
  }

  displaySuggestions(suggestions) {
    const dropdown = this.block.querySelector('.dropdown');
    const defaultItems = dropdown.querySelectorAll('.dropdown-item, .dropdown-title');
    defaultItems.forEach((item) => item.classList.add('hidden'));

    this.addDynamicSuggestions(suggestions, dropdown);

    if (dropdown.classList.contains('hidden')) {
      dropdown.classList.remove('hidden');
    }

    this.initActionListeners();
  }

  addDynamicSuggestions(suggestions, dropdown) {
    const header = this.createSuggestionHeader();
    dropdown.prepend(header);

    if (suggestions.length === 0) {
      const noSuggestions = dropdown.querySelector('.dropdown-empty-message');
      if (!noSuggestions) {
        const emptyMessage = createTag('li', {
          class: 'dropdown-empty-message',
          role: 'presentation',
        }, 'No suggestions available');
        dropdown.prepend(emptyMessage);
      }
    } else {
      suggestions.forEach((suggestion, index) => {
        const item = createTag('li', {
          id: `dynamic-item-${index}`,
          class: 'dropdown-item dynamic',
          role: 'option',
        }, suggestion);
        dropdown.append(item);
      });
    }
  }

  createSuggestionHeader() {
    const header = createTag('li', { class: 'dropdown-title dynamic' });
    const titleText = createTag(
      'span',
      { class: 'title-text' },
      `${this.workflowCfg.placeholder['placeholder-suggestions']} (${this.workflowCfg.placeholder['placeholder-only']})`
    );
    header.append(titleText);
    return header;
  }

  resetDropdown() {
    const dropdown = this.block.querySelector('.dropdown');
    const input = this.block.querySelector('.input-class');
    input.value = '';
    const surpriseBtn = this.block.querySelector('.surprise-btn-class');
    surpriseBtn.classList.remove('hidden');
    dropdown.querySelectorAll('.dynamic').forEach((el) => el.remove());
    dropdown.querySelectorAll('.dropdown-item, .dropdown-title').forEach((item) => item.classList.remove('hidden'));
    dropdown.querySelector('.dropdown-empty-message')?.remove();
    dropdown.classList.add('hidden');
  }

  updateWidgetState(inputValue) {
    const dropdown = this.block.querySelector('.dropdown');
    const surpriseBtn = this.block.querySelector('.surprise-btn');
    surpriseBtn.classList.toggle('hidden', inputValue.length > 0);

    if (inputValue.length === 0) {
      this.resetDropdown();
    }
  }

  updatePromptValue(el) {
    const input = this.block.querySelector('.input-field');
    const promptText = el.textContent.trim();
    input.value = promptText;
    input.focus();
    const surpriseBtn = this.block.querySelector('.surprise-btn');
    surpriseBtn.classList.add('hidden');
  }

  setupAccessibility() {
    const input = this.block.querySelector('.input-field');
    const dropdown = this.block.querySelector('.dropdown');
    const dropdownItems = Array.from(dropdown.querySelectorAll('.dropdown-item'));
    let activeIndex = -1;

    input.addEventListener('keydown', (event) => {
      if (!dropdownItems.length) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          activeIndex = (activeIndex + 1) % dropdownItems.length;
          this.setActiveItem(dropdownItems, activeIndex, input);
          break;
        case 'ArrowUp':
          event.preventDefault();
          activeIndex = (activeIndex - 1 + dropdownItems.length) % dropdownItems.length;
          this.setActiveItem(dropdownItems, activeIndex, input);
          break;
        case 'Enter':
          event.preventDefault();
          dropdownItems[activeIndex]?.click();
          break;
        case 'Escape':
          dropdown.classList.add('hidden');
          input.setAttribute('aria-expanded', 'false');
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
        this.apiConfig.connectorApiEndPoint,
        { body: JSON.stringify(payload) },
      );
      window.location.href = response.url;
    } catch (error) {
      console.error('Error generating content:', error);
    }
  }
}
