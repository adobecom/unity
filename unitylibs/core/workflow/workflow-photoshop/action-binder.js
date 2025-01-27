/* eslint-disable eqeqeq */
/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */

import {
  unityConfig,
  getUnityLibs,
  loadImg,
  loadStyle,
  createTag,
  loadSvgs,
  getLocale,
  delay,
  getLibs,
} from '../../../scripts/utils.js';

export default class ActionBinder {
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}, limits = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea;
    this.operations = [];
    this.progressCircleEl = null;
    this.errorToastEl = null;
    this.psApiConfig = this.getPsApiConfig();
    this.serviceHandler = null;
    this.renderCachedExperience = true;
  }

  getPsApiConfig() {
    unityConfig.psEndPoint = {
      assetUpload: `${unityConfig.apiEndPoint}/asset`,
      acmpCheck: `${unityConfig.apiEndPoint}/asset/finalize`,
      removeBackground: `${unityConfig.apiEndPoint}/providers/PhotoshopRemoveBackground`,
      changeBackground: `${unityConfig.apiEndPoint}/providers/PhotoshopChangeBackground`,
    };
    return unityConfig;
  }

  hideElement(item, b) {
    if (typeof item === 'string') b?.querySelector(item)?.classList.remove('show');
    else item?.classList.remove('show');
  }

  showElement(item, b) {
    if (typeof item === 'string') b?.querySelector(item)?.classList.add('show');
    else item?.classList.add('show');
  }

  toggleElement(item, b) {
    if (typeof item === 'string') {
      if (b?.querySelector(item)?.classList.contains('show')) b?.querySelector(item)?.classList.remove('show');
      else b?.querySelector(item)?.classList.add('show');
      return;
    }
    if (item?.classList.contains('show')) item?.classList.remove('show');
    else item?.classList.add('show');
  }

  styleElement(itemSelector, propertyName, propertyValue) {
    const item = this.block.querySelector(itemSelector);
    item.style[propertyName] = propertyValue;
  }

  dispatchClickEvent(params, e) {
    const a = e.target.nodeName == 'A' ? e.target : e.target.closest('a');
    a.querySelector(params.target).click();
  }

  async executeAction(values, e) {
    for (const value of values) {
      switch (true) {
        case value.actionType == 'hide':
          value.targets.forEach((t) => this.hideElement(t, this.block));
          break;
        case value.actionType == 'setCssStyle':
          value.targets.forEach((t) => {
            this.styleElement(t, value.propertyName, value.propertyValue);
          });
          break;
        case value.actionType == 'show':
          value.targets.forEach((t) => this.showElement(t, this.block));
          break;
        case value.actionType == 'toggle':
          value.targets.forEach((t) => this.toggleElement(t, this.block));
          break;
        case value.actionType == 'removebg':
          await this.removeBackground(value);
          break;
        case value.actionType == 'changebg':
          await this.changeBackground(value);
          break;
        case value.actionType == 'imageAdjustment':
          this.changeAdjustments(e.target.value, value);
          break;
        case value.actionType == 'upload':
          this.renderCachedExperience = false;
          await this.userImgUpload(value, e);
          break;
        case value.actionType == 'continueInApp':
          await this.continueInApp(value, e);
          break;
        case value.actionType == 'dispatchClickEvent':
          this.dispatchClickEvent(value, e);
          break;
        case value.actionType == 'refresh':
          this.renderCachedExperience = true;
          value.target.src = value.sourceSrc;
          this.operations = [];
          break;
        default:
          break;
      }
    }
  }

  async psActionMaps(values, e) {
    const { default: ServiceHandler } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/service-handler.js`);
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
      this.unityEl,
    );
    if (this.workflowCfg.targetCfg.renderWidget) {
      const svgs = this.canvasArea.querySelectorAll('.unity-widget img[src*=".svg"');
      await loadSvgs(svgs);
      if (!this.progressCircleEl) {
        this.progressCircleEl = await this.createSpectrumProgress();
        this.canvasArea.append(this.progressCircleEl);
      }
      if (!this.errorToastEl) await this.createErrorToast();
    }
    await this.executeAction(values, e);
    if (this.workflowCfg.targetCfg.renderWidget && this.operations.length) {
      this.canvasArea.querySelector('.widget-product-icon')?.classList.remove('show');
      [...this.canvasArea.querySelectorAll('.widget-refresh-button')].forEach((w) => w.classList.add('show'));
    }
  }

  initActionListeners() {
    for (const [key, values] of Object.entries(this.actionMap)) {
      const el = this.block.querySelector(key);
      if (!el) return;
      switch (true) {
        case el.nodeName === 'A':
          el.href = '#';
          el.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.psActionMaps(values, e);
          });
          if (values.find((v) => v.actionType == 'refresh')) {
            const observer = new IntersectionObserver((entries) => {
              entries.forEach(async (entry) => {
                if (!entry.isIntersecting) {
                  await this.psActionMaps(values);
                }
              });
            });
            observer.observe(this.canvasArea);
          }
          break;
        case el.nodeName === 'INPUT':
          el.addEventListener('change', async (e) => {
            await this.psActionMaps(values, e);
          });
          break;
        default:
          break;
      }
    }
  }

  getImageBlobData(url) {
    return new Promise((res, rej) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'blob';
      xhr.onload = () => {
        if (xhr.status === 200) res(xhr.response);
        else rej(xhr.status);
      };
      xhr.send();
    });
  }

  async uploadImgToUnity(storageUrl, id, blobData, fileType) {
    const uploadOptions = {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: blobData,
    };
    const response = await fetch(storageUrl, uploadOptions);
    if (response.status != 200) return '';
    return id;
  }

  getFileType() {
    if (this.operations.length) {
      const lastOperation = this.operations[this.operations.length - 1];
      if (lastOperation.operationType == 'upload') return lastOperation.fileType;
    }
    return 'image/jpeg';
  }

  async scanImgForSafety(assetId) {
    const assetData = { assetId, targetProduct: this.workflowCfg.productName };
    const optionsBody = { body: JSON.stringify(assetData) };
    const res = await this.serviceHandler.postCallToService(
      this.psApiConfig.psEndPoint.acmpCheck,
      optionsBody,
      {},
      false,
    );
    if (res.status === 403) {
      this.unityEl.dispatchEvent(new CustomEvent('unity:refreshrequested'));
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-acmp' });
      throw Error('Operation failed');
    } else if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      setTimeout(() => { this.scanImgForSafety(); }, 1000);
    }
  }

  async uploadAsset(imgUrl) {
    const resJson = await this.serviceHandler.postCallToService(
      this.psApiConfig.psEndPoint.assetUpload,
      {},
      {
        errorToastEl: this.errorToastEl,
        errorType: '.icon-error-request',
      },
    );
    const { id, href } = resJson;
    const blobData = await this.getImageBlobData(imgUrl);
    const fileType = this.getFileType();
    const assetId = await this.uploadImgToUnity(href, id, blobData, fileType);
    const { origin } = new URL(imgUrl);
    if ((imgUrl.startsWith('blob:')) || (origin != window.location.origin)) await this.scanImgForSafety(assetId);
    return assetId;
  }

  async userImgUpload(params, e) {
    this.canvasArea.querySelector('img').style.filter = '';
    this.operations = [];
    const file = e.target.files[0];
    if (!file) throw Error('Could not read file!!');
    if (['image/jpeg', 'image/png', 'image/jpg'].indexOf(file.type) == -1) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filetype' });
      throw new Error('File format not supported!!');
    }
    if (file.size > 40000000) {
      this.serviceHandler.showErrorToast({ errorToastEl: this.errorToastEl, errorType: '.icon-error-filesize' });
      throw new Error('File too large!!');
    }
    const operationItem = {
      operationType: 'upload',
      fileType: file.type,
    };
    const objUrl = URL.createObjectURL(file);
    params.target.src = objUrl;
    let loadSuccessful = false;
    await new Promise((res) => {
      params.target.onload = () => {
        loadSuccessful = true;
        res();
      };
      params.target.onerror = () => {
        loadSuccessful = false;
        res();
      };
    });
    if (!loadSuccessful) return;
    this.operations.push(operationItem);
    const callbackObj = [{
      itemType: 'button',
      actionType: params.callbackAction,
      source: params.callbackActionSource,
      target: params.callbackActionTarget,
    },
    ];
    await this.executeAction(callbackObj, null);
  }

  async removeBackground(params) {
    const optype = 'removeBackground';
    let { source, target } = params;
    if (typeof (source) == 'string') source = this.block.querySelector(source);
    if (typeof (target) == 'string') target = this.block.querySelector(target);
    const parsedUrl = new URL(source.src);
    const imgsrc = ((!source.src.startsWith('blob:')) && parsedUrl.origin == window.origin)
      ? parsedUrl.pathname
      : source.src;
    const operationItem = {
      operationType: optype,
      sourceAssetId: null,
      sourceAssetUrl: null,
      sourceSrc: imgsrc,
      assetId: null,
      assetUrl: null,
    };
    if (params.cachedOutputUrl && this.renderCachedExperience) {
      await delay(500);
      operationItem.sourceAssetUrl = imgsrc;
      operationItem.assetUrl = params.cachedOutputUrl;
    } else {
      let assetId = null;
      if (
        this.operations.length
        && this.operations[this.operations.length - 1].assetId
      ) {
        assetId = this.operations[this.operations.length - 1].assetId;
      } else assetId = await this.uploadAsset(imgsrc);
      operationItem.sourceAssetId = assetId;
      const removeBgOptions = { body: `{"surfaceId":"Unity","assets":[{"id": "${assetId}"}]}` };
      const resJson = await this.serviceHandler.postCallToService(
        this.psApiConfig.psEndPoint[optype],
        removeBgOptions,
        {
          errorToastEl: this.errorToastEl,
          errorType: '.icon-error-request',
        },
      );
      operationItem.assetId = resJson.assetId;
      operationItem.assetUrl = resJson.outputUrl;
    }
    target.src = operationItem.assetUrl;
    await loadImg(target);
    this.operations.push(operationItem);
  }

  async changeBackground(params) {
    const opType = 'changeBackground';
    let { source, target, backgroundSrc } = params;
    if (typeof (source) == 'string') source = this.block.querySelector(source);
    if (typeof (target) == 'string') target = this.block.querySelector(target);
    if (typeof (backgroundSrc) == 'string' && !backgroundSrc.startsWith('http')) backgroundSrc = this.block.querySelector(backgroundSrc);
    const parsedUrl = new URL(backgroundSrc);
    const imgsrc = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const operationItem = {
      operationType: opType,
      sourceSrc: source.src,
      backgroundSrc: imgsrc,
      assetId: null,
      assetUrl: null,
      fgId: null,
      bgId: null,
    };
    if (params.cachedOutputUrl && this.renderCachedExperience) {
      await delay(500);
      operationItem.assetUrl = params.cachedOutputUrl;
    } else {
      const fgId = this.operations[this.operations.length - 1].assetId;
      const bgId = await this.uploadAsset(imgsrc);
      const changeBgOptions = {
        body: `{
                "assets": [{ "id": "${fgId}" },{ "id": "${bgId}" }],
                "metadata": {
                  "foregroundImageId": "${fgId}",
                  "backgroundImageId": "${bgId}"
                }
              }`,
      };
      const resJson = await this.serviceHandler.postCallToService(
        this.psApiConfig.psEndPoint[opType],
        changeBgOptions,
        {
          errorToastEl: this.errorToastEl,
          errorType: '.icon-error-request',
        },
      );
      const changeBgId = resJson.assetId;
      operationItem.assetId = changeBgId;
      operationItem.fgId = fgId;
      operationItem.bgId = bgId;
      operationItem.assetUrl = resJson.outputUrl;
    }
    target.src = operationItem.assetUrl;
    await loadImg(target);
    this.operations.push(operationItem);
  }

  getFilterAttrValue(currFilter, filterName, value) {
    if (!currFilter) return value;
    const filterVals = currFilter.split(' ');
    let hasFilter = false;
    filterVals.forEach((f, i) => {
      if (f.match(filterName)) {
        hasFilter = true;
        filterVals[i] = value;
      }
    });
    if (!hasFilter) filterVals.push(value);
    return filterVals.join(' ');
  }

  changeAdjustments(value, params) {
    const { filterType, target } = params;
    const operationItem = {
      operationType: 'imageAdjustment',
      adjustmentType: filterType,
      filterValue: params,
    };
    const currFilter = target.style.filter;
    switch (filterType) {
      case 'hue':
        target.style.filter = this.getFilterAttrValue(currFilter, 'hue-rotate', `hue-rotate(${value}deg)`);
        break;
      case 'saturation':
        target.style.filter = this.getFilterAttrValue(currFilter, 'saturate', `saturate(${value}%)`);
        break;
      default:
        break;
    }
    this.operations.push(operationItem);
  }

  async continueInApp() {
    const cOpts = {
      targetProduct: this.workflowCfg.productName,
      payload: {
        locale: getLocale(),
        operations: [],
      },
    };
    this.operations.forEach((op, i) => {
      if (!cOpts.assetId && !cOpts.href) {
        if (op.sourceAssetUrl) cOpts.href = op.sourceAssetUrl;
        else if (op.sourceAssetId) cOpts.assetId = op.sourceAssetId;
      }
      const idx = cOpts.payload.operations.length;
      if (idx > 0 && cOpts.payload.operations[idx - 1] == op.operationType) cOpts.pop();
      cOpts.payload.operations.push({ name: op.operationType });
      if (op.assetId) {
        cOpts.payload.finalAssetId = op.assetId;
        if (op.operationType == 'changeBackground') cOpts.payload.operations[idx].assetIds = [op.assetId];
      } else if (op.assetUrl) {
        cOpts.payload.finalAssetUrl = op.assetUrl;
        if (op.operationType == 'changeBackground') cOpts.payload.operations[idx].hrefs = [op.assetUrl];
      }
      if (op.operationType == 'imageAdjustment' && op.adjustmentType && op.filterValue) {
        cOpts.payload.operations[idx][op.adjustmentType] = parseInt(
          op.filterValue.sliderElem.value,
          10,
        );
      }
    });
    const { url } = await this.serviceHandler.postCallToService(
      this.psApiConfig.connectorApiEndPoint,
      { body: JSON.stringify(cOpts) },
      {
        errorToastEl: this.errorToastEl,
        errorType: '.icon-error-request',
      },
    );
    window.location.href = url;
  }

  async createSpectrumProgress() {
    await new Promise((resolve) => {
      loadStyle(`${getUnityLibs()}/core/features/progress-circle/progress-circle.css`, resolve);
    });
    const pdom = `<div class="spectrum-ProgressCircle-track"></div>
    <div class="spectrum-ProgressCircle-fills">
      <div class="spectrum-ProgressCircle-fillMask1">
        <div class="spectrum-ProgressCircle-fillSubMask1">
          <div class="spectrum-ProgressCircle-fill"></div>
        </div>
      </div>
      <div class="spectrum-ProgressCircle-fillMask2">
        <div class="spectrum-ProgressCircle-fillSubMask2">
          <div class="spectrum-ProgressCircle-fill"></div>
        </div>
      </div>
    </div>`;
    const loader = createTag(
      'div',
      { class: 'progress-circle' },
      createTag('div', { class: 'spectrum-ProgressCircle spectrum-ProgressCircle--indeterminate' }, pdom),
    );
    return loader;
  }

  async createErrorToast() {
    const alertImg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <g id="Frame">
        <path id="iconPrimary" d="M9.99936 15.1233C9.76871 15.1315 9.54398 15.0496 9.37275 14.895C9.04242 14.5304 9.04242 13.9751 9.37275 13.6104C9.5421 13.4521 9.76758 13.3677 9.99939 13.3757C10.2357 13.3662 10.4653 13.4559 10.6324 13.6231C10.7945 13.7908 10.8816 14.017 10.8738 14.2499C10.8862 14.4846 10.8042 14.7145 10.6461 14.8886C10.4725 15.0531 10.2382 15.1382 9.99936 15.1233Z" fill="white"/>
        <path id="iconPrimary_2" d="M10 11.75C9.58594 11.75 9.25 11.4141 9.25 11V7C9.25 6.58594 9.58594 6.25 10 6.25C10.4141 6.25 10.75 6.58594 10.75 7V11C10.75 11.4141 10.4141 11.75 10 11.75Z" fill="white"/>
        <path id="iconPrimary_3" d="M16.7332 18H3.26642C2.46613 18 1.74347 17.5898 1.3338 16.9023C0.924131 16.2148 0.906551 15.3838 1.28741 14.6797L8.02082 2.23242C8.41437 1.50488 9.17268 1.05273 9.99982 1.05273C10.827 1.05273 11.5853 1.50488 11.9788 2.23242L18.7122 14.6797C19.0931 15.3838 19.0755 16.2149 18.6658 16.9024C18.2562 17.5899 17.5335 18 16.7332 18ZM9.99982 2.55273C9.86554 2.55273 9.53205 2.59082 9.34015 2.94531L2.60675 15.3926C2.42364 15.7315 2.55646 16.0244 2.62237 16.1338C2.6878 16.2441 2.88165 16.5 3.26641 16.5H16.7332C17.118 16.5 17.3118 16.2441 17.3773 16.1338C17.4432 16.0244 17.576 15.7315 17.3929 15.3926L10.6595 2.94531C10.4676 2.59082 10.1341 2.55273 9.99982 2.55273Z" fill="white"/>
      </g>
    </svg>`;
    const closeImg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <g id="Frame" clip-path="url(#clip0_3633_2420)">
        <path id="iconPrimary" d="M7.34283 6L10.7389 2.60352C11.1095 2.2334 11.1095 1.63184 10.7389 1.26075C10.3678 0.891609 9.76721 0.890629 9.39612 1.26173L6.00061 4.65773L2.6051 1.26172C2.23401 0.890629 1.63342 0.891599 1.26233 1.26074C0.891723 1.63183 0.891723 2.2334 1.26233 2.60351L4.65839 5.99999L1.26233 9.39647C0.891723 9.76659 0.891723 10.3681 1.26233 10.7392C1.44788 10.9238 1.69055 11.0166 1.93372 11.0166C2.17689 11.0166 2.41956 10.9238 2.60511 10.7383L6.00062 7.34226L9.39613 10.7383C9.58168 10.9238 9.82435 11.0166 10.0675 11.0166C10.3107 11.0166 10.5534 10.9238 10.7389 10.7392C11.1095 10.3681 11.1095 9.76658 10.7389 9.39647L7.34283 6Z" fill="white"/>
      </g>
      <defs>
        <clipPath id="clip0_3633_2420">
          <rect width="12" height="12" fill="white"/>
        </clipPath>
      </defs>
    </svg>`;
    const alertText = createTag('div', { class: 'alert-text' }, createTag('p', {}, 'Alert Text'));
    const alertIcon = createTag('div', { class: 'alert-icon' }, alertImg);
    alertIcon.append(alertText);
    const alertClose = createTag('a', { class: 'alert-close', href: '#' }, closeImg);
    alertClose.append(createTag('span', { class: 'alert-close-text' }, 'Close error toast'));
    const alertContent = createTag('div', { class: 'alert-content' });
    alertContent.append(alertIcon, alertClose);
    const errholder = createTag('div', { class: 'alert-holder' }, createTag('div', { class: 'alert-toast' }, alertContent));
    alertClose.addEventListener('click', (e) => {
      e.preventDefault();
      e.target.closest('.alert-holder').classList.remove('show');
    });
    const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
    decorateDefaultLinkAnalytics(errholder);
    this.canvasArea.append(errholder);
    this.errorToastEl = errholder;
  }
}
