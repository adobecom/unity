import { createTag, getGuestAccessToken, getUnityConfig } from '../../../scripts/utils.js';
import { uploadAsset } from '../../steps/upload-step.js';

function toggleOptionTrayDisplay() {
  const { unityWidget } = getUnityConfig();
  const unityOptTray = unityWidget.querySelector('.unity-option-area');
  if (unityOptTray.style.display === 'none') unityOptTray.style.display = 'flex';
  else unityOptTray.style.display = 'none';
}

function createActionBtn(btnCfg) {
  const txt = btnCfg.innerText;
  const img = btnCfg.querySelector('img[src*=".svg"]');
  const actionBtn = createTag('a', { class: 'unity-action-btn' });
  if (img) {
    const actionSvg = createTag('img', { class: 'btn-icon' }, img);
    actionBtn.append(actionSvg);
  }
  if (txt) {
    const actionText = createTag('div', { class: 'btn-text' }, txt);
    actionBtn.append(actionText);
  }
  return actionBtn;
}

function loadImg(img) {
  return new Promise((res) => {
    img.loading = 'eager';
    img.fetchpriority = 'high';
    if (img.complete) res();
    else {
      img.onload = () => res();
      img.onerror = () => res();
    }
  });
}

async function resetActiveState() {
  const unityCfg = getUnityConfig();
  const { unityEl, unityWidget, targetEl } = unityCfg;
  const iconHolder = unityWidget.querySelector('.product-refresh-holder');
  iconHolder.classList.add('show-product');
  iconHolder.classList.remove('show-refresh');
  unityCfg.presentState.activeIdx = -1;
  changeVisibleFeature();
  const initImg = unityEl.querySelector(':scope picture img');
  const img = targetEl.querySelector('picture img');
  img.src = initImg.src;
  await loadImg(img);
}

async function switchProdIcon(refresh = false) {
  const unityCfg = getUnityConfig();
  const { unityWidget } = unityCfg;
  const iconHolder = unityWidget.querySelector('.product-refresh-holder');
  if (refresh) {
    await resetActiveState(unityCfg);
    return;
  }
  iconHolder.classList.add('show-refresh');
  iconHolder.classList.remove('show-product');
}

function addProductIcon() {
  const unityCfg = getUnityConfig();
  const { unityEl, unityWidget } = unityCfg;
  unityCfg.refreshEnabled = false;
  const refreshCfg = unityEl.querySelector('.icon-product-icon');
  if (!refreshCfg) return;
  const [prodIcon, refreshIcon] = refreshCfg.closest('li').querySelectorAll('img[src*=".svg"]');
  const iconHolder = createTag('div', { class: 'product-refresh-holder show-product' }, prodIcon);
  if (refreshIcon) {
    iconHolder.append(refreshIcon);
    unityCfg.refreshEnabled = true;
    refreshIcon.addEventListener('click', async () => {
      await switchProdIcon(true);
    });
  }
  unityWidget.querySelector('.unity-action-area').append(iconHolder);
}

function resetWorkflowState() {
  const unityCfg = getUnityConfig();
  unityCfg.presentState = {
    activeIdx: -1,
    removeBgState: {
      assetId: null,
      assetUrl: null,
    },
    changeBgState: {},
    hueState: {},
    satState: {},
  };
}

async function removeBgHandler(changeDisplay = true) {
  const unityCfg = getUnityConfig();
  const { apiEndPoint, targetEl } = unityCfg;
  const { unityEl, interactiveSwitchEvent } = unityCfg;
  const { endpoint } = unityCfg.wfDetail.removebg;
  const img = targetEl.querySelector('picture img');
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
  const imgUrl = srcUrl || `${origin}${pathname}`;
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
  unityCfg.presentState.removeBgState.assetUrl = outputUrl;
  if (!changeDisplay) return true;
  img.src = outputUrl;
  await loadImg(img);
  unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
  return true;
}

function removebg(featureName) {
  const { unityWidget, wfDetail } = getUnityConfig();
  const btn = createActionBtn(wfDetail[featureName].authorCfg);
  unityWidget.querySelector('.unity-action-area').append(btn);
  btn.addEventListener('click', async () => {
    await removeBgHandler();
  });
}

async function changeBgHandler(selectedUrl = null, refreshState = true) {
  const unityCfg = getUnityConfig();
  if (refreshState) resetWorkflowState();
  const { apiEndPoint, targetEl, unityWidget, unityEl, interactiveSwitchEvent } = unityCfg;
  const { endpoint } = unityCfg.wfDetail.changebg;
  const unityRetriggered = await removeBgHandler(false);
  const img = targetEl.querySelector('picture img');
  const fgId = unityCfg.presentState.removeBgState.assetId;
  const bgImg = selectedUrl || unityWidget.querySelector('.unity-option-area .changebg-selector-tray img').dataset.backgroundImg;
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
  img.src = outputUrl;
  await loadImg(img);
  unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
}

function changebg(featureName) {
  const { unityWidget, wfDetail } = getUnityConfig();
  const { authorCfg } = wfDetail[featureName];
  const btn = createActionBtn(authorCfg);
  unityWidget.querySelector('.unity-action-area').append(btn);
  const bgSelectorTray = createTag('div', { class: 'changebg-selector-tray' });
  const bgOptions = authorCfg.querySelectorAll(':scope ul li');
  [...bgOptions].forEach((o) => {
    let [thumbnail, bgImg] = o.querySelectorAll('img');
    if (!bgImg) bgImg = thumbnail;
    thumbnail.dataset.backgroundImg = bgImg.src;
    const a = createTag('a', { class: 'changebg-option' }, thumbnail);
    bgSelectorTray.append(a);
    a.addEventListener('click', async () => {
      await changeBgHandler(bgImg.src, false);
    });
  });
  unityWidget.querySelector('.unity-option-area').append(bgSelectorTray);
  btn.addEventListener('click', () => {
    toggleOptionTrayDisplay();
  });
}

function changeHueSat(featureName) {
  const { unityWidget } = getUnityConfig();
  const featureBtn = unityWidget.querySelector('.unity-button');
  const a = createTag('a', { class: 'unity-button changebg-button' }, 'Change BG');
  if (!featureBtn) unityWidget.append(a);
  else featureBtn.replaceWith(a);
  a.addEventListener('click', async () => {
    await changeBgHandler();
  });
}

function changeVisibleFeature() {
  const cfg = getUnityConfig();
  const { enabledFeatures } = cfg;
  if (cfg.presentState.activeIdx + 1 === enabledFeatures.length) return;
  cfg.presentState.activeIdx += 1;
  const featureName = enabledFeatures[cfg.presentState.activeIdx];
  switch (featureName) {
    case 'removebg':
      removebg(featureName);
      break;
    case 'changebg':
      changebg(featureName);
      break;
    case 'huesat':
      changeHueSat(featureName);
      break;
    default:
      break;
  }
}

export default async function initUnity() {
  const cfg = getUnityConfig();
  cfg.interactiveSwitchEvent = 'unity:ps-interactive-switch';
  resetWorkflowState();
  addProductIcon();
  changeVisibleFeature();
  cfg.unityEl.addEventListener(cfg.interactiveSwitchEvent, () => {
    changeVisibleFeature();
    if (cfg.refreshEnabled) switchProdIcon();
  });
}
