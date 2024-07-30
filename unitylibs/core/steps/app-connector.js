import { createActionBtn, getGuestAccessToken, createIntersectionObserver } from '../../scripts/utils.js';

function getPreludeData(cfg) {
  const dataObj = {
    assetId: cfg.preludeState.assetId,
    targetProduct: 'Photoshop',
    payload: { operations: [...cfg.preludeState.operations] },
  };
  if (cfg.presentState?.adjustments
    && (cfg.presentState?.adjustments.hue
    || cfg.presentState?.adjustments.saturation)) {
    const imageAdjustment = {
      name: 'imageAdjustment',
      target: '',
      hue: parseInt(cfg.presentState?.adjustments.hue.value, 10),
      sat: parseInt(cfg.presentState?.adjustments.saturation.value, 10),
    };
    dataObj.payload.operations.push(imageAdjustment);
  }
  return dataObj;
}

async function continueInApp(cfg, appName, btnConfig) {
  const { unityEl, unityWidget, connectorApiEndPoint, apiKey, errorToastEvent } = cfg;
  const continuebtn = unityWidget.querySelector(`continue-in-${appName}`);
  if (continuebtn) return continuebtn;
  const btn = await createActionBtn(btnConfig, `continue-in-app continue-in-${appName}`, true, true);
  btn.addEventListener('click', async (evt) => {
    evt.preventDefault();
    const data = getPreludeData(cfg);
    const connectorOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: getGuestAccessToken(),
        'x-api-key': apiKey,
      },
      body: JSON.stringify(data),
    };
    const response = await fetch(connectorApiEndPoint, connectorOptions);
    if (response.status !== 200) {
      unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { className: '.icon-error-request' } }));
      return '';
    }
    const { url } = await response.json();
    window.location.href = url;
    return true;
  });
  return btn;
}

function resetAppConnector(cfg) {
  const connectBtn = cfg.unityWidget.querySelector('.continue-in-app');
  connectBtn?.classList.remove('show');
}

export default async function initAppConnector(cfg, appName) {
  const { unityEl, unityWidget, refreshWidgetEvent, interactiveSwitchEvent } = cfg;
  const isContinueEnabled = unityEl.querySelector('.icon-app-connector');
  if (!isContinueEnabled) return;
  const btnConfig = isContinueEnabled.closest('li');
  const connectBtn = await continueInApp(cfg, appName, btnConfig);
  unityWidget.querySelector('.unity-action-area').append(connectBtn);
  unityEl.addEventListener(refreshWidgetEvent, () => {
    connectBtn?.classList.remove('show');
  });
  unityEl.addEventListener(interactiveSwitchEvent, () => {
    connectBtn?.classList.add('show');
  });
  createIntersectionObserver({ el: connectBtn, callback: resetAppConnector, cfg });
}
