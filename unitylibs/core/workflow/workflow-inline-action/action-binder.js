/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */

import {
  unityConfig,
  getUnityLibs,
  priorityLoad,
  createTag,
  getLocale,
  getHeaders,
  sendAnalyticsEvent,
  isGuestUser,
  loadImg,
} from '../../../scripts/utils.js';
import { createChunkUploadTasks } from '../../../utils/chunkingUtils.js';

const DOWNLOAD_COUNT_KEY = 'inline-action-download-count';
const WORKFLOW_NAME = 'inline-action';

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

  showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
    sendAnalyticsEvent(new CustomEvent(`Upload ${errorType} error|UnityWidget|${errorCallbackOptions.errorCode || ''}`));
    if (!errorCallbackOptions.errorToastEl) return;
    const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.closest('li')?.textContent?.trim();
    this.canvasArea.forEach((element) => {
      const mount = element.querySelector('.ia-widget') || element;
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
    this.operation = widgetRef?.meta?.operation || 'removeBackground';
    this.verb = this.getVerbFromDom();
    this.initActionListeners = this.initActionListeners.bind(this);
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

  getVerbFromDom() {
    const verbEl = this.unityEl?.querySelector('[class*="icon-verb-"]') || this.unityEl?.querySelector('[class*="icon-operation-"]');
    if (!verbEl) return undefined;
    const verbClass = Array.from(verbEl.classList).find((cls) => cls.startsWith('icon-verb-'));
    return verbClass?.slice('icon-verb-'.length);
  }

  getAdditionalHeaders() {
    const baseAction = this.workflowCfg?.supportedFeatures?.values()?.next()?.value;
    const xUnityAction = this.verb ? `${baseAction}-${this.verb}` : baseAction;
    return {
      'x-unity-product': this.workflowCfg?.productName,
      'x-unity-action': xUnityAction,
    };
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
    this.sendAnalyticsToSplunk?.(eventName, this.workflowCfg.productName, { ...data, workflow: WORKFLOW_NAME }, `${unityConfig.apiEndPoint}/log`);
  }

  async initAnalytics() {
    if (!this.sendAnalyticsToSplunk && this.workflowCfg.targetCfg.sendSplunkAnalytics) {
      this.sendAnalyticsToSplunk = (await import(`${getUnityLibs()}/scripts/analytics.js`)).default;
    }
  }

  extractFiles(e) {
    const files = [];
    if (e.dataTransfer?.items) {
      [...e.dataTransfer.items].forEach((item) => { if (item.kind === 'file') files.push(item.getAsFile()); });
    } else if (e.target?.files) {
      [...e.target.files].forEach((file) => files.push(file));
    }
    return files;
  }

  preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  handleClientUploadError(errorTypeSelector, errorCode) {
    this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: errorTypeSelector, errorCode }, '', this.lanaOptions, 'client');
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

  async uploadImgToUnity(storageUrl, blobData, fileType, signal) {
    const response = await fetch(storageUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
      ...(signal && { signal }),
    });
    if (response.status !== 200) {
      const error = new Error('Failed to upload image to Unity');
      error.status = response.status;
      throw error;
    }
  }

  onUploadProgress(ratio) {
    this.widgetRef?.setProgress?.(Math.round(ratio * 80));
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
    try {
      const resJson = await this.serviceHandler.postCallToService(
        this.apiConfig.endPoint.assetUpload,
        { body: JSON.stringify(assetDetails) },
        { errorToastEl: this.errorToastEl, errorType: '.icon-error-request' },
      );
      const { id, href, blocksize, uploadUrls } = resJson;
      this.assetId = id;
      const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
      const uploadHandler = new UploadHandler(this, this.serviceHandler);
      if (blocksize && uploadUrls?.length) {
        const totalChunks = Math.ceil(file.size / blocksize);
        const { failedChunks } = await createChunkUploadTasks(
          uploadUrls,
          file,
          blocksize,
          uploadHandler.uploadFileToUnity.bind(uploadHandler),
          signal,
          {
            assetId: id,
            fileType: file.type,
            onChunkComplete: useInlineProgress
              ? (i) => this.onUploadProgress((i + 1) / totalChunks)
              : undefined,
          },
        );
        if (failedChunks?.size > 0) {
          if (signal.aborted) return false;
          throw new Error('Chunk upload failed');
        }
        await uploadHandler.scanImgForSafetyWithRetry(id, signal);
      } else {
        await this.uploadImgToUnity(href, file, file.type, signal);
        await this.scanImgForSafety(id, signal);
      }
      return true;
    } catch (e) {
      if (signal.aborted || e.name === 'AbortError') return false;
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, e, this.lanaOptions);
      return false;
    }
  }

  async scanImgForSafety(assetId, signal) {
    const res = await this.serviceHandler.postCallToService(
      this.apiConfig.endPoint.acmpCheck,
      { body: JSON.stringify({ assetId, targetProduct: this.workflowCfg.productName }), ...(signal && { signal }) },
      {},
      false,
    );
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      await new Promise((r) => { setTimeout(r, 1000); });
      return this.scanImgForSafety(assetId, signal);
    }
  }

  async removeBackground() {
    this.widgetRef?.setProgress?.(85);
    const body = JSON.stringify({ surfaceId: 'Unity', assets: [{ id: this.assetId }] });
    const res = await this.serviceHandler.postCallToService(
      this.apiConfig.endPoint.removeBackground,
      { body },
      { errorToastEl: this.errorToastEl, errorType: '.icon-error-request' },
    );
    this.resultAssetId = res.assetId;
    this.resultUrl = res.outputUrl;
    this.widgetRef?.setProgress?.(100);
    return res;
  }

  resolveConnectorVerb(el, isDownload = false, downloadsLocally = false) {
    if (isDownload) return downloadsLocally ? 'aiPhotoEditor' : 'download';
    if (el?.classList?.contains('ia-edit-in-firefly')) return 'aiPhotoEditor';
    if (el?.dataset?.nba) return el.dataset.nba;
    return undefined;
  }

  getConnectorWorkflow() {
    return this.workflowCfg?.supportedFeatures?.values()?.next()?.value;
  }

  async buildConnectorPayload(file, { defaultPrompt, userCount, verb, connectorAssetId } = {}) {
    const { getCgenQueryParams } = await import(`${getUnityLibs()}/utils/cgen-utils.js`);
    const connectorVerb = verb ?? this.operation;
    const query = defaultPrompt?.trim();
    return {
      assetId: connectorAssetId,
      targetProduct: this.workflowCfg.productName,
      ...(query && { query }),
      payload: {
        workflow: this.getConnectorWorkflow(),
        action: 'asset-upload',
        operation: this.operation,
        verb: connectorVerb,
        widgetType: 'nba',
        locale: getLocale(),
        additionalQueryParams: getCgenQueryParams(this.unityEl),
        type: file?.type,
        ...(userCount != null && { userCount }),
      },
    };
  }

  async callConnector(cOpts) {
    const res = await this.serviceHandler.postCallToService(
      this.apiConfig.connectorApiEndPoint,
      { body: JSON.stringify(cOpts) },
      { errorToastEl: this.errorToastEl, errorType: '.icon-error-request' },
    );
    if (!res?.url) {
      const error = new Error('Error connecting to App');
      error.status = res?.status;
      throw error;
    }
    window.open(res.url, '_blank');
    return res;
  }

  static downloadFilename(mimeType = 'image/png') {
    const extMap = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
    };
    const ext = extMap[mimeType] || 'png';
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
    if (this.resultBlob) return this.resultBlob;
    return this.getImageBlobData(url);
  }

  async cacheResultBlob(url) {
    try {
      this.resultBlob = await this.resolveDownloadBlob(url);
    } catch {
      this.resultBlob = null;
    }
  }

  downloadBlob(blob, mimeType = 'image/png') {
    const filename = ActionBinder.downloadFilename(mimeType);
    const objUrl = URL.createObjectURL(blob);
    const a = createTag('a', {
      href: objUrl,
      download: filename,
    });
    document.body.append(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(objUrl);
    }, 200);
  }

  async triggerDownload(url) {
    const blob = await this.resolveDownloadBlob(url);
    const mimeType = blob.type || 'image/png';
    this.downloadBlob(blob, mimeType);
  }

  async signedInFlow(file) {
    if (!this.transitionScreen) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(null, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg, false);
    }
    await this.transitionScreen.showSplashScreen(true);
    const ok = await this.uploadAsset(file, false);
    if (!ok) return;
    this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, 100);
    await this.callConnector(await this.buildConnectorPayload(file, {
      verb: this.operation,
      connectorAssetId: this.assetId,
    }));
  }

  async anonymousFlow(file) {
    this.widgetRef?.setState('loading');
    this.widgetRef?.setProgress(0);
    try {
      const ok = await this.uploadAsset(file, true);
      if (!ok) {
        this.widgetRef?.setState('initial');
        return;
      }
      await this.removeBackground();
      this.widgetRef?.setResultUrl(this.resultUrl);
      await loadImg(this.widgetRef.widget.querySelector('.ia-result-img'));
      this.widgetRef?.setState('complete');
      this.cacheResultBlob(this.resultUrl).catch(() => {});
    } catch (e) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, e, this.lanaOptions);
      this.widgetRef?.setState('initial');
    }
  }

  async uploadFile(files) {
    const file = await this.validateFile(files);
    if (!file) return;
    this.assetId = null;
    this.resultAssetId = null;
    this.resultUrl = null;
    this.resultBlob = null;
    this.filesData = { type: file.type, name: file.name };
    sendAnalyticsEvent(new CustomEvent('Uploading Started|UnityWidget'));
    const { isGuest } = await isGuestUser();
    if (isGuest === false) await this.signedInFlow(file);
    else await this.anonymousFlow(file);
  }

  async handleConnector(el, isDownload = false) {
    let userCount = this.getUserCount();
    const defaultPrompt = el?.dataset?.defaultPrompt;
    const downloadsLocally = isDownload && userCount < 100;
    const verb = this.resolveConnectorVerb(el, isDownload, downloadsLocally);
    if (downloadsLocally) {
      try {
        await this.triggerDownload(this.resultUrl);
        userCount = this.incrementUserCount();
      } catch (e) {
        this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-request' }, e, this.lanaOptions);
        return;
      }
    }
    await this.callConnector(await this.buildConnectorPayload(this.filesData, {
      defaultPrompt,
      userCount,
      verb,
      connectorAssetId: this.resultAssetId,
    }));
  }

  async createErrorToast() {
    try {
      const [alertImg, closeImg] = await Promise.all([
        fetch(`${getUnityLibs()}/img/icons/alert.svg`).then((res) => res.text()),
        fetch(`${getUnityLibs()}/img/icons/close.svg`).then((res) => res.text()),
      ]);
      this.canvasArea.forEach((element) => {
        const mount = element.querySelector('.ia-widget') || element;
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
        const alertToast = createTag('div', { class: 'alert-toast' }, alertContent);
        const holder = createTag('div', { class: 'alert-holder' }, alertToast);
        alertClose.addEventListener('click', (e) => {
          this.preventDefault(e);
          holder.classList.remove('show');
          mount.style.pointerEvents = 'auto';
        });
        mount.append(holder);
      });
      const root = this.canvasArea[0];
      const mount = root?.querySelector('.ia-widget') || root;
      return mount?.querySelector('.alert-holder');
    } catch (e) {
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
        await this.handleConnector(el);
        break;
      case 'download':
        await this.handleConnector(el, true);
        break;
      case 'reupload':
        this.widgetRef?.openFilePicker();
        break;
      default:
        break;
    }
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    this.serviceHandler = new ServiceHandler(this.canvasArea, this.unityEl, this.getAdditionalHeaders.bind(this));
    await this.initAnalytics();
    if (this.workflowCfg.targetCfg.showSplashScreen) {
      await priorityLoad([`${getUnityLibs()}/core/styles/splash-screen.css`]);
    }
    Object.keys(actMap).forEach((key) => {
      b.querySelectorAll(key).forEach((el) => {
        const action = actMap[key];
        if (el.classList.contains('drop-zone') || el.classList.contains('ia-dropzone')) {
          return;
        }
        if (el.type === 'file') {
          el.addEventListener('click', () => {
            this.canvasArea.forEach((element) => {
              const mount = element.querySelector('.ia-widget') || element;
              const errHolder = mount.querySelector('.alert-holder');
              if (errHolder?.classList.contains('show')) {
                mount.style.pointerEvents = 'auto';
                errHolder.classList.remove('show');
              }
            });
          });
          el.addEventListener('change', async (e) => {
            await this.executeActionMaps('upload', this.extractFiles(e));
            e.target.value = '';
          });
          return;
        }
        el.addEventListener('click', async (e) => {
          if (action !== 'upload') this.preventDefault(e);
          await this.executeActionMaps(action, null, el);
        });
      });
    });
    window.addEventListener('dragover', this.preventDefault.bind(this), false);
    window.addEventListener('drop', this.preventDefault.bind(this), false);
  }
}
