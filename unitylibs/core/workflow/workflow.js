import {
  createTag,
  setUnityLibs,
  getUnityLibs,
  unityConfig,
  defineDeviceByScreenSize,
  getConfig,
  priorityLoad,
} from '../../scripts/utils.js';

/**
 * Which Firefly prompt bundle to preload: `widget-prompt-with-style` on the Unity block → style-select, else prompt-widget.
 * Used by the `workflow-firefly` entry in `workflowRes` (see `priorityLibFetch`).
 *
 * @param {HTMLElement | null} el
 * @param {string} widgetsBase
 * @returns {string | null}
 */
function promptWidgetJsPathFromEl(el, widgetsBase) {
  if (!el) return null;
  return el.classList.contains('widget-prompt-with-style')
    ? `${widgetsBase}/prompt-with-style-select/prompt-with-style-select.js`
    : `${widgetsBase}/prompt-widget/prompt-widget.js`;
}

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
  }

  /**
   * @param {string} workflowName
   * @param {HTMLElement | null} [el] — Unity block; for `workflow-firefly` only, appends the matching prompt widget `.css` + `.js` to the batch.
   * @returns {Promise<{ targetConfigCallRes: Response, spriteCallRes: Response | null }>}
   */
  static async priorityLibFetch(workflowName, el = null) {
    const baseWfPath = `${getUnityLibs()}/core/workflow/${workflowName}`;
    const widgetsBase = `${getUnityLibs()}/core/widgets`;
    const sharedWfRes = [
      `${baseWfPath}/sprite.svg`,
      `${baseWfPath}/widget.css`,
      `${baseWfPath}/widget.js`,
    ];
    /** @type {Record<string, () => string[]>} */
    const workflowRes = {
      'workflow-photoshop': () => [
        ...sharedWfRes,
        `${getUnityLibs()}/core/features/progress-circle/progress-circle.css`,
      ],
      'workflow-ai': () => [...sharedWfRes],
      'workflow-firefly': () => {
        const promptJs = promptWidgetJsPathFromEl(el, widgetsBase);
        return [
          ...sharedWfRes,
          ...(promptJs ? [promptJs.replace(/\.js$/, '.css'), promptJs] : []),
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
      const widgetsBase = `${getUnityLibs()}/core/widgets`;
      let WidgetClass;
      if (this.el.classList.contains('widget-prompt-with-style')) {
        ({ PromptWithStyleSelectWidget: WidgetClass } = await import(
          `${widgetsBase}/prompt-with-style-select/prompt-with-style-select.js`
        ));
      } else {
        ({ PromptWidget: WidgetClass } = await import(`${widgetsBase}/prompt-widget/prompt-widget.js`));
      }
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
    const promptWithStyleSelectRoot = unityWidget?.promptWithStyleSelectRoot ?? null;
    const actionBinderBlock = this.el.classList.contains('widget-prompt-with-style')
      ? (promptWithStyleSelectRoot || this.el)
      : this.targetBlock;
    const canvasAreaForBinder = this.el.classList.contains('widget-prompt-with-style')
      ? (promptWithStyleSelectRoot || this.interactiveArea)
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

  /**
   * @param {Response} rawTargetConfig — `target-config.json` response from `priorityLibFetch` (body consumed here).
   */
  async getTarget(rawTargetConfig) {
    const targetConfig = await rawTargetConfig.json();
    const prevElem = this.el.previousElementSibling;
    // List `widget-prompt-with-style` before `hero-marquee` (etc.) in target-config.json so the loop matches it first.
    const supportedBlocks = Object.keys(targetConfig).filter((key) => !key.startsWith('_'));
    // eslint-disable-next-line no-underscore-dangle -- target-config.json reserved key
    const defaults = targetConfig._defaults || {};

    let targetCfg = null;
    for (let k = 0; k < supportedBlocks.length; k += 1) {
      const key = supportedBlocks[k];
      const cfg = targetConfig[key];
      let matches = false;
      if (key === 'widget-prompt-with-style') {
        matches = this.workflowCfg.name === 'workflow-firefly'
          && this.el.classList.contains('widget-prompt-with-style');
      } else {
        const classes = key.split('.');
        matches = true;
        // eslint-disable-next-line no-restricted-syntax
        for (const c of classes) {
          const hasClass = prevElem?.classList.contains(c);
          const hasChild = prevElem?.querySelector(`.${c}`);
          if (!(hasClass || hasChild)) {
            matches = false;
            break;
          }
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
    if (this.el.classList.contains('widget-prompt-with-style')) {
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

// eslint-disable-next-line no-unused-vars -- reserved API slot (version) for future use
export default async function init(el, project = 'unity', unityLibs = '/unitylibs', unityVersion = 'v2', langRegion = 'us', langCode = 'en') {
  const { imsClientId } = getConfig();
  if (imsClientId) unityConfig.apiKey = imsClientId;
  setUnityLibs(unityLibs, project);
  await new WfInitiator().init(el, project, unityLibs, langRegion, langCode);
}
