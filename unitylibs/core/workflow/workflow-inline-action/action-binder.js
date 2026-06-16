/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */

import {
  unityConfig,
  getUnityLibs,
  createTag,
  getLocale,
  getHeaders,
  sendAnalyticsEvent,
  isGuestUser,
  loadImg,
} from '../../../scripts/utils.js';
import { InlineActionState } from '../../widgets/inline-action/inline-action.js';
import { INLINE_ACTION_EVENTS } from '../../../scripts/analytics.js';

const DOWNLOAD_COUNT_KEY = 'inline-action-download-count';
const WORKFLOW_NAME = 'inline-action';
const UPLOAD_ERROR_TYPE = '.icon-error-request';
const PROGRESS = { UPLOAD_MAX: 60, REMOVE_BG: 95, COMPLETE: 100 };
const getMount = (el) => el?.querySelector?.('.ia-widget') || el;

class ServiceHandler {
  constructor(canvasArea, unityEl, getAdditionalHeaders) {
    this.canvasArea = canvasArea;
    this.unityEl = unityEl;
    this.getAdditionalHeaders = getAdditionalHeaders;
  }

  async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
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

  showErrorToast(errorCallbackOptions, error, lanaOptions) {
    if (!errorCallbackOptions.errorToastEl) return;
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.closest('li')?.textContent?.trim();
    this.canvasArea.forEach((element) => {
      const mount = getMount(element);
      mount.style.pointerEvents = 'none';
      const errorToast = mount.querySelector('.alert-holder');
      if (!errorToast) return;
      const alertText = errorToast.querySelector('.alert-text p');
      if (alertText) alertText.innerText = msg;
      errorToast.classList.add('show');
      const closeBtn = errorToast.querySelector('.alert-close');
      if (closeBtn) closeBtn.style.pointerEvents = 'auto';
    });
    window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, lanaOptions);
  }
}

export default class ActionBinder {
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}, widgetRef = null) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea?.forEach ? canvasArea : [canvasArea].filter(Boolean);
    this.widgetRef = widgetRef;
    this.errorToastEl = null;
    this.apiConfig = this.getApiConfig();
    this.serviceHandler = null;
    this.transitionScreen = null;
    this.LOADER_LIMIT = 95;
    this.limits = ActionBinder.resolveLimits(workflowCfg);
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF-InlineAction' };
    this.sendAnalyticsToSplunk = null;
    this.assetId = null;
    this.resultAssetId = null;
    this.resultUrl = null;
    this.resultBlob = null;
    this.filesData = {};
    this.uploadAbortController = null;
    this.signedInFlowInProgress = false;
    this.splashProgress = 0;
    this.operation = widgetRef?.meta?.operation || 'removeBackground';
    this.initActionListeners = this.initActionListeners.bind(this);
  }

  getAnalyticsMeta(data = {}) {
    return { workflow: WORKFLOW_NAME, ...data };
  }

  trackEvent(eventName, data = {}) {
    const metaData = this.getAnalyticsMeta(data);
    sendAnalyticsEvent(new CustomEvent(eventName, {
      detail: { workflow: meta.workflow },
    }));
    this.logAnalyticsinSplunk(eventName, metaData);
  }

  trackClientError(errorCode) {
    this.trackEvent(INLINE_ACTION_EVENTS.UPLOAD_CLIENT_ERROR, {
      errorData: { code: errorCode },
      fileMetaData: this.filesData,
    });
  }

  trackServerError(callType, error, errorCode = 'error-request') {
    this.trackEvent(INLINE_ACTION_EVENTS.UPLOAD_SERVER_ERROR, {
      errorData: {
        code: errorCode,
        subCode: `${callType} ${error?.status ?? ''}`.trim(),
        desc: error?.message || undefined,
      },
      fileMetaData: this.filesData,
      assetId: this.assetId || this.resultAssetId,
      action: callType,
    });
  }

  trackConnectorSuccess(verb, assetId) {
    this.trackEvent(INLINE_ACTION_EVENTS.CONNECTOR_SUCCESS, {
      assetId: assetId || this.resultAssetId,
      verb,
      fileMetaData: this.filesData,
    });
  }

  trackConnectorAnalytics(el) {
    const redirectMeta = { assetId: this.resultAssetId, action: 'redirect' };
    if (el?.classList?.contains('ia-edit-in-firefly')) {
      this.trackEvent(INLINE_ACTION_EVENTS.EDIT_IN_FIREFLY, redirectMeta);
    } else if (el?.classList?.contains('ia-nba-card')) {
      const label = el.querySelector('.ia-nba-label')?.textContent?.trim() || el.dataset.nba;
      this.trackEvent(INLINE_ACTION_EVENTS.nbaClick(label), { ...redirectMeta, verb: el.dataset.nba });
    }
  }

  static resolveLimits(workflowCfg) {
    const targetCfg = workflowCfg.targetCfg || {};
    const productLimits = targetCfg[`limits-${workflowCfg.productName?.toLowerCase()}`] || {};
    return { ...(targetCfg.limits || {}), ...productLimits };
  }

  getApiConfig() {
    unityConfig.endPoint = {
      assetUpload: `${unityConfig.apiEndPoint}/asset`,
      acmpCheck: `${unityConfig.apiEndPoint}/asset/finalize`,
      removeBackground: `${unityConfig.apiEndPoint}/providers/RemoveBackground`,
    };
    return unityConfig;
  }

  getAdditionalHeaders() {
    const baseAction = this.workflowCfg?.supportedFeatures?.values()?.next()?.value;
    const xUnityAction = this.operation ? `${baseAction}-${this.operation}` : baseAction;
    return {
      'x-unity-product': this.workflowCfg?.productName,
      'x-unity-action': xUnityAction,
    };
  }

  uploadErrorOpts(errorCode) {
    return { errorToastEl: this.errorToastEl, errorType: UPLOAD_ERROR_TYPE, ...(errorCode && { errorCode }) };
  }

  getUserCount() {
    return parseInt(localStorage.getItem(DOWNLOAD_COUNT_KEY), 10) || 0;
  }

  incrementUserCount() {
    const next = this.getUserCount() + 1;
    localStorage.setItem(DOWNLOAD_COUNT_KEY, String(next));
    return next;
  }

  logAnalyticsinSplunk(eventName, data) {
    this.sendAnalyticsToSplunk?.(
      eventName,
      this.workflowCfg.productName,
      this.getAnalyticsMeta(data),
      `${unityConfig.apiEndPoint}/log`,
    );
  }

  async initAnalytics() {
    if (!this.sendAnalyticsToSplunk && this.workflowCfg.targetCfg.sendSplunkAnalytics) {
      this.sendAnalyticsToSplunk = (await import(`${getUnityLibs()}/scripts/analytics.js`)).default;
    }
  }

  extractFiles(e) {
    if (e.dataTransfer?.items) {
      return [...e.dataTransfer.items].filter((item) => item.kind === 'file').map((item) => item.getAsFile());
    }
    if (e.target?.files) return [...e.target.files];
    return [];
  }

  preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  dismissErrorToast() {
    this.canvasArea.forEach((element) => {
      const mount = getMount(element);
      const errHolder = mount.querySelector('.alert-holder');
      if (errHolder?.classList.contains('show')) {
        mount.style.pointerEvents = 'auto';
        errHolder.classList.remove('show');
      }
    });
  }

  handleClientUploadError(errorTypeSelector, errorCode) {
    this.trackClientError(errorCode);
    this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: errorTypeSelector, errorCode }, '', this.lanaOptions);
  }

  async validateFile(files) {
    if (!files?.length) return null;
    const file = files[0];
    if (this.limits.maxNumFiles !== files.length) {
      this.handleClientUploadError('.icon-error-filecount', 'error-filecount');
      return null;
    }
    if (!this.limits.allowedFileTypes?.includes(file.type)) {
      this.handleClientUploadError('.icon-error-filetype', 'error-filetype');
      return null;
    }
    if (this.limits.maxFileSize < file.size) {
      this.handleClientUploadError('.icon-error-filesize', 'error-filesize');
      return null;
    }
    return file;
  }

  async uploadImgToUnity(storageUrl, _id, blobData, fileType, signal) {
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
      ...(signal && { signal }),
    };
    let response;
    try {
      response = await fetch(storageUrl, uploadOptions);
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

  setProgress(pct, useSplash = false) {
    if (useSplash && this.transitionScreen?.splashScreenEl) {
      this.splashProgress = Math.max(this.splashProgress, pct);
      this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, this.splashProgress);
    } else {
      this.widgetRef?.setProgress?.(pct);
    }
  }

  async ensureTransitionScreen({ delayedSplash = false } = {}) {
    this.workflowCfg.theme = this.unityEl.classList.contains('dark') ? 'dark' : null;
    if (!this.transitionScreen) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(
        null,
        this.initActionListeners,
        this.LOADER_LIMIT,
        this.workflowCfg,
        false,
      );
      if (delayedSplash) await this.transitionScreen.delayedSplashLoader();
    }
    return this.transitionScreen;
  }

  async loadTransitionScreen() {
    try {
      await this.ensureTransitionScreen({ delayedSplash: true });
    } catch (error) {
      window.lana?.log(`Message: Error loading transition screen, Error: ${error}`, this.lanaOptions);
      throw error;
    }
  }

  async cancelUploadOperation() {
    try {
      const { assetId } = this;
      this.uploadAbortController?.abort();
      this.uploadAbortController = null;
      this.signedInFlowInProgress = false;
      this.assetId = null;
      this.resultAssetId = null;
      this.trackEvent('Cancel|UnityWidget', { assetId });
      await this.transitionScreen?.showSplashScreen(false);
    } catch (error) {
      await this.transitionScreen?.showSplashScreen(false);
      window.lana?.log(`Message: Error cancelling upload operation, Error: ${error}`, this.lanaOptions);
    }
  }

  async uploadAsset(file, useInlineProgress = false) {
    const assetDetails = {
      targetProduct: this.workflowCfg.productName,
      name: file.name,
      size: file.size,
      format: file.type,
    };
    this.uploadAbortController = new AbortController();
    const { signal } = this.uploadAbortController;
    let callType = 'asset';
    try {
      const resJson = await this.serviceHandler.postCallToService(
        this.apiConfig.endPoint.assetUpload,
        { body: JSON.stringify(assetDetails) },
        this.uploadErrorOpts(),
      );
      if (signal.aborted) return false;
      callType = 'upload';
      const { id, href, blocksize, uploadUrls } = resJson;
      this.assetId = id;
      this.logAnalyticsinSplunk('Asset Created|UnityWidget', { assetId: this.assetId });
      const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
      const uploadHandler = new UploadHandler(this, this.serviceHandler);
      if (blocksize && uploadUrls && Array.isArray(uploadUrls)) {
        const totalChunks = Math.ceil(file.size / blocksize);
        let completedChunks = 0;
        const callbacks = useInlineProgress ? {
          onChunkComplete: () => {
            completedChunks += 1;
            this.setProgress(Math.round((completedChunks / totalChunks) * PROGRESS.UPLOAD_MAX));
          },
        } : {};
        const { failedChunks, attemptMap } = await uploadHandler.uploadChunksToUnity(uploadUrls, file, blocksize, signal, callbacks);
        if (failedChunks?.size > 0) {
          if (signal.aborted) return false;
          const error = new Error(`One or more chunks failed for asset: ${id}`);
          error.status = 504;
          this.logAnalyticsinSplunk('Chunked Upload Failed|UnityWidget', {
            assetId: this.assetId,
            failedChunks: failedChunks.size,
            maxRetryCount: Math.max(...Array.from(attemptMap.values())),
          });
          throw error;
        }
        await uploadHandler.scanImgForSafetyWithRetry(this.assetId, signal);
        const { createChunkAnalyticsData } = await import(`${getUnityLibs()}/utils/chunkingUtils.js`);
        this.logAnalyticsinSplunk(
          'Chunked Upload Completed|UnityWidget',
          createChunkAnalyticsData('Chunked Upload Completed|UnityWidget', {
            assetId: this.assetId,
            chunkCount: totalChunks,
            totalFileSize: file.size,
            fileType: file.type,
          }),
        );
      } else {
        await this.uploadImgToUnity(href, id, file, file.type, signal);
        await uploadHandler.scanImgForSafetyWithRetry(this.assetId, signal);
        this.logAnalyticsinSplunk('Upload Completed|UnityWidget', { assetId: this.assetId });
      }
      this.setProgress(PROGRESS.UPLOAD_MAX, !useInlineProgress);
      return true;
    } catch (e) {
      if (signal.aborted || e.name === 'AbortError') {
        window.lana?.log(`Message: Upload aborted, Error: ${e.message}`, this.lanaOptions);
        return false;
      }
      this.trackServerError(callType, e);
      this.serviceHandler.showErrorToast(this.uploadErrorOpts(), e, this.lanaOptions);
      return false;
    }
  }

  async removeBackground(useSplashProgress = false) {
    const { signal } = this.uploadAbortController || {};
    if (signal?.aborted) return null;
    const body = JSON.stringify({ surfaceId: 'Unity', assets: [{ id: this.assetId }] });
    try {
      const res = await this.serviceHandler.postCallToService(
        this.apiConfig.endPoint.removeBackground,
        { body, ...(signal && { signal }) },
        this.uploadErrorOpts(),
      );
      this.resultAssetId = res.assetId;
      this.resultUrl = res.outputUrl;
      this.setProgress(PROGRESS.REMOVE_BG, useSplashProgress);
      return res;
    } catch (e) {
      if (signal?.aborted || e.name === 'AbortError') return null;
      throw e;
    }
  }

  resolveConnectorVerb(el, isDownload = false, downloadsLocally = false) {
    if (isDownload) return downloadsLocally ? 'aiPhotoEditor' : 'download';
    if (el?.classList?.contains('ia-edit-in-firefly')) return 'aiPhotoEditor';
    return el?.dataset?.nba;
  }

  async buildConnectorPayload({ defaultPrompt, verb, connectorAssetId, fileType } = {}) {
    const { getCgenQueryParams } = await import(`${getUnityLibs()}/utils/cgen-utils.js`);
    const query = defaultPrompt?.trim();
    return {
      assetId: connectorAssetId,
      targetProduct: this.workflowCfg.productName,
      ...(query && { query }),
      payload: {
        workflow: this.workflowCfg?.supportedFeatures?.values()?.next()?.value,
        action: 'asset-upload',
        verb: verb ?? this.operation,
        widgetType: 'nba',
        locale: getLocale(),
        additionalQueryParams: getCgenQueryParams(this.unityEl),
        type: fileType,
      },
    };
  }

  async callConnector(cOpts, { openInSameTab = false } = {}) {
    try {
      const res = await this.serviceHandler.postCallToService(
        this.apiConfig.connectorApiEndPoint,
        { body: JSON.stringify(cOpts) },
        this.uploadErrorOpts(),
      );
      if (!res?.url) {
        const error = new Error('Error connecting to App');
        error.status = res?.status;
        throw error;
      }
      this.trackConnectorSuccess(cOpts.payload?.verb, cOpts.assetId);
      if (openInSameTab) {
        if (this.transitionScreen) this.transitionScreen.LOADER_LIMIT = PROGRESS.COMPLETE;
        this.setProgress(PROGRESS.COMPLETE, true);
        window.location.assign(res.url);
      } else {
        window.open(res.url, '_blank');
      }
      return res;
    } catch (e) {
      if (e.name !== 'AbortError') {
        this.trackServerError('connector', e);
        e.analyticsTracked = true;
      }
      throw e;
    }
  }

  static downloadFilename(mimeType = 'image/png') {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' }[mimeType] || 'png';
    return `Firefly_RemoveBackground.${ext}`;
  }

  getImageBlobData(url) {
    return new Promise((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'blob';
      xhr.onload = () => {
        if (xhr.status === 200) res(xhr.response);
        else rej(new Error(`Failed to fetch image (${xhr.status})`));
      };
      xhr.onerror = () => rej(new Error('Failed to fetch image'));
      xhr.send();
    });
  }

  async resolveDownloadBlob(url) {
    const blob = this.resultBlob || await this.getImageBlobData(url);
    if (!blob?.size) throw new Error('Failed to fetch image (empty response)');
    return blob;
  }

  async cacheResultBlob(url) {
    try {
      this.resultBlob = await this.resolveDownloadBlob(url);
    } catch {
      this.resultBlob = null;
    }
  }

  downloadBlob(blob, mimeType = 'image/png') {
    const objUrl = URL.createObjectURL(blob);
    const a = createTag('a', { href: objUrl, download: ActionBinder.downloadFilename(mimeType) });
    document.body.append(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(objUrl);
    }, 200);
  }

  async triggerDownload(url) {
    const blob = await this.resolveDownloadBlob(url);
    this.downloadBlob(blob, blob.type || 'image/png');
  }

  async signedInFlow(file) {
    if (this.signedInFlowInProgress) return;
    this.signedInFlowInProgress = true;
    try {
      const ts = await this.ensureTransitionScreen();
      if (!ts.splashScreenEl) await ts.loadSplashFragment();
      ts.LOADER_LIMIT = 0;
      await ts.showSplashScreen(true);
      if (this.transitionScreen) this.transitionScreen.progressBarHandler = () => {};
      this.splashProgress = 0;
      ts.LOADER_LIMIT = PROGRESS.COMPLETE;
      this.setProgress(0, true);
      const ok = await this.uploadAsset(file, false);
      if (!ok) {
        this.uploadAbortController = null;
        await ts.showSplashScreen(false);
        return;
      }
      const removeBgRes = await this.removeBackground(true);
      if (!removeBgRes) {
        this.uploadAbortController = null;
        await ts.showSplashScreen(false);
        return;
      }
      await this.callConnector(await this.buildConnectorPayload({
        verb: 'aiPhotoEditor',
        connectorAssetId: this.resultAssetId,
        fileType: this.filesData.type,
      }), { openInSameTab: true });
    } catch (e) {
      await this.transitionScreen?.showSplashScreen(false);
      if (e.name !== 'AbortError') {
        if (!e.analyticsTracked) this.trackServerError('upload', e);
        this.serviceHandler.showErrorToast(this.uploadErrorOpts(), e, this.lanaOptions);
      }
    } finally {
      this.uploadAbortController = null;
      this.signedInFlowInProgress = false;
    }
  }

  async anonymousFlow(file) {
    this.widgetRef?.setState(InlineActionState.LOADING);
    this.widgetRef?.setProgress(0);
    try {
      const ok = await this.uploadAsset(file, true);
      if (!ok) {
        this.widgetRef?.setState(InlineActionState.INITIAL);
        return;
      }
      await this.removeBackground();
      this.widgetRef?.setResultUrl(this.resultUrl);
      await loadImg(this.widgetRef.widget.querySelector('.ia-result-img'));
      this.widgetRef?.setProgress(PROGRESS.COMPLETE);
      this.widgetRef?.setState(InlineActionState.COMPLETE);
      this.cacheResultBlob(this.resultUrl).catch(() => {});
    } catch (e) {
      this.trackServerError('upload', e);
      this.serviceHandler.showErrorToast(this.uploadErrorOpts(), e, this.lanaOptions);
      this.widgetRef?.setState(InlineActionState.INITIAL);
    }
  }

  async uploadFile(files) {
    const file = await this.validateFile(files);
    if (!file) return;
    this.uploadAbortController = null;
    this.assetId = null;
    this.resultAssetId = null;
    this.resultUrl = null;
    this.resultBlob = null;
    this.filesData = { count: 1, size: file.size, type: file.type, name: file.name };
    this.trackEvent('Uploading Started|UnityWidget');
    const { isGuest } = await isGuestUser();
    if (isGuest === false) await this.signedInFlow(file);
    else await this.anonymousFlow(file);
  }

  async handleConnector(el, isDownload = false) {
    let userCount = this.getUserCount();
    const downloadsLocally = isDownload && userCount < 1;
    const verb = this.resolveConnectorVerb(el, isDownload, downloadsLocally);
    if (downloadsLocally) {
      try {
        await this.triggerDownload(this.resultUrl);
        userCount = this.incrementUserCount();
        this.trackEvent(INLINE_ACTION_EVENTS.DOWNLOAD_SUCCESS, { assetId: this.resultAssetId, fileMetaData: this.filesData });
      } catch (e) {
        this.trackServerError('upload', e);
        this.serviceHandler.showErrorToast(this.uploadErrorOpts(), e, this.lanaOptions);
        return;
      }
    }
    try {
      await this.callConnector(await this.buildConnectorPayload({
        defaultPrompt: el?.dataset?.defaultPrompt,
        verb,
        connectorAssetId: this.resultAssetId,
        fileType: this.filesData.type,
      }));
    } catch (e) {
      if (e.name !== 'AbortError') {
        this.serviceHandler.showErrorToast(this.uploadErrorOpts(), e, this.lanaOptions);
      }
    }
  }

  async createErrorToast() {
    try {
      const [alertImg, closeImg] = await Promise.all([
        fetch(`${getUnityLibs()}/img/icons/alert.svg`).then((res) => res.text()),
        fetch(`${getUnityLibs()}/img/icons/close.svg`).then((res) => res.text()),
      ]);
      this.canvasArea.forEach((element) => {
        const mount = getMount(element);
        if (mount.querySelector('.alert-holder')) return;
        const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, 'Alert Text'));
        const alertIcon = createTag('div', { class: 'alert-icon' });
        alertIcon.innerHTML = alertImg;
        alertIcon.append(alertText);
        const alertClose = createTag('a', { class: 'alert-close', href: '#' });
        alertClose.innerHTML = closeImg;
        alertClose.append(createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
        const alertContent = createTag('div', { class: 'alert-content' });
        alertContent.append(alertIcon, alertClose);
        const holder = createTag('div', { class: 'alert-holder' }, createTag('div', { class: 'alert-toast' }, alertContent));
        alertClose.addEventListener('click', (e) => {
          this.preventDefault(e);
          holder.classList.remove('show');
          mount.style.pointerEvents = 'auto';
        });
        mount.append(holder);
      });
      return getMount(this.canvasArea[0])?.querySelector('.alert-holder');
    } catch {
      return null;
    }
  }

  async executeActionMaps(action, files, el) {
    if (!this.errorToastEl) this.errorToastEl = await this.createErrorToast();
    switch (action) {
      case 'upload':
        await this.uploadFile(files);
        break;
      case 'connector':
        this.trackConnectorAnalytics(el);
        await this.handleConnector(el);
        break;
      case 'download':
        this.trackEvent(INLINE_ACTION_EVENTS.DOWNLOAD, { assetId: this.resultAssetId, action: 'redirect' });
        await this.handleConnector(el, true);
        break;
      case 'reupload':
        this.trackEvent(INLINE_ACTION_EVENTS.TRY_AGAIN, { assetId: this.resultAssetId, fileMetaData: this.filesData });
        this.widgetRef?.openFilePicker();
        break;
      case 'interrupt':
        await this.cancelUploadOperation();
        break;
      default:
        break;
    }
  }

  bindUploadAnalytics(b) {
    b.querySelectorAll('.upload-action-container .action-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.trackEvent(INLINE_ACTION_EVENTS.UPLOAD_ASSET_CTA, { fileMetaData: this.filesData });
      });
    });
    b.querySelectorAll('.ia-dropzone, .drop-zone.ia-dropzone').forEach((dropZone) => {
      dropZone.addEventListener('click', (e) => {
        if (e.target.closest('.upload-action-container')) return;
        this.trackEvent(INLINE_ACTION_EVENTS.DRAG_AND_DROP, { fileMetaData: this.filesData });
      });
      dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer?.files?.length) {
          this.trackEvent(INLINE_ACTION_EVENTS.DRAG_AND_DROP, { fileMetaData: this.filesData });
        }
      });
    });
  }

  isInitialState() {
    return this.widgetRef?.widget?.dataset?.state === InlineActionState.INITIAL;
  }

  openFilePicker(block = this.block) {
    block?.querySelector('.ia-file-input')?.click();
  }

  bindInteractiveAreaDrag(block = this.block) {
    const dragTarget = block?.querySelector('.interactive-area');
    const widget = block?.querySelector('.ia-widget');
    const dropZone = block?.querySelector('.drop-zone.ia-dropzone');
    const fileInput = block?.querySelector('.ia-file-input');
    if (!dragTarget || !widget || !dropZone || !fileInput) return;

    let activeDropZone;
    const setActive = () => {
      if (!this.isInitialState() || activeDropZone === dropZone) return;
      activeDropZone?.classList.remove('active');
      (activeDropZone = dropZone).classList.add('active');
    };
    const clearActive = () => {
      activeDropZone?.classList.remove('active');
      activeDropZone = null;
    };
    const onDrag = (event, fn) => {
      if (!this.isInitialState()) return;
      event.preventDefault();
      fn?.(event);
    };

    dragTarget.addEventListener('dragenter', (e) => onDrag(e, setActive));
    dragTarget.addEventListener('dragover', (e) => onDrag(e, () => {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setActive();
    }));
    dragTarget.addEventListener('dragleave', (e) => onDrag(e, clearActive));
    dragTarget.addEventListener('drop', (e) => onDrag(e, () => {
      setActive();
      const files = e.dataTransfer?.files;
      if (files?.length) {
        try { fileInput.files = files; } catch { /* FileList assignment unsupported */ }
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      clearActive();
    }));
    dropZone.addEventListener('drop', clearActive);
    ['dragend', 'drop'].forEach((type) => {
      document.addEventListener(type, clearActive);
      window.addEventListener(type, clearActive);
    });
  }

  bindUploadDropZone(el, action, block = this.block) {
    el.setAttribute('tabindex', '-1');
    el.addEventListener('dragover', (e) => {
      if (!this.isInitialState()) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      el.classList.add('active');
    });
    el.addEventListener('dragleave', () => {
      if (!this.isInitialState()) return;
      el.classList.remove('active');
    });
    el.addEventListener('drop', async (e) => {
      if (!this.isInitialState()) return;
      this.preventDefault(e);
      el.classList.remove('active');
      await this.executeActionMaps(action, this.extractFiles(e));
    });
    el.addEventListener('click', (e) => {
      if (!this.isInitialState()) return;
      e.stopPropagation();
      this.openFilePicker(block);
    });
  }

  bindUploadActionButton(el, block = this.block) {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.isInitialState()) return;
      this.openFilePicker(block);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!this.isInitialState()) return;
        this.openFilePicker(block);
      }
    });
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    this.serviceHandler = new ServiceHandler(
      this.canvasArea,
      this.unityEl,
      this.getAdditionalHeaders.bind(this),
    );
    await this.initAnalytics();
    if (this.workflowCfg.targetCfg.showSplashScreen) this.loadTransitionScreen();
    this.bindUploadAnalytics(b);
    this.bindInteractiveAreaDrag(b);
    const handlers = {
      DIV: (el, action) => {
        if (el.classList.contains('drop-zone')) this.bindUploadDropZone(el, action, b);
      },
      A: (el) => {
        if (el.classList.contains('action-button')) this.bindUploadActionButton(el, b);
      },
      INPUT: (el, action) => {
        if (this.limits.allowedFileTypes?.length) {
          el.setAttribute('accept', this.limits.allowedFileTypes.join(','));
        }
        el.addEventListener('click', () => this.dismissErrorToast());
        el.addEventListener('change', async (e) => {
          await this.executeActionMaps(action, this.extractFiles(e));
          e.target.value = '';
        });
      },
      BUTTON: (el, action) => {
        el.addEventListener('click', async (e) => {
          if (action !== 'upload') this.preventDefault(e);
          await this.executeActionMaps(action, null, el);
        });
      },
    };

    Object.entries(actMap).forEach(([key, action]) => {
      b.querySelectorAll(key).forEach((el) => {
        const handler = handlers[el.nodeName];
        if (handler) handler(el, action);
      });
    });

    window.addEventListener('dragover', this.preventDefault.bind(this), false);
    window.addEventListener('drop', this.preventDefault.bind(this), false);
  }
}
