/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs,
  createTag,
  defineDeviceByScreenSize,
  getLibs,
  getApiCallOptions,
  getLocale,
  sendAnalyticsEvent,
} from '../../../scripts/utils.js';

export default class ActionBinder {
  static VALID_KEYS = ['Tab', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape', ' '];

  boundHandleKeyDown = this.handleKeyDown.bind(this);

  boundOutsideClickHandler = this.handleOutsideClick.bind(this);

  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actions = actionMap;
    this.query = '';
    this.activeIndex = -1;
    this.id = '';
    this.apiConfig = { ...unityConfig };
    this.inputField = this.getElement('.inp-field');
    this.dropdown = this.getElement('.drop');
    this.widget = this.getElement('.ex-unity-widget');
    this.viewport = defineDeviceByScreenSize();
    this.widgetWrap = this.getElement('.ex-unity-wrap');
    this.widgetWrap.addEventListener('firefly-reinit-action-listeners', () => this.initActionListeners());
    this.widgetWrap.addEventListener('firefly-audio-error', (ev) => {
      const run = async () => {
        try {
          if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
          this.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-audio-fail' }, ev?.detail?.error, this.lanaOptions, 'client');
        } catch (e) { /* noop */ }
      };
      run();
    });
    this.scrRead = createTag('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.widgetWrap.append(this.scrRead);
    this.errorToastEl = null;
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-FF' };
    this.sendAnalyticsToSplunk = null;
    this.addAccessibility();
    this.initAction();
  }

  getNetworkUtils = async () => {
    if (this.networkUtils) return this.networkUtils;
    const { default: NetworkUtils } = await import(`${getUnityLibs()}/utils/NetworkUtils.js`);
    return (this.networkUtils = new NetworkUtils());
  };

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    sendAnalyticsEvent(new CustomEvent(`FF Generate prompt ${errorType} error|UnityWidget`));
    if (!errorCallbackOptions?.errorToastEl) return;
    const lang = document.querySelector('html').getAttribute('lang');
    const msg = lang !== 'ja-JP' ? this.unityEl.querySelector(errorCallbackOptions.errorType)?.nextSibling.textContent : this.unityEl.querySelector(errorCallbackOptions.errorType)?.parentElement.textContent;
    const promptBarEl = this.canvasArea.querySelector('.copy .ex-unity-wrap');
    if (promptBarEl) promptBarEl.style.pointerEvents = 'none';
    const errorToast = promptBarEl.querySelector('.alert-holder');
    if (!errorToast) return;
    const closeBtn = errorToast.querySelector('.alert-close');
    if (closeBtn) closeBtn.style.pointerEvents = 'auto';
    const alertText = errorToast.querySelector('.alert-text p');
    if (!alertText) return;
    alertText.innerText = msg;
    errorToast.classList.add('show');
    window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, lanaOptions);
  }

  async initAction() {
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
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

  async createErrorToast() {
    try {
      const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
      const alertImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/alert.svg` });
      const closeImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/close.svg` });
      const promptBarEl = this.canvasArea.querySelector('.copy .ex-unity-wrap');
      const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, 'Alert Text'));
      const alertIcon = createTag('div', { class: 'alert-icon' });
      alertIcon.append(alertImg, alertText);
      const alertClose = createTag('a', { class: 'alert-close', href: '#' });
      alertClose.append(closeImg, createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
      const alertContent = createTag('div', { class: 'alert-content' });
      alertContent.append(alertIcon, alertClose);
      const alertToast = createTag('div', { class: 'alert-toast' }, alertContent);
      const errholder = createTag('div', { class: 'alert-holder' }, alertToast);
      const closeToast = (e) => {
        e.preventDefault();
        e.stopPropagation();
        errholder.classList.remove('show');
        if (promptBarEl) promptBarEl.style.pointerEvents = 'auto';
      };
      alertClose.addEventListener('click', closeToast);
      alertClose.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') closeToast(e);
      });
      decorateDefaultLinkAnalytics(errholder);
      promptBarEl.prepend(errholder);
      return promptBarEl?.querySelector('.alert-holder');
    } catch (e) {
      window.lana?.log(`Message: Error creating error toast, Error: ${e}`, this.lanaOptions);
      return null;
    }
  }

  initializeApiConfig() {
    return { ...unityConfig };
  }

  getElement(selector) {
    const element = this.block.querySelector(selector);
    if (!element) window.lana?.log(`Element with selector "${selector}" not found.`, this.lanaOptions);
    return element;
  }

  async initActionListeners() {
    Object.entries(this.actions).forEach(([selector, actionsList]) => {
      this.block.querySelectorAll(selector).forEach((el) => {
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
      case 'TEXTAREA':
        this.addInputEvents(el);
        break;
      default:
        break;
    }
  }

  addInputEvents(el) {
    el.addEventListener('focus', () => this.showDropdown());
    el.addEventListener('focusout', ({ relatedTarget, currentTarget }) => {
      if (!relatedTarget && this.widget?.contains(currentTarget)) return;
      if (!this.widget?.contains(relatedTarget)) this.hideDropdown();
    });
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.block.querySelector('.gen-btn')?.click();
      }
    });
  }

  async execActions(action, el = null) {
    try {
      await this.handleAction(action, el);
    } catch (err) {
      window.lana?.log(`Message: Actions failed, Error: ${err}`, this.lanaOptions);
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

  getSelectedVerbType = () => this.widgetWrap.getAttribute('data-selected-verb');

  getSelectedModelId = () => this.widgetWrap.getAttribute('data-selected-model-id');

  getSelectedModelVersion = () => this.widgetWrap.getAttribute('data-selected-model-version');

  validateInput(query) {
    if (query.length > 750) {
      this.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-max-length' }, 'Max prompt characters exceeded');
      return { isValid: false, errorCode: 'max-prompt-characters-exceeded' };
    }
    return { isValid: true };
  }

  async initAnalytics() {
    if (!this.sendAnalyticsToSplunk && this.workflowCfg.targetCfg.sendSplunkAnalytics) {
      this.sendAnalyticsToSplunk = (await import(`${getUnityLibs()}/scripts/splunk-analytics.js`)).default;
    }
  }

  logAnalytics(eventName, data, { workflowStep, statusCode } = {}) {
    const logData = {
      ...data,
      ...(workflowStep && { workflowStep }),
      ...(typeof statusCode !== 'undefined' && { statusCode }),
    };
    this.sendAnalyticsToSplunk?.(eventName, this.workflowCfg.productName, logData, `${unityConfig.apiEndPoint}/log`, true);
  }

  getCgenQueryParams() {
    const label = Array.from(this.unityEl.querySelectorAll('div'))
      .find((el) => el.textContent?.trim().toLowerCase() === 'cgen');
    const cGenNew = label?.nextElementSibling?.textContent?.trim();
    const cGenLegacy = this.unityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
    const cgen = (cGenNew || cGenLegacy || '').trim();
    const params = {};
    if (!cgen) return params;
    cgen.split('&').forEach((param) => {
      const [key, value] = param.split('=');
      if (key && value) params[key] = value;
    });
    return params;
  }

  async generateContent() {
    await this.initAnalytics();
    const queryParams = this.getCgenQueryParams();
    const currentVerb = this.getSelectedVerbType();
    const genBtn = this.block.querySelector('.gen-btn');
    const override = genBtn?.dataset?.soundPrompt;
    if (currentVerb === 'sound' && override) {
      this.query = override.trim();
      try { delete genBtn.dataset.soundPrompt; } catch (e) { /* noop */ }
    } else {
      this.query = this.inputField.value.trim();
    }
    const selectedVerbType = `text-to-${currentVerb}`;
    const action = (this.id || !!override ? 'prompt-suggestion' : 'generate');
    const eventData = { assetId: this.id, verb: selectedVerbType, action };
    this.logAnalytics('generate', eventData, { workflowStep: 'start' });
    const validation = this.validateInput(this.query);
    if (!validation.isValid) {
      this.logAnalytics('generate', { ...eventData, errorData: { code: validation.errorCode } }, { workflowStep: 'complete', statusCode: -1 });
      return;
    }
    try {
      const modelId = this.getSelectedModelId();
      const modelVersion = this.getSelectedModelVersion();
      const payload = {
        targetProduct: this.workflowCfg.productName,
        additionalQueryParams: queryParams,
        payload: {
          workflow: selectedVerbType,
          ...(modelId ? { modelId } : {}),
          ...(modelVersion ? { modelVersion } : {}),
          locale: getLocale(),
          action,
        },
        ...(this.id ? { assetId: this.id } : { query: this.query }),
      };
      const postOpts = await getApiCallOptions(
        'POST',
        unityConfig.apiKey,
        {
          'x-unity-product': this.workflowCfg.productName,
          'x-unity-action': `${action}-${this.getSelectedVerbType()}Generation`,
        },
        { body: JSON.stringify(payload) },
      );
      const networkUtils = await this.getNetworkUtils();
      const { url } = await networkUtils.fetchFromService(
        this.apiConfig.connectorApiEndPoint,
        postOpts,
        async (response) => {
          if (response.status !== 200) {
            const error = new Error();
            error.status = response.status;
            throw error;
          }
          return response.json();
        },
      );
      this.logAnalytics('generate', eventData, { workflowStep: 'complete', statusCode: 0 });
      this.query = '';
      this.id = '';
      this.resetDropdown();
      if (url) window.location.href = url;
    } catch (err) {
      this.query = '';
      this.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, err);
      this.logAnalytics('generate', {
        ...eventData,
        errorData: { code: 'request-failed', subCode: err.status, desc: err.message },
      }, { workflowStep: 'complete', statusCode: -1 });
      window.lana?.log(`Content generation failed:, Error: ${err}`, this.lanaOptions);
    }
  }

  setPrompt(el) {
    this.query = el.getAttribute('aria-label')?.trim();
    this.id = el.getAttribute('id')?.trim();
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
    if (!ActionBinder.VALID_KEYS.includes(ev.key)) return;
    if (ev.key === ' ' && (ev.target === this.inputField || ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
    const openVerbMenu = this.block.querySelector('.verbs-container.show-menu');
    const openModelMenu = this.block.querySelector('.models-container.show-menu');
    const isMenuOpen = openVerbMenu || openModelMenu;
    switch (ev.key) {
      case 'Tab': {
        const isDropVisi = this.isDropdownVisible();
        if (!isDropVisi && !isMenuOpen) return;
        const dropItems = this.getDropdownItems();
        const focusElems = this.getFocusElems(dropItems.length > 0);
        const currIdx = focusElems.indexOf(document.activeElement);
        this.handleTab(ev, focusElems, dropItems, currIdx);
        break;
      }
      case 'ArrowDown':
      case 'ArrowUp': {
        ev.preventDefault();
        const direction = ev.key === 'ArrowDown' ? 'down' : 'up';
        if (isMenuOpen) {
          const focusElems = this.getFocusElems();
          const currIdx = focusElems.indexOf(document.activeElement);
          this.moveFocusInMenu(focusElems, currIdx, direction);
        } else {
          this.moveFocusWithArrow(this.getDropdownItems(), direction);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        const dropItems = this.getDropdownItems();
        const focusElems = this.getFocusElems(dropItems.length > 0);
        const currIdx = focusElems.indexOf(document.activeElement);
        this.handleEnter(ev, dropItems, focusElems, currIdx);
        break;
      }
      case 'Escape':
        if (isMenuOpen) {
          ev.preventDefault();
          const menuButton = openVerbMenu?.querySelector('.selected-verb') || openModelMenu?.querySelector('.selected-model');
          if (menuButton) {
            (openVerbMenu || openModelMenu).classList.remove('show-menu');
            menuButton.setAttribute('aria-expanded', 'false');
            menuButton.focus();
          }
        } else {
          this.inputField.focus();
          this.hideDropdown();
        }
        break;
      default:
        break;
    }
  }

  getDropdownItems() {
    if (!this.dropdown) return [];
    let tipCon = null;
    if (this.viewport !== 'MOBILE') tipCon = this.dropdown?.querySelector('.tip-con');
    const allItems = Array.from(this.dropdown?.querySelectorAll('.drop-item'));
    return tipCon ? [...allItems, tipCon] : allItems;
  }

  getFocusElems() {
    let elmSelector = '.drop-item';
    if (this.viewport !== 'MOBILE') elmSelector = `${elmSelector}, .legal-text`;
    const baseSelector = `.selected-verb, .selected-model, .inp-field, .gen-btn, ${elmSelector}`;
    const openVerbMenu = this.block.querySelector('.verbs-container.show-menu .verb-link');
    const openModelMenu = this.block.querySelector('.models-container.show-menu .verb-link');
    if (openVerbMenu || openModelMenu) {
      const menuSelector = openVerbMenu ? '.verbs-container.show-menu .verb-link' : '.models-container.show-menu .verb-link';
      return Array.from(this.block.querySelectorAll(menuSelector));
    }
    return Array.from(this.block.querySelectorAll(baseSelector));
  }

  isDropdownVisible = () => !this.dropdown?.classList.contains('hidden');

  handleTab(event, focusableElements, dropItems, currentIndex) {
    if (!focusableElements.length) return;
    if (currentIndex === -1) return;
    const isShift = event.shiftKey;
    const currentElement = document.activeElement;
    const isFirstElement = currentIndex === 0;
    const isLastElement = currentIndex === focusableElements.length - 1;
    const openVerbMenu = this.block.querySelector('.verbs-container.show-menu');
    const openModelMenu = this.block.querySelector('.models-container.show-menu');
    const isMenuOpen = openVerbMenu || openModelMenu;
    if (isMenuOpen) {
      if ((isShift && isFirstElement) || (!isShift && isLastElement)) {
        event.preventDefault();
        const menuButton = openVerbMenu?.querySelector('.selected-verb') || openModelMenu?.querySelector('.selected-model');
        if (menuButton) {
          (openVerbMenu || openModelMenu).classList.remove('show-menu');
          menuButton.setAttribute('aria-expanded', 'false');
          menuButton.focus();
        }
        return;
      }
    } else if ((isShift && isFirstElement) || (!isShift && isLastElement)) {
      this.hideDropdown();
      return;
    }
    event.preventDefault();
    if (currentElement.classList.contains('tip-con')) {
      if (!isShift) {
        const legalText = this.block.querySelector('.legal-text');
        if (legalText) {
          legalText.focus();
          return;
        }
      }
    }
    const nextIndex = isShift ? currentIndex - 1 : currentIndex + 1;
    focusableElements[nextIndex].focus();
    const newActiveIndex = dropItems.indexOf(focusableElements[nextIndex]);
    this.activeIndex = newActiveIndex !== -1 ? newActiveIndex : -1;
  }

  moveFocusInMenu(focusElems, currentIndex, direction) {
    if (!focusElems.length) return;
    let nextIndex;
    if (currentIndex === -1) {
      nextIndex = direction === 'down' ? 0 : focusElems.length - 1;
    } else {
      nextIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0) nextIndex = focusElems.length - 1;
      if (nextIndex >= focusElems.length) nextIndex = 0;
    }
    focusElems[nextIndex]?.focus();
  }

  moveFocusWithArrow(dropItems, direction) {
    if (this.activeIndex === -1 || !this.isDropdownItemFocused(dropItems)) this.activeIndex = direction === 'down' ? 0 : dropItems.length - 1;
    else this.activeIndex = direction === 'down' ? (this.activeIndex + 1) % dropItems.length : (this.activeIndex - 1 + dropItems.length) % dropItems.length;
    this.setActiveItem(dropItems, this.activeIndex, this.inputField);
  }

  isDropdownItemFocused = (dropItems) => dropItems.some((item) => item === document.activeElement);

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
      if (matchCls) actions[matchCls]();
      else if (currIdx !== -1) tarElem.click();
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
    const verbsWithoutPromptSuggestions = this.workflowCfg.targetCfg?.verbsWithoutPromptSuggestions ?? [];
    const currentVerbType = this.getSelectedVerbType();
    if (verbsWithoutPromptSuggestions.includes(currentVerbType)) return;
    this.dropdown?.classList.remove('hidden');
    this.dropdown?.removeAttribute('inert');
    this.dropdown?.removeAttribute('aria-hidden');
    document.addEventListener('click', this.boundOutsideClickHandler, true);
  }

  hideDropdown() {
    if (this.isDropdownVisible()) {
      this.dropdown?.classList.add('hidden');
      this.dropdown?.setAttribute('inert', '');
      this.dropdown?.setAttribute('aria-hidden', 'true');
      document.removeEventListener('click', this.boundOutsideClickHandler, true);
    }
  }

  handleOutsideClick(event) {
    if (this.widgetWrap && window.getComputedStyle(this.widgetWrap).pointerEvents === 'none') return;
    if (!this.widget?.contains(event.target)) this.hideDropdown();
  }

  resetDropdown() {
    this.inputField.focus();
    if (!this.query) this.inputField.value = '';
    this.hideDropdown();
  }
}
