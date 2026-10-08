/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable class-methods-use-this */

import {
  unityConfig,
  getUnityLibs,
  priorityLoad,
  createTag,
  getLocale,
  getLibs,
  getHeaders,
  getApiCallOptions,
  sendAnalyticsEvent,
  isGuestUser,
} from '../../../scripts/utils.js';

const CANCEL_MESSAGE = 'Operation termination requested.';
const WIDGET_ROOT = '.unity-face-swap';

/**
 * Client-side validation rules. Rules are data: a new case is one entry here
 * plus one authored `:error-*:` token — no new code path.
 * PLACEHOLDER — MWPW-206550: the confirmed validation matrix is pending with PdM.
 */
export const RULES = [
  { id: 'filecount', scope: 'all', test: (files, limits) => files.length <= (limits.maxNumFiles || 1), token: 'error-filecount' },
  { id: 'filetype', scope: 'each', test: (f, limits) => !limits.allowedFileTypes || limits.allowedFileTypes.includes(f.type), token: 'error-filetype' },
  { id: 'filesize', scope: 'each', test: (f, limits) => f.size > 0 && (!limits.maxFileSize || f.size <= limits.maxFileSize), token: 'error-filesize' },
];

export function validateSelection(files, limits = {}) {
  const list = [...(files || [])];
  const failed = RULES.find((r) => (r.scope === 'all' ? !r.test(list, limits) : !list.every((f) => r.test(f, limits))));
  return failed ? { ok: false, errorToken: failed.token } : { ok: true };
}

/**
 * PLACEHOLDER — MWPW-206550. The dual-asset connector contract is being defined
 * with the Unity backend team; this is the ONLY function that changes when it lands.
 * `generate` rides the existing `payload.generate` field; `assetIds` sits at the body top level.
 */
export function buildFaceSwapAssetPayload(uploads = []) {
  const assetIds = uploads.map((u) => u.assetId).filter(Boolean);
  return {
    ...(assetIds.length && { assetIds }),
    generate: assetIds.length === 2,
  };
}

class ServiceHandler {
  constructor(canvasArea = [], unityEl = null, getAdditionalHeaders = null) {
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
    this.getAdditionalHeaders = getAdditionalHeaders;
  }

  async postCallToService(api, options, failOnError = true) {
    const postOpts = {
      method: 'POST',
      headers: await getHeaders(unityConfig.apiKey, this.getAdditionalHeaders?.() || {}),
      ...options,
    };
    let response;
    try {
      response = await fetch(api, postOpts);
    } catch (e) {
      if (e instanceof TypeError) {
        const error = new Error(`Network error. URL: ${api}; Error message: ${e.message}`);
        error.status = 0;
        throw error;
      }
      throw e;
    }
    if (failOnError && response.status !== 200) {
      const error = new Error('Operation failed');
      error.status = response.status;
      throw error;
    }
    if (!failOnError) return response;
    return response.json();
  }

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    sendAnalyticsEvent(new CustomEvent(`Upload ${errorType} error|UnityWidget|${errorCallbackOptions.errorCode || ''}|${JSON.stringify(errorCallbackOptions.fileMetaData) || ''}`));
    if (!errorCallbackOptions.errorToastEl) return null;
    const base = this.unityEl?.querySelector(errorCallbackOptions.errorType)?.closest('li')?.textContent?.trim() || '';
    const msg = [base, errorCallbackOptions.suffix].filter(Boolean).join(' ');
    let shown = null;
    this.canvasArea.forEach((element) => {
      element.style.pointerEvents = 'none';
      const errorToast = element.querySelector('.alert-holder');
      if (!errorToast) return;
      const closeBtn = errorToast.querySelector('.alert-close');
      if (closeBtn) closeBtn.style.pointerEvents = 'auto';
      const alertText = errorToast.querySelector('.alert-text p');
      if (!alertText) return;
      alertText.innerText = msg;
      errorToast.classList.add('show');
      shown = errorToast;
    });
    window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, lanaOptions);
    return shown;
  }
}

export default class ActionBinder {
  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}, widget = null) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actionMap = actionMap;
    this.widget = widget;
    this.errorToastEl = null;
    this.transitionScreen = null;
    this.LOADER_LIMIT = 95;
    this.serviceHandler = null;
    this.abortController = null;
    this.inFlight = false;
    this.isGuestUser = undefined;
    this.sendAnalyticsToSplunk = null;
    this.analyticsModule = null;
    this.promiseStack = [];
    this.desktop = false;
    this.warmed = false;
    this.restoreFocusEl = null;
    this.toastCanvasAreas = canvasArea ? [canvasArea] : [];
    this.apiConfig = this.getApiConfig();
    this.verb = this.getVerbFromDom();
    this.initActionListeners = this.initActionListeners.bind(this);
    const searchRoot = canvasArea || block;
    this.root = searchRoot?.closest?.(WIDGET_ROOT) || searchRoot?.querySelector?.(WIDGET_ROOT) || searchRoot;
    this.widgetWrap = searchRoot?.querySelector?.('.ex-unity-wrap') ?? searchRoot;
    this.limits = workflowCfg.targetCfg?.limits || {};
    const productTag = workflowCfg.targetCfg?.[`productTag-${workflowCfg.productName?.toLowerCase()}`] || 'FF';
    this.lanaOptions = { sampleRate: 1, tags: `Unity-${productTag}-FaceSwap` };
  }

  getApiConfig() {
    unityConfig.endPoint = {
      assetUpload: `${unityConfig.apiEndPoint}/asset`,
      acmpCheck: `${unityConfig.apiEndPoint}/asset/finalize`,
    };
    return unityConfig;
  }

  getAdditionalHeaders() {
    const baseAction = this.workflowCfg?.supportedFeatures?.values()?.next()?.value;
    const xUnityAction = this.verb ? `${baseAction}-${this.verb}` : baseAction;
    return {
      'x-unity-product': this.workflowCfg?.productName,
      'x-unity-action': xUnityAction,
    };
  }

  getVerbFromDom() {
    const verbEl = this.unityEl?.querySelector('[class*="icon-operation-"]');
    if (verbEl) {
      const verbClass = Array.from(verbEl.classList).find((cls) => cls.startsWith('icon-operation-'));
      const fromDom = verbClass?.slice('icon-operation-'.length);
      if (fromDom) return fromDom;
    }
    return this.workflowCfg?.enabledFeatures?.[0];
  }

  async initAnalytics() {
    if (this.analyticsModule) return;
    this.analyticsModule = await import(`${getUnityLibs()}/scripts/analytics.js`);
    if (this.workflowCfg.targetCfg?.sendSplunkAnalytics) {
      this.sendAnalyticsToSplunk = this.analyticsModule.default;
    }
  }

  getAnalyticsMeta(data = {}) {
    return {
      workflow: this.workflowCfg?.name,
      ...(this.isGuestUser !== undefined && { isGuestUser: this.isGuestUser }),
      ...data,
    };
  }

  logAnalyticsinSplunk(eventName, data = {}) {
    this.sendAnalyticsToSplunk?.(
      eventName,
      this.workflowCfg.productName,
      this.getAnalyticsMeta({ ...data, operation: this.verb, action: 'upload-generate' }),
      `${unityConfig.apiEndPoint}/log`,
      true,
    );
  }

  /* ---------- error toast (ported from workflow-prompt-bar-upload) ---------- */

  async createErrorToast() {
    try {
      const [alertImg, closeImg] = await Promise.all([
        fetch(`${getUnityLibs()}/img/icons/alert.svg`).then((res) => res.text()),
        fetch(`${getUnityLibs()}/img/icons/close.svg`).then((res) => res.text()),
      ]);
      const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
      this.toastCanvasAreas.forEach((canvasEl) => {
        const mount = canvasEl.querySelector('.interactive-area') || canvasEl;
        const alertText = createTag('div', { class: 'alert-text', role: 'alert' }, createTag('p', {}, ''));
        const alertIcon = createTag('div', { class: 'alert-icon' });
        alertIcon.innerHTML = alertImg;
        alertIcon.append(alertText);
        const alertClose = createTag('a', { class: 'alert-close', href: '#', role: 'button' });
        alertClose.innerHTML = closeImg;
        alertClose.append(createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
        const alertContent = createTag('div', { class: 'alert-content' });
        alertContent.append(alertIcon, alertClose);
        const alertToast = createTag('div', { class: 'alert-toast', tabindex: '-1' }, alertContent);
        const errholder = createTag('div', { class: 'alert-holder' }, alertToast);
        alertClose.addEventListener('click', (e) => {
          this.preventDefault(e);
          this.dismissErrorToast();
        });
        errholder.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            this.preventDefault(e);
            this.dismissErrorToast();
          }
        });
        decorateDefaultLinkAnalytics(errholder);
        mount.append(errholder);
      });
      return this.toastCanvasAreas[0]?.querySelector('.alert-holder') || null;
    } catch (e) {
      window.lana?.log(`Message: Error creating error toast, Error: ${e}`, this.lanaOptions);
      return null;
    }
  }

  setMainInert(on) {
    ['.unity-slf-main', '.fs-legal'].forEach((sel) => {
      const node = this.root?.querySelector?.(sel);
      if (!node) return;
      if (on) node.setAttribute('inert', '');
      else node.removeAttribute('inert');
    });
  }

  showToast(options, error, errorType, focusBackEl) {
    const shown = this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, ...options }, error, this.lanaOptions, errorType);
    if (!shown) return;
    /* pointer-events:none blocks the mouse but not the keyboard; inert covers both. */
    this.setMainInert(true);
    this.restoreFocusEl = focusBackEl || null;
    /* Focus the toast itself (as workflow-prompt-upload does) so keyboard focus leaves the
       now-inert UI without forcing a ring onto the close button for mouse/touch users. */
    const toast = shown.querySelector('.alert-toast');
    setTimeout(() => toast?.focus(), 0);
  }

  dismissErrorToast() {
    this.toastCanvasAreas.forEach((el) => {
      el.style.pointerEvents = 'auto';
      el.querySelector('.alert-holder')?.classList.remove('show');
    });
    this.setMainInert(false);
    const target = this.restoreFocusEl;
    this.restoreFocusEl = null;
    target?.focus?.();
  }

  handleClientError(errorToken, slotId, fileMetaData) {
    this.showToast({ errorType: `.icon-${errorToken}`, errorCode: errorToken, fileMetaData }, '', 'client', this.widget?.slotEls?.[slotId]?.input);
    this.logAnalyticsinSplunk('Upload client error|UnityWidget', { errorData: { code: errorToken }, fileMetaData, slot: slotId });
  }

  /* ---------- selection-time hooks ---------- */

  validateFiles(files, slotId) {
    const fileMetaData = { count: files.length, size: files[0]?.size, type: files[0]?.type };
    const { ok, errorToken } = validateSelection(files, this.limits);
    if (!ok) this.handleClientError(errorToken, slotId, fileMetaData);
    return ok;
  }

  installWidgetHooks() {
    if (!this.widget) return;
    this.widget.validateFiles = (files, slotId) => this.validateFiles(files, slotId);
    this.widget.onPreviewError = (slotId) => this.handleClientError('error-filetype', slotId);
    if (this.limits.allowedFileTypes?.length) {
      Object.values(this.widget.slotEls || {}).forEach(({ input }) => {
        input?.setAttribute('accept', this.limits.allowedFileTypes.join(','));
      });
    }
  }

  /* Filling a slot signals intent: warm the CTA path during idle time only. */
  warmUp() {
    if (this.warmed) return;
    this.warmed = true;
    const run = async () => {
      try {
        const origin = unityConfig.apiEndPoint ? new URL(unityConfig.apiEndPoint).origin : null;
        if (origin && !document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
          document.head.append(createTag('link', { rel: 'preconnect', href: origin, crossorigin: '' }));
        }
        await Promise.all([
          import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`),
          this.ensureTransitionScreen(),
        ]);
      } catch (e) {
        window.lana?.log(`Message: Face swap warm-up failed, Error: ${e}`, this.lanaOptions);
      }
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => run(), { timeout: 2000 });
    else setTimeout(run, 200);
  }

  /* ---------- upload ---------- */

  async uploadImgToUnity(storageUrl, blobData, fileType, signal) {
    let response;
    try {
      response = await fetch(storageUrl, {
        method: 'PUT',
        headers: { 'Content-Type': fileType },
        body: blobData,
        ...(signal && { signal }),
      });
    } catch (e) {
      if (e instanceof TypeError) {
        const error = new Error(`Network error. URL: ${storageUrl}; Error message: ${e.message}`);
        error.status = 0;
        throw error;
      }
      throw e;
    }
    if (response.status !== 200) {
      const error = new Error('Failed to upload image to Unity');
      error.status = response.status;
      throw error;
    }
  }

  /**
   * upload-handler reads `actionBinder.assetId` (singular). Both slots upload
   * concurrently, so each gets its own facade with its own assetId view.
   */
  createUploadContext() {
    const ctx = { assetId: null };
    const self = this;
    ctx.facade = {
      get assetId() { return ctx.assetId; },
      lanaOptions: this.lanaOptions,
      workflowCfg: this.workflowCfg,
      apiConfig: this.apiConfig,
      logAnalyticsinSplunk: (...a) => self.logAnalyticsinSplunk(...a),
      getAdditionalHeaders: () => self.getAdditionalHeaders(),
    };
    return ctx;
  }

  async materializeFile(slot, signal) {
    if (slot.file) return slot.file;
    const res = await fetch(slot.assetUrl, { mode: 'cors', signal });
    if (!res.ok) {
      const error = new Error(`Gallery asset fetch failed: ${slot.assetUrl}`);
      error.status = res.status;
      throw error;
    }
    const blob = await res.blob();
    const name = decodeURIComponent(new URL(slot.assetUrl, window.location.href).pathname.split('/').pop() || 'gallery-image');
    return new File([blob], name, { type: blob.type });
  }

  async uploadSlot(slotId, slot, signal) {
    const ctx = this.createUploadContext();
    const file = await this.materializeFile(slot, signal);
    const { ok, errorToken } = validateSelection([file], this.limits);
    if (!ok) {
      const error = new Error(`Validation failed: ${errorToken}`);
      error.errorToken = errorToken;
      throw error;
    }
    const resJson = await this.serviceHandler.postCallToService(
      this.apiConfig.endPoint.assetUpload,
      {
        body: JSON.stringify({
          targetProduct: this.workflowCfg.productName,
          name: file.name,
          size: file.size,
          format: file.type,
        }),
        signal,
      },
    );
    const { id, href, blocksize, uploadUrls } = resJson;
    ctx.assetId = id;
    this.logAnalyticsinSplunk('Asset Created|UnityWidget', { assetId: id, slot: slotId });
    const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
    const uploadHandler = new UploadHandler(ctx.facade, this.serviceHandler);
    if (blocksize && Array.isArray(uploadUrls)) {
      const { failedChunks, attemptMap } = await uploadHandler.uploadChunksToUnity(uploadUrls, file, blocksize, signal);
      if (failedChunks?.size > 0) {
        const error = new Error(`One or more chunks failed for asset: ${id}`);
        error.status = 504;
        this.logAnalyticsinSplunk('Chunked Upload Failed|UnityWidget', {
          assetId: id,
          failedChunks: failedChunks.size,
          maxRetryCount: Math.max(...Array.from(attemptMap.values())),
        });
        throw error;
      }
    } else {
      await this.uploadImgToUnity(href, file, file.type, signal);
    }
    await uploadHandler.scanImgForSafetyWithRetry(id, signal);
    this.logAnalyticsinSplunk('Upload Completed|UnityWidget', { assetId: id, slot: slotId });
    return { slotId, assetId: id };
  }

  /* ---------- transition screen ---------- */

  async ensureTransitionScreen() {
    if (!this.transitionScreen) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(null, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, this.desktop);
    }
    if (!this.transitionScreen.splashScreenEl) {
      await this.transitionScreen.loadSplashFragment();
    }
  }

  async hideSplash() {
    await this.transitionScreen?.showSplashScreen();
  }

  async cancelUploadOperation() {
    try {
      this.abortController?.abort();
      sendAnalyticsEvent(new CustomEvent('Cancel|UnityWidget'));
      this.logAnalyticsinSplunk('Cancel|UnityWidget');
      await this.ensureTransitionScreen();
      await this.hideSplash();
      const cancelPromise = Promise.reject(new Error(CANCEL_MESSAGE));
      cancelPromise.catch(() => {});
      this.promiseStack.unshift(cancelPromise);
      this.widget?.genBtn?.focus();
    } catch (error) {
      await this.hideSplash();
      window.lana?.log(`Message: Error cancelling upload operation, Error: ${error}`, this.lanaOptions);
      throw error;
    }
  }

  /* ---------- generate ---------- */

  async handleGenerate() {
    if (this.inFlight) return;
    this.inFlight = true;
    this.promiseStack = [];
    try {
      if (!this.analyticsModule) await this.initAnalytics();
      const events = this.analyticsModule.PROMPT_BAR_EVENTS;
      const filled = this.widget?.getFilledSlots?.() || [];
      sendAnalyticsEvent(new CustomEvent(events.GENERATE_CTA));
      this.logAnalyticsinSplunk(events.GENERATE_CTA, { imageCount: filled.length });

      /* Zero images: redirect straight to the product, no splash. */
      if (!filled.length) {
        await this.continueInApp([]);
        return;
      }

      const shell = this.root?.querySelector?.('.interactive-area');
      this.workflowCfg.theme = shell?.classList.contains('dark') ? 'dark' : null;
      this.abortController = new AbortController();
      const { signal } = this.abortController;
      await this.ensureTransitionScreen();
      await this.transitionScreen.showSplashScreen(true);
      const { isGuest } = await isGuestUser();
      this.isGuestUser = isGuest;
      sendAnalyticsEvent(new CustomEvent(events.UPLOAD_STARTED));
      this.logAnalyticsinSplunk(events.UPLOAD_STARTED, { imageCount: filled.length });

      const results = await Promise.allSettled(filled.map(([slotId, slot]) => this.uploadSlot(slotId, slot, signal)));
      if (signal.aborted || this.promiseStack.length) return;

      const failedIdx = results.findIndex((r) => r.status === 'rejected');
      if (failedIdx >= 0) {
        /* Fail safe (Q16 pending): never redirect with a partial payload; keep previews for retry. */
        await this.handleUploadFailure(filled[failedIdx][0], results[failedIdx].reason);
        return;
      }
      await this.continueInApp(results.map((r) => r.value));
    } catch (err) {
      window.lana?.log(`Message: Face swap generate failed, Error: ${err}`, this.lanaOptions);
    } finally {
      this.inFlight = false;
      this.abortController = null;
    }
  }

  async handleUploadFailure(slotId, err) {
    /* The splash mounts on <body> above the widget, so it must go first. */
    await this.hideSplash();
    const errorToken = err?.errorToken || 'error-request';
    const suffix = errorToken === 'error-request' ? `(${this.widget?.slotTitle?.(slotId) || slotId})` : '';
    this.showToast({ errorType: `.icon-${errorToken}`, errorCode: errorToken, suffix }, err, 'server', this.widget?.genBtn);
    this.logAnalyticsinSplunk('Upload server error|UnityWidget', {
      errorData: { code: errorToken, subCode: `uploadSlot ${err?.status}`, desc: err?.message || undefined },
      slot: slotId,
    });
  }

  async continueInApp(uploads) {
    const { getCgenQueryParams } = await import(`${getUnityLibs()}/utils/cgen-utils.js`);
    const { generate, ...assetFields } = buildFaceSwapAssetPayload(uploads);
    const connectorBody = {
      targetProduct: this.workflowCfg.productName,
      additionalQueryParams: getCgenQueryParams(this.unityEl),
      ...assetFields,
      payload: {
        workflow: this.workflowCfg.supportedFeatures.values().next().value,
        verb: this.verb,
        action: uploads.length ? 'asset-upload' : 'redirect',
        locale: getLocale(),
        generate,
      },
    };
    try {
      const postOpts = await getApiCallOptions('POST', unityConfig.apiKey, this.getAdditionalHeaders(), { body: JSON.stringify(connectorBody) });
      const { default: NetworkUtils } = await import(`${getUnityLibs()}/utils/NetworkUtils.js`);
      const { url } = await new NetworkUtils().fetchFromService(
        this.apiConfig.connectorApiEndPoint,
        postOpts,
        async (response) => {
          if (response.status !== 200) {
            const error = new Error('Connector call failed');
            error.status = response.status;
            throw error;
          }
          return response.json();
        },
      );
      if (this.promiseStack.length > 0) return;
      this.logAnalyticsinSplunk('Generate Complete|UnityWidget', { imageCount: uploads.length });
      if (this.transitionScreen?.splashScreenEl) {
        this.transitionScreen.LOADER_LIMIT = 100;
        this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, 100);
      }
      if (url) window.location.href = url;
    } catch (err) {
      if (err.message === CANCEL_MESSAGE) return;
      await this.hideSplash();
      this.showToast({ errorType: '.icon-error-request', errorCode: 'error-request' }, err, 'server', this.widget?.genBtn);
      this.logAnalyticsinSplunk('Upload server error|UnityWidget', { errorData: { code: 'error-request', subCode: `continueInApp ${err.status}`, desc: err.message || undefined } });
    }
  }

  /* ---------- wiring ---------- */

  async handlePreloads() {
    if (this.workflowCfg.targetCfg?.showSplashScreen) {
      await priorityLoad([`${getUnityLibs()}/core/styles/splash-screen.css`]);
    }
  }

  isStringActionMap(actMap) {
    return actMap && typeof actMap === 'object' && Object.keys(actMap).length > 0
      && Object.values(actMap).every((v) => typeof v === 'string');
  }

  async executeActionMaps(value) {
    if (value === 'interrupt') await this.cancelUploadOperation();
  }

  /* Called back by transition-screen for the splash's Cancel link. */
  async bindStringActionMap(b, actMap) {
    Object.entries(actMap).forEach(([selector, action]) => {
      b.querySelectorAll(selector).forEach((el) => {
        el.addEventListener('click', async (e) => {
          if (action !== 'redirect') e.preventDefault();
          await this.executeActionMaps(action);
        });
      });
    });
  }

  setupServiceHandler() {
    this.serviceHandler = new ServiceHandler(
      this.toastCanvasAreas,
      this.unityEl,
      this.getAdditionalHeaders.bind(this),
    );
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    if (this.isStringActionMap(actMap)) {
      await this.bindStringActionMap(b, actMap);
      return;
    }
    this.setupServiceHandler();
    this.installWidgetHooks();
    await Promise.all([this.initAnalytics(), this.handlePreloads()]);
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    const scope = this.widgetWrap || b;
    Object.entries(actMap || {}).forEach(([selector, actionsList]) => {
      const primary = (Array.isArray(actionsList) ? actionsList : [actionsList])[0]?.actionType;
      scope?.querySelectorAll(selector).forEach((el) => {
        if (el.dataset.fsBound) return;
        el.dataset.fsBound = 'true';
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          if (primary === 'generate') await this.handleGenerate();
        });
      });
    });
    this.widgetWrap?.addEventListener('fs-slot-selected', (e) => {
      this.warmUp();
      const { slotId, source } = e.detail || {};
      const eventName = this.analyticsModule?.PROMPT_BAR_EVENTS?.UPLOAD_FILE_ATTEMPT || 'Upload file attempt|UnityWidget';
      sendAnalyticsEvent(new CustomEvent(eventName));
      this.logAnalyticsinSplunk(eventName, { slot: slotId, action: source });
    });
    this.widgetWrap?.addEventListener('fs-reset', () => {
      sendAnalyticsEvent(new CustomEvent('Reset|UnityWidget'));
      this.logAnalyticsinSplunk('Reset|UnityWidget');
    });
  }

  preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }
}
