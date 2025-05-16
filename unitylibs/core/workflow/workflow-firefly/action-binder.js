/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  createTag,
  //sendAnalyticsEvent,
  defineDeviceByScreenSize,
  getHeaders,
  getLocale,
} from '../../../scripts/utils.js';
class ServiceHandler {
  constructor(renderWidget = false, canvasArea = null) {
    this.renderWidget = renderWidget;
    this.canvasArea = canvasArea;
  }

  async fetchFromService(url, options) {
    try {
      const response = await fetch(url, options);
      const error = new Error();
      if (response.status !== 200) {
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        error.status = 504;
      }
      throw error;
    }
  }

  async postCallToService(api, options) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey),
      ...options,
    };
    return this.fetchFromService(api, postOpts);
  }
}

export default class ActionBinder {
  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actions = actionMap;
    this.query = '';
    this.serviceHandler = null;
    //this.sendAnalyticsOnFocus = true;
    this.activeIndex = -1;
    this.id = '';
    this.init();
  }

  init() {
    this.apiConfig = this.initializeApiConfig();
    this.inputField = this.getElement('.inp-field');
    this.dropdown = this.getElement('.drop');
    this.widget = this.getElement('.ex-unity-widget');
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundOutsideClickHandler = this.handleOutsideClick.bind(this);
    this.viewport = defineDeviceByScreenSize();
    this.addAccessibility();
    this.widgetWrap = this.getElement('.ex-unity-wrap');
    this.scrRead = createTag('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.widgetWrap.append(this.scrRead);
    this.initAction();
  }

  initAction() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
    if (!isIos) return;
    window.addEventListener('pageshow', ({ persisted }) => {
      if (!persisted || document.visibilityState !== 'visible') return;
      const handleClick = ({ target }) => {
        if (target === this.inputField) {
          this.inputField.focus();
          this.initActionListeners();
          this.showDropdown();
        }
      };
      document.addEventListener('click', handleClick, { once: true });
    });
  }

  initializeApiConfig() {
    return { ...unityConfig };
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

  async loadServiceHandler() {
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
    );
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

  addInputEvents(el) {
    el.addEventListener('focus', () => {
      this.showDropdown();
      /*if (this.sendAnalyticsOnFocus) {
        sendAnalyticsEvent(new Event('promptOpen'));
        this.sendAnalyticsOnFocus = false;
      }*/
    });
    el.addEventListener('focusout', ({ relatedTarget, currentTarget }) => {
      if (!relatedTarget) {
        if (this.widget.contains(currentTarget)) return;
      }
      if (!this.widget.contains(relatedTarget)) this.hideDropdown();
    });
  }

  async execActions(action, el = null) {
    try {
      await this.handleAction(action, el);
    } catch (err) {
      // ToDo: send to LANA
    }
  }

  async handleAction(action, el) {
    const actionMap = {
      generate: () => this.generateContent(),
      setPromptValue: () => this.setPrompt(el),
      closeDropdown: () => this.resetDropdown(),
    };

    const execute = actionMap[action.actionType];
    if (execute) await execute();
  }

  getSelectedVerbType() {
    return this.widgetWrap.getAttribute('data-selected-verb');
  }

  async generateContent() {
    if (!this.serviceHandler) await this.loadServiceHandler();
    const cgen = this.unityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
    const queryParams = {};
    if (cgen) {
      cgen.split('&').forEach((param) => {
        const [key, value] = param.split('=');
        if (key && value) {
          queryParams[key] = value;
        }
      });
    }
    if (!this.query) this.query = this.inputField.value.trim();

    try {
      const selectedVerbType = this.getSelectedVerbType();
      const payload = {
        targetProduct: this.workflowCfg.productName,
        payload: {
          workflow: `text-to-${selectedVerbType}`,
          locale: getLocale(),
          additionalQueryParams: queryParams,
        },
      };
      if (this.id) {
        payload.assetId = this.id;
        payload.action = 'prompt-suggestion';
      } else {
        payload.query = this.query;
        payload.action = 'generate';
      }
      const { url } = await this.serviceHandler.postCallToService(
        this.apiConfig.connectorApiEndPoint,
        { body: JSON.stringify(payload) },
      );
      this.query = '';
      this.resetDropdown();
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Content generation failed:', err);
    }
  }

  setPrompt(el) {
    const prompt = el.getAttribute('aria-label').trim();
    this.query = prompt;
    this.id = el.getAttribute('id').trim();
    this.generateContent();
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
        ev.preventDefault();
        this.moveFocusWithArrow(dropItems, 'down');
        break;
      case 'ArrowUp':
        ev.preventDefault();
        this.moveFocusWithArrow(dropItems, 'up');
        break;
      case 'Enter':
        this.handleEnter(ev, dropItems, focusElems, currIdx);
        break;
      case 'Escape':
        this.inputField.focus();
        this.hideDropdown();
        break;
      default:
        break;
    }
  }

  getDropdownItems() {
    if (!this.dropdown) return [];
    const dynamicItems = Array.from(this.dropdown.querySelectorAll('.drop-item.dynamic'));
    let tipCon = null;
    if (this.viewport !== 'MOBILE') tipCon = this.dropdown.querySelector('.tip-con');
    if (dynamicItems.length > 0) return tipCon ? [...dynamicItems, tipCon] : dynamicItems;
    const allItems = Array.from(this.dropdown.querySelectorAll('.drop-item'));
    return tipCon ? [...allItems, tipCon] : allItems;
  }

  getFocusElems() {
    let elmSelector = this.block.querySelector('.close-btn.dynamic') ? '.close-btn.dynamic,.drop-item.dynamic' : '.close-btn,.drop-item';
    if (this.viewport !== 'MOBILE') {
      elmSelector = `${elmSelector}, .legal-text`;
    }
    const selector = `.inp-field, .gen-btn, ${elmSelector}`;
    return Array.from(this.block.querySelectorAll(selector));
  }

  isDropdownVisible() {
    return !this.dropdown.classList.contains('hidden');
  }

  handleTab(event, focusableElements, dropItems, currentIndex) {
    if (!focusableElements.length) return;
    event.preventDefault();
    const isShift = event.shiftKey;
    const currentElement = document.activeElement;
    if (currentElement.classList.contains('tip-con')) {
      if (!isShift) {
        const legalText = this.block.querySelector('.legal-text');
        if (legalText) {
          legalText.focus();
          return;
        }
      }
    }
    const nextIndex = isShift
      ? (currentIndex - 1 + focusableElements.length) % focusableElements.length
      : (currentIndex + 1) % focusableElements.length;
    focusableElements[nextIndex].focus();
    const newActiveIndex = dropItems.indexOf(focusableElements[nextIndex]);
    this.activeIndex = newActiveIndex !== -1 ? newActiveIndex : -1;
  }

  moveFocusWithArrow(dropItems, direction) {
    if (this.activeIndex === -1 || !this.isDropdownItemFocused(dropItems)) this.activeIndex = direction === 'down' ? 0 : dropItems.length - 1;
    else this.activeIndex = direction === 'down' ? (this.activeIndex + 1) % dropItems.length : (this.activeIndex - 1 + dropItems.length) % dropItems.length;
    this.setActiveItem(dropItems, this.activeIndex, this.inputField);
  }

  isDropdownItemFocused(dropItems) {
    return dropItems.some((item) => item === document.activeElement);
  }

  handleEnter(ev, dropItems, focusElems, currIdx) {
    ev.preventDefault();
    const nonInteractiveRoles = ['note', 'presentation'];
    const role = document.activeElement.getAttribute('role');
    if (role && nonInteractiveRoles.includes(role)) return;
    if (
      this.activeIndex >= 0
      && dropItems[this.activeIndex]
      && dropItems[this.activeIndex] === document.activeElement
    ) {
      this.setPrompt(dropItems[this.activeIndex]);
      this.activeIndex = -1;
      return;
    }
    const tarElem = focusElems[currIdx] || ev.target;
    const actions = { 'inp-field': () => this.inpRedirect() };
    if (tarElem) {
      const matchCls = Object.keys(actions).find((cls) => tarElem.classList.contains(cls));
      if (matchCls) {
        actions[matchCls]();
      } else if (currIdx !== -1) {
        tarElem.click();
      }
    }
  }

  setActiveItem(items, index, input) {
    items.forEach((item, i) => {
      if (i === index) {
        input.setAttribute('aria-activedescendant', item.id || 'tip-content');
        item.focus();
      }
    });
  }

  async inpRedirect() {
    if (!this.query) return;
    await this.generateContent();
  }

  showDropdown() {
    this.dropdown.classList.remove('hidden');
    this.dropdown.removeAttribute('inert');
    this.inputField.setAttribute('aria-expanded', 'true');
    this.dropdown.removeAttribute('aria-hidden');
    document.addEventListener('click', this.boundOutsideClickHandler, true);
  }

  hideDropdown() {
    if (this.isDropdownVisible()) {
      this.dropdown.classList.add('hidden');
      this.dropdown.setAttribute('inert', '');
      this.dropdown.setAttribute('aria-hidden', 'true');
      this.inputField.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', this.boundOutsideClickHandler, true);
    }
  }

  handleOutsideClick(event) {
    if (!this.widget.contains(event.target)) this.hideDropdown();
  }

  resetDropdown() {
    this.inputField.focus();
    if (!this.query) {
      this.inputField.value = '';
    }
    this.hideDropdown();
  }
}
