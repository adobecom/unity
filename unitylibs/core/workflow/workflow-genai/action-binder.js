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
    return {
      autoComplete: `${unityConfig.apiEndPoint}/api/v1/providers/AutoComplete`,
    };
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
              clearTimeout(debounceTimer);
              this.query = event.target.value.trim();
              this.updateWidgetState(this.query);

              if (this.query.length >= 3) {
                debounceTimer = setTimeout(async () => {
                  await this.handleAction(actionsList);
                }, 1000);
              }
            });
            break;

          default:
            break;
        }

        el.setAttribute('data-event-bound', 'true');
      });
    }

    this.addAccessibilityFeatures();
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
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
    }
  }

  displaySuggestions(suggestions) {
    const dropdown = this.block.querySelector('.dropdown');
    const dynamicElem = dropdown.querySelectorAll('.dropdown-item.dynamic');
    dynamicElem.forEach((el) => el.remove());
    const defaultItems = dropdown.querySelectorAll('.dropdown-item, .dropdown-title:not(.dynamic)');
    defaultItems.forEach((item) => item.classList.add('hidden'));
    const dynamicheader = dropdown.querySelector('.dropdown-title.dynamic');
    if (suggestions.length === 0) {
      const emptyMessage = dropdown.querySelector('.dropdown-empty-message');
      if (!emptyMessage) {
        const noSuggestions = createTag('li', {
          class: 'dropdown-empty-message',
          role: 'presentation',
        }, 'No suggestions available');
        dropdown.prepend(noSuggestions);
      }
    } else {
      suggestions.forEach((suggestion, index) => {
        const item = createTag('li', {
          id: `dynamic-item-${index}`,
          class: 'dropdown-item dynamic',
          role: 'option',
        }, suggestion);
        dropdown.prepend(item);
      });
    }
    if (!dynamicheader) {
      const header = this.createSuggestionHeader();
      dropdown.prepend(header);
    }
    dropdown.classList.remove('hidden');
    this.initActionListeners();
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
    const dropdown = this.block.querySelector('.dropdown');
    const input = this.block.querySelector('.input-field');
    input.value = '';
    const surpriseBtn = this.block.querySelector('.surprise-btn');
    surpriseBtn.classList.remove('hidden');

    dropdown.querySelectorAll('.dynamic').forEach((el) => el.remove());
    dropdown.querySelectorAll('.dropdown-item, .dropdown-title').forEach((item) => item.classList.remove('hidden'));
    dropdown.querySelector('.dropdown-empty-message')?.remove();
    dropdown.classList.add('hidden');
  }

  updateWidgetState(query) {
    const surpriseBtn = this.block.querySelector('.surprise-btn');

    surpriseBtn.classList.toggle('hidden', query.length > 0);

    if (query.length === 0) {
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

  addAccessibilityFeatures() {
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
        this.apiConfig.autoComplete,
        { body: JSON.stringify(payload) },
      );
      window.location.href = response.url;
    } catch (error) {
      console.error('Error generating content:', error);
    }
  }
}
