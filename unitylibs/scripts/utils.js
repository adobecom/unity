export const [setLibs, getLibs] = (() => {
  let libs;
  return [
    (prodLibs, location) => {
      libs = (() => {
        const { hostname, search } = location || window.location;
        if (!(hostname.includes('.hlx.') || hostname.includes('local'))) return prodLibs;
        const branch = new URLSearchParams(search).get('milolibs') || 'main';
        if (branch === 'local') return 'http://localhost:6456/libs';
        return branch.includes('--') ? `https://${branch}.hlx.live/libs` : `https://${branch}--milo--adobecom.hlx.live/libs`;
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

const { createTag, getConfig, loadStyle, loadLink } = await import(`${miloLibs}/utils/utils.js`);
export { createTag, loadStyle, getConfig, loadLink };
const { decorateDefaultLinkAnalytics } = await import(`${miloLibs}/martech/attributes.js`);
export { decorateDefaultLinkAnalytics };

export function getGuestAccessToken() {
  const { token } = window.adobeIMS.getAccessToken();
  return `Bearer ${token}`;
}

export function defineDeviceByScreenSize() {
  const DESKTOP_SIZE = 1200;
  const MOBILE_SIZE = 600;
  const screenWidth = window.innerWidth;
  if (screenWidth >= DESKTOP_SIZE) return 'DESKTOP';
  if (screenWidth <= MOBILE_SIZE) return 'MOBILE';
  return 'TABLET';
}

export async function loadSVG(svgs) {
  const promiseArr = [];
  [...svgs].forEach((svg) => {
    promiseArr.push(
      fetch(svg.src)
        .then((res) => { 
          if (res.ok) return res.text();
          else throw new Error('Could not fetch SVG');
        })
        .then((txt) => { svg.parentElement.innerHTML = txt; })
        .catch((e) => { svg.remove() }),
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

export function createActionBtn(btnCfg, btnClass, hasInputel = false, swapOrder = false) {
  const txt = btnCfg.innerText;
  const img = btnCfg.querySelector('img[src*=".svg"]');
  const actionBtn = createTag('a', { href: '#', class: `unity-action-btn ${btnClass}` });
  if (img) { actionBtn.append(createTag('div', { class: 'btn-icon' }, img)); }
  if (txt) {
    const btnTxt = createTag('div', { class: 'btn-text' }, txt.split('\n')[0].trim());
    if (swapOrder) actionBtn.prepend(btnTxt);
    else actionBtn.append(btnTxt);
  }
  // if (!hasInputel) actionBtn.addEventListener('click', (e) => { e.preventDefault(); });
  return actionBtn;
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

export const unityConfig = (() => {
  const { host } = window.location;
  const cfg = {
    prod: {
      apiKey: 'leo',
      apiEndPoint: 'https://unity.adobe.io/api/v1',
      connectorApiEndPoint: 'https://unity.adobe.io/api/v1/asset/connector',
    },
    stage: {
      apiKey: 'leo',
      apiEndPoint: 'https://unity-stage.adobe.io/api/v1',
      connectorApiEndPoint: 'https://unity-stage.adobe.io/api/v1/asset/connector',
    },
  };
  if (host.includes('hlx.page')
    || host.includes('localhost')
    || host.includes('stage.adobe')
    || host.includes('corp.adobe')
    || host.includes('graybox.adobe')) {
    return cfg.stage;
  }
  return cfg.prod;
})();
