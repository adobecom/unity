export const [setLibs, getLibs] = (() => {
  let libs;
  return [
    (prodLibs, location) => {
      libs = (() => {
        const { hostname, search } = location || window.location;
        if (!(hostname.includes('.hlx.') || hostname.includes('.aem.') || hostname.includes('local'))) return prodLibs;
        const branch = new URLSearchParams(search).get('milolibs') || 'main';
        if (branch === 'local') return 'http://localhost:6456/libs';
        return branch.includes('--') ? `https://${branch}.aem.live/libs` : `https://${branch}--milo--adobecom.aem.live/libs`;
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

export function decorateArea(area = document) {}

const miloLibs = setLibs('/libs');

const {
  createTag, getConfig, loadStyle, loadLink, loadScript, localizeLink, loadArea,
} = await import(`${miloLibs}/utils/utils.js`);
export {
  createTag, loadStyle, getConfig, loadLink, loadScript, localizeLink, loadArea,
};

export function getGuestAccessToken() {
  try {
    const { token } = window.adobeIMS.getAccessToken();
    return `Bearer ${token}`;
  } catch (e) {
    return '';
  }
}

export function getHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: getGuestAccessToken(),
    'x-api-key': apiKey,
  };
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
  const currLocale = getConfig().locale?.prefix.replace('/', '')
  return currLocale ? currLocale : 'us';
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
  return await Promise.all(promiseArr);
}

export function delay(durationMs = 1000) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('Resolved after 1 second');
    }, durationMs);
  });
}

export function updateQueryParameter(url, paramName='format', oldValue='webply', newValue='jpeg') {
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
      ...commoncfg,
    },
    stage: {
      apiEndPoint: 'https://unity-stage.adobe.io/api/v1',
      connectorApiEndPoint: 'https://unity-stage.adobe.io/api/v1/asset/connector',
      ...commoncfg,
    },
  };
  if (host.includes('hlx.page')
    || host.includes('aem.page')
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
    data.data._adobe_corpnew = { digitalData: event.detail };
  }
  window._satellite?.track('event', data);
}
