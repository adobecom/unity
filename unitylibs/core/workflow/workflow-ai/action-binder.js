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
    this.activeIndex = -1;
    this.suggestion = [];
    this.init();
  }

  init() {
    this.apiConfig = this.initializeApiConfig();
    this.inputField = this.getElement('.inp-field');
    this.dropdown = this.getElement('.drop');
    this.surpriseBtn = this.getElement('.surprise-btn');
    this.widget = this.getElement('.ex-unity-widget');
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.viewport = defineDeviceByScreenSize();
    this.addAccessibility();
    this.widgetWrap = this.getElement('.ex-unity-wrap');
    this.scrRead = createTag('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.widgetWrap.append(this.scrRead);
  }

  initializeApiConfig() {
    return {
      ...unityConfig,
      expressEndpoint: { autoComplete: `${unityConfig.apiEndPoint}/providers/AutoComplete` },
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
      await this.execActions(actionsList, el);
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
        this.addInputEvents(el, actionsList);
        break;
      default:
        break;
    }
  }

  addInputEvents(el, actions) {
    let debounce;
    el.addEventListener('input', ({ target }) => {
      clearTimeout(debounce);
      this.query = target.value.trim();
      this.toggleSurpriseBtn();
      if (this.query.length >= 3) {
        debounce = setTimeout(() => this.execActions(actions), 1000);
      }
    });
    el.addEventListener('focus', () => {
      this.showDropdown();
      if (this.sendAnalyticsOnFocus) {
        sendAnalyticsEvent(new Event('promptOpen'));
        this.sendAnalyticsOnFocus = false;
      }
    });
    el.addEventListener('blur', ({ relatedTarget }) => {
      if (!this.widget.contains(relatedTarget)) this.hideDropdown();
    });
  }

  async execActions(actions, el = null) {
    if (!this.serviceHandler) {
      const { default: ServiceHandler } = await import(
        `${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`
      );
      this.serviceHandler = new ServiceHandler(
        this.workflowCfg.targetCfg.renderWidget,
        this.canvasArea,
      );
    }
    await Promise.all(
      actions.map(async (act) => {
        try {
          await this.handleAction(act, el);
        } catch (err) {
          console.error(`Error handling action ${act}:`, err);
        }
      }),
    );
  }

  async handleAction(action, el) {
    const actionMap = {
      autocomplete: () => this.fetchAutoComplete(),
      refreshSuggestion: () => this.refreshSuggestions(),
      surprise: () => this.triggerSurprise(),
      generate: () => this.generateContent(),
      setPromptValue: () => this.setPrompt(el),
      closeDropdown: () => this.resetDropdown(),
    };

    const execute = actionMap[action.actionType];
    if (execute) await execute();
  }

  async fetchAutoComplete(fetchType = 'default') {
    try {
      this.maxResults = fetchType === 'refresh' ? this.maxResults * 2 : 12;
      if (fetchType !== 'refresh' && this.query) {
        sendAnalyticsEvent(
          new CustomEvent('promptInput', { detail: { query: this.query } }),
        );
      }
      const payload = {
        query: this.query,
        targetProduct: this.apiConfig.productName,
        maxResults: this.maxResults,
      };
      const response = await this.serviceHandler.postCallToService(
        this.apiConfig.expressEndpoint.autoComplete,
        { body: JSON.stringify(payload) },
      );
      if (response?.completions) {
        this.suggestion = fetchType === 'refresh'
          ? response.completions.slice(this.maxResults / 2)
          : response.completions;
        this.displaySuggestions();
        this.inputField.focus();
      }
    } catch (err) {
      console.error('Error fetching autocomplete suggestions:', err);
    }
  }

  async refreshSuggestions() {
    if (this.suggestion.length) {
      this.displaySuggestions();
      this.inputField.focus();
      return;
    }
    await this.fetchAutoComplete('refresh');
  }

  displaySuggestions() {
    this.clearDropdown();
    this.toggleDefaultItems(false);
    const dynamicHeader = this.createDynamicHeader();
    this.dropdown.prepend(dynamicHeader);
    if (this.suggestion.length === 0) {
      this.showEmptyState(dynamicHeader);
      this.scrRead.textContent = this.workflowCfg.placeholder['placeholder-no-suggestions'];
    } else {
      const suggestionsToAdd = this.suggestion.splice(0, 3);
      this.addSuggestionItems(suggestionsToAdd, dynamicHeader);
      this.scrRead.textContent = `${suggestionsToAdd.length} suggestions ${suggestionsToAdd.reverse().toString()} available. Use up and down arrows to navigate`;
    }
    this.dropdown.classList.remove('hidden');
    this.initActionListeners();
    this.addAccessibility();
  }

  async triggerSurprise() {
    const prompts = this.workflowCfg?.supportedTexts?.prompt || [];
    if (!prompts.length) return;
    this.query = prompts[Math.floor(Math.random() * prompts.length)];
    await this.generateContent();
  }

  async generateContent() {
    try {
      const payload = {
        query: this.query,
        targetProduct: this.workflowCfg.productName,
      };
      const { url } = await this.serviceHandler.postCallToService(
        this.apiConfig.connectorApiEndPoint,
        { body: JSON.stringify(payload) },
      );
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Content generation failed:', err);
    }
  }

  toggleDefaultItems(show = true) {
    this.dropdown
      .querySelectorAll('.drop-item, .drop-title-con')
      .forEach((item) => item.classList.toggle('hidden', !show));
  }

  showEmptyState(header) {
    if (!this.dropdown.querySelector('.drop-empty-msg')) {
      const emptyMessage = createTag('li', {
        class: 'drop-empty-msg',
        role: 'presentation',
      }, this.workflowCfg.placeholder['placeholder-no-suggestions']);
      header.after(emptyMessage);
    }
  }

  addSuggestionItems(suggestions, header) {
    suggestions.reverse().forEach((suggestion, idx) => {
      const item = createTag('li', {
        id: `item-${idx}`,
        class: 'drop-item dynamic',
        'daa-ll': `prompt-API-powered|${suggestion}`,
        tabindex: '0',
        role: 'option',
        'aria-label': suggestion,
        'aria-description': `${this.workflowCfg.placeholder['placeholder-suggestions']} (English ${this.workflowCfg.placeholder['placeholder-only']})`,
      }, suggestion);
      const referenceNode = header.nextSibling;
      this.dropdown.insertBefore(item, referenceNode);
    });
  }

  createDynamicHeader() {
    const elements = [
      { tag: 'span', attrs: { class: 'title-text', id: 'prompt-suggestions' }, content: `${this.workflowCfg.placeholder['placeholder-suggestions']} (English ${this.workflowCfg.placeholder['placeholder-only']})` },
      { tag: 'button', attrs: { class: 'refresh-btn dynamic', 'daa-ll': 'prompt-dropdown-refresh', 'aria-label': 'Refresh suggestions' } },
      { tag: 'button', attrs: { class: 'close-btn dynamic', 'daa-ll': 'prompt-dropdown-close', 'aria-label': 'Close dropdown' } },
    ];
    const header = createTag('li', { class: 'drop-title-con dynamic', 'aria-labelledby': 'prompt-suggestions' });
    elements.forEach(({ tag, attrs, content = '' }) => {
      const element = createTag(tag, attrs, content);
      header.appendChild(element);
    });
    return header;
  }

  setPrompt(el) {
    const prompt = el.textContent.trim();
    this.inputField.value = prompt;
    this.query = prompt;
    this.inputField.focus();
    this.toggleSurpriseBtn();
    this.hideDropdown();
  }

  addAccessibility() {
    this.addKeyDown();
  }

  addKeyDown() {
    this.rmvKeyDown();
    this.block.addEventListener('keydown', this.boundHandleKeyDown);
  }

  rmvKeyDown() {
    this.block.removeEventListener('keydown', this.boundHandleKeyDown);
  }

  handleKeyDown(ev) {
    const validKeys = ['Tab', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
    if (!validKeys.includes(ev.key)) return;
    const dropItems = this.getDropdownItems();
    const focusElems = this.getFocusElems(dropItems.length > 0);
    const currIdx = focusElems.indexOf(document.activeElement);
    const isDropVisi = this.isDropdownVisible();
    switch (ev.key) {
      case 'Tab':
        if (!isDropVisi) return;
        this.handleTab(ev, focusElems, dropItems, currIdx);
        break;
      case 'ArrowDown':
        this.handleArrowDown(ev, dropItems);
        break;
      case 'ArrowUp':
        this.handleArrowUp(ev, dropItems);
        break;
      case 'Enter':
        this.handleEnter(ev, dropItems, focusElems, currIdx);
        break;
      case 'Escape':
        this.hideDropdown();
        break;
      default:
        break;
    }
  }

  getDropdownItems() {
    const dynamicItems = Array.from(this.dropdown.querySelectorAll('.drop-item.dynamic'));
    return dynamicItems.length > 0
      ? [...dynamicItems]
      : [...Array.from(this.dropdown.querySelectorAll('.drop-item'))];
  }

  getFocusElems(isDynamic) {
    let elmSelector = this.block.querySelector('.close-btn.dynamic') ? '.close-btn.dynamic,.drop-item.dynamic' : '.close-btn,.drop-item';
    if (this.viewport !== 'MOBILE') {
      elmSelector = `${elmSelector}, .legal-text, .tip-con`;
    }
    const isSurBtnVisible = !this.surpriseBtn.classList.contains('hidden');
    const surpriseBtnSelector = isSurBtnVisible ? '.surprise-btn' : '';
    const baseSelector = `.inp-field, .gen-btn, ${elmSelector}`;
    const selector = isDynamic
      ? `${baseSelector}, .refresh-btn, ${surpriseBtnSelector}`.trim().replace(/,+$/, '')
      : `${baseSelector}, ${surpriseBtnSelector}`.trim().replace(/,+$/, '');
    return Array.from(this.block.querySelectorAll(selector));
  }

  isDropdownVisible() {
    return !this.dropdown.classList.contains('hidden');
  }

  handleTab(event, focusableElements, dropItems, currentIndex) {
    if (!focusableElements.length) return;
    event.preventDefault();
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusableElements.length) % focusableElements.length
      : (currentIndex + 1) % focusableElements.length;
    focusableElements[nextIndex].focus();
    const newActiveIndex = dropItems.indexOf(focusableElements[nextIndex]);
    if (newActiveIndex !== -1) {
      this.activeIndex = newActiveIndex;
    } else {
      this.activeIndex = -1;
    }
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

  handleEnter(ev, dropItems, focusElems, currIdx) {
    ev.preventDefault();
    if (
      this.activeIndex >= 0 && dropItems[this.activeIndex]
      && dropItems[this.activeIndex] === document.activeElement
    ) {
      this.setPrompt(dropItems[this.activeIndex]);
      this.activeIndex = -1;
      return;
    }
    const targetElement = focusElems[currIdx] || ev.target;
    if (targetElement && (currIdx !== -1 || targetElement.classList.contains('unity-act-btn'))) {
      targetElement.click();
    }
  }

  setActiveItem(items, index, input) {
    items.forEach((item, i) => {
      if (i === index) {
        input.setAttribute('aria-activedescendant', item.id);
        item.focus();
      }
    });
  }

  clearDropdown() {
    this.dropdown.querySelectorAll('.drop-item.dynamic, .drop-title-con.dynamic, .drop-empty-msg').forEach((el) => el.remove());
    this.dropdown.classList.add('hidden');
    this.addAccessibility();
  }

  showDropdown() {
    this.dropdown.classList.remove('hidden');
    this.dropdown.removeAttribute('inert');
    this.inputField.setAttribute('aria-expanded', 'true');
    this.dropdown.removeAttribute('aria-hidden');
  }

  hideDropdown() {
    this.dropdown.classList.add('hidden');
    this.dropdown.setAttribute('inert', '');
    this.dropdown.setAttribute('aria-hidden', 'true');
    this.inputField.setAttribute('aria-expanded', 'false');
  }

  toggleSurpriseBtn() {
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
