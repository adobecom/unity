/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs,
  getConfig,
  priorityLoad,
  isGuestUser,
  getApiCallOptions,
  getMatchedDomain,
  getLocale,
  createTag,
} from '../../../scripts/utils.js';

const DOS_SPECIAL_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL', 'COM0', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6',
  'COM7', 'COM8', 'COM9', 'LPT0', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6',
  'LPT7', 'LPT8', 'LPT9',
]);

// eslint-disable-next-line no-control-regex
const INVALID_CHARS_REGEX = /[\x00-\x1F\\/:"*?<>|]/g;
const ENDING_SPACE_PERIOD_REGEX = /[ .]+$/;
const STARTING_SPACE_PERIOD_REGEX = /^[ .]+/;

const ERROR_WARNING_ICON = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 2.75 1.75 17.25h16.5L10 2.75Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 8v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14.4" r="0.9" fill="currentColor"/></svg>';
const ERROR_CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" class="close-icon error"><g clip-path="url(#clip0_15746_2423)"><g clip-path="url(#clip1_15746_2423)"><path fill-rule="evenodd" clip-rule="evenodd" d="M17.2381 15.9994L19.6944 13.5434C19.8586 13.3793 19.9509 13.1566 19.9509 12.9245C19.951 12.6923 19.8588 12.4696 19.6946 12.3054C19.5305 12.1412 19.3078 12.0489 19.0757 12.0488C18.8435 12.0488 18.6208 12.141 18.4566 12.3051L16.0002 14.7615L13.5435 12.3051C13.3793 12.141 13.1566 12.0489 12.9245 12.049C12.6923 12.0491 12.4697 12.1414 12.3057 12.3056C12.1416 12.4698 12.0495 12.6925 12.0496 12.9246C12.0497 13.1568 12.142 13.3794 12.3062 13.5434L14.7622 15.9994L12.3062 18.4555C12.1427 18.6197 12.051 18.8421 12.0512 19.0738C12.0515 19.3055 12.1436 19.5277 12.3074 19.6916C12.4711 19.8556 12.6933 19.9478 12.925 19.9482C13.1567 19.9486 13.3791 19.8571 13.5435 19.6938L16.0002 17.2374L18.4566 19.6938C18.6208 19.8579 18.8435 19.9501 19.0756 19.9501C19.3078 19.95 19.5305 19.8577 19.6946 19.6935C19.8588 19.5293 19.9509 19.3066 19.9509 19.0745C19.9509 18.8423 19.8586 18.6196 19.6944 18.4555L17.2381 15.9994Z" fill="white"></path></g></g><defs><clipPath id="clip0_15746_2423"><rect width="8" height="8" fill="white" transform="translate(12 12)"></rect></clipPath><clipPath id="clip1_15746_2423"><rect width="8" height="8" fill="white" transform="translate(12 12)"></rect></clipPath></defs></svg>';

export default class ActionBinder {
  static SINGLE_FILE_ERROR_MESSAGES = {
    UNSUPPORTED_TYPE: 'validation_error_unsupported_type',
    EMPTY_FILE: 'validation_error_empty_file',
    FILE_TOO_LARGE: 'validation_error_file_too_large',
    SAME_FILE_TYPE: 'validation_error_file_same_type',
    OVER_MAX_PAGE_COUNT: 'upload_validation_error_max_page_count',
    UNDER_MIN_PAGE_COUNT: 'upload_validation_error_min_page_count',
  };

  static MULTI_FILE_ERROR_MESSAGES = {
    UNSUPPORTED_TYPE: 'validation_error_unsupported_type_multi',
    EMPTY_FILE: 'validation_error_empty_file_multi',
    FILE_TOO_LARGE: 'validation_error_file_too_large_multi',
    SAME_FILE_TYPE: 'validation_error_file_same_type_multi',
    OVER_MAX_PAGE_COUNT: 'upload_validation_error_max_page_count_multi',
  };

  static ERROR_MAP = {
    error_generic: -1,
    pre_upload_error_fetch_redirect_url: -53,
    pre_upload_error_fetching_access_token: -54,
    pre_upload_error_create_asset: -55,
    pre_upload_error_transition_screen: -57,
    pre_upload_error_direct_upload: -58,
    validation_error_validate_files: -100,
    validation_error_unsupported_type: -101,
    validation_error_empty_file: -102,
    validation_error_file_too_large: -103,
    validation_error_only_accept_one_file: -104,
    validation_error_file_same_type: -105,
    validation_error_unsupported_type_multi: -200,
    validation_error_empty_file_multi: -201,
    validation_error_file_too_large_multi: -202,
    validation_error_max_num_files: -204,
    upload_validation_error_duplicate_asset: -304,
    upload_error_max_quota_exceeded: -400,
    upload_error_no_storage_provision: -401,
    upload_error_chunk_upload: -402,
    upload_error_finalize_asset: -403,
    upload_error_redirect_to_app: -500,
    upload_warn_chunk_upload: -600,
    upload_warn_chunk_upload_exception: -601,
    upload_warn_delete_asset: -603,
    warn_fetch_experiment: -605,
    prompt_error_max_length: -700,
  };

  static ERROR_SELECTOR_MAP = {
    validation_error_unsupported_type: '.icon-error-filetype',
    validation_error_unsupported_type_multi: '.icon-error-filetype-multi',
    validation_error_file_same_type: '.icon-error-filetype',
    validation_error_file_same_type_multi: '.icon-error-filetype-multi',
    validation_error_empty_file: '.icon-error-emptyfile',
    validation_error_empty_file_multi: '.icon-error-emptyfile-multi',
    validation_error_file_too_large: '.icon-error-filesize',
    validation_error_file_too_large_multi: '.icon-error-filesize',
    validation_error_max_num_files: '.icon-error-filecount',
    validation_error_only_accept_one_file: '.icon-error-filecount',
    upload_validation_error_max_page_count: '.icon-error-numpages',
    upload_validation_error_max_page_count_multi: '.icon-error-numpages',
    prompt_error_max_length: '.icon-error-max-char',
    upload_error_max_quota_exceeded: '.icon-error-quota',
    upload_error_no_storage_provision: '.icon-error-storage',
    upload_validation_error_duplicate_asset: '.icon-error-duplicate',
  };

  static ERROR_ANALYTICS_MAP = {
    validation_error_unsupported_type: 'error:UnsupportedFile',
    validation_error_empty_file: 'error:EmptyFile',
    validation_error_file_too_large: 'error:TooLargeFile',
    validation_error_max_num_files: 'error:max_num_files',
    validation_error_file_same_type: 'error:file_same_type',
    upload_validation_error_max_page_count: 'error:max_page_count',
    upload_validation_error_min_page_count: 'error:min_page_count',
    upload_validation_error_duplicate_asset: 'error:duplicate_asset',
    upload_error_max_quota_exceeded: 'error:max_quota_exceeded',
    upload_error_no_storage_provision: 'error:no_storage_provision',
    upload_error_chunk_upload: 'error:chunk_upload',
    upload_error_finalize_asset: 'error:finalize_asset',
    pre_upload_error_create_asset: 'error:create_asset',
    pre_upload_error_fetch_redirect_url: 'error:fetch_redirect_url',
    pre_upload_error_fetching_access_token: 'error:fetching_access_token',
    upload_warn_chunk_upload: 'warn:verb_upload_warn_chunk_upload',
    upload_warn_chunk_upload_exception: 'warn:verb_upload_warn_chunk_upload_exception',
    upload_warn_delete_asset: 'warn:verb_upload_warn_delete_asset',
    error_generic: 'error',
  };

  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.canvasArea = canvasArea;
    this.actionMap = actionMap;
    this.isUploading = false;
    this.limits = this.resolveLimits();
    this.operations = [];
    this.acrobatApiConfig = null;
    this.networkUtils = null;
    this.uploadHandler = null;
    this.splashScreenEl = null;
    this.transitionScreen = null;
    this.promiseStack = [];
    this.signedOut = undefined;
    this.tokenError = null;
    this.redirectUrl = '';
    this.filesData = {};
    this.redirectWithoutUpload = false;
    this.LOADER_LIMIT = 95;
    this.MULTI_FILE = false;
    this.multiFileFailure = null;
    this.multiFileValidationFailure = false;
    this.showInfoToast = false;
    this.uploadTimestamp = null;
    this.abortController = new AbortController();
    this.pendingFiles = [];
    this.query = '';
    this.optionValue = '';
    this.promptPrefix = '';
    this.optionKey = '';
    this.selectedStyleName = '';
    this.analyticsModule = null;
    this.sendAnalyticsToSplunk = null;
    this.verbAnalytics = null;
    this.analyticsListenersBound = false;
    this.experimentData = null;
    this.experimentViaPageConfig = false;
    this.pageConfigLocation = null;
    this.pageConfigFetched = false;
    this.pageConfigPromise = null;
    if (!this.workflowCfg.enabledFeatures?.length) {
      this.workflowCfg.enabledFeatures = [...(this.workflowCfg.supportedFeatures || [])].filter(Boolean);
    }
    this.verb = this.workflowCfg.enabledFeatures?.[0];
    const productTag = this.workflowCfg.targetCfg?.[`productTag-${this.workflowCfg.productName?.toLowerCase()}`] || 'PU';
    this.lanaOptions = { sampleRate: 1, tags: `Unity-${productTag}-PromptUpload` };
    this.initActionListeners = this.initActionListeners.bind(this);
    this.initPromise = this.initialize();
  }

  async initialize() {
    await this.isSignedOut();
  }

  async isSignedOut() {
    try {
      const result = await isGuestUser();
      if (result.error) {
        this.tokenError = result.error;
        return;
      }
      this.signedOut = result.isGuest ?? undefined;
    } catch (e) {
      this.tokenError = e;
    }
  }

  resolveLimits() {
    const cfg = this.workflowCfg.targetCfg || {};
    const verb = this.workflowCfg.enabledFeatures?.[0];
    const base = { ...(cfg.limits || {}) };
    const verbLimits = verb ? cfg[`limits-${verb}`] : null;
    if (verbLimits) Object.assign(base, verbLimits);
    return base;
  }

  setIsUploading(isUploading) {
    this.isUploading = isUploading;
  }

  getAbortSignal() {
    return this.abortController.signal;
  }

  setAssetId(assetId) {
    this.filesData.assetId = assetId;
  }

  delay(ms) {
    return new Promise((res) => { setTimeout(() => { res(); }, ms); });
  }

  isDirectUploadVerb(fileSize) {
    const verb = this.workflowCfg.enabledFeatures[0];
    const directUploadVerbs = this.workflowCfg.targetCfg.directUploadVerbs || [];
    const directUploadMaxSize = this.workflowCfg.targetCfg.directUploadMaxSize || 0;
    return directUploadVerbs.includes(verb) && fileSize != null && fileSize <= directUploadMaxSize;
  }

  getAcrobatApiConfig() {
    const base = this.pageConfigLocation ? `${this.pageConfigLocation}/api/v1` : unityConfig.apiEndPoint;
    unityConfig.acrobatEndpoint = {
      createAsset: `${base}/asset`,
      finalizeAsset: `${base}/asset/finalize`,
      getMetadata: `${base}/asset/metadata`,
      directUpload: `${base}/asset/upload`,
    };
    unityConfig.connectorApiEndPoint = `${base}/asset/connector`;
    return unityConfig;
  }

  async ensurePageConfig() {
    if (this.pageConfigFetched) return;
    this.pageConfigFetched = true;
    const verb = this.workflowCfg.enabledFeatures[0];
    const isRetry = !!this.pageConfigLocation;
    let pageConfig;
    try {
      const { fetchPageConfig } = await import('../../../scripts/utils.js');
      const { default: getExperimentData } = await import('../../../utils/experiment-provider.js');
      pageConfig = await fetchPageConfig({ product: this.workflowCfg.productName, verb });
      this.pageConfigLocation = pageConfig.location;
      if (pageConfig.config?.target?.enabled) {
        this.experimentData = await getExperimentData(pageConfig.config.target.decisionScopes);
        this.experimentViaPageConfig = true;
      } else if (!this.experimentData && this.workflowCfg.targetCfg?.experimentationOn?.includes(verb)) {
        const { getDecisionScopesForVerb } = await import('../../../utils/experiment-provider.js');
        const decisionScopes = await getDecisionScopesForVerb(verb);
        this.experimentData = await getExperimentData(decisionScopes);
      }
    } catch (error) {
      if (isRetry) {
        await this.dispatchErrorToast('warn_fetch_experiment', null, error.message, true, true, {
          code: 'warn_fetch_experiment',
          desc: error.message,
        });
      }
      this.pageConfigFetched = false;
      this.pageConfigPromise = null;
    }
    this.acrobatApiConfig = this.getAcrobatApiConfig();
  }

  getAdditionalHeaders() {
    const verb = this.MULTI_FILE ? `${this.workflowCfg.enabledFeatures[0]}MFU` : this.workflowCfg.enabledFeatures[0];
    return {
      'x-unity-dc-verb': verb,
      'x-unity-product': this.workflowCfg.productName,
      'x-unity-action': verb,
    };
  }

  async handlePreloads() {
    const parr = [];
    if (this.workflowCfg.targetCfg.showSplashScreen) {
      parr.push(`${getUnityLibs()}/core/styles/splash-screen.css`);
    }
    if (parr.length) await priorityLoad(parr);
  }

  async ensureNetworkUtils() {
    if (this.networkUtils) return this.networkUtils;
    const { default: NetworkUtils } = await import('../../../utils/NetworkUtils.js');
    this.networkUtils = new NetworkUtils();
    return this.networkUtils;
  }

  async initAnalytics() {
    if (this.analyticsModule) return;
    if (this.workflowCfg.productName?.toLowerCase() !== 'acrobat') return;
    try {
      this.analyticsModule = await import(`${getUnityLibs()}/scripts/acrobat-verb-analytics.js`);
      this.verbAnalytics = this.analyticsModule.default;
      if (this.workflowCfg.targetCfg?.sendSplunkAnalytics) {
        this.sendAnalyticsToSplunk = this.analyticsModule.sendAnalyticsToSplunk;
      }
    } catch (e) {
      window.lana?.log(`Message: Failed to load analytics module, Error: ${e}`, this.lanaOptions);
    }
  }

  logAnalyticsinSplunk(eventName, data = {}) {
    this.sendAnalyticsToSplunk?.(
      eventName,
      this.verb,
      this.workflowCfg.productName,
      data,
      `${unityConfig.apiEndPoint}/log`,
      true,
    );
  }

  async dispatchAnalyticsEvent(eventName, data = null) {
    const map = {
      uploading: 'job:uploading',
      uploaded: 'job:uploaded',
      chunk_uploaded: 'job:chunk-uploaded',
      redirectUrl: 'job:redirect-success',
      multifile: 'job:multi-file-uploading',
      cancel: 'job:cancel',
      drop: 'files-dropped',
      change: 'choose-file:open',
      generate: 'generate:clicked',
      'choose-file': 'dropzone:choose-file-clicked',
      'filepicker-shown': 'filepicker:shown',
      entry: 'entry:clicked',
      discover: 'discover:clicked',
      'prompt-click': 'promptbox:clicked',
      'style-open': 'style-selector-opened',
    };
    const analyticsName = map[eventName] || eventName;
    if (!this.analyticsModule) await this.initAnalytics();
    const meta = { ...(data || {}) };
    try { this.verbAnalytics?.(analyticsName, this.verb, this.workflowCfg.productName, meta, false); } catch (e) { /* noop */ }
    if (this.workflowCfg.targetCfg.sendSplunkAnalytics) this.logAnalyticsinSplunk(analyticsName, meta);
  }

  async resolveErrorMessage(errorType) {
    const errors = this.workflowCfg.errors || {};
    if (Object.keys(errors).length === 0) {
      try {
        const getError = (await import('../../../scripts/errors.js')).default;
        const sheetMsg = await getError(this.verb, errorType);
        if (sheetMsg) return sheetMsg;
      } catch (e) {
        window.lana?.log(`Failed to resolve error message from error sheet: ${e?.message}`, this.lanaOptions);
      }
      return 'Unable to process the request';
    }
    const selector = ActionBinder.ERROR_SELECTOR_MAP[errorType] || '.icon-error-request';
    const key = selector.replace('.icon-', '');
    const fromDom = (sel) => this.unityEl?.querySelector(sel)?.closest('li')?.textContent?.trim();
    const msg = errors[key] || fromDom(selector) || errors['error-request'] || fromDom('.icon-error-request');
    return msg || 'Unable to process the request';
  }

  async dispatchErrorToast(errorType, status, info = null, lanaOnly = false, showError = true, errorMetaData = {}) {
    const sendToSplunk = this.workflowCfg.targetCfg.sendSplunkAnalytics;
    const message = lanaOnly ? '' : await this.resolveErrorMessage(errorType);
    window.lana?.log(
      `Error Code: ${errorType}, Status: ${status}, Message: ${message}, Info: ${info}`,
      this.lanaOptions,
    );
    if (showError && !lanaOnly && message) this.showErrorToastMessage(message);
    if (!sendToSplunk) return;
    const errorData = {
      code: ActionBinder.ERROR_MAP[errorMetaData.code || errorType] || -1,
      subCode: ActionBinder.ERROR_MAP[errorMetaData.subCode] || errorMetaData.subCode || status,
      desc: errorMetaData.desc || message || info || undefined,
    };
    const analyticsName = ActionBinder.ERROR_ANALYTICS_MAP[errorType] || `error:${errorType}`;
    if (!this.analyticsModule) await this.initAnalytics();
    const meta = { ...this.filesData, errorData, errorInfo: info || undefined };
    try { this.verbAnalytics?.(analyticsName, this.verb, this.workflowCfg.productName, meta, false); } catch (e) { /* noop */ }
    this.logAnalyticsinSplunk(analyticsName, meta);
  }

  findOrCreateErrorToast() {
    const existing = this.canvasArea?.querySelector?.('.error')
      || this.block?.querySelector?.('.error')
      || document.querySelector('.error');
    if (existing) return existing;
    const host = this.block || this.canvasArea;
    if (!host) return null;
    const toast = createTag('div', { class: 'error verb-error pu-error-toast hide', role: 'alert', tabindex: '-1' });
    const icon = createTag('div', { class: 'verb-errorIcon' });
    icon.innerHTML = ERROR_WARNING_ICON;
    const closeBtn = createTag('div', { class: 'verb-errorBtn', role: 'button', tabindex: '0', 'aria-label': 'Close error' });
    closeBtn.innerHTML = ERROR_CLOSE_ICON;
    toast.append(icon, createTag('p', { class: 'verb-errorText' }), closeBtn);
    host.append(toast);
    return toast;
  }

  getStickyTopOffset() {
    const selectors = ['header.global-navigation', '.feds-localnav', '.global-navigation'];
    let bottom = 0;
    selectors.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const pos = getComputedStyle(el).position;
      if (pos !== 'fixed' && pos !== 'sticky') return;
      const rect = el.getBoundingClientRect();
      if (rect.top <= 1 && rect.bottom > bottom) bottom = rect.bottom;
    });
    return bottom;
  }

  showErrorToastMessage(message) {
    const toast = this.findOrCreateErrorToast();
    if (!toast) {
      window.lana?.log(`Message: Error toast element not found; ${message}`, this.lanaOptions);
      return;
    }
    const textEl = toast.querySelector('.verb-errorText') || toast;
    toast.classList.remove('hide');
    toast.classList.add('verb-error');
    const stickyOffset = this.getStickyTopOffset();
    if (stickyOffset) toast.style.top = `${stickyOffset + 12}px`;
    textEl.textContent = message;
    const closeBtn = toast.querySelector('.verb-errorBtn');
    if (closeBtn && !closeBtn.dataset.puBound) {
      closeBtn.dataset.puBound = 'true';
      const hide = () => { toast.classList.add('hide'); toast.classList.remove('verb-error'); };
      closeBtn.addEventListener('click', hide);
      closeBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hide(); }
      });
    }
    toast.focus();
  }

  isMixedFileTypes(files) {
    const fileTypes = new Set(files.map((file) => file.type));
    return fileTypes.size > 1 ? 'mixed' : files[0].type;
  }

  async sanitizeFileName(rawFileName) {
    try {
      const MAX_FILE_NAME_LENGTH = 255;
      let fileName = rawFileName;
      if (!fileName || fileName === '.' || fileName === '..') return '---';
      const { getExtension, removeExtension } = await import('../../../utils/FileUtils.js');
      let ext = getExtension(fileName);
      const nameWithoutExtension = removeExtension(fileName);
      ext = ext.length > 0 ? `.${ext}` : '';
      fileName = DOS_SPECIAL_NAMES.has(nameWithoutExtension.toUpperCase())
        ? `---${ext}`
        : nameWithoutExtension + ext;
      if (fileName.length > MAX_FILE_NAME_LENGTH) {
        const trimToLen = MAX_FILE_NAME_LENGTH - ext.length;
        fileName = trimToLen > 0 ? fileName.substring(0, trimToLen) + ext : fileName.substring(0, MAX_FILE_NAME_LENGTH);
      }
      fileName = fileName
        .replace(ENDING_SPACE_PERIOD_REGEX, '-')
        .replace(STARTING_SPACE_PERIOD_REGEX, '-')
        .replace(INVALID_CHARS_REGEX, '-');
      return fileName;
    } catch (error) {
      await this.dispatchErrorToast('error_generic', 500, `Error renaming file: ${rawFileName}`, false, true, {
        code: 'error_generic',
        subCode: error.name,
        desc: error.message,
      });
      return '---';
    }
  }

  async getMimeType(file) {
    const { getMimeType } = await import('../../../utils/FileUtils.js');
    return getMimeType(file.name);
  }

  async validateFiles(files) {
    const errorMessages = files.length === 1
      ? ActionBinder.SINGLE_FILE_ERROR_MESSAGES
      : ActionBinder.MULTI_FILE_ERROR_MESSAGES;
  
    const validFiles = [];
    const errorTypes = new Set();
    let allFilesFailed = true;
  
    if (this.limits.maxNumFiles && files.length > this.limits.maxNumFiles) {
      await this.dispatchErrorToast(
        'validation_error_max_num_files',
        null,
        `Maximum ${this.limits.maxNumFiles} files allowed`,
        false,
        true,
        {
          code: 'validation_error_validate_files',
          subCode: 'validation_error_max_num_files',
        },
      );
      return { isValid: false, validFiles };
    }
  
    for (const file of files) {
      let fail = false;
  
      if (this.limits.allowedFileTypes && !this.limits.allowedFileTypes.includes(file.type)) {
        fail = true;
        errorTypes.add(errorMessages.UNSUPPORTED_TYPE);
      } else if (!file.size) {
        fail = true;
        errorTypes.add(errorMessages.EMPTY_FILE);
      } else if (this.limits.maxFileSize && file.size > this.limits.maxFileSize) {
        fail = true;
        errorTypes.add(errorMessages.FILE_TOO_LARGE);
      }
  
      if (!fail) {
        allFilesFailed = false;
        validFiles.push(file);
      }
    }
    if (allFilesFailed) {
      const firstErrorType = Array.from(errorTypes)[0];
      await this.dispatchErrorToast(
        firstErrorType,
        null,
        null,
        false,
        true,
        {
          code: 'validation_error_validate_files',
          subCode: firstErrorType,
        },
      );
      return { isValid: false, validFiles };
    }
    return { isValid: true, validFiles };
  }

  getComputedRedirectParams(queryString) {
    const params = this.workflowCfg.targetCfg?.redirectParams;
    if (!params) return queryString;
    let updatedQuery = queryString || '';
    Object.entries(params).forEach(([key, cfg]) => {
      if (cfg.source !== 'pageUrlPath') return;
      const path = window.location.pathname;
      const after = cfg.stripPrefix ? path.split(cfg.stripPrefix)[1] : path.slice(1);
      if (!after) return;
      const value = cfg.transform === 'reverseSegments'
        ? after.split('/').filter(Boolean).reverse().join('_')
        : after;
      const encodedValue = encodeURIComponent(value);
      const paramRegex = new RegExp(`(^|&)(${key}=)[^&]*`);
      if (paramRegex.test(updatedQuery)) updatedQuery = updatedQuery.replace(paramRegex, `$1${key}=${encodedValue}`);
      else updatedQuery = updatedQuery ? `${updatedQuery}&${key}=${encodedValue}` : `${key}=${encodedValue}`;
    });
    return updatedQuery;
  }

  async getRedirectUrl(cOpts) {
    await this.ensureNetworkUtils();
    const postOpts = await getApiCallOptions('POST', unityConfig.apiKey, this.getAdditionalHeaders() || {}, { body: JSON.stringify(cOpts) });
    this.promiseStack.push(
      this.networkUtils.fetchFromServiceWithRetry(this.acrobatApiConfig.connectorApiEndPoint, postOpts),
    );
    await Promise.all(this.promiseStack)
      .then(async (resArr) => {
        const { response } = resArr[resArr.length - 1];
        if (!response?.url) throw new Error('Error connecting to App');
        let redirectUrl = response.url;
        if (getMatchedDomain(this.workflowCfg.targetCfg.domainMap) === 'acrobat') {
          const localePrefix = getConfig()?.locale?.prefix?.replace('/', '');
          if (localePrefix) {
            const url = new URL(response.url);
            if (!url.pathname.startsWith(`/${localePrefix}/`)) {
              url.pathname = `/${localePrefix}${url.pathname}`.replace(/\/+/g, '/');
            }
            redirectUrl = url.href;
          }
        }
        this.redirectUrl = redirectUrl;
      })
      .catch(async (e) => {
        await this.showTransitionScreen();
        await this.dispatchErrorToast('pre_upload_error_fetch_redirect_url', e.status || 500, `Exception thrown when retrieving redirect URL. Message: ${e.message}`, false, e.showError, {
          code: 'pre_upload_error_fetch_redirect_url',
          subCode: e.status,
          desc: e.message,
        });
      });
  }

  async handleRedirect(cOpts, filesData) {
    if (this.query) {
      cOpts.query = this.promptPrefix
        ? `${this.promptPrefix} ${this.query}`
        : this.query;
    }
    if (this.optionValue && this.optionKey) cOpts.payload[this.optionKey] = this.optionValue;
    [cOpts.payload.referrer] = this.workflowCfg.enabledFeatures;
    try {
      cOpts.payload.newUser = !localStorage.getItem('unity.user');
      const numAttempts = parseInt(localStorage.getItem(`${this.workflowCfg.enabledFeatures[0]}_attempts`), 10) || 0;
      cOpts.payload.attempts = { 0: '1st', 1: '2nd' }[numAttempts] || '2+';
    } catch (e) {
      cOpts.payload.newUser = true;
      cOpts.payload.attempts = '1st';
    }
    if (this.experimentData && (this.experimentViaPageConfig || this.workflowCfg.targetCfg?.experimentationOn?.includes(this.workflowCfg.enabledFeatures[0]))) {
      cOpts.payload.variationId = this.experimentData.variationId;
    }
    await this.getRedirectUrl(cOpts);
    if (!this.redirectUrl) return false;
    const [baseUrl, queryString] = this.redirectUrl.split('?');
    const additionalParams = unityConfig.env === 'stage' ? `${window.location.search.slice(1)}&` : '';
    const updatedQuery = this.getComputedRedirectParams(queryString);
    this.redirectUrl = `${baseUrl}?${additionalParams}${updatedQuery}`;
    this.dispatchAnalyticsEvent('redirectUrl', { ...filesData, redirectUrl: this.redirectUrl });
    return true;
  }

  async initUploadHandler() {
    await this.ensureNetworkUtils();
    const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-acrobat/upload-handler.js`);
    this.uploadHandler = new UploadHandler(this, this.networkUtils);
  }

  async handleSingleFileUpload(files) {
    this.filesData = { ...this.filesData, uploadType: 'sfu' };
    if (this.signedOut) await this.uploadHandler.singleFileGuestUpload(files[0], this.filesData);
    else await this.uploadHandler.singleFileUserUpload(files[0], this.filesData);
  }

  async handleMultiFileUpload(files) {
    this.MULTI_FILE = true;
    this.LOADER_LIMIT = 65;
    this.filesData = { ...this.filesData, uploadType: 'mfu' };
    this.dispatchAnalyticsEvent('multifile', this.filesData);
    if (this.signedOut) await this.uploadHandler.multiFileGuestUpload(files, this.filesData);
    else await this.uploadHandler.multiFileUserUpload(files, this.filesData);
  }

  async filterFilesWithPdflite(files) {
    if (!this.limits.pageLimit) return files;
    try {
      const { validateFilesWithPdflite, getPageCountErrorCode } = await import('../../../scripts/pdflite-validator.js');
      const errorMessages = this.MULTI_FILE ? ActionBinder.MULTI_FILE_ERROR_MESSAGES : ActionBinder.SINGLE_FILE_ERROR_MESSAGES;
      const { passed, failed, results } = await validateFilesWithPdflite(files, this.limits);
      if (failed && failed.length > 0) {
        const errorInfo = getPageCountErrorCode(failed, results, this.MULTI_FILE, errorMessages);
        if (errorInfo?.shouldDispatch && errorInfo.errorCode) {
          await this.dispatchErrorToast(errorInfo.errorCode, null, null, false, true, { code: errorInfo.errorCode });
          if (errorInfo.returnEmpty) return [];
        }
        if (errorInfo?.setValidationFailure) this.multiFileValidationFailure = true;
      }
      return passed;
    } catch (error) {
      await this.dispatchErrorToast('error_generic', 500, `Exception during PDF validation: ${error.message}`, true);
      return files;
    }
  }

  async validateWordFilePageCount(files) {
    if (!this.limits.pageLimit?.maxNumPages || files.length === 0) return files;
    try {
      const file = files[0];
      let pageCount = null;
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { getDocxPageCount } = await import('../../../scripts/docx-validator.js');
        pageCount = await getDocxPageCount(file);
      } else if (file.type === 'application/msword') {
        const { getDocPageCount } = await import('../../../scripts/doc-validator.js');
        pageCount = await getDocPageCount(file);
      }
      if (pageCount !== null && pageCount > this.limits.pageLimit.maxNumPages) {
        const errorCode = ActionBinder.SINGLE_FILE_ERROR_MESSAGES.OVER_MAX_PAGE_COUNT;
        await this.dispatchErrorToast(errorCode, null, null, false, true, { code: errorCode });
        return [];
      }
    } catch (error) {
      await this.dispatchErrorToast('error_generic', 500, `Exception during Word page count validation: ${error.message}`, true);
    }
    return files;
  }

  async handleFileUpload(files) {
    const sanitizedFiles = await Promise.all(files.map(async (file) => {
      const sanitizedFileName = await this.sanitizeFileName(file.name);
      const mimeType = (await this.getMimeType(file)) || file.type;
      return new File([file], sanitizedFileName, { type: mimeType, lastModified: file.lastModified });
    }));
    this.MULTI_FILE = sanitizedFiles.length > 1;
    const prevalidatedFiles = await this.filterFilesWithPdflite(sanitizedFiles);
    if (prevalidatedFiles.length === 0) return;
    const wordValidatedFiles = await this.validateWordFilePageCount(prevalidatedFiles);
    if (wordValidatedFiles.length === 0) return;
    const { isValid, validFiles } = await this.validateFiles(wordValidatedFiles);
    if (!isValid) return;
    await (this.pageConfigPromise || this.ensurePageConfig());
    await this.initUploadHandler();
    if (validFiles.length === 1) await this.handleSingleFileUpload(validFiles);
    else await this.handleMultiFileUpload(validFiles);
  }

  async showTransitionScreen() {
    if (!this.transitionScreen) return;
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    await this.transitionScreen.showSplashScreen();
  }

  async loadTransitionScreen() {
    if (this.transitionScreen) return;
    try {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(this.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
      await this.transitionScreen.delayedSplashLoader();
    } catch (error) {
      await this.dispatchErrorToast('pre_upload_error_transition_screen', null, `Error loading transition screen, Error: ${error}`, false, true, { code: 'pre_upload_error_transition_screen' });
      throw error;
    }
  }

  async runProgressBarUpdate(splashLayer) {
    try {
      this.transitionScreen.updateProgressBar(splashLayer, 100);
    } catch (error) {
      window.lana?.log(`Message: Unable to update progress bar, Error: ${error}`, this.lanaOptions);
    }
  }

  async continueInApp() {
    if (!this.redirectUrl || !(this.operations.length || this.redirectWithoutUpload)) return;
    if (!this.transitionScreen) {
      const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
      this.transitionScreen = new TransitionScreen(this.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    }
    this.LOADER_LIMIT = 100;
    this.transitionScreen.LOADER_LIMIT = 100;
    this.transitionScreen.clearProgressBarHandler();
    const splashLayer = this.transitionScreen.splashScreenEl;
    if (this.isDirectUploadVerb(this.filesData?.size)) await this.runProgressBarUpdate(splashLayer);
    else this.transitionScreen.updateProgressBar(splashLayer, 100);
    try {
      await this.delay(500);
      const [baseUrl, queryString] = this.redirectUrl.split('?');
      if (getMatchedDomain(this.workflowCfg.targetCfg.domainMap) === 'acrobat') {
        document.cookie = `dc_fl=1;domain=.adobe.com;path=/;expires=${new Date(Date.now() + 30 * 1000).toUTCString()}`;
      }
      window.location.href = `${baseUrl}?${this.redirectWithoutUpload === false ? `UTS_Uploaded=${this.uploadTimestamp}&` : ''}redirectTime=${Date.now()}&${queryString}`;
    } catch (e) {
      await this.transitionScreen.showSplashScreen();
      await this.dispatchErrorToast('error_generic', 500, `Exception thrown when redirecting to product; ${e.message}`, false, e.showError, {
        code: 'upload_error_redirect_to_app',
        subCode: e.status,
        desc: e.message,
      });
    }
  }

  validatePrompt(query) {
    const maxCharLimit = this.limits?.['max-char-limit'] ?? 1024;
    if (query.length > maxCharLimit) {
      this.dispatchErrorToast('prompt_error_max_length', null, 'Prompt too long', false, true, { code: 'prompt_error_max_length' });
      return false;
    }
    return true;
  }

  extractFiles(e) {
    const files = [];
    let totalFileSize = 0;
    if (e.dataTransfer?.items) {
      [...e.dataTransfer.items].forEach((item) => {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          files.push(file);
          totalFileSize += file.size;
        }
      });
    } else if (e.target?.files) {
      [...e.target.files].forEach((file) => {
        files.push(file);
        totalFileSize += file.size;
      });
    }
    return { files, totalFileSize };
  }

  getWidgetWrap() {
    const searchRoot = this.canvasArea || this.block;
    return searchRoot?.querySelector?.('.ex-unity-wrap') || searchRoot;
  }

  bindMarqueeDropTarget() {
    const dropTarget = this.block;
    const highlightEl = this.getWidgetWrap()?.querySelector('.interactive-area') || this.getWidgetWrap();
    if (!dropTarget || dropTarget.dataset.puDropBound) return;
    dropTarget.dataset.puDropBound = 'true';
    let dragDepth = 0;
    const hasFilePayload = (e) => !!e?.dataTransfer?.types && [...e.dataTransfer.types].includes('Files');
    const setHighlight = (on) => highlightEl?.classList.toggle('drag-over', !!on);
    dropTarget.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (!hasFilePayload(e)) return;
      dragDepth += 1;
      setHighlight(true);
    });
    dropTarget.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!hasFilePayload(e)) return;
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setHighlight(true);
    });
    dropTarget.addEventListener('dragleave', (e) => {
      if (!hasFilePayload(e)) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setHighlight(false);
    });
    dropTarget.addEventListener('drop', async (e) => {
      if (!hasFilePayload(e)) return;
      e.preventDefault();
      dragDepth = 0;
      setHighlight(false);
      const { files } = this.extractFiles(e);
      this.dispatchAnalyticsEvent('drop');
      this.dispatchEntryAnalytics();
      await this.uploadFilesImmediately(files, 'drop');
    });
  }

  resetUploadState() {
    this.pendingFiles = [];
    this.operations = [];
    this.filesData = {};
    this.redirectUrl = '';
    this.redirectWithoutUpload = false;
  }

  readPromptState() {
    const wrap = this.getWidgetWrap();
    const searchRoot = this.canvasArea || this.block;
    const input = searchRoot?.querySelector?.('#pbuPromptInput') || searchRoot?.querySelector?.('.inp-field');
    this.query = input?.value?.trim() || '';
    this.optionValue = wrap?.getAttribute('data-selected-option-value') || '';
    this.promptPrefix = wrap?.getAttribute('data-prompt-prefix') || '';
    this.optionKey = wrap?.getAttribute('data-selected-option-key') || '';
    this.selectedStyleName = wrap?.querySelector('.selected-model .model-name')?.textContent?.trim() || '';
    this.ctaStaticLink = wrap?.getAttribute('data-cta-static-link') || '';
  }

  dispatchStyleSelection() {
    if (this.selectedStyleName) this.dispatchAnalyticsEvent(`style-selector:${this.selectedStyleName}`);
  }

  dispatchEntryAnalytics() {
    this.dispatchAnalyticsEvent('entry');
    this.dispatchAnalyticsEvent('discover');
  }

  async continueWithPrompt() {
    this.promiseStack = [];
    await (this.pageConfigPromise || this.ensurePageConfig());
    const cOpts = {
      targetProduct: this.workflowCfg.productName,
      payload: {
        languageRegion: this.workflowCfg.langRegion,
        languageCode: this.workflowCfg.langCode,
        verb: this.workflowCfg.enabledFeatures[0],
        action: 'asset-upload',
        locale: getLocale(),
      },
    };
    this.redirectWithoutUpload = true;
    this.dispatchStyleSelection();
    const ok = await this.handleRedirect(cOpts, {});
    if (ok) await this.continueInApp();
  }

  async processFileUpload(eventName = 'generate') {
    this.promiseStack = [];
    const files = this.pendingFiles;
    const totalFileSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    this.filesData = {
      type: this.isMixedFileTypes(files),
      size: totalFileSize,
      count: files.length,
      uploadType: files.length > 1 ? 'mfu' : 'sfu',
    };
    this.dispatchAnalyticsEvent(eventName, this.filesData);
    this.dispatchStyleSelection();
    try {
      await this.handleFileUpload(files);
      await this.continueInApp();
    } finally {
      if (!this.redirectUrl) this.resetUploadState();
    }
  }

  async runPreflight() {
    await this.initPromise;
    await this.loadTransitionScreen();
    await this.handlePreloads();
    if (this.signedOut === undefined && this.tokenError) {
      await this.dispatchErrorToast('pre_upload_error_fetching_access_token', null, `Could not fetch access token; Error: ${JSON.stringify(this.tokenError.originalError || this.tokenError)}`, false, true, { code: 'pre_upload_error_fetching_access_token' });
      return false;
    }
    if (!this.workflowCfg.enabledFeatures?.length) {
      await this.dispatchErrorToast('error_generic', 500, 'Invalid or missing verb configuration on Unity', false, true, { code: 'error_generic' });
      return false;
    }
    return true;
  }

  async uploadFilesImmediately(files, eventName = 'change') {
    try {
      if (!(await this.runPreflight())) return;
      if (!files?.length) return;
      this.pendingFiles = files;
      this.readPromptState();
      this.limits = this.resolveLimits();
      await this.processFileUpload(eventName);
    } catch (err) {
      await this.dispatchErrorToast('error_generic', 500, `Exception during upload: ${err.message}`, false, true, { code: 'error_generic', desc: err.message });
    }
  }

  async handleGenerate() {
    try {
      this.readPromptState();
      if (!this.pendingFiles.length && !this.query) {
        if (this.ctaStaticLink) window.location.href = this.ctaStaticLink;
        return;
      }
      if (!(await this.runPreflight())) return;
      if (this.query && !this.validatePrompt(this.query)) return;
      this.limits = this.resolveLimits();
      if (this.pendingFiles.length) {
        await this.processFileUpload();
      } else {
        this.dispatchAnalyticsEvent('generate');
        await this.continueWithPrompt();
      }
    } catch (err) {
      await this.dispatchErrorToast('error_generic', 500, `Exception during generate: ${err.message}`, false, true, { code: 'error_generic', desc: err.message });
    }
  }

  async cancelOperation() {
    this.redirectUrl = '';
    this.setIsUploading(false);
    this.abortController.abort();
    this.abortController = new AbortController();
    this.dispatchAnalyticsEvent('cancel', this.filesData);
    await this.showTransitionScreen();
    const e = new Error('Operation termination requested.');
    e.showError = false;
    const cancelPromise = Promise.reject(e);
    cancelPromise.catch(() => {});
    this.promiseStack.unshift(cancelPromise);
    this.resetUploadState();
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    const searchRoot = this.canvasArea || b;
    Object.entries(actMap).forEach(([selector, value]) => {
      const el = searchRoot?.querySelector?.(selector) ?? b.querySelector(selector) ?? document.querySelector(selector);
      if (!el || el.dataset.puBound) return;
      el.dataset.puBound = 'true';
      switch (el.nodeName) {
        case 'A':
        case 'BUTTON':
          el.addEventListener('click', async (e) => {
            if (value === 'interrupt') { e.preventDefault(); await this.cancelOperation(); } else if (value === 'generate') { e.preventDefault(); await this.handleGenerate(); }
          });
          if (el.nodeName === 'A') {
            el.addEventListener('keydown', (e) => {
              if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); el.click(); }
            });
          }
          break;
        case 'DIV':
          el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
          el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
          el.addEventListener('click', (e) => {
            if (e.target?.matches?.('input[type="file"]')) return;
            this.dispatchAnalyticsEvent('filepicker-shown');
            this.dispatchAnalyticsEvent('choose-file');
            this.dispatchEntryAnalytics();
          });
          el.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('drag-over');
            const { files } = this.extractFiles(e);
            this.dispatchAnalyticsEvent('drop');
            this.dispatchEntryAnalytics();
            if (value === 'upload') await this.uploadFilesImmediately(files, 'drop');
          });
          break;
        case 'INPUT':
          el.addEventListener('change', async (e) => {
            const { files } = this.extractFiles(e);
            this.dispatchAnalyticsEvent('change');
            if (value === 'upload') await this.uploadFilesImmediately(files, 'change');
            e.target.value = '';
          });
          break;
        case 'BODY': {
          const onDragOver = (e) => e.preventDefault();
          const onDrop = async (e) => {
            e.preventDefault();
            const { files } = this.extractFiles(e);
            this.dispatchAnalyticsEvent('drop');
            this.dispatchEntryAnalytics();
            await this.uploadFilesImmediately(files, 'drop');
          };
          const target = b.querySelector(this.workflowCfg.targetCfg.selector);
          if (target) {
            const observer = new IntersectionObserver(([entry]) => {
              if (entry.isIntersecting) {
                el.addEventListener('dragover', onDragOver);
                el.addEventListener('drop', onDrop);
              } else {
                el.removeEventListener('dragover', onDragOver);
                el.removeEventListener('drop', onDrop);
              }
            });
            observer.observe(target);
          }
          break;
        }
        default:
          break;
      }
    });
    const promptInput = searchRoot?.querySelector?.('#pbuPromptInput') || searchRoot?.querySelector?.('.inp-field');
    if (searchRoot && !this.analyticsListenersBound) {
      this.analyticsListenersBound = true;
      promptInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          searchRoot?.querySelector('.gen-btn')?.click();
        }
      });
      promptInput?.addEventListener('focus', () => this.dispatchAnalyticsEvent('prompt-click'), { once: true });
      searchRoot.addEventListener('pu:style-open', () => this.dispatchAnalyticsEvent('style-open'));
    }
    if (b === this.block) {
      this.bindMarqueeDropTarget();
      const preloadTransitionScreen = () => this.loadTransitionScreen();
      if ('requestIdleCallback' in window) requestIdleCallback(preloadTransitionScreen, { timeout: 3000 });
      else setTimeout(preloadTransitionScreen, 2000);
      if (!this.pageConfigPromise) this.pageConfigPromise = this.ensurePageConfig();
    }
  }
}
