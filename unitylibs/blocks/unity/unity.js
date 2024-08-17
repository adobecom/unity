import { loadStyle } from '../../scripts/utils.js';

function getUnityLibs(prodLibs, project = 'unity') {
  let libs = '';
  const { hostname, origin } = window.location;
  if (project === 'unity') { libs = `${origin}/unitylibs`; return libs; }
  if (!hostname.includes('hlx.page')
    && !hostname.includes('hlx.live')
    && !hostname.includes('localhost')) {
    libs = prodLibs;
    return libs;
  }
  const branch = new URLSearchParams(window.location.search).get('unitylibs') || 'main';
  if (branch.indexOf('--') > -1) { libs = `https://${branch}.hlx.live/unitylibs`; return libs; }
  libs = `https://${branch}--unity--adobecom.hlx.live/unitylibs`;
  return libs;
}

function getWorkFlowInformation(el) {
  let wfName = '';
  const workflowCfg = {
    'workflow-photoshop': {
      removebg: { endpoint: 'providers/PhotoshopRemoveBackground' },
      changebg: { endpoint: 'providers/PhotoshopChangeBackground' },
      slider: {},
    },
  };
  [...el.classList].forEach((cn) => { if (cn.match('workflow-')) wfName = cn; });
  if (!wfName || !workflowCfg[wfName]) return [];
  return [wfName, workflowCfg[wfName]];
}

export default async function init(el) {
  const projectName = 'unity';
  const unitylibs = getUnityLibs('/unitylibs', projectName);
  const [wfName, wfDetail] = getWorkFlowInformation(el);
  const [{ default: wfinit }, { default: productWfInit }] = await Promise.all([
    import(`${unitylibs}/core/workflow/workflow.js`),
    import(`${unitylibs}/core/workflow/${wfName}/${wfName}.js`),
    new Promise((resolve) => {
      loadStyle(`${unitylibs}/core/styles/styles.css`, resolve);
    }),
    new Promise((resolve) => {
      loadStyle(`${getUnityLibs()}/core/workflow/${wfName}/${wfName}.css`, resolve);
    }),
    import(`${unitylibs}/core/steps/app-connector.js`),
    import(`${unitylibs}/core/workflow/${wfName}/${wfName}.js`),
  ]);
  await wfinit({
    el, projectName, unitylibs, wfName, wfDetail, productWfInit,
  });
}
