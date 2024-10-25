import {
  createTag,
  loadStyle,
  setUnityLibs,
  getUnityLibs,
  unityConfig,
  defineDeviceByScreenSize,
  getConfig,
  loadLink,
} from '../../scripts/utils.js';

export function getImgSrc(pic) {
  const viewport = defineDeviceByScreenSize();
  let source = '';
  if (viewport === 'MOBILE') source = pic.querySelector('source[type="image/webp"]:not([media])');
  else source = pic.querySelector('source[type="image/webp"][media]');
  return source.srcset;
}

function checkRenderStatus(targetBlock, res, rej, etime, rtime) {
  if (etime > 20000) { rej(); return; }
  if (targetBlock.querySelector('.text') && targetBlock.querySelector('.asset, .image')) res();
  else setTimeout(() => checkRenderStatus(targetBlock, res, rej, etime + rtime), rtime);
}

function intEnbReendered(targetBlock) {
  return new Promise((res, rej) => {
    try {
      checkRenderStatus(targetBlock, res, rej, 0, 100);
    } catch (err) { rej(); }
  });
}

function createInteractiveArea(el, pic) {
  const iArea = createTag('div', { class: 'interactive-area' });
  const iWidget = createTag('div', { class: 'unity-widget decorating' });
  const unityaa = createTag('div', { class: 'unity-action-area' });
  const unityoa = createTag('div', { class: 'unity-option-area' });
  iWidget.append(unityoa, unityaa);
  pic.querySelector('img').src = getImgSrc(pic);
  [...pic.querySelectorAll('source')].forEach((s) => s.remove());
  const newPic = pic.cloneNode(true);
  const p = createTag('p', {}, newPic);
  el.querySelector(':scope > div > div').prepend(p);
  iArea.append(pic, iWidget);
  if (el.classList.contains('light')) iArea.classList.add('light');
  else iArea.classList.add('dark');
  return [iArea, iWidget];
}

async function getTargetArea(el) {
  const metadataSec = el.closest('.section');
  const intEnb = metadataSec.querySelector('.marquee, .aside');
  try {
    intEnb.classList.add('unity-enabled');
    await intEnbReendered(intEnb);
  } catch (err) { return null; }
  if (el.classList.contains('mobile-image-bottom')) intEnb.classList.add('mobile-image-bottom');
  const asset = intEnb.querySelector('.asset picture, .image picture');
  const container = asset.closest('p');
  const [iArea, iWidget] = createInteractiveArea(el, asset);
  const assetArea = intEnb.querySelector('.asset, .image');
  if (container) container.replaceWith(iArea);
  else assetArea.append(iArea);
  return [iArea, iWidget];
}

function getEnabledFeatures(unityEl, wfDetail) {
  const enabledFeatures = [];
  const supportedFeatures = Object.keys(wfDetail);
  const configuredFeatures = unityEl.querySelectorAll(':scope ul > li > span.icon');
  configuredFeatures.forEach((cf) => {
    const cfName = [...cf.classList].find((cn) => cn.match('icon-'));
    if (!cfName) return;
    const fn = cfName.split('-')[1];
    const isEnabled = supportedFeatures.indexOf(fn);
    if (isEnabled > -1) {
      enabledFeatures.push(fn);
      wfDetail[fn].authorCfg = cf.closest('li');
    }
  });
  return enabledFeatures;
}

function getWorkFlowInformation(el) {
  let wfName = '';
  const workflowCfg = {
    'workflow-photoshop': {
      removebg: { endpoint: 'providers/PhotoshopRemoveBackground' },
      changebg: { endpoint: 'providers/PhotoshopChangeBackground' },
      slider: {},
    },
    'workflow-acrobat': {},
  };
  [...el.classList].forEach((cn) => { if (cn.match('workflow-')) wfName = cn; });
  if (!wfName || !workflowCfg[wfName]) return [];
  return [wfName, workflowCfg[wfName]];
}

async function initWorkflow(cfg) {
  loadStyle(`${getUnityLibs()}/core/workflow/${cfg.wfName}/${cfg.wfName}.css`);
  const { default: wfinit } = await import(`./${cfg.wfName}/${cfg.wfName}.js`);
  await wfinit(cfg);
  cfg.unityWidget?.classList.remove('decorating');
  const actionBtn = cfg.unityWidget.querySelector('.unity-action-btn');
  actionBtn?.classList.add('animate-btn');
  cfg.unityWidget.addEventListener('mouseover', () => {
    actionBtn?.classList.remove('animate-btn');
  }, { once: true });
}

export class WfInitiator {
  constructor() {
    this.el = null;
    this.targetBlock = {};
    this.unityLibs = '/unityLibs';
    this.interactiveArea = null;
    this.project = 'unity';
    this.targetConfig = {};
    this.operations = {};
    this.actionMap = {};
  }

  async priorityLibFetch(renderWidget, workflowName) {
    const priorityList = [
      `${getUnityLibs()}/core/workflow/${workflowName}/action-binder.js`,
    ];
    if (renderWidget) {
      priorityList.push(
        `${getUnityLibs()}/core/workflow/${workflowName}/widget.css`,
        `${getUnityLibs()}/core/workflow/${workflowName}/widget.js`,
      );
    }
    const promiseArr = [];
    priorityList.forEach((p) => {
      if (p.endsWith('.js')) {
        const pr = new Promise((res) => { loadLink(p, { as: 'script', rel: 'modulepreload', callback: res }); });
        promiseArr.push(pr);
      } else if (p.endsWith('.css')) {
        const pr = new Promise((res) => { loadLink(p, { rel: 'stylesheet', callback: res }); });
        promiseArr.push(pr);
      } else {
        promiseArr.push(fetch(p));
      }
    });
    await Promise.all(promiseArr);
  }

  async init(el, project = 'unity', unityLibs = '/unitylibs') {
    setUnityLibs(unityLibs, project);
    this.el = el;
    this.unityLibs = unityLibs;
    this.project = project;
    this.enabledFeatures = [];
    this.workflowCfg = this.getWorkFlowInformation();
    [this.targetBlock, this.interactiveArea, this.targetConfig] = await this.getTarget();
    this.getEnabledFeatures();
    this.callbackMap = {};
    this.workflowCfg.targetCfg = this.targetConfig;
    await this.priorityLibFetch(this.targetConfig.renderWidget, this.workflowCfg.name);
    if (this.targetConfig.renderWidget) {
      loadStyle(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/widget.css`);
      const { default: UnityWidget } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/widget.js`);
      this.actionMap = await new UnityWidget(
        this.interactiveArea,
        this.el,
        this.workflowCfg,
      ).initWidget();
    } else {
      this.actionMap = this.targetConfig.actionMap;
    }
    const { default: ActionBinder } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/action-binder.js`);
    await new ActionBinder(
      this.workflowCfg,
      this.targetBlock,
      this.interactiveArea,
      this.actionMap,
    ).initActionListeners();
  }

  checkRenderStatus(block, selector, res, rej, etime, rtime) {
    if (etime > 20000) { rej(); return; }
    if (block.querySelector(selector)) res();
    else setTimeout(() => this.checkRenderStatus(block, selector, res, rej, etime + rtime), rtime);
  }

  intEnbReendered(block, selector) {
    return new Promise((res, rej) => {
      try {
        this.checkRenderStatus(block, selector, res, rej, 0, 100);
      } catch (err) { rej(); }
    });
  }

  async getTarget() {
    const res = await fetch(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/target-config.json`);
    const targetConfig = await res.json();
    const prevElem = this.el.previousElementSibling;
    const supportedBlocks = Object.keys(targetConfig);
    let targetCfg = null;
    for (let k = 0; k < supportedBlocks.length; k += 1) {
      const classes = supportedBlocks[k].split('.');
      let hasAllClasses = true;
      for (let c of classes) {
        const hasClass = prevElem.classList.contains(c);
        const hasChild = prevElem.querySelector(`.${c}`);
        if (!(hasClass || hasChild)) {
          hasAllClasses = false;
          break;
        }
      }
      if (hasAllClasses) {
        targetCfg = targetConfig[supportedBlocks[k]];
        break;
      }
    }
    if (!targetCfg) return [null, null, null];
    await this.intEnbReendered(prevElem, targetCfg.selector);
    let ta = null;
    ta = this.createInteractiveArea(prevElem, targetCfg.selector, targetCfg);
    prevElem.classList.add('unity-enabled');
    return [prevElem, ta, targetCfg];
  }

  getImgSrc(pic) {
    const viewport = defineDeviceByScreenSize();
    let source = '';
    if (viewport === 'MOBILE') source = pic.querySelector('source[type="image/webp"]:not([media])');
    else source = pic.querySelector('source[type="image/webp"][media]');
    return source ? source.srcset : pic.querySelector('img').src;
  }

  createInteractiveArea(block, selector, targetCfg) {
    const iArea = createTag('div', { class: 'interactive-area' });
    const asset = block.querySelector(selector);
    if (asset.nodeName === 'PICTURE') {
      asset.querySelector('img').src = this.getImgSrc(asset);
      [...asset.querySelectorAll('source')].forEach((s) => s.remove());
      const newPic = asset.cloneNode(true);
      this.el.querySelector(':scope > div > div').prepend(newPic);
    }
    if (!targetCfg.renderWidget) return null;
    asset.insertAdjacentElement('beforebegin', iArea);
    iArea.append(asset);
    if (this.el.classList.contains('light')) iArea.classList.add('light');
    else iArea.classList.add('dark');
    return iArea;
  }

  getWorkFlowInformation() {
    let wfName = '';
    const workflowCfg = {
      'workflow-photoshop': new Set(['removebg', 'changebg', 'slider']),
      'workflow-acrobat': new Set([]),
    };
    [...this.el.classList].forEach((cn) => { if (cn.match('workflow-')) wfName = cn; });
    if (!wfName || !workflowCfg[wfName]) return [];
    return {
      name: wfName,
      supportedFeatures: workflowCfg[wfName],
      enabledFeatures: [],
      featureCfg: [],
    };
  }

  getEnabledFeatures() {
    const { supportedFeatures } = this.workflowCfg;
    const configuredFeatures = this.el.querySelectorAll(':scope > div > div > ul > li > span.icon');
    configuredFeatures.forEach((cf) => {
      const cfName = [...cf.classList].find((cn) => cn.match('icon-'));
      if (!cfName) return;
      const fn = cfName.split('-')[1];
      if (supportedFeatures.has(fn)) {
        this.workflowCfg.enabledFeatures.push(fn);
        this.workflowCfg.featureCfg.push(cf.closest('li'));
      }
    });
  }
}


export default async function init(el, project = 'unity', unityLibs = '/unitylibs', unityVersion = 'v1') {
  const uv = new URLSearchParams(window.location.search).get('unityversion') || unityVersion;
  console.log(uv);
  switch (uv) {
    case 'v1':
      const { imsClientId } = getConfig();
      if (imsClientId) unityConfig.apiKey = imsClientId;
      setUnityLibs(unityLibs, project);
      const [targetBlock, unityWidget] = await getTargetArea(el);
      if (!targetBlock) return;
      const [wfName, wfDetail] = getWorkFlowInformation(el);
      if (!wfName || !wfDetail) return;
      const enabledFeatures = getEnabledFeatures(el, wfDetail);
      if (!enabledFeatures) return;
      const wfConfig = {
        unityEl: el,
        targetEl: targetBlock,
        unityWidget,
        wfName,
        wfDetail,
        enabledFeatures,
        uploadState: { },
        ...unityConfig,
      };
      await initWorkflow(wfConfig);
      break;
    case 'v2':
      await new WfInitiator().init(el, project, unityLibs);
    default:
      break;
  }
}
