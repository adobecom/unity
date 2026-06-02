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
  }

  getWidgetNameFromClass() {
    const cls = [...this.el.classList].find((c) => c.startsWith('widget-'));
    return cls ? cls.replace(/^widget-/, '') : 'prompt-bar';
  }

  static widgetPathsForName(name) {
    const widgetBase = `${getUnityLibs()}/core/widgets/${name}`;
    return [`${widgetBase}/${name}.js`, `${widgetBase}/${name}.css`];
  }

  getWidgetPaths() {
    this.widgetName = this.getWidgetNameFromClass();
    return WfInitiator.widgetPathsForName(this.widgetName);
  }

  static getWidgetPathsFromEl(el) {
    const cls = el && [...el.classList].find((c) => c.startsWith('widget-'));
    const name = cls ? cls.replace(/^widget-/, '') : 'prompt-bar';
    return WfInitiator.widgetPathsForName(name);
  }

  async priorityLibFetch(workflowName) {
    const baseWfPath = `${getUnityLibs()}/core/workflow/${workflowName}`;
    const bundledWidgetAssets = [
      `${baseWfPath}/sprite.svg`,
      `${baseWfPath}/widget.js`,
      `${baseWfPath}/widget.css`,
    ];
    const fireflyShared = [`${baseWfPath}/sprite.svg`, ...this.getWidgetPaths()];

    const workflowRes = {
      'workflow-photoshop': [
        ...bundledWidgetAssets,
        `${getUnityLibs()}/core/features/progress-circle/progress-circle.css`,
      ],
      'workflow-ai': [...bundledWidgetAssets],
      'workflow-firefly': fireflyShared,
      'workflow-prompt-bar-upload': [
        `${baseWfPath}/sprite.svg`,
        ...this.getWidgetPaths(),
      ],
      'workflow-inline-action': [
        `${baseWfPath}/sprite.svg`,
        `${getUnityLibs()}/core/styles/splash-screen.css`,
        ...this.getWidgetPaths(),
      ],
    };
    const commonResources = [
      `${baseWfPath}/target-config.json`,
      `${baseWfPath}/action-binder.js`,
    ];
    const wfRes = workflowRes[workflowName] || [];
    const priorityList = [...commonResources, ...wfRes];
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
    // eslint-disable-next-line max-len
    const { targetConfigCallRes: tcfg, spriteCallRes: spriteSvg } = await this.priorityLibFetch(this.workflowCfg.name);
    [this.targetBlock, this.interactiveArea, this.targetConfig] = await this.getTarget(tcfg);
    this.getEnabledFeatures();
    this.callbackMap = {};
    this.workflowCfg.targetCfg = this.targetConfig;
    let unityWidgetObject = null;
    if (this.targetConfig.renderWidget) {
      const widgetPath = (this.workflowCfg.name === 'workflow-photoshop' || this.workflowCfg.name === 'workflow-ai')
        ? `${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/widget.js`
        : WfInitiator.widgetPathsForName(this.widgetName)[0];
      const { default: UnityWidget } = await import(widgetPath);
      const spriteContent = await spriteSvg.text();
      unityWidgetObject = new UnityWidget(
        this.interactiveArea,
        this.el,
        this.workflowCfg,
        spriteContent,
      );
      this.actionMap = await unityWidgetObject.initWidget();
    } else {
      this.actionMap = this.targetConfig.actionMap;
    }
    const { default: ActionBinder } = await import(`${getUnityLibs()}/core/workflow/${this.workflowCfg.name}/action-binder.js`);
    const isExtendedWidget = (this.targetConfig?.extendedWidgets ?? []).includes(this.widgetName);
    const extendedLayoutRoot = isExtendedWidget ? (unityWidgetObject?.promptBarExtendedRoot || null) : null;
    const actionBinderBlock = isExtendedWidget ? extendedLayoutRoot : this.targetBlock;
    const canvasAreaForBinder = isExtendedWidget ? extendedLayoutRoot : this.interactiveArea;
    await new ActionBinder(
      this.el,
      this.workflowCfg,
      actionBinderBlock,
      canvasAreaForBinder,
      this.actionMap,
      unityWidgetObject,
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
    const defaults = targetConfig._defaults || {};
    if (defaults.mountOnUnityEl) {
      const iArea = createTag('div', { class: 'interactive-area' });
      if (this.el.classList.contains('light')) iArea.classList.add('light');
      else iArea.classList.add('dark');
      this.el.prepend(iArea);
      this.el.classList.add('unity-enabled');
      return [this.el, iArea, { ...defaults }];
    }
    const prevElem = this.el.previousElementSibling;
    const supportedBlocks = Object.keys(targetConfig).filter((key) => !key.startsWith('_'));

    let targetCfg = null;
    for (let k = 0; k < supportedBlocks.length; k += 1) {
      const classes = supportedBlocks[k].split('.');
      let hasAllClasses = true;
      // eslint-disable-next-line no-restricted-syntax
      for (const c of classes) {
        const hasClass = prevElem?.classList.contains(c);
        const hasChild = prevElem?.querySelector(`.${c}`);
        if (!(hasClass || hasChild)) {
          hasAllClasses = false;
          break;
        }
      }
      if (hasAllClasses) {
        targetCfg = { ...defaults, ...targetConfig[supportedBlocks[k]] };
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
    if ((targetCfg?.extendedWidgets ?? []).includes(this.widgetName)) return this.el;
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
          'mindmap-maker',
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
      'workflow-prompt-bar-upload': {
        productName: product || 'Firefly',
        sfList: new Set([feature || 'image-to-video']),
      },
      'workflow-firefly': {
        productName: 'Firefly',
        sfList: new Set(['text-to-mage']),
        stList: new Set(['prompt', 'tip', 'legal', 'generate']),
      },
      'workflow-inline-action': {
        productName: product || 'Firefly',
        sfList: new Set([feature]),
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
    const verbWidget = this.el.closest('.section')?.querySelector('.verb-widget, .study-marquee, .verb-marquee');
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
      } else if (cfName.startsWith('icon-nba-') && this.workflowCfg.name === 'workflow-inline-action') {
        const nbaFn = cfName.replace('icon-nba-', '');
        if (!this.workflowCfg.enabledFeatures.includes(nbaFn)) this.workflowCfg.enabledFeatures.push(nbaFn);
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
