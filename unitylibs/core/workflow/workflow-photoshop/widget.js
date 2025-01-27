import {
  createTag,
  getLibs,
  loadSvgs,
  priorityLoad,
  defineDeviceByScreenSize,
} from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
  }

  async initWidget() {
    const [iWidget, unityaa, unityoa] = ['unity-widget', 'unity-action-area', 'unity-option-area']
      .map((c) => createTag('div', { class: c }));
    iWidget.append(unityoa, unityaa);
    const refreshCfg = this.el.querySelector('.icon-product-icon');
    if (refreshCfg) this.addRestartOption(refreshCfg.closest('li'), unityaa);
    this.workflowCfg.enabledFeatures.forEach((f, idx) => {
      const addClasses = idx === 0 ? 'ps-action-btn show' : 'ps-action-btn';
      this.addFeatureButtons(
        f,
        this.workflowCfg.featureCfg[idx],
        unityaa,
        unityoa,
        addClasses,
        idx,
        this.workflowCfg.enabledFeatures.length,
      );
    });
    const uploadCfg = this.el.querySelector('.icon-upload');
    if (uploadCfg) this.addFeatureButtons('upload', uploadCfg.closest('li'), unityaa, unityoa, 'show');
    const continueInApp = this.el.querySelector('.icon-app-connector');
    if (continueInApp) this.addFeatureButtons('continue-in-app', continueInApp.closest('li'), unityaa, unityoa, '');
    this.widget = iWidget;
    const svgs = iWidget.querySelectorAll('.show img[src*=".svg"');
    await loadSvgs(svgs);
    this.target.append(iWidget);
    const { decorateDefaultLinkAnalytics } = await import(`${getLibs()}/martech/attributes.js`);
    decorateDefaultLinkAnalytics(iWidget);
    return this.actionMap;
  }

  createActionBtn(btnCfg, btnClass) {
    const txt = btnCfg.innerText;
    const img = btnCfg.querySelector('img[src*=".svg"]');
    const actionBtn = createTag('a', { href: '#', class: `unity-action-btn ${btnClass}` });
    let swapOrder = false;
    if (img) {
      actionBtn.append(createTag('div', { class: 'btn-icon' }, img));
      if (img.nextSibling?.nodeName == '#text') swapOrder = true;
    }
    if (txt) {
      const btnTxt = createTag('div', { class: 'btn-text' }, txt.split('\n')[0].trim());
      const viewport = defineDeviceByScreenSize();
      if (viewport === 'MOBILE') btnTxt.innerText = btnTxt.innerText.split(' ').toSpliced(1, 0, '\n').join(' ');
      if (swapOrder) actionBtn.prepend(btnTxt);
      else actionBtn.append(btnTxt);
    }
    return actionBtn;
  }

  initRefreshActionMap(w) {
    this.actionMap[w] = [
      {
        actionType: 'hide',
        targets: ['.ps-action-btn.show', '.unity-option-area .show', '.continue-in-app-button'],
      }, {
        actionType: 'show',
        targets: ['.ps-action-btn'],
      }, {
        actionType: 'refresh',
        sourceSrc: this.el.querySelector('img').src,
        target: this.target.querySelector('img'),
      },
    ];
  }

  refreshHandler(ih, rh, mrh) {
    this.target.querySelector('img').style.filter = '';
    ih.classList.add('show');
    rh.classList.remove('show');
    mrh.classList.remove('show');
  }

  addRestartOption(refreshCfg, unityaa) {
    const [prodIcon, refreshIcon] = refreshCfg.querySelectorAll('img[src*=".svg"]');
    const iconHolder = createTag('div', { class: 'widget-product-icon show' }, prodIcon);
    const refreshHolder = createTag('a', { href: '#', class: 'widget-refresh-button' }, refreshIcon);
    refreshHolder.append(createTag('div', { class: 'widget-refresh-text' }, 'Restart'));
    unityaa.append(iconHolder);
    const mobileRefreshHolder = refreshHolder.cloneNode(true);
    [refreshHolder, mobileRefreshHolder].forEach((w) => {
      w.addEventListener('click', () => {
        this.refreshHandler(iconHolder, refreshHolder, mobileRefreshHolder);
      });
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          this.refreshHandler(iconHolder, refreshHolder, mobileRefreshHolder);
        }
      });
    });
    observer.observe(this.target);
    this.initRefreshActionMap('.unity-action-area .widget-refresh-button');
    this.initRefreshActionMap('.interactive-area > .widget-refresh-button');
    unityaa.append(refreshHolder);
    this.target.append(mobileRefreshHolder);
  }

  addFeatureButtons(
    featName,
    authCfg,
    actionArea,
    optionArea,
    addClasses,
    currFeatureIdx,
    totalFeatures,
  ) {
    const btn = this.createActionBtn(authCfg, `${featName}-button ${addClasses}`);
    actionArea.append(btn);
    switch (featName) {
      case 'removebg':
        this.initRemoveBgActions(featName, btn, authCfg);
        break;
      case 'upload':
        {
          const inpel = createTag('input', {
            class: 'file-upload',
            type: 'file',
            accept: 'image/png,image/jpg,image/jpeg',
            tabIndex: -1,
          });
          btn.append(inpel);
          inpel.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          this.initUploadActions(featName);
        }
        break;
      case 'continue-in-app':
        this.initContinueInAppActions(featName);
        break;
      default:
        this.addFeatureTray(
          featName,
          authCfg,
          optionArea,
          btn,
          addClasses,
          currFeatureIdx,
          totalFeatures,
        );
    }
  }

  updateQueryParameter(url, paramName = 'format', formatName = 'jpeg') {
    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;
      params.set(paramName, formatName);
      return urlObj.toString();
    } catch (error) {
      return null;
    }
  }

  initRemoveBgActions(featName, btn, authCfg) {
    this.actionMap[`.${featName}-button`] = [
      {
        actionType: 'show',
        targets: ['.progress-circle'],
      }, {
        itemType: 'button',
        actionType: featName,
        source: this.target.querySelector('img'),
        target: this.target.querySelector('img'),
        cachedOutputUrl: authCfg.querySelector('ul li img') ? this.updateQueryParameter(authCfg.querySelector('ul li img').src) : null,
      }, {
        actionType: 'show',
        targets: ['.ps-action-btn.show + .ps-action-btn', '.changebg-options-tray', '.continue-in-app-button'],
      }, {
        actionType: 'hide',
        targets: [btn, '.progress-circle'],
      },
    ];
  }

  initChangeBgActions(key, btn, bgImg, bgSelectorTray, authCfg, currFeatureIdx, totalFeatures) {
    this.actionMap[key] = [
      {
        actionType: 'show',
        targets: ['.progress-circle'],
      }, {
        itemType: 'button',
        actionType: 'changebg',
        backgroundSrc: bgImg.src,
        source: this.target.querySelector('img'),
        target: this.target.querySelector('img'),
        cachedOutputUrl: authCfg.querySelector('ul li img') ? this.updateQueryParameter(authCfg.querySelector('ul li img').src) : null,
      }, {
        actionType: 'show',
        targets: ['.continue-in-app-button'],
      }, {
        actionType: 'hide',
        targets: ['.progress-circle'],
      },
    ];
    if (currFeatureIdx < totalFeatures - 1) {
      this.actionMap[key].push({
        actionType: 'show',
        targets: ['.ps-action-btn.show + .ps-action-btn', '.adjustment-options-tray'],
      }, {
        actionType: 'hide',
        targets: [btn, bgSelectorTray, '.progress-circle'],
      });
    }
  }

  initUploadActions(featName) {
    this.actionMap[`.${featName}-button`] = [
      {
        actionType: 'dispatchClickEvent',
        target: '.file-upload',
      },
    ];
    this.actionMap[`.${featName}-button .file-upload`] = [
      {
        actionType: 'show',
        targets: ['.progress-circle'],
      }, {
        itemType: 'button',
        actionType: 'upload',
        assetType: 'img',
        target: this.target.querySelector('img'),
        callbackAction: 'removebg',
        callbackActionSource: this.target.querySelector('img'),
        callbackActionTarget: this.target.querySelector('img'),
      }, {
        actionType: 'hide',
        targets: ['.ps-action-btn.show', '.unity-option-area > div.show', '.progress-circle'],
      }, {
        actionType: 'show',
        targets: ['.changebg-button', '.unity-option-area .changebg-options-tray', '.continue-in-app-button'],
      },
    ];
  }

  initContinueInAppActions(featName) {
    this.actionMap[`.${featName}-button`] = [
      {
        itemType: 'button',
        actionType: 'continueInApp',
        appName: 'Photoshop',
      },
    ];
  }

  addFeatureTray(featName, authCfg, optionArea, btn, addClasses, currFeatureIdx, totalFeatures) {
    switch (featName) {
      case 'changebg': {
        const tray = this.addChangeBgTray(btn, authCfg, optionArea, addClasses.indexOf('show') > -1, currFeatureIdx, totalFeatures);
        this.actionMap[`.${featName}-button`] = [
          {
            actionType: 'toggle',
            targets: [tray],
          },
        ];
        break;
      }
      case 'slider': {
        const tray = this.addAdjustmentTray(btn, authCfg, optionArea, addClasses.indexOf('show') > -1);
        this.actionMap[`.${featName}-button`] = [
          {
            actionType: 'toggle',
            targets: [tray],
          },
        ];
        break;
      }
      default:
        break;
    }
  }

  updateQueryParam(url, params) {
    const parsedUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      parsedUrl.searchParams.set(key, value);
    });
    return parsedUrl;
  }

  addChangeBgTray(btn, authCfg, optionArea, isVisible, currFeatureIdx, totalFeatures) {
    const bgSelectorTray = createTag('div', { class: `changebg-options-tray ${isVisible ? 'show' : ''}` });
    const bgOptions = authCfg.querySelectorAll(':scope > ul > li');
    const thumbnailSrc = [];
    [...bgOptions].forEach((o, num) => {
      let thumbnail = null;
      let bgImg = null;
      bgImg = o.querySelector('img');
      thumbnail = bgImg;
      thumbnail.dataset.backgroundImg = bgImg.src;
      thumbnail.setAttribute('src', this.updateQueryParam(bgImg.src, { format: 'webply', width: '68', height: '68' }));
      thumbnailSrc.push(thumbnail.getAttribute('src'));
      const optionSelector = `changebg-option option-${num}`;
      const a = createTag('a', { href: '#', class: optionSelector }, thumbnail);
      bgSelectorTray.append(a);
      this.initChangeBgActions(`.changebg-option.option-${num}`, btn, bgImg, bgSelectorTray, o, currFeatureIdx, totalFeatures);
      a.addEventListener('click', (e) => { e.preventDefault(); });
    });
    priorityLoad(thumbnailSrc);
    optionArea.append(bgSelectorTray);
    return bgSelectorTray;
  }

  addAdjustmentTray(btn, authCfg, optionArea, isVisible) {
    const sliderTray = createTag('div', { class: `adjustment-options-tray  ${isVisible ? 'show' : ''}` });
    const sliderOptions = authCfg.querySelectorAll(':scope > ul li');
    [...sliderOptions].forEach((o) => {
      let iconName = null;
      const psAction = o.querySelector(':scope > .icon');
      [...psAction.classList].forEach((cn) => { if (cn.match('icon-')) iconName = cn; });
      const [, actionName] = iconName.split('-');
      switch (actionName) {
        case 'hue':
          this.createSlider(sliderTray, 'hue', o.innerText, -180, 180);
          break;
        case 'saturation':
          this.createSlider(sliderTray, 'saturation', o.innerText, 0, 300);
          break;
        default:
          break;
      }
    });
    optionArea.append(sliderTray);
    return sliderTray;
  }

  createSlider(tray, propertyName, label, minVal, maxVal) {
    const actionDiv = createTag('div', { class: 'adjustment-option' });
    const actionLabel = createTag('label', { class: 'adjustment-label' }, label);
    const actionSliderDiv = createTag('div', { class: `adjustment-container ${propertyName}` });
    const actionSliderInput = createTag('input', {
      type: 'range',
      min: minVal,
      max: maxVal,
      value: (minVal + maxVal) / 2,
      class: `adjustment-slider ${propertyName}`,
    });
    const actionAnalytics = createTag('div', { class: 'analytics-content' }, `Adjust ${label} slider`);
    const actionSliderCircle = createTag('a', { href: '#', class: `adjustment-circle ${propertyName}` }, actionAnalytics);
    actionSliderDiv.append(actionSliderInput, actionSliderCircle);
    actionDiv.append(actionLabel, actionSliderDiv);
    this.actionMap[`.adjustment-slider.${propertyName}`] = [
      {
        actionType: 'show',
        targets: ['.continue-in-app-button'],
      }, {
        itemType: 'slider',
        actionType: 'imageAdjustment',
        filterType: propertyName,
        sliderElem: actionSliderInput,
        target: this.target.querySelector('img'),
      },
    ];
    actionSliderInput.addEventListener('input', () => {
      const { value } = actionSliderInput;
      const centerOffset = (value - minVal) / (maxVal - minVal);
      const moveCircle = 3 + (centerOffset * 94);
      actionSliderCircle.style.left = `${moveCircle}%`;
    });
    actionSliderInput.addEventListener('change', () => {
      actionSliderCircle.click();
    });
    actionSliderCircle.addEventListener('click', (evt) => {
      evt.preventDefault();
    });
    tray.append(actionDiv);
  }
}
