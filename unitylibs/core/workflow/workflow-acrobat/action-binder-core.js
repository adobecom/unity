export default class AcrobatActionBinderCore {
  constructor(unityEl, workflowCfg, wfblock, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = wfblock;
    this.actionMap = actionMap;
    this.canvasArea = canvasArea;
    this.errorToastEl = null;
    this.serviceHandler = null;
    this.lanaOptions = { sampleRate: 100, tags: `Unity-${workflowCfg.productName}` };
    this.isUploading = false;
    this.abortController = null;
    this.assetId = null;
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
    const actions = {
      A: (el, key) => {
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.handleAction(actMap[key]);
        });
      },
      DIV: (el, key) => {
        el.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const files = this.extractFiles(e);
          await this.handleAction(actMap[key], files);
        });
        el.addEventListener('click', () => {
          // Analytics event
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

    // Add page show event listener for history navigation
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
    tempBinder.isUploading = this.isUploading;
    tempBinder.abortController = this.abortController;
    tempBinder.assetId = this.assetId;

    // Delegate to the full implementation
    await tempBinder.acrobatActionMaps(value, files);
  }

  preventDefault(e) {
    e.preventDefault();
    e.stopPropagation();
  }
} 