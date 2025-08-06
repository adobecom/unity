import {
  sendAnalyticsEvent,
} from '../../../scripts/utils.js';
import ServiceHandler from './service-handler.js';

export default class ActionBinderCore {
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea;
    this.errorToastEl = null;
    this.serviceHandler = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-PS-Upload' };
  }

  extractFiles(e) {
    const files = [];
    if (e.dataTransfer?.items) {
      [...e.dataTransfer.items].forEach((item) => {
        if (item.kind === 'file') files.push(item.getAsFile());
      });
    } else if (e.target?.files) {
      [...e.target.files].forEach((file) => files.push(file));
    }
    return files;
  }

  async initActionListeners(b = this.block, actMap = this.actionMap) {
    this.serviceHandler = new ServiceHandler(
      this.workflowCfg.targetCfg.renderWidget,
      this.canvasArea,
      this.unityEl,
      this.workflowCfg,
    );

    const actions = {
      A: (el, key) => {
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.handleAction(actMap[key]);
        });
      },
      DIV: (el, key) => {
        el.addEventListener('drop', async (e) => {
          sendAnalyticsEvent(new CustomEvent('Drag and drop|UnityWidget'));
          e.preventDefault();
          e.stopPropagation();
          const files = this.extractFiles(e);
          await this.handleAction(actMap[key], files);
        });
        el.addEventListener('click', () => {
          sendAnalyticsEvent(new CustomEvent('Click Drag and drop|UnityWidget'));
        });
      },
      INPUT: (el, key) => {
        el.addEventListener('click', () => {
          this.canvasArea.forEach((element) => {
            const errHolder = element.querySelector('.alert-holder');
            if (errHolder?.classList.contains('show')) {
              element.style.pointerEvents = 'auto';
              errHolder.classList.remove('show');
            }
          });
        });
        el.addEventListener('change', async (e) => {
          const files = this.extractFiles(e);
          await this.handleAction(actMap[key], files);
          e.target.value = '';
        });
      },
    };

    Object.entries(actMap).forEach(([key]) => {
      const elements = b.querySelectorAll(key);
      if (elements && elements.length > 0) {
        elements.forEach(async (el) => {
          const actionType = el.nodeName;
          if (actions[actionType]) {
            await actions[actionType](el, key);
          }
        });
      }
    });

    window.addEventListener('pageshow', (event) => {
      const navigationEntries = window.performance.getEntriesByType('navigation');
      const historyTraversal = event.persisted
        || (typeof window.performance !== 'undefined'
          && navigationEntries.length > 0
          && navigationEntries[0].type === 'back_forward');
      if (historyTraversal) {
        window.location.reload();
      }
    });
  }

  // This method will be overridden by the full ActionBinder when loaded
  async handleAction(value, files) {
    // Load required features first
    const { default: FeatureLoader } = await import('../shared/feature-loader.js');
    const featureLoader = new FeatureLoader(this.workflowCfg);
    await featureLoader.loadWorkflowFeatures();

    // Load the full ActionBinder and delegate to it
    const { default: ActionBinder } = await import('./action-binder.js');

    // Create a temporary instance to handle the action
    const tempBinder = new ActionBinder(
      this.unityEl,
      this.workflowCfg,
      this.block,
      this.canvasArea,
      this.actionMap,
    );

    // Copy over any state that might be needed
    tempBinder.serviceHandler = this.serviceHandler;
    tempBinder.errorToastEl = this.errorToastEl;
    tempBinder.lanaOptions = this.lanaOptions;

    // Delegate to the full implementation
    await tempBinder.photoshopActionMaps(value, files);
  }

  preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }
} 