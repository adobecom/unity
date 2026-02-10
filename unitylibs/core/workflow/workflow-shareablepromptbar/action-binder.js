/* eslint-disable class-methods-use-this */
//dummy commit to sync code on codebusp
import { sendAnalyticsEvent } from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actions = actionMap;
    this.widgetWrap = this.getElement('.ex-unity-wrap');
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-ShareablePromptBar' };
    this.errorToastEl = null;
    this.sendAnalyticsToSplunk = null;
    this.initAction();
  }

  async initAction() {
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    // const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    //   || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
    // if (!isIos) return;
    // window.addEventListener('pageshow', ({ persisted }) => {
    //   if (!persisted || document.visibilityState !== 'visible') return;
    //   const handleClick = ({ target }) => {
    //     if (target === this.inputField) {
    //       this.inputField.focus();
    //       this.initActionListeners();
    //       this.showDropdown();
    //     }
    //   };
    //   document.addEventListener('click', handleClick, { once: true });
    // });
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

  getElement(selector) {
    const element = this.block.querySelector(selector);
    if (!element) window.lana?.log(`Element with selector "${selector}" not found.`, this.lanaOptions);
    return element;
  }

  validateInput(query) {
    if (query.length > 750) {
      this.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-max-length' }, 'Max prompt characters exceeded');
      return { isValid: false, errorCode: 'max-prompt-characters-exceeded' };
    }
    return { isValid: true };
  }

  async initActionListeners() {
    if (!this.widgetWrap) return;
    this.widgetWrap.addEventListener('firefly-generate', (ev) => this.handleFireflyGenerate(ev));
    this.widgetWrap.addEventListener('firefly-prompt-validate', (ev) => this.handlePromptValidate(ev));
  }

  handlePromptValidate(ev) {
    const { detail } = ev;
    const validation = this.validateInput(detail?.prompt);
    if (!validation.isValid) {
      //send error analytics
      //this.logAnalytics('generate', { ...eventData, errorData: { code: validation.errorCode } }, { workflowStep: 'complete', statusCode: -1 });
      detail?.originalEvent?.stopPropagation();
   }
  }
  handleFireflyGenerate(ev) {
    const { detail } = ev;
    
    if (!validation.isValid) {
      //send success analytics
      //this.logAnalytics('generate', { ...eventData, errorData: { code: validation.errorCode } }, { workflowStep: 'complete', statusCode: -1 });
      detail?.originalEvent?.stopPropagation();
    }
  }
}