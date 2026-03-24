import {
  createTag,
  setUnityLibs,
  getUnityLibs,
  unityConfig,
  defineDeviceByScreenSize,
  getConfig,
  priorityLoad,
} from '../../scripts/utils.js';

class WfInitiator {
  constructor() {
    this.el = null;
    this.targetBlock = {};
    this.unityLibs = '/unityLibs';
    this.interactiveArea = null;
    this.project = 'unity';
    this.targetConfig = {};
    this.operations = {};
    this.actionMap = {};
    this.widgetName = 'prompt-bar';
    this.widgetJsUrl = undefined;
    this.widgetCssUrl = undefined;
  }

  getWidgetNameFromClass() {
    if (!this.el) return 'prompt-bar';
    const cls = [...this.el.classList].find((c) => c.startsWith('widget-'));
    return cls ? cls.replace(/^widget-/, '') : 'prompt-bar';
  }

  static getWidgetRegistry() {
    const base = getUnityLibs();
    const widgetBase = `${base}/core/widgets`;
    return {
      'prompt-bar': [`${widgetBase}/prompt-widget/prompt-widget.js`, `${widgetBase}/prompt-widget/prompt-widget.css`],
      'prompt-with-style': [
        `${widgetBase}/prompt-with-style/prompt-with-style.js`,
        `${widgetBase}/prompt-with-style/prompt-with-style.css`,
      ],
    };
  }

  getWidgetPaths() {
    const registry = WfInitiator.getWidgetRegistry();
    const rawName = this.getWidgetNameFromClass();
    let paths;
    if (registry[rawName]) {
      this.widgetName = rawName;
      paths = registry[rawName];
    } else {
      this.widgetName = 'prompt-bar';
      paths = registry['prompt-bar'];
    }
    [this.widgetJsUrl, this.widgetCssUrl] = paths;
    return paths;
  }

  static getWidgetPathsFromEl(el) {
    const registry = WfInitiator.getWidgetRegistry();
    if (!el) return registry['prompt-bar'];
    const cls = [...el.classList].find((c) => c.startsWith('widget-'));
    const rawName = cls ? cls.replace(/^widget-/, '') : 'prompt-bar';
    return registry[rawName] || registry['prompt-bar'];
  }

  static async priorityLibFetch(workflowName, el = null) {
    const baseWfPath = `${getUnityLibs()}/core/workflow/${workflowName}`;
    const sharedWfRes = [
      `${baseWfPath}/sprite.svg`,
      `${baseWfPath}/widget.css`,
      `${baseWfPath}/widget.js`,
    ];
    const workflowRes = {
      'workflow-photoshop': () => [
        ...sharedWfRes,
        `${getUnityLibs()}/core/features/progress-circle/progress-circle.css`,
      ],
      'workflow-ai': () => [...sharedWfRes],
      'workflow-firefly': () => {
        const [widgetJs, widgetCss] = WfInitiator.getWidgetPathsFromEl(el);
        return [
          `${baseWfPath}/sprite.svg`,
          widgetCss,
          widgetJs,
        ];
      },
    };
    const commonResources = [
      `${baseWfPath}/target-config.json`,
      `${baseWfPath}/action-binder.js`,
    ];
    const wfResGetter = workflowRes[workflowName];
    const wfRes = wfResGetter ? wfResGetter() : [];
    const priorityList = [
      ...commonResources,
      ...wfRes,
    ];
    const pfr = await priorityLoad(priorityList);

    return {
      targetConfigCallRes: pfr[0],
      spriteCallRes: pfr.length > 2 ? pfr[2] : null,
    };
  }

  async init(el, project = 'unity', unityLibs = '/unitylibs', langRegion = '', langCode = '') {
    setUnityLibs(unityLibs, project);
    this.el = el;
    this.unityLibs = unityLibs;
    this.project = project;
    this.enabledFeatures = [];
    this.workflowCfg = this.getWorkFlowInformation();
    this.workflowCfg.langRegion = langRegion;
    this.workflowCfg.langCode = langCode;
    if (this.workflowCfg.name === 'workflow-firefly') {
      this.getWidgetPaths();
    } else {
      const wfBase = `${getUnityLibs()}/core/workflow/${this.workflowCfg.name}`;
      this.widgetJsUrl = `${wfBase}/widget.js`;
      this.widgetCssUrl = `${wfBase}/widget.css`;
    }
    // eslint-disable-next-line max-len
    const { targetConfigCallRes: tcfg, spriteCallRes: spriteSvg } = await WfInitiator.priorityLibFetch(
      this.workflowCfg.name,
      this.el,
    );
    [this.targetBlock, this.interactiveArea, this.targetConfig] = await this.getTarget(tcfg);
    this.getEnabledFeatures();
    this.callbackMap = {};
    this.workflowCfg.targetCfg = this.targetConfig;
    let unityWidget = null;
    if (this.targetConfig?.renderWidget) {
      const spriteContent = spriteSvg ? await spriteSvg.text() : '';
      const widgetModule = await import(this.widgetJsUrl);
      const WidgetClass = this.widgetName === 'prompt-with-style'
        ? widgetModule.PromptWithStyleWidget
        : (widgetModule.PromptWidget ?? widgetModule.default);
      unityWidget = new WidgetClass(
        this.interactiveArea,
        this.el,
        this.workflowCfg,
        spriteContent,
      );
      this.actionMap = await unityWidget.initWidget();
    } else {
      this.actionMap = this.targetConfig?.actionMap;
    }
    const { default: ActionBinder } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/action-binder.js`);
    const promptWithStyleRoot = unityWidget?.promptWithStyleRoot ?? null;
    const actionBinderBlock = this.widgetName === 'prompt-with-style'
      ? (promptWithStyleRoot || this.el)
      : this.targetBlock;
    const canvasAreaForBinder = this.widgetName === 'prompt-with-style'
      ? (promptWithStyleRoot || this.interactiveArea)
      : this.interactiveArea;
    await new ActionBinder(
      this.el,
      this.workflowCfg,
      actionBinderBlock,
      canvasAreaForBinder,
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

  async getTarget(rawTargetConfig) {
    const targetConfig = await rawTargetConfig.json();
    const prevElem = this.el.previousElementSibling;
    const supportedBlocks = Object.keys(targetConfig).filter((key) => !key.startsWith('_'));
    // eslint-disable-next-line no-underscore-dangle -- target-config.json reserved key
    const defaults = targetConfig._defaults || {};

    let targetCfg = null;
    for (let k = 0; k < supportedBlocks.length; k += 1) {
      const key = supportedBlocks[k];
      const cfg = targetConfig[key];
      const classes = key.split('.');
      let matches = true;
      // eslint-disable-next-line no-restricted-syntax
      for (const c of classes) {
        const hasClass = prevElem?.classList.contains(c);
        const hasChild = prevElem?.querySelector(`.${c}`);
        if (!(hasClass || hasChild)) {
          matches = false;
          break;
        }
      }
      if (matches) {
        targetCfg = { ...defaults, ...cfg };
        break;
      }
    }

    if (!targetCfg || !prevElem) return [null, null, null];
    await this.intEnbReendered(prevElem, targetCfg.selector);
    const ta = this.createInteractiveArea(prevElem, targetCfg.selector, targetCfg);
    prevElem.classList.add('unity-enabled');
    return [prevElem, ta, targetCfg];
  }

  static getImgSrc(pic) {
    const viewport = defineDeviceByScreenSize();
    let source = '';
    if (viewport === 'MOBILE') source = pic.querySelector('source[type="image/webp"]:not([media])');
    else source = pic.querySelector('source[type="image/webp"][media]');
    return source ? source.srcset : pic.querySelector('img').src;
  }

  createInteractiveArea(block, selector, targetCfg) {
    if (this.widgetName === 'prompt-with-style') {
      return this.el;
    }
    const iArea = createTag('div', { class: 'interactive-area' });
    const asset = block.querySelector(selector);
    if (asset.nodeName === 'PICTURE') {
      asset.querySelector('img').src = WfInitiator.getImgSrc(asset);
      [...asset.querySelectorAll('source')].forEach((s) => s.remove());
      const newPic = asset.cloneNode(true);
      this.el.querySelector(':scope > div > div').prepend(newPic);
    }
    if (!targetCfg.renderWidget && (block.classList.contains('upload') || block.classList.contains('upload-marquee'))) {
      return block.querySelectorAll(selector);
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
    let product = '';
    let feature = '';
    let psw = '';
    [...this.el.classList].forEach((cn) => {
      if (cn.match('workflow-')) wfName = cn;
      if (cn.match('product-')) product = cn.replace('product-', '');
      if (cn.match('feature-')) feature = cn.replace('feature-', '');
      if (cn.match('psw-enabled')) psw = cn;
    });
    const workflowCfg = {
      'workflow-photoshop': {
        productName: 'Photoshop',
        sfList: new Set(['removebg', 'changebg', 'slider']),
      },
      'workflow-acrobat': {
        productName: 'acrobat',
        sfList: new Set([
          'fillsign',
          'compress-pdf',
          'add-comment',
          'number-pages',
          'split-pdf',
          'crop-pages',
          'delete-pages',
          'insert-pdf',
          'extract-pages',
          'reorder-pages',
          'sendforsignature',
          'pdf-to-word',
          'pdf-to-excel',
          'pdf-to-ppt',
          'pdf-to-image',
          'pdf-to-png',
          'createpdf',
          'word-to-pdf',
          'excel-to-pdf',
          'ppt-to-pdf',
          'jpg-to-pdf',
          'png-to-pdf',
          'combine-pdf',
          'rotate-pages',
          'protect-pdf',
          'ocr-pdf',
          'chat-pdf',
          'chat-pdf-student',
          'summarize-pdf',
          'pdf-ai',
          'heic-to-pdf',
          'quiz-maker',
          'flashcard-maker',
        ]),
      },
      'workflow-ai': {
        productName: 'Express',
        sfList: new Set(['text-to-mage']),
        stList: new Set(['prompt', 'tip', 'legal', 'surpriseMe', 'generate']),
      },
      'workflow-upload': {
        productName: product,
        sfList: new Set([feature]),
        psw,
      },
      'workflow-firefly': {
        productName: 'Firefly',
        sfList: new Set(['text-to-mage']),
        stList: new Set(['prompt', 'tip', 'legal', 'generate']),
      },
    };
    if (!wfName || !workflowCfg[wfName]) return [];
    return {
      name: wfName,
      productName: workflowCfg[wfName].productName,
      supportedFeatures: workflowCfg[wfName].sfList,
      enabledFeatures: [],
      featureCfg: [],
      errors: {},
      supportedTexts: workflowCfg[wfName]?.stList ?? null,
      pswFeature: !!psw,
    };
  }

  getEnabledFeatures() {
    const { supportedFeatures, supportedTexts } = this.workflowCfg;
    const verbWidget = this.el.closest('.section')?.querySelector('.verb-widget, .study-marquee');
    if (verbWidget) {
      const verb = [...verbWidget.classList].find((cn) => supportedFeatures.has(cn));
      if (verb) this.workflowCfg.enabledFeatures.push(verb);
    }
    const configuredFeatures = this.el.querySelectorAll(':scope > div > div > ul > li > span.icon');
    configuredFeatures.forEach((cf) => {
      const cfName = [...cf.classList].find((cn) => cn.match('icon-'));
      if (!cfName) return;
      const fn = cfName.trim().replace('icon-', '');
      if (supportedFeatures.has(fn)) {
        if (!this.workflowCfg.enabledFeatures.includes(fn)) this.workflowCfg.enabledFeatures.push(fn);
        this.workflowCfg.featureCfg.push(cf.closest('li'));
      } else if (fn.includes('error')) {
        this.workflowCfg.errors[fn] = cf.closest('li').innerText;
      } else if (supportedTexts && supportedTexts.has(fn)) {
        this.workflowCfg.supportedTexts[fn] = this.workflowCfg.supportedTexts[fn] || [];
        this.workflowCfg.supportedTexts[fn].push(cf.closest('li').innerText);
      }
    });
  }
}

export default async function init(el, project = 'unity', unityLibs = '/unitylibs', unityVersion = 'v2', langRegion = 'us', langCode = 'en') {
  const { imsClientId } = getConfig();
  if (imsClientId) unityConfig.apiKey = imsClientId;
  setUnityLibs(unityLibs, project);
  await new WfInitiator().init(el, project, unityLibs, langRegion, langCode);
}
