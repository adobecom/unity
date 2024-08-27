import { loadStyle } from '../../scripts/utils.js';
let count = 1;
function getUnityLibs(prodLibs, project = 'unity') {
  const { hostname, origin } = window.location;
  if (project === 'unity') { return `${origin}/unitylibs`; }
  if (!hostname.includes('hlx.page')
    && !hostname.includes('hlx.live')
    && !hostname.includes('localhost')) {
    return prodLibs;
  }
  const branch = new URLSearchParams(window.location.search).get('unitylibs') || 'main';
  if (branch.indexOf('--') > -1) return `https://${branch}.hlx.live/unitylibs`;
  return `https://${branch}--unity--adobecom.hlx.live/unitylibs`;
}

export default async function init(el) {
  if (count > 1) return;
  const unitylibs = getUnityLibs();
  const stylePromise = new Promise((resolve) => {
    loadStyle(`${unitylibs}/core/styles/styles.css`, resolve);
  });
  await stylePromise;
  // const { default: wfinit } = await import(`${unitylibs}/core/workflow/workflow.js`);
  // await wfinit(el, 'cc', unitylibs);
  const { default: WfInit } = await import(`${unitylibs}/core/workflow/workflow.js`);
  await new WfInit().init(el, unitylibs);
  count += 1;
}
