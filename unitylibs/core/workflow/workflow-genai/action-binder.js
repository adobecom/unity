/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs,
  createTag,
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
    unityConfig.expressEndpoint = { autoComplete: `${unityConfig.apiEndPoint}/api/v1/providers/AutoComplete` };
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
        case value.actionType === 'closeDropdown':
          this.closeDropdown(el);
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
        // Check if event is already bound
        if (el.hasAttribute('data-event-bound')) {
          return; // Skip if already bound
        }
        // Add event listeners based on the element's node type
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
              this.updateWidget(this.query);
              clearTimeout(debounceTimer);
              if (this.query.length >= 3 && (e.inputType === 'insertText' || e.inputType === 'insertFromPaste' || e.data === ' ')) {
                debounceTimer = setTimeout(async () => {
                  await this.expressActionMaps(values);
                }, 1000);
              }
            });
            break;
          case el.nodeName === 'LI':
            el.addEventListener('click', async () => {
              await this.expressActionMaps(values, el);
            });
            break;
          case el.nodeName === 'BUTTON':
            el.addEventListener('click', async () => {
              await this.expressActionMaps(values, el);
            });
            break;
          default:
            break;
        }
        // Mark the element as having an event bound
        el.setAttribute('data-event-bound', 'true');
      });
    }
    this.addAccessibilityFeatures();
  }

  async fetchAutocompleteSuggestions() {
    let suggestions = null;
    try {
      const data = { query: this.query, targetProduct: this.workflowCfg.productName, maxResults: 5 };
      suggestions = await this.serviceHandler.postCallToService(
        this.expressApiConfig.expressEndpoint.autoComplete,
        { body: JSON.stringify(data) },
      );
      if (!suggestions) return;
      this.displaySuggestions(suggestions.completions); // to be implemented
    } catch (e) {
      console.log('Error fetching autocomplete suggestions:', e);
    }
  }

  createSuggestionHeader() {
    const header = createTag('li', { class: 'dropdown-title dynamic' });
    const textSpan = createTag('span', { class: 'title-text' }, `${this.workflowCfg.placeholder['placeholder-suggestions']} (English ${this.workflowCfg.placeholder['placeholder-only']})`);
    const refreshBtn = createTag('button', { class: 'refresh-btn dynamic', 'aria-abel': 'Refresh suggestions' });
    const closeBtn = createTag('button', { class: 'close-btn dynamic', 'aria-label': 'Close suggestions' });
    header.appendChild(textSpan);
    header.appendChild(refreshBtn);
    header.appendChild(closeBtn);
    return header;
  }

  closeDropdown() {
    const input = this.block.querySelector('.input-class');
    input.value = '';
    const surpriseBtn = this.block.querySelector('.surprise-btn-class');
    surpriseBtn.classList.remove('hidden');
    const dropdown = this.block.querySelector('.dropdown');
    const dynamicElem = dropdown.querySelectorAll('.dynamic');
    dynamicElem.forEach((el) => el.remove());
    dropdown.classList.add('hidden');
    const defaultItems = dropdown.querySelectorAll('.dropdown-item, .dropdown-title');
    defaultItems.forEach((item) => item.classList.remove('hidden'));
    const emptyCon = dropdown.querySelector('.dropdown-empty-message');
    if (emptyCon) emptyCon.remove();
  }

  updateWidget(txtVal) {
    const dropdown = this.block.querySelector('.dropdown');
    const surpriseBtn = this.block.querySelector('.surprise-btn-class');
    if (txtVal.length > 0) {
      surpriseBtn.classList.add('hidden');
    } else {
      surpriseBtn.classList.remove('hidden');
      const dynamicElem = dropdown.querySelectorAll('.dynamic');
      dynamicElem.forEach((el) => el.remove());
      const defaultItems = dropdown.querySelectorAll('.dropdown-item, .dropdown-title');
      defaultItems.forEach((item) => item.classList.remove('hidden'));
      const emptyCon = dropdown.querySelector('.dropdown-empty-message');
      if (emptyCon) emptyCon.remove();
    }
  }

  displaySuggestions(suggestions) {
    // if (!suggestions.length) return;
    const dropdown = this.block.querySelector('.dropdown');
    // Hide existing default suggestions
    const defaultItems = dropdown.querySelectorAll('.dropdown-item, .dropdown-title');
    defaultItems.forEach((item) => item.classList.add('hidden'));
    // Add new dynamic suggestions
    const sugHeader = this.createSuggestionHeader();
    if (suggestions.length === 0) {
      // Show "No suggestion Available" message
      const emptyCon = dropdown.querySelector('.dropdown-empty-message');
      if (emptyCon) return;
      const emptyMessage = createTag('li', {
        class: 'dropdown-empty-message',
        role: 'presentation',
      }, 'No suggestion Available');
      dropdown.prepend(emptyMessage);
      dropdown.prepend(sugHeader);
    } else {
      const emptyCon = dropdown.querySelector('.dropdown-empty-message');
      if (emptyCon) emptyCon.remove();
      suggestions.forEach((suggestion, index) => {
        const item = createTag('li', {
          id: `dynamic-item-${index}`,
          class: 'dropdown-item dynamic',
          role: 'option',
        }, suggestion);
        dropdown.prepend(item);
        dropdown.prepend(sugHeader);
      });
    }
    if (dropdown.classList.contains('hidden')) {
      dropdown.classList.remove('hidden');
    }
    this.initActionListeners();
  }

  async surpriseMe() {
    const prompts = this.workflowCfg.supportedTexts.prompt;
    if (!prompts) return;
    const randomIndex = Math.floor(Math.random() * prompts.length);
    this.query = prompts[randomIndex];
    this.generate();
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
    const surpriseBtn = this.block.querySelector('.surprise-btn-class');
    const input = this.block.querySelector('.input-class');
    const promptText = el.textContent.trim();
    input.value = promptText;
    input.focus();
    if (!surpriseBtn.classList.contains('hidden')) surpriseBtn.classList.add('hidden');
  }

  addAccessibilityFeatures() {
    const dropdown = this.block.querySelector('.dropdown');
    const dropdownItems = Array.from(this.block.querySelectorAll('.dropdown-item'));
    let activeIndex = -1;
    const input = document.querySelector('.input-class');
    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
      if (dropdownItems.length === 0) return;

      switch (e.key) {
        case 'ArrowDown': // Navigate to the next dropdown item
          e.preventDefault();
          activeIndex = (activeIndex + 1) % dropdownItems.length; // Increment index and wrap around
          this.updateActiveDescendant(dropdownItems, activeIndex, input);
          break;

        case 'ArrowUp': // Navigate to the previous dropdown item
          e.preventDefault();
          activeIndex = (activeIndex - 1 + dropdownItems.length) % dropdownItems.length; // Decrement index and wrap around
          this.updateActiveDescendant(dropdownItems, activeIndex, input);
          break;

        case 'Enter': // Select the current dropdown item
          e.preventDefault();
          if (activeIndex >= 0) {
            dropdownItems[activeIndex].click(); // Trigger the click event for the active item
          }
          break;

        case 'Escape': // Close the dropdown
          dropdown.classList.add('hidden');
          input.setAttribute('aria-expanded', 'false');
          activeIndex = -1; // Reset active index
          break;

        default:
          // Allow normal input behavior for other keys
          break;
      }
    });

    // Handle focus and blur for dropdown visibility
    input.addEventListener('focus', () => {
      dropdown.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        ddropdown.classList.add('hidden');
        input.setAttribute('aria-expanded', 'false');
        activeIndex = -1; // Reset active index on blur
      }, 200); // Delay to allow click events on dropdown items
    });
  }

  updateActiveDescendant(items, index, input) {
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', item.id);
      } else {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }
}
