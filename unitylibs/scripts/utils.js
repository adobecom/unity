//dummy commit to sync code on codebusp
export const [setLibs, getLibs] = (() => {
  let libs;
  return [
    (prodLibs, location) => {
      libs = (() => {
        const { hostname, search } = location || window.location;
        if (!(hostname.includes('.hlx.') || hostname.includes('.aem.') || hostname.includes('local'))) return prodLibs;
        const branch = new URLSearchParams(search).get('milolibs') || 'main';
        if (branch === 'local') return 'http://localhost:6456/libs';
        const env = hostname.includes('.hlx.') ? 'hlx' : 'aem';
        return branch.includes('--') ? `https://${branch}.${env}.live/libs` : `https://${branch}--milo--adobecom.${env}.live/libs`;
      })();
      return libs;
    }, () => libs,
  ];
})();

export const [setUnityLibs, getUnityLibs] = (() => {
  let libs;
  return [
    (libPath, project = 'unity') => {
      if (project === 'unity') { libs = `${origin}/unitylibs`; return libs; }
      libs = libPath;
      return libs;
    }, () => libs,
  ];
})();

export function decorateArea() {}

const miloLibs = setLibs('/libs');

const {
  createTag, getConfig, loadStyle, loadLink, loadScript, localizeLink, loadArea,
} = await import(`${miloLibs}/utils/utils.js`);
export {
  createTag, loadStyle, getConfig, loadLink, loadScript, localizeLink, loadArea,
};

async function getRefreshToken() {
  try {
    const { tokenInfo } = window.adobeIMS ? await window.adobeIMS.refreshToken() : {};
    return tokenInfo;
  } catch (e) {
    return {
      token: null,
      error: e,
    };
  }
}

async function attemptTokenRefresh() {
  const refreshResult = await getRefreshToken();
  if (!refreshResult.error) {
    return { token: refreshResult, error: null };
  }
  return refreshResult;
}

export async function getFlatObject() {
  const { default: flattenObject } = await import(`${getUnityLibs()}/utils/ObjectUtils.js`);
  return flattenObject;
}

async function getImsToken() {
  const RETRY_WAIT = 2000;
  try {
    const accessToken = window.adobeIMS?.getAccessToken();
    if (!accessToken || accessToken?.expire.valueOf() <= Date.now() + (5 * 60 * 1000)) {
      const reason = !accessToken ? 'access_token_null' : 'access_token_expired';
      const firstAttempt = await attemptTokenRefresh();
      if (!firstAttempt.error) return firstAttempt;
      await new Promise((resolve) => { setTimeout(resolve, RETRY_WAIT); });
      const retryAttempt = await attemptTokenRefresh();
      if (!retryAttempt.error) return retryAttempt;
      const flattenObject = await getFlatObject();
      return {
        token: null,
        error: {
          message: `Token refresh failed after retry. refresh_error_${reason}`,
          originalError: flattenObject(retryAttempt.error),
          originalToken: accessToken,
        },
      };
    }
    return { token: accessToken, error: null };
  } catch (error) {
    const flattenObject = await getFlatObject();
    return {
      token: null,
      error: {
        message: `Error getting IMS access token: ${flattenObject(error)}`,
        type: 'token_error',
      },
    };
  }
}

export async function getGuestAccessToken() {
  const result = await getImsToken();
  return `Bearer ${result.token?.token}`;
}

export async function isGuestUser() {
  const result = await getImsToken();
  if (result.error) {
    return {
      isGuest: null,
      error: result.error,
    };
  }
  return { isGuest: result.token?.isGuestToken, error: null };
}

export async function getApiCallOptions(method, apiKey, additionalHeaders = {}, options = {}) {
  return {
    method,
    headers: await getHeaders(apiKey, additionalHeaders),
    ...options,
  };
}

export async function getHeaders(apiKey, additionalHeaders = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    Authorization: await getGuestAccessToken(),
    'x-api-key': apiKey,
  };
  return Object.keys(additionalHeaders).length > 0
    ? { ...defaultHeaders, ...additionalHeaders }
    : defaultHeaders;
}

export function defineDeviceByScreenSize() {
  const DESKTOP_SIZE = 1200;
  const MOBILE_SIZE = 600;
  const screenWidth = window.innerWidth;
  if (screenWidth >= DESKTOP_SIZE) return 'DESKTOP';
  if (screenWidth <= MOBILE_SIZE) return 'MOBILE';
  return 'TABLET';
}

export function getLocale() {
  const currLocale = getConfig().locale?.prefix.replace('/', '');
  return currLocale || 'us';
}

export async function loadSvg(src) {
  try {
    const res = await fetch(src, { mode: 'no-cors' });
    if (!res.status === 200) return null;
    const svg = await res.text();
    return svg;
  } catch (e) {
    return '';
  }
}

export async function loadSvgs(svgs) {
  const promiseArr = [];
  [...svgs].forEach((svg) => {
    promiseArr.push(
      fetch(svg.src)
        .then((res) => {
          if (res.ok) return res.text();
          throw new Error('Could not fetch SVG');
        })
        .then((txt) => { svg.parentElement.innerHTML = txt; })
        .catch(() => { svg.remove(); }),
    );
  });
  await Promise.all(promiseArr);
}

export function loadImg(img) {
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

export async function createActionBtn(btnCfg, btnClass, iconAsImg = false, swapOrder = false) {
  const txt = btnCfg.innerText;
  const img = btnCfg.querySelector('img[src*=".svg"]');
  const actionBtn = createTag('a', { href: '#', class: `unity-action-btn ${btnClass}` });
  if (img) {
    let btnImg = null;
    const { pathname } = new URL(img.src);
    const libSrcPath = `${getUnityLibs().split('/unitylibs')[0]}${pathname}`;
    if (iconAsImg) btnImg = createTag('img', { src: libSrcPath });
    else btnImg = await loadSvg(libSrcPath);
    const btnIcon = createTag('div', { class: 'btn-icon' }, btnImg);
    actionBtn.append(btnIcon);
  }
  if (txt) {
    const btnTxt = createTag('div', { class: 'btn-text' }, txt.split('\n')[0].trim());
    if (swapOrder) actionBtn.prepend(btnTxt);
    else actionBtn.append(btnTxt);
  }
  return actionBtn;
}

export async function priorityLoad(parr) {
  const promiseArr = [];
  parr.forEach((p) => {
    if (p.endsWith('.js')) {
      const pr = loadScript(p, 'module', { mode: 'async' });
      promiseArr.push(pr);
    } else if (p.endsWith('.css')) {
      const pr = new Promise((res) => { loadLink(p, { rel: 'stylesheet', callback: res }); });
      promiseArr.push(pr);
    } else {
      promiseArr.push(fetch(p));
    }
  });
  return Promise.all(promiseArr);
}

export async function retryRequestUntilProductRedirect(cfg, requestFunction, retryDelay = 1000) {
  while (cfg.continueRetrying) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const scanResponse = await requestFunction();
      if (scanResponse.status === 429 || (scanResponse.status >= 500 && scanResponse.status < 600)) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => { setTimeout(res, retryDelay); });
      } else {
        cfg.scanResponseAfterRetries = scanResponse;
        return scanResponse;
      }
    } catch (e) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => { setTimeout(res, retryDelay); });
    }
  }
  return cfg.scanResponseAfterRetries;
}

export function createIntersectionObserver({ el, callback, cfg, options = {} }) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        callback(cfg);
      }
    });
  }, options);
  io.observe(el);
  return io;
}

export function delay(durationMs = 1000) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('Resolved after 1 second');
    }, durationMs);
  });
}

export function updateQueryParameter(url, paramName = 'format', oldValue = 'webply', newValue = 'jpeg') {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    if (params.get(paramName) === oldValue) {
      params.set(paramName, newValue);
    }

    return urlObj.toString();
  } catch (error) {
    return null;
  }
}

export const unityConfig = (() => {
  const { host } = window.location;
  const commoncfg = {
    apiKey: 'leo',
    refreshWidgetEvent: 'unity:refresh-widget',
    interactiveSwitchEvent: 'unity:interactive-switch',
    trackAnalyticsEvent: 'unity:track-analytics',
    errorToastEvent: 'unity:show-error-toast',
    surfaceId: 'unity',
  };
  const cfg = {
    prod: {
      apiEndPoint: 'https://unity.adobe.io/api/v1',
      connectorApiEndPoint: 'https://unity.adobe.io/api/v1/asset/connector',
      env: 'prod',
      ...commoncfg,
    },
    stage: {
      apiEndPoint: 'https://unity-stage.adobe.io/api/v1',
      connectorApiEndPoint: 'https://unity-stage.adobe.io/api/v1/asset/connector',
      env: 'stage',
      ...commoncfg,
    },
  };
  if (host.includes('hlx.page')
    || host.includes('hlx.live')
    || host.includes('aem.page')
    || host.includes('aem.live')
    || host.includes('localhost')
    || host.includes('stage.adobe')
    || host.includes('corp.adobe')
    || host.includes('graybox.adobe')) {
    return cfg.stage;
  }
  return cfg.prod;
})();

export function sendAnalyticsEvent(event) {
  const data = {
    xdm: {},
    data: { web: { webInteraction: { name: event?.type } } },
  };
  if (event?.detail) {
    data.data._adobe_corpnew = { digitalData: event.detail }; // eslint-disable-line no-underscore-dangle
  }
  window._satellite?.track('event', data); // eslint-disable-line no-underscore-dangle
}
