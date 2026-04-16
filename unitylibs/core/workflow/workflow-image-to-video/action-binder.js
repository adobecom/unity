/* eslint-disable max-len */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-await-in-loop */

import {
  unityConfig,
  getUnityLibs,
  createTag,
  getLibs,
  getApiCallOptions,
  getLocale,
  sendAnalyticsEvent,
  getHeaders,
} from '../../../scripts/utils.js';

export default class ActionBinder {
  static VALID_KEYS = ['Tab', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape', ' '];

  boundHandleKeyDown = this.handleKeyDown.bind(this);

  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actions = actionMap;
    this.apiConfig = { ...unityConfig };
    this.apiConfig.endPoint = {
      assetUpload: `${unityConfig.apiEndPoint}/asset`,
    };
    this.errorToastEl = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-IV' };
    this.widgetWrap = this.block?.querySelector('.ex-unity-wrap');
    this.networkUtils = null;
    this.addKeyDown();
  }

  getNetworkUtils = async () => {
    if (this.networkUtils) return this.networkUtils;
    const { default: NetworkUtils } = await import(`${getUnityLibs()}/utils/NetworkUtils.js`);
    return (this.networkUtils = new NetworkUtils());
  };

  addKeyDown() {
    this.block?.addEventListener('keydown', this.boundHandleKeyDown);
  }

  handleKeyDown(ev) {
    if (!ActionBinder.VALID_KEYS.includes(ev.key)) return;
    const target = ev.target;
    if (ev.key === ' ' && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
    if (ev.key === 'Enter' && target.classList.contains('inp-field')) {
      ev.preventDefault();
      this.block?.querySelector('.gen-btn')?.click();
    }
  }

  async initActionListeners() {
    Object.entries(this.actions).forEach(([selector, actionsList]) => {
      this.block?.querySelectorAll(selector).forEach((el) => {
        if (!el.hasAttribute('data-event-bound')) {
          this.addEventListeners(el, actionsList);
          el.setAttribute('data-event-bound', 'true');
        }
      });
    });
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
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
      case 'TEXTAREA':
        el.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.block?.querySelector('.gen-btn')?.click();
          }
        });
        break;
      default:
        break;
    }
  }

  async execActions(actionsList, el = null) {
    try {
      const list = Array.isArray(actionsList) ? actionsList : [actionsList];
      for (const action of list) {
        await this.handleAction(action, el);
      }
    } catch (err) {
      window.lana?.log(`Message: Actions failed, Error: ${err}`, this.lanaOptions);
    }
  }

  async handleAction(action, el) {
    const actionType = typeof action === 'string' ? action : action.actionType;
    const actionMap = {
      generate: () => this.generateContent(),
      moreFilters: () => this.moreFilters(),
    };
    const execute = actionMap[actionType];
    if (execute) await execute();
  }

  moreFilters() {
    const productUrlEl = this.unityEl?.querySelector('.icon-product-url');
    const url = productUrlEl?.querySelector('a')?.href
      || productUrlEl?.closest('li')?.querySelector('a')?.href
      || productUrlEl?.closest('li')?.textContent?.trim()
      || 'https://firefly.adobe.com';
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  getUploadedFile() {
    const dropzone = this.block?.querySelector('.iv-dropzone');
    if (!dropzone) return null;
    const widget = dropzone.closest('.ex-unity-wrap');
    if (!widget) return null;
    const widgetInstance = widget._ivWidgetInstance;
    if (widgetInstance) return widgetInstance.uploadedFile;
    return null;
  }

  async uploadImageIfPresent() {
    const dropzone = this.block?.querySelector('.iv-dropzone');
    if (!dropzone || !dropzone.classList.contains('preview-ready')) return null;

    const wrap = this.block?.querySelector('.ex-unity-wrap');
    if (!wrap || !wrap._ivUploadedFile) return null;

    const file = wrap._ivUploadedFile;

    try {
      const assetDetails = {
        targetProduct: this.workflowCfg.productName,
        name: file.name,
        size: file.size,
        format: file.type,
      };
      const postOpts = {
        method: 'POST',
        headers: await getHeaders(unityConfig.apiKey, {
          'x-unity-product': this.workflowCfg.productName,
          'x-unity-action': 'image-to-video-upload',
        }),
        body: JSON.stringify(assetDetails),
      };
      const res = await fetch(this.apiConfig.endPoint.assetUpload, postOpts);
      if (!res.ok) {
        const err = new Error('Asset upload initiation failed');
        err.status = res.status;
        throw err;
      }
      const { id, href } = await res.json();
      if (href) {
        const uploadOpts = {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        };
        const uploadRes = await fetch(href, uploadOpts);
        if (!uploadRes.ok) {
          const err = new Error('Image upload to storage failed');
          err.status = uploadRes.status;
          throw err;
        }
      }
      return id || null;
    } catch (e) {
      window.lana?.log(`Message: Image upload failed, Error: ${e}`, this.lanaOptions);
      return null;
    }
  }

  async generateContent() {
    const promptEl = this.block?.querySelector('.inp-field');
    const prompt = promptEl?.value?.trim() || '';
    const wrap = this.block?.querySelector('.ex-unity-wrap');
    const modelId = wrap?.dataset?.selectedModelId || '';
    const modelVersion = wrap?.dataset?.selectedModelVersion || '';
    const aspectRatio = wrap?.dataset?.selectedAspectRatio || '';

    const { getCgenQueryParams } = await import(`${getUnityLibs()}/utils/cgen-utils.js`);
    const queryParams = getCgenQueryParams(this.unityEl);

    let assetId = null;
    const dropzone = this.block?.querySelector('.iv-dropzone');
    if (dropzone?.classList.contains('preview-ready') && wrap?._ivUploadedFile) {
      assetId = await this.uploadImageIfPresent();
    }

    try {
      const payload = {
        targetProduct: this.workflowCfg.productName,
        additionalQueryParams: queryParams,
        payload: {
          workflow: 'image-to-video',
          locale: getLocale(),
          action: 'generate',
          ...(modelId ? { modelId } : {}),
          ...(modelVersion ? { modelVersion } : {}),
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(prompt ? { prompt } : {}),
        },
        ...(assetId ? { assetId } : {}),
      };

      const postOpts = await getApiCallOptions(
        'POST',
        unityConfig.apiKey,
        {
          'x-unity-product': this.workflowCfg.productName,
          'x-unity-action': 'generate-image-to-video',
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
      if (url) window.location.href = url;
    } catch (err) {
      await this.showErrorToast(err);
      window.lana?.log(`Message: Image-to-video generation failed, Error: ${err}`, this.lanaOptions);
    }
  }

  async showErrorToast(err) {
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    if (!this.errorToastEl) return;
    const ivWidget = this.block?.querySelector('.iv-widget');
    if (!ivWidget) return;
    ivWidget.style.pointerEvents = 'none';
    const lang = document.querySelector('html')?.getAttribute('lang');
    const errorEl = this.unityEl?.querySelector('.icon-error-request');
    const msg = lang !== 'ja-JP'
      ? errorEl?.nextSibling?.textContent
      : errorEl?.parentElement?.textContent;
    const alertText = this.errorToastEl.querySelector('.alert-text p');
    if (alertText) alertText.innerText = msg || 'Something went wrong. Please try again.';
    this.errorToastEl.classList.add('show');
    sendAnalyticsEvent(new CustomEvent('IV Generate error|UnityWidget'));
    window.lana?.log(`Message: ${msg || 'Generation error'}, Error: ${err || ''}`, this.lanaOptions);
  }

  async createErrorToast() {
    try {
      const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
      const ivWidget = this.block?.querySelector('.iv-widget');
      if (!ivWidget) return null;

      const alertImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/alert.svg` });
      const closeImg = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/close.svg` });

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
        ivWidget.style.pointerEvents = 'auto';
      };
      alertClose.addEventListener('click', closeToast);
      alertClose.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') closeToast(e);
      });

      decorateDefaultLinkAnalytics(errholder);
      ivWidget.append(errholder);
      return errholder;
    } catch (e) {
      window.lana?.log(`Message: Error creating error toast, Error: ${e}`, this.lanaOptions);
      return null;
    }
  }
}
