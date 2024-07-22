import {
  createTag,
  getGuestAccessToken,
  getUnityConfig,
  loadImg,
  createActionBtn,
  loadSvg,
  decorateDefaultLinkAnalytics,
  createIntersectionObserver } from '../../../scripts/utils.js';
import { uploadAsset } from '../../steps/upload-step.js';
import initAppConnector from '../../steps/app-connector.js';
import createUpload from '../../steps/upload-btn.js';

function resetWorkflowState() {
  const unityCfg = getUnityConfig();
  unityCfg.presentState = {
    activeIdx: -1,
    removeBgState: {
      assetId: null,
      assetUrl: null,
    },
    changeBgState: {},
    adjustments: {},
  };
  unityCfg.preludeState = { assetId: null };
  const img = unityCfg.targetEl.querySelector(':scope > picture img');
  img.style.filter = '';
}

function toggleDisplay(domEl) {
  if (domEl.classList.contains('show')) domEl.classList.remove('show');
  else domEl.classList.add('show');
}

async function addProductIcon() {
  const unityCfg = getUnityConfig();
  const { unityEl, unityWidget, targetEl, refreshWidgetEvent } = unityCfg;
  unityCfg.refreshEnabled = false;
  const refreshCfg = unityEl.querySelector('.icon-product-icon');
  if (!refreshCfg) return;
  const [prodIcon, refreshIcon] = refreshCfg.closest('li').querySelectorAll('img[src*=".svg"]');
  const iconHolder = createTag('div', { class: 'widget-product-icon show' }, prodIcon);
  const refreshSvg = await loadSvg(refreshIcon);
  const refreshHolder = createTag('a', { href: '#', class: 'widget-refresh-button' }, refreshSvg);
  await loadImg(prodIcon);
  unityWidget.querySelector('.unity-action-area').append(iconHolder);
  if (!refreshIcon) return;
  unityCfg.refreshEnabled = true;
  const mobileRefreshHolder = refreshHolder.cloneNode(true);
  [refreshHolder, mobileRefreshHolder].forEach((el) => {
    el.addEventListener('click', (evt) => {
      evt.preventDefault();
      unityEl.dispatchEvent(new CustomEvent(refreshWidgetEvent));
    });
  });
  unityWidget.querySelector('.unity-action-area').append(refreshHolder);
  targetEl.append(mobileRefreshHolder);
}

async function removeBgHandler(changeDisplay = true) {
  const unityCfg = getUnityConfig();
  const { apiEndPoint, targetEl } = unityCfg;
  const { unityEl, interactiveSwitchEvent } = unityCfg;
  const { endpoint } = unityCfg.wfDetail.removebg;
  const img = targetEl.querySelector('picture img');
  const hasExec = unityCfg.presentState.removeBgState.srcUrl;
  if (changeDisplay
    && hasExec
    && !(img.src.startsWith(unityCfg.presentState.removeBgState.srcUrl))) {
    unityCfg.presentState.removeBgState.assetId = null;
    unityCfg.presentState.removeBgState.srcUrl = null;
  }
  const { srcUrl, assetUrl } = unityCfg.presentState.removeBgState;
  const urlIsValid = assetUrl ? await fetch(assetUrl) : null;
  if (unityCfg.presentState.removeBgState.assetId && urlIsValid?.status === 200) {
    if (changeDisplay) {
      img.src = unityCfg.presentState.removeBgState.assetUrl;
      await loadImg(img);
      unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
    }
    return false;
  }
  const { origin, pathname } = new URL(img.src);
  const imgUrl = srcUrl || (img.src.startsWith('blob:') ? img.src : `${origin}${pathname}`);
  unityCfg.presentState.removeBgState.srcUrl = imgUrl;
  const id = await uploadAsset(apiEndPoint, imgUrl);
  const removeBgOptions = {
    method: 'POST',
    headers: {
      Authorization: getGuestAccessToken(),
      'Content-Type': 'application/json',
      'x-api-key': 'leo',
    },
    body: `{"surfaceId":"Unity","assets":[{"id": "${id}"}]}`,
  };
  const response = await fetch(`${apiEndPoint}/${endpoint}`, removeBgOptions);
  if (response.status !== 200) return true;
  const { outputUrl } = await response.json();
  const opId = new URL(outputUrl).pathname.split('/').pop();
  unityCfg.presentState.removeBgState.assetId = opId;
  unityCfg.preludeState.assetId = opId;
  unityCfg.presentState.removeBgState.assetUrl = outputUrl;
  if (!changeDisplay) return true;
  img.src = outputUrl;
  await loadImg(img);
  unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
  return true;
}

async function removebg(featureName) {
  const { wfDetail, unityWidget, unityEl, progressCircleEvent } = getUnityConfig();
  const removebgBtn = unityWidget.querySelector('.ps-action-btn.removebg-button');
  if (removebgBtn) return removebgBtn;
  const btn = await createActionBtn(wfDetail[featureName].authorCfg, 'ps-action-btn removebg-button show');
  btn.addEventListener('click', async (evt) => {
    evt.preventDefault();
    try {
      unityEl.dispatchEvent(new CustomEvent(progressCircleEvent));
      await removeBgHandler();
    } catch (e) {
      // error
    } finally {
      unityEl.dispatchEvent(new CustomEvent(progressCircleEvent));
    }
  });
  return btn;
}

async function changeBgHandler(selectedUrl = null, refreshState = true) {
  const unityCfg = getUnityConfig();
  if (refreshState) resetWorkflowState();
  const { apiEndPoint, targetEl, unityWidget, unityEl, interactiveSwitchEvent } = unityCfg;
  const { endpoint } = unityCfg.wfDetail.changebg;
  const unityRetriggered = await removeBgHandler(false);
  const img = targetEl.querySelector('picture img');
  const fgId = unityCfg.presentState.removeBgState.assetId;
  const bgImg = selectedUrl || unityWidget.querySelector('.unity-option-area .changebg-options-tray img').dataset.backgroundImg;
  const { origin, pathname } = new URL(bgImg);
  const bgImgUrl = `${origin}${pathname}`;
  if (!unityRetriggered && unityCfg.presentState.changeBgState[bgImgUrl]?.assetId) {
    img.src = unityCfg.presentState.changeBgState[bgImgUrl].assetUrl;
    await loadImg(img);
    unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
    return;
  }
  const bgId = await uploadAsset(apiEndPoint, bgImgUrl);
  const changeBgOptions = {
    method: 'POST',
    headers: {
      Authorization: getGuestAccessToken(),
      'Content-Type': 'application/json',
      'x-api-key': 'leo',
    },
    body: `{
            "assets": [{ "id": "${fgId}" },{ "id": "${bgId}" }],
            "metadata": {
              "foregroundImageId": "${fgId}",
              "backgroundImageId": "${bgId}"
            }
          }`,
  };
  const response = await fetch(`${apiEndPoint}/${endpoint}`, changeBgOptions);
  if (response.status !== 200) return;
  const { outputUrl } = await response.json();
  const changeBgId = new URL(outputUrl).pathname.split('/').pop();
  unityCfg.presentState.changeBgState[bgImgUrl] = {};
  unityCfg.presentState.changeBgState[bgImgUrl].assetId = changeBgId;
  unityCfg.presentState.changeBgState[bgImgUrl].assetUrl = outputUrl;
  unityCfg.preludeState.assetId = changeBgId;
  img.src = outputUrl;
  await loadImg(img);
  unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
}

async function changebg(featureName) {
  const { unityEl, unityWidget, wfDetail, progressCircleEvent } = getUnityConfig();
  const { authorCfg } = wfDetail[featureName];
  const changebgBtn = unityWidget.querySelector('.ps-action-btn.changebg-button');
  if (changebgBtn) return changebgBtn;
  const btn = await createActionBtn(authorCfg, 'ps-action-btn changebg-button subnav-active show');
  btn.dataset.optionsTray = 'changebg-options-tray';
  const bgSelectorTray = createTag('div', { class: 'changebg-options-tray show' });
  const bgOptions = authorCfg.querySelectorAll(':scope ul li');
  [...bgOptions].forEach((o) => {
    let thumbnail = null;
    let bgImg = null;
    [thumbnail, bgImg] = o.querySelectorAll('img');
    if (!bgImg) bgImg = thumbnail;
    thumbnail.dataset.backgroundImg = bgImg.src;
    const a = createTag('a', { href: '#', class: 'changebg-option' }, thumbnail);
    bgSelectorTray.append(a);
    a.addEventListener('click', async (evt) => {
      evt.preventDefault();
      try {
        unityEl.dispatchEvent(new CustomEvent(progressCircleEvent));
        await changeBgHandler(bgImg.src, false);
      } catch (e) {
        // error
      } finally {
        unityEl.dispatchEvent(new CustomEvent(progressCircleEvent));
      }
    });
  });
  unityWidget.querySelector('.unity-option-area').append(bgSelectorTray);
  btn.addEventListener('click', () => {
    if (btn.classList.contains('subnav-active')) btn.classList.remove('subnav-active');
    else btn.classList.add('subnav-active');
    toggleDisplay(unityWidget.querySelector('.unity-option-area .changebg-options-tray'));
  });
  return btn;
}

function createSlider(tray, propertyName, label, cssFilter, minVal, maxVal) {
  const cfg = getUnityConfig();
  const { targetEl } = cfg;
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
  actionSliderInput.addEventListener('input', () => {
    const { value } = actionSliderInput;
    const centerOffset = (value - minVal) / (maxVal - minVal);
    const moveCircle = 3 + (centerOffset * 94);
    actionSliderCircle.style.left = `${moveCircle}%`;
    const img = targetEl.querySelector(':scope > picture img');
    const filterValue = cssFilter.replace('inputValue', value);
    cfg.presentState.adjustments[propertyName] = { value, filterValue };
    const imgFilters = Object.keys(cfg.presentState.adjustments);
    img.style.filter = '';
    imgFilters.forEach((f) => {
      img.style.filter += `${cfg.presentState.adjustments[f].filterValue} `;
    });
  });
  actionSliderInput.addEventListener('change', () => {
    actionSliderCircle.click();
  });
  actionSliderCircle.addEventListener('click', (evt) => {
    evt.preventDefault();
  });
  tray.append(actionDiv);
}

async function changeAdjustments(featureName) {
  const { unityWidget, wfDetail, targetEl } = getUnityConfig();
  const { authorCfg } = wfDetail[featureName];
  const adjustmentBtn = unityWidget.querySelector('.ps-action-btn.adjustment-button');
  if (adjustmentBtn) {
    const img = targetEl.querySelector(':scope > picture img');
    img.style.filter = '';
    return adjustmentBtn;
  }
  const btn = await createActionBtn(authorCfg, 'ps-action-btn adjustment-button subnav-active show');
  btn.dataset.optionsTray = 'adjustment-options-tray';
  const sliderTray = createTag('div', { class: 'adjustment-options-tray show' });
  const sliderOptions = authorCfg.querySelectorAll(':scope > ul li');
  [...sliderOptions].forEach((o) => {
    let iconName = null;
    const psAction = o.querySelector(':scope > .icon');
    [...psAction.classList].forEach((cn) => { if (cn.match('icon-')) iconName = cn; });
    const [, actionName] = iconName.split('-');
    switch (actionName) {
      case 'hue':
        createSlider(sliderTray, 'hue', o.innerText, 'hue-rotate(inputValuedeg)', -180, 180);
        break;
      case 'saturation':
        createSlider(sliderTray, 'saturation', o.innerText, 'saturate(inputValue%)', 0, 300);
        break;
      default:
        break;
    }
  });
  unityWidget.querySelector('.unity-option-area').append(sliderTray);
  btn.addEventListener('click', () => {
    if (btn.classList.contains('subnav-active')) btn.classList.remove('subnav-active');
    else btn.classList.add('subnav-active');
    toggleDisplay(unityWidget.querySelector('.unity-option-area .adjustment-options-tray'));
  });
  return btn;
}

function showFeatureButton(prevBtn, currBtn) {
  const cfg = getUnityConfig();
  const { unityWidget } = cfg;
  if (!prevBtn) {
    unityWidget.querySelector('.unity-action-area').append(currBtn);
  } else {
    prevBtn.insertAdjacentElement('afterend', currBtn);
    const prevOptionTray = prevBtn?.dataset.optionsTray;
    unityWidget.querySelector(`.unity-option-area .${prevOptionTray}`)?.classList.remove('show');
    prevBtn.classList.remove('show');
  }
  const currOptionTray = currBtn.dataset.optionsTray;
  unityWidget.querySelector(`.unity-option-area .${currOptionTray}`)?.classList.add('show');
  currBtn.classList.add('show');
}

async function changeVisibleFeature() {
  const cfg = getUnityConfig();
  const { unityWidget, enabledFeatures } = cfg;
  if (cfg.presentState.activeIdx + 1 === enabledFeatures.length) return;
  cfg.presentState.activeIdx += 1;
  const featureName = enabledFeatures[cfg.presentState.activeIdx];
  let actionBtn = null;
  switch (featureName) {
    case 'removebg':
      actionBtn = await removebg(featureName);
      break;
    case 'changebg':
      actionBtn = await changebg(featureName);
      break;
    case 'slider':
      actionBtn = await changeAdjustments(featureName);
      break;
    default:
      break;
  }
  const prevActionBtn = unityWidget.querySelector('.ps-action-btn.show');
  if (prevActionBtn === actionBtn) return;
  showFeatureButton(prevActionBtn, actionBtn);
}

async function resetWidgetState() {
  const unityCfg = getUnityConfig();
  const { unityWidget, unityEl, targetEl } = unityCfg;
  unityCfg.presentState.activeIdx = -1;
  const initImg = unityEl.querySelector(':scope picture img');
  const img = targetEl.querySelector(':scope > picture img');
  img.src = initImg.src;
  img.style.filter = '';
  await changeVisibleFeature();
  unityWidget.querySelector('.widget-product-icon')?.classList.add('show');
  unityWidget.querySelector('.widget-refresh-button').classList.remove('show');
  targetEl.querySelector(':scope > .widget-refresh-button').classList.remove('show');
  await loadImg(img);
}

async function switchProdIcon(forceRefresh = true) {
  const unityCfg = getUnityConfig();
  const { unityWidget, refreshEnabled, targetEl } = unityCfg;
  const iconHolder = unityWidget.querySelector('.widget-product-icon');
  if (!(refreshEnabled)) return;
  if (forceRefresh) {
    await resetWidgetState();
    return;
  }
  iconHolder?.classList.remove('show');
  unityWidget.querySelector('.widget-refresh-button').classList.add('show');
  targetEl.querySelector(':scope > .widget-refresh-button').classList.add('show');
}

async function uploadCallback() {
  const cfg = getUnityConfig();
  const { enabledFeatures } = cfg;
  resetWorkflowState();
  if (enabledFeatures.length === 1) return;
  await removeBgHandler();
}

export default async function init() {
  const cfg = getUnityConfig();
  const {unityEl, unityWidget, interactiveSwitchEvent, refreshWidgetEvent } = cfg;
  resetWorkflowState();
  await addProductIcon();
  await changeVisibleFeature();
  const img = cfg.targetEl.querySelector('picture img');
  const uploadBtn = await createUpload(img, uploadCallback);
  unityWidget.querySelector('.unity-action-area').append(uploadBtn);
  await initAppConnector('photoshop');
  await decorateDefaultLinkAnalytics(unityWidget);
  unityEl.addEventListener(interactiveSwitchEvent, async () => {
    await changeVisibleFeature();
    await switchProdIcon(false);
    await decorateDefaultLinkAnalytics(unityWidget);
  });
  unityEl.addEventListener(refreshWidgetEvent, async () => {
    await switchProdIcon(true);
  });
  createIntersectionObserver({ el: unityWidget, callback: switchProdIcon });
}
