import {
  createTag,
  loadStyle,
  setUnityLibs,
  getUnityLibs,
  defineDeviceByScreenSize,
  loadLink,
} from '../../scripts/utils.js';
// import { createErrorToast } from '../steps/upload-btn.js';
// import createProgressCircle from '../features/progress-circle/progress-circle.js';

export default class WfInitiator {
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
      const hasClass = prevElem.classList.contains(supportedBlocks[k]);
      const hasChild = prevElem.querySelector(`.${supportedBlocks[k]}`);
      if (hasClass || hasChild) {
        targetCfg = targetConfig[supportedBlocks[k]];
        break;
      }
    }
    if (!targetCfg) return [null, null, null];
    await this.intEnbReendered(prevElem, targetCfg.selector);
    const ta = this.createInteractiveArea(prevElem, targetCfg.selector);
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

  createInteractiveArea(block, selector) {
    const iArea = createTag('div', { class: 'interactive-area' });
    const asset = block.querySelector(selector);
    if (asset.nodeName === 'PICTURE') {
      asset.querySelector('img').src = this.getImgSrc(asset);
      [...asset.querySelectorAll('source')].forEach((s) => s.remove());
      const newPic = asset.cloneNode(true);
      this.el.querySelector(':scope > div > div').prepend(newPic);
    }
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

// {
//   "marquee": {
//     "type": "img",
//     "selector": ".asset picture, .image picture",
//     "handler": "render",
//     "renderWidget": true,
//     "source": ".asset picture img",
//     "target": ".asset picture img"
//   },
//   "marquee.custom1": {
//     "type": "img",
//     "selector": ".asset picture, .image picture",
//     "handler": "render",
//     "renderWidget": false,
//     "source": ".asset picture img",
//     "target": ".asset picture img",
//     "workflow-config": {
//       ".action-area .con-button": "removebg",
//       ".action-area .con-button:nth-child(2)": "changebg"
//     }
//   },
//   "aside": {
//     "type": "img",
//     "selector": ".asset picture, .image picture",
//     "handler": "render",
//     "renderWidget": true
//   },
//   "dc-marquee": {
//     "type": "img",
//     "selector": ".asset picture, .image picture",
//     "handler": "render",
//     "renderWidget": false
//   }
// }
