/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs,
  priorityLoad,
  isGuestUser,
  getApiCallOptions,
} from '../../../scripts/utils.js';
import NetworkUtils from '../../../utils/NetworkUtils.js';

const DOS_SPECIAL_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL', 'COM0', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6',
  'COM7', 'COM8', 'COM9', 'LPT0', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6',
  'LPT7', 'LPT8', 'LPT9',
]);

// eslint-disable-next-line no-control-regex
const INVALID_CHARS_REGEX = /[\x00-\x1F\\/:"*?<>|]/g;
const ENDING_SPACE_PERIOD_REGEX = /[ .]+$/;
const STARTING_SPACE_PERIOD_REGEX = /^[ .]+/;

export default class ActionBinder {
  static SINGLE_FILE_ERROR_MESSAGES = {
    UNSUPPORTED_TYPE: 'validation_error_unsupported_type',
    EMPTY_FILE: 'validation_error_empty_file',
    FILE_TOO_LARGE: 'validation_error_file_too_large',
    SAME_FILE_TYPE: 'validation_error_file_same_type',
  };

  static MULTI_FILE_ERROR_MESSAGES = {
    UNSUPPORTED_TYPE: 'validation_error_unsupported_type_multi',
    EMPTY_FILE: 'validation_error_empty_file_multi',
    FILE_TOO_LARGE: 'validation_error_file_too_large_multi',
    SAME_FILE_TYPE: 'validation_error_file_same_type_multi',
  };

  static LIMITS_MAP = {
    fillsign: ['single', 'page-limit-100'],
    'compress-pdf': ['hybrid', 'allowed-filetypes-all', 'max-filesize-2-gb'],
    'add-comment': ['single'],
    'number-pages': ['single'],
    'split-pdf': ['single', 'max-filesize-1-gb', 'split-pdf-page-limits', 'signedInallowedFileTypes'],
    'crop-pages': ['single'],
    'delete-pages': ['single', 'page-limit-500'],
    'insert-pdf': ['single', 'page-limit-500'],
    'extract-pages': ['single', 'page-limit-500'],
    'reorder-pages': ['single', 'page-limit-500'],
    sendforsignature: ['single', 'max-filesize-5-mb', 'page-limit-25'],
    'pdf-to-word': ['hybrid', 'allowed-filetypes-pdf-only', 'max-filesize-250-mb'],
    'pdf-to-excel': ['hybrid', 'allowed-filetypes-pdf-only', 'max-filesize-100-mb'],
    'pdf-to-ppt': ['hybrid', 'allowed-filetypes-pdf-only', 'max-filesize-250-mb'],
    'pdf-to-image': ['hybrid', 'allowed-filetypes-pdf-only', 'max-filesize-100-mb'],
    'pdf-to-png': ['hybrid', 'allowed-filetypes-pdf-only', 'max-filesize-100-mb'],
    createpdf: ['hybrid', 'allowed-filetypes-all', 'max-filesize-100-mb'],
    'word-to-pdf': ['hybrid', 'allowed-filetypes-all', 'max-filesize-100-mb'],
    'excel-to-pdf': ['hybrid', 'allowed-filetypes-all', 'max-filesize-100-mb'],
    'ppt-to-pdf': ['hybrid', 'allowed-filetypes-all', 'max-filesize-100-mb'],
    'jpg-to-pdf': ['hybrid', 'allowed-filetypes-all', 'max-filesize-100-mb'],
    'png-to-pdf': ['hybrid', 'allowed-filetypes-all', 'max-filesize-100-mb'],
    'combine-pdf': ['hybrid', 'page-limit-500', 'allowed-filetypes-all', 'max-filesize-100-mb', 'max-numfiles-100'],
    'rotate-pages': ['hybrid', 'page-limit-500', 'allowed-filetypes-pdf-only', 'max-filesize-100-mb', 'max-numfiles-100'],
    'protect-pdf': ['single'],
    'ocr-pdf': ['hybrid', 'allowed-filetypes-pdf-word-excel-ppt-img-txt', 'page-limit-100', 'max-filesize-100-mb'],
    'chat-pdf': ['hybrid', 'allowed-filetypes-pdf-word-ppt-txt', 'page-limit-600', 'max-numfiles-10', 'max-filesize-100-mb'],
    'chat-pdf-student': ['hybrid', 'allowed-filetypes-pdf-word-ppt-txt', 'page-limit-600', 'max-numfiles-10', 'max-filesize-100-mb'],
    'summarize-pdf': ['single', 'allowed-filetypes-pdf-word-ppt-txt', 'page-limit-600', 'max-filesize-100-mb'],
  };

  static ERROR_MAP = {
    error_generic: -1,
    pre_upload_error_loading_verb_limits: -50,
    pre_upload_error_empty_verb_limits: -51,
    pre_upload_error_renaming_file: -52,
    pre_upload_error_fetch_redirect_url: -53,
    pre_upload_error_fetching_access_token: -54,
    pre_upload_error_create_asset: -55,
    pre_upload_error_missing_verb_config: -56,
    pre_upload_error_transition_screen: -57,
    validation_error_validate_files: -100,
    validation_error_unsupported_type: -101,
    validation_error_empty_file: -102,
    validation_error_file_too_large: -103,
    validation_error_only_accept_one_file: -104,
    validation_error_file_same_type: -105,
    validation_error_unsupported_type_multi: -200,
    validation_error_empty_file_multi: -201,
    validation_error_file_too_large_multi: -202,
    validation_error_multiple_invalid_files: -203,
    validation_error_max_num_files: -204,
    validation_error_file_same_type_multi: -206,
    upload_validation_error_max_page_count: -300,
    upload_validation_error_min_page_count: -301,
    upload_validation_error_verify_page_count: -302,
    upload_validation_error_max_page_count_multi: -303,
    upload_validation_error_duplicate_asset: -304,
    upload_error_max_quota_exceeded: -400,
    upload_error_no_storage_provision: -401,
    upload_error_chunk_upload: -402,
    upload_error_finalize_asset: -403,
    upload_error_redirect_to_app: -500,
    upload_warn_chunk_upload: -600,
    upload_warn_chunk_upload_exception: -601,
    pre_upload_warn_renamed_invalid_file_name: -602,
    upload_warn_delete_asset: -603,
    validation_warn_validate_files: -604,
    warn_fetch_experiment: -605,
  };

  static NEW_TO_OLD_ERROR_KEY_MAP = {
    error_generic: 'verb_upload_error_generic',
    pre_upload_error_loading_verb_limits: 'verb_upload_error_loading_verb_limits',
    pre_upload_error_empty_verb_limits: 'verb_upload_error_empty_verb_limits',
    pre_upload_error_renaming_file: 'verb_upload_error_renaming_file',
    pre_upload_error_fetch_redirect_url: 'verb_upload_error_fetch_redirect_url',
    validation_error_validate_files: 'verb_upload_error_validate_files',
    validation_error_unsupported_type: 'verb_upload_error_unsupported_type',
    validation_error_empty_file: 'verb_upload_error_empty_file',
    validation_error_file_too_large: 'verb_upload_error_file_too_large',
    validation_error_only_accept_one_file: 'verb_upload_error_only_accept_one_file',
    validation_error_file_same_type: 'verb_upload_error_file_same_type',
    validation_error_unsupported_type_multi: 'verb_upload_error_unsupported_type_multi',
    validation_error_empty_file_multi: 'verb_upload_error_empty_file_multi',
    validation_error_file_too_large_multi: 'verb_upload_error_file_too_large_multi',
    validation_error_multiple_invalid_files: 'verb_upload_error_multiple_invalid_files',
    validation_error_max_num_files: 'verb_upload_error_max_num_files',
    validation_error_file_same_type_multi: 'verb_upload_error_file_same_type_multi',
    upload_validation_error_max_page_count: 'verb_upload_error_max_page_count',
    upload_validation_error_min_page_count: 'verb_upload_error_min_page_count',
    upload_validation_error_verify_page_count: 'verb_upload_error_verify_page_count',
    upload_validation_error_max_page_count_multi: 'verb_upload_error_max_page_count_multi',
    upload_validation_error_duplicate_asset: 'verb_upload_error_duplicate_asset',
    upload_error_max_quota_exceeded: 'verb_upload_error_max_quota_exceeded',
    upload_error_no_storage_provision: 'verb_upload_error_no_storage_provision',
    upload_error_chunk_upload: 'verb_upload_error_chunk_upload',
    upload_error_finalize_asset: 'verb_upload_error_finalize_asset',
    upload_error_redirect_to_app: 'verb_upload_error_redirect_to_app',
    upload_warn_chunk_upload: 'verb_upload_warn_chunk_upload',
    pre_upload_warn_renamed_invalid_file_name: 'verb_warn_renamed_invalid_file_name',
    warn_delete_asset: 'verb_upload_warn_delete_asset',
    warn_fetch_experiment: 'verb_warn_fetch_experiment',
  };

  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.isUploading = false;
    this.block = wfblock;
    this.canvasArea = canvasArea;
    this.actionMap = actionMap;
    this.limits = {};
    this.operations = [];
    this.acrobatApiConfig = this.getAcrobatApiConfig();
    this.networkUtils = new NetworkUtils();
    this.uploadHandler = null;
    this.splashScreenEl = null;
    this.transitionScreen = null;
    this.promiseStack = [];
    this.signedOut = undefined;
    this.tokenError = null;
    this.redirectUrl = '';
    this.filesData = {};
    this.errorData = {};
    this.redirectWithoutUpload = false;
    this.LOADER_LIMIT = 95;
    this.MULTI_FILE = false;
    this.initActionListeners = this.initActionListeners.bind(this);
    this.abortController = new AbortController();
    this.uploadTimestamp = null;
    this.showInfoToast = false;
    this.multiFileValidationFailure = false;
    this.initialize();
    this.experimentData = null;
  }

  async initialize() {
    await this.isSignedOut();
    await this.applySignedInSettings();
  }

  async isSignedOut() {
    const result = await isGuestUser();
    if (result.error) {
      this.tokenError = result.error;
      return;
    }
    this.signedOut = result.isGuest ?? undefined;
  }

  setIsUploading(isUploading) {
    this.isUploading = isUploading;
  }

  getAbortSignal() {
    return this.abortController.signal;
  }

  acrobatSignedInSettings() {
    if (this.limits.signedInallowedFileTypes && !this.signedOut) this.limits.allowedFileTypes.push(...this.limits.signedInallowedFileTypes);
  }

  async applySignedInSettings() {
    if (this.signedOut === undefined) return;
    if (this.block.classList.contains('signed-in')) {
      if (!this.signedOut) {
        this.acrobatSignedInSettings();
        return;
      }
    }
    window.addEventListener('IMS:Ready', () => {
      this.acrobatSignedInSettings();
    });
  }

  getAcrobatApiConfig() {
    unityConfig.acrobatEndpoint = {
      createAsset: `${unityConfig.apiEndPoint}/asset`,
      finalizeAsset: `${unityConfig.apiEndPoint}/asset/finalize`,
      getMetadata: `${unityConfig.apiEndPoint}/asset/metadata`,
    };
    return unityConfig;
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
    
    if ( !this.experimentData && this.workflowCfg.targetCfg?.experimentationOn?.includes(this.workflowCfg.enabledFeatures[0])) {
      const { getExperimentData, getDecisionScopesForVerb } = await import('../../../utils/experiment-provider.js');
      try {
        const decisionScopes = await getDecisionScopesForVerb(this.workflowCfg.enabledFeatures[0]);
        this.experimentData = await getExperimentData(decisionScopes);
      } catch (error) {
        await this.dispatchErrorToast('warn_fetch_experiment', null, error.message, true, true, {
          code: 'warn_fetch_experiment',
          desc: error.message,
        });
      }
    }
    const parr = [];
    if (this.workflowCfg.targetCfg.showSplashScreen) {
      parr.push(
        `${getUnityLibs()}/core/styles/splash-screen.css`,
      );
    }
    await priorityLoad(parr);
  }

  async dispatchErrorToast(errorType, status, info = null, lanaOnly = false, showError = true, errorMetaData = {}) {
    if (!showError) return;
    const errorMessage = errorType in this.workflowCfg.errors
      ? this.workflowCfg.errors[errorType]
      : await (async () => {
        const getError = (await import('../../../scripts/errors.js')).default;
        const oldKey = ActionBinder.NEW_TO_OLD_ERROR_KEY_MAP[errorType] || errorType;
        return getError(this.workflowCfg.enabledFeatures[0], oldKey);
      })();
    const message = lanaOnly ? '' : errorMessage || 'Unable to process the request';
    const sendToSplunk = this.workflowCfg.targetCfg.sendSplunkAnalytics;
    this.block.dispatchEvent(new CustomEvent(
      unityConfig.errorToastEvent,
      {
        detail: {
          code: errorType,
          message: `${message}`,
          status,
          info: `Upload Type: ${this.MULTI_FILE ? 'multi' : 'single'}; ${info}`,
          accountType: this.signedOut ? 'guest' : 'signed-in',
          metaData: this.filesData,
          errorData: {
            code: ActionBinder.ERROR_MAP[errorMetaData.code || errorType] || -1,
            subCode: ActionBinder.ERROR_MAP[errorMetaData.subCode] || errorMetaData.subCode || status,
            desc: errorMetaData.desc || message || info || undefined,
          },
          sendToSplunk,
        },
      },
    ));
  }

  async dispatchAnalyticsEvent(eventName, data = null) {
    const sendToSplunk = this.workflowCfg.targetCfg.sendSplunkAnalytics;
    const detail = { event: eventName, ...(data && { data }), sendToSplunk };
    this.block.dispatchEvent(new CustomEvent(unityConfig.trackAnalyticsEvent, { detail }));
  }

  isMixedFileTypes(files) {
    const fileTypes = new Set(files.map((file) => file.type));
    return fileTypes.size > 1 ? 'mixed' : files[0].type;
  }

  async sanitizeFileName(rawFileName) {
    try {
      const MAX_FILE_NAME_LENGTH = 255;
      let fileName = rawFileName;
      if (!fileName || fileName === '.' || fileName === '..') {
        return '---';
      }
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
      if (rawFileName !== fileName) {
        await this.dispatchErrorToast('pre_upload_warn_renamed_invalid_file_name', null, `Renamed ${rawFileName} to ${fileName}`, true);
      }
      return fileName;
    } catch (error) {
      await this.dispatchErrorToast('error_generic', 500, `Error renaming file: ${rawFileName}`, false, true, {
        code: 'pre_upload_error_renaming_file',
        subCode: error.name,
        desc: error.message,
      });
      return '---';
    }
  }

  isSameFileType(verb, fileType) {
    const verbToFileTypeMap = {
      'pdf-to-word': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/rtf'],
      'pdf-to-excel': ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      'pdf-to-ppt': ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      'pdf-to-image': ['image/jpeg', 'image/png', 'image/tiff'],
      'pdf-to-png': ['image/jpeg', 'image/png', 'image/tiff'],
    };
    return verbToFileTypeMap[verb]?.includes(fileType) || false;
  }

  convertToSingleFileErrorMessage(multiFileErrorMessage) {
    return multiFileErrorMessage.endsWith('_multi')
      ? multiFileErrorMessage.slice(0, -6)
      : multiFileErrorMessage;
  }

  async validateFiles(files) {
    const errorMessages = files.length === 1
      ? ActionBinder.SINGLE_FILE_ERROR_MESSAGES
      : ActionBinder.MULTI_FILE_ERROR_MESSAGES;
    let allFilesFailed = true;
    const errorTypes = new Set();
    const validFiles = [];

    if (this.limits.maxNumFiles && files.length > this.limits.maxNumFiles) {
      await this.dispatchErrorToast('validation_error_max_num_files', null, `Maximum ${this.limits.maxNumFiles} files allowed`, false, true, {
        code: 'validation_error_validate_files',
        subCode: 'validation_error_max_num_files',
      });
      return { isValid: false, validFiles };
    }

    for (const file of files) {
      let fail = false;
      if (!this.limits.allowedFileTypes.includes(file.type)) {
        let errorMessage = errorMessages.UNSUPPORTED_TYPE;
        if (this.isSameFileType(this.workflowCfg.enabledFeatures[0], file.type)) errorMessage = errorMessages.SAME_FILE_TYPE;
        if (this.MULTI_FILE) {
          await this.dispatchErrorToast('validation_warn_validate_files', null, `File type: ${file.type}`, true, true, { code: 'validation_warn_validate_files', subCode: errorMessage });
          this.multiFileValidationFailure = true;
        } else await this.dispatchErrorToast(errorMessage, null, null, false, true, { code: 'validation_error_validate_files', subCode: errorMessage });
        fail = true;
        errorTypes.add(errorMessage);
      }
      if (!file.size) {
        if (this.MULTI_FILE) {
          await this.dispatchErrorToast('validation_warn_validate_files', null, 'Empty file', true, true, { code: 'validation_warn_validate_files', subCode: errorMessages.EMPTY_FILE });
          this.multiFileValidationFailure = true;
        } else await this.dispatchErrorToast(errorMessages.EMPTY_FILE, null, null, false, true, { code: 'validation_error_validate_files', subCode: errorMessages.EMPTY_FILE });
        fail = true;
        errorTypes.add(errorMessages.EMPTY_FILE);
      }
      if (file.size > this.limits.maxFileSize) {
        if (this.MULTI_FILE) {
          await this.dispatchErrorToast('validation_warn_validate_files', null, `File too large: ${file.size}`, true, true, { code: 'validation_warn_validate_files', subCode: errorMessages.FILE_TOO_LARGE });
          this.multiFileValidationFailure = true;
        } else await this.dispatchErrorToast(errorMessages.FILE_TOO_LARGE, null, null, false, true, { code: 'validation_error_validate_files', subCode: errorMessages.FILE_TOO_LARGE });
        fail = true;
        errorTypes.add(errorMessages.FILE_TOO_LARGE);
      }
      if (!fail) {
        allFilesFailed = false;
        validFiles.push(file);
      }
    }
    if (allFilesFailed) {
      if (this.MULTI_FILE) {
        const firstErrorType = Array.from(errorTypes)[0];
        if (errorTypes.size === 1) {
          await this.dispatchErrorToast(firstErrorType, null, null, false, true, { code: 'validation_error_validate_files', subCode: firstErrorType });
        } else {
          const singleFileErrorType = this.convertToSingleFileErrorMessage(firstErrorType);
          const errorDesc = Array.from(errorTypes).join(', ');
          await this.dispatchErrorToast(singleFileErrorType, null, `All ${files.length} files failed validation. Error Types: ${errorDesc}`, false, true, { code: 'validation_error_validate_files', subCode: singleFileErrorType, desc: errorDesc });
        }
      }
      return { isValid: false, validFiles };
    }
    return { isValid: true, validFiles };
  }

  async showTransitionScreen() {
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    await this.transitionScreen.showSplashScreen();
  }

  async getRedirectUrl(cOpts) {
    const postOpts = await getApiCallOptions('POST', unityConfig.apiKey, this.getAdditionalHeaders() || {}, { body: JSON.stringify(cOpts) });
    this.promiseStack.push(
      this.networkUtils.fetchFromServiceWithRetry(
        this.acrobatApiConfig.connectorApiEndPoint,
        postOpts,
      ),
    );
    await Promise.all(this.promiseStack)
      .then(async (resArr) => {
        const { response } = resArr[resArr.length - 1];
        if (!response?.url) throw new Error('Error connecting to App');
        this.redirectUrl = response.url;
      })
      .catch(async (e) => {
        await this.showTransitionScreen();
        await this.dispatchErrorToast('pre_upload_error_fetch_redirect_url', e.status || 500, `Exception thrown when retrieving redirect URL. Message: ${e.message}, Options: ${JSON.stringify(cOpts)}`, false, e.showError, {
          code: 'pre_upload_error_fetch_redirect_url',
          subCode: e.status,
          desc: e.message,
        });
      });
  }

  async handleRedirect(cOpts, filesData) {
    try {
      cOpts.payload.newUser = !localStorage.getItem('unity.user');
      const numAttempts = parseInt(localStorage.getItem(`${this.workflowCfg.enabledFeatures[0]}_attempts`), 10) || 0;
      const trialMapping = {
        0: '1st',
        1: '2nd',
      };
      cOpts.payload.attempts = trialMapping[numAttempts] || '2+';
    } catch (e) {
      cOpts.payload.newUser = true;
      cOpts.payload.attempts = '1st';
    }
    if (!(cOpts.payload.feedback)) {
      if (this.multiFileValidationFailure) cOpts.payload.feedback = 'uploaderror';
      if (this.showInfoToast) cOpts.payload.feedback = 'nonpdf';
    }
    if (this.workflowCfg.targetCfg?.experimentationOn?.includes(this.workflowCfg.enabledFeatures[0]) && this.experimentData) {
      cOpts.payload.variationId = this.experimentData.variationId;
    }
    await this.getRedirectUrl(cOpts);
    if (!this.redirectUrl) return false;
    const [baseUrl, queryString] = this.redirectUrl.split('?');
    const additionalParams = unityConfig.env === 'stage' ? `${window.location.search.slice(1)}&` : '';
    this.redirectUrl = `${baseUrl}?${additionalParams}${queryString}`;
    this.dispatchAnalyticsEvent('redirectUrl', { ...filesData, redirectUrl: this.redirectUrl });
    return true;
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

  async initUploadHandler() {
    const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/upload-handler.js`);
    this.uploadHandler = new UploadHandler(this, this.networkUtils);
  }

  async getMimeType(file) {
    const { getMimeType } = await import('../../../utils/FileUtils.js');
    return getMimeType(file.name);
  }

  async handleFileUpload(files) {
    const verbsWithoutFallback = this.workflowCfg.targetCfg.verbsWithoutMfuToSfuFallback;
    const sanitizedFiles = await Promise.all(files.map(async (file) => {
      const sanitizedFileName = await this.sanitizeFileName(file.name);
      const mimeType = file.type || await this.getMimeType(file);
      return new File([file], sanitizedFileName, { type: mimeType, lastModified: file.lastModified });
    }));
    this.MULTI_FILE = files.length > 1;
    const { isValid, validFiles } = await this.validateFiles(sanitizedFiles);
    if (!isValid) return;
    await this.initUploadHandler();
    if (files.length === 1 || (validFiles.length === 1 && !verbsWithoutFallback.includes(this.workflowCfg.enabledFeatures[0]))) {
      await this.handleSingleFileUpload(validFiles);
    } else {
      await this.handleMultiFileUpload(validFiles);
    }
  }

  async loadVerbLimits(workflowName, keys) {
    try {
      const response = await fetch(`${getUnityLibs()}/core/workflow/${workflowName}/limits.json`);
      if (!response.ok) throw new Error('Error loading verb limits');
      const limits = await response.json();
      const combinedLimits = keys.reduce((acc, key) => {
        if (limits[key]) Object.entries(limits[key]).forEach(([k, v]) => { acc[k] = v; });
        return acc;
      }, {});
      if (!combinedLimits || Object.keys(combinedLimits).length === 0) {
        await this.dispatchErrorToast('error_generic', 500, 'No verb limits found', false, true, {
          code: 'pre_upload_error_empty_verb_limits',
          desc: 'No verb limits found',
        });
      }
      return combinedLimits;
    } catch (e) {
      await this.dispatchErrorToast('error_generic', 500, `Exception thrown when loading verb limits: ${e.message}`, false, true, {
        code: 'pre_upload_error_loading_verb_limits',
        subCode: e.status,
        desc: e.message,
      });
      return {};
    }
  }

  async processSingleFile(files) {
    this.limits = await this.loadVerbLimits(this.workflowCfg.name, ActionBinder.LIMITS_MAP[this.workflowCfg.enabledFeatures[0]]);
    if (!this.limits || Object.keys(this.limits).length === 0) return;
    if (!files || files.length > this.limits.maxNumFiles) {
      await this.dispatchErrorToast('validation_error_only_accept_one_file');
      return;
    }
    const file = files[0];
    if (!file) return;
    await this.handleFileUpload(files);
  }

  async processHybrid(files) {
    if (!files) {
      await this.dispatchErrorToast('validation_error_only_accept_one_file');
      return;
    }
    this.limits = await this.loadVerbLimits(this.workflowCfg.name, ActionBinder.LIMITS_MAP[this.workflowCfg.enabledFeatures[0]]);
    if (!this.limits || Object.keys(this.limits).length === 0) return;
    await this.handleFileUpload(files);
  }

  delay(ms) {
    return new Promise((res) => { setTimeout(() => { res(); }, ms); });
  }

  async continueInApp() {
    if (!this.redirectUrl || !(this.operations.length || this.redirectWithoutUpload)) return;
    this.LOADER_LIMIT = 100;
    const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
    this.transitionScreen = new TransitionScreen(this.transitionScreen.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
    this.transitionScreen.updateProgressBar(this.transitionScreen.splashScreenEl, 100);
    try {
      await this.delay(500);
      const [baseUrl, queryString] = this.redirectUrl.split('?');
      if (this.multiFileFailure && !this.redirectUrl.includes('feedback=') && this.redirectUrl.includes('#folder')) {
        window.location.href = `${baseUrl}?feedback=${this.multiFileFailure}&${queryString}`;
      } else window.location.href = `${baseUrl}?${this.redirectWithoutUpload === false ? `UTS_Uploaded=${this.uploadTimestamp}&` : ''}${queryString}`;
    } catch (e) {
      await this.transitionScreen.showSplashScreen();
      await this.dispatchErrorToast('error_generic', 500, `Exception thrown when redirecting to product; ${e.message}`, false, e.showError, {
        code: 'upload_error_redirect_to_app',
        subCode: e.status,
        desc: e.message,
      });
    }
  }

  async cancelAcrobatOperation() {
    await this.showTransitionScreen();
    this.redirectUrl = '';
    this.filesData = this.filesData || {};
    this.filesData.workflowStep = this.isUploading ? 'uploading' : 'preuploading';
    this.dispatchAnalyticsEvent('cancel', this.filesData);
    this.setIsUploading(false);
    this.abortController.abort();
    this.abortController = new AbortController();
    const e = new Error('Operation termination requested.');
    e.showError = false;
    const cancelPromise = Promise.reject(e);
    this.promiseStack.unshift(cancelPromise);
  }

  async loadTransitionScreen() {
    if (!this.transitionScreen) {
      try {
        const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);
        this.transitionScreen = new TransitionScreen(this.splashScreenEl, this.initActionListeners, this.LOADER_LIMIT, this.workflowCfg);
        await this.transitionScreen.delayedSplashLoader();
      } catch (error) {
        await this.dispatchErrorToast('pre_upload_error_transition_screen', null, `Error loading transition screen, Error: ${error}`, false, true, { code: 'pre_upload_error_transition_screen' });
        throw error;
      }
    }
  }

  async acrobatActionMaps(value, files, totalFileSize, eventName) {
    await this.loadTransitionScreen();
    await this.handlePreloads();
    if (this.signedOut === undefined) {
      if (this.tokenError) {
        const errorDetails = this.tokenError;
        await this.dispatchErrorToast('pre_upload_error_fetching_access_token', null, `Could not fetch access token; Error: ${errorDetails.originalError}`, false, true, {
          code: 'pre_upload_error_fetching_access_token',
          desc: errorDetails,
        });
        return;
      }
    }
    window.addEventListener('DCUnity:RedirectReady', async () => {
      await this.continueInApp();
    });
    if (!this.workflowCfg.enabledFeatures?.length || !ActionBinder.LIMITS_MAP[this.workflowCfg.enabledFeatures[0]]) {
      await this.dispatchErrorToast('error_generic', 500, 'Invalid or missing verb configuration on Unity', false, true, { code: 'pre_upload_error_missing_verb_config' });
      return;
    }
    const uploadType = ActionBinder.LIMITS_MAP[this.workflowCfg.enabledFeatures[0]][0];
    switch (value) {
      case 'upload':
        this.promiseStack = [];
        this.filesData = { type: this.isMixedFileTypes(files), size: totalFileSize, count: files.length, uploadType: files.length > 1 ? 'mfu' : 'sfu' };
        this.dispatchAnalyticsEvent(eventName, this.filesData);
        if (uploadType === 'single') await this.processSingleFile(files);
        else if (uploadType === 'hybrid') await this.processHybrid(files);
        break;
      case 'interrupt':
        await this.cancelAcrobatOperation();
        break;
      default:
        break;
    }
    if (this.redirectWithoutUpload) await this.continueInApp();
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

  setAssetId(assetId) {
    this.filesData.assetId = assetId;
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    for (const [key, value] of Object.entries(actMap)) {
      const el = b.querySelector(key);
      if (!el) return;
      switch (true) {
        case el.nodeName === 'A':
          el.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.acrobatActionMaps(value);
          });
          break;
        case el.nodeName === 'DIV':
          el.addEventListener('drop', async (e) => {
            e.preventDefault();
            const { files, totalFileSize } = this.extractFiles(e);
            await this.acrobatActionMaps(value, files, totalFileSize, 'drop');
          });
          break;
        case el.nodeName === 'INPUT':
          el.addEventListener('change', async (e) => {
            const { files, totalFileSize } = this.extractFiles(e);
            await this.acrobatActionMaps(value, files, totalFileSize, 'change');
            e.target.value = '';
          });
          break;
        default:
          break;
      }
    }
    if (b === this.block) {
      this.loadTransitionScreen();
    }
  }
}
