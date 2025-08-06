import { sendAnalyticsEvent } from '../../../scripts/utils.js';

export default class AIActionBinderCore {
  constructor(unityEl, workflowCfg, block, canvasArea, actionMap = {}) {
    this.unityEl = unityEl;
    this.workflowCfg = workflowCfg;
    this.block = block;
    this.canvasArea = canvasArea;
    this.actionMap = actionMap;
    this.actions = actionMap;
    this.query = '';
    this.maxResults = 0;
    this.sendAnalyticsOnFocus = true;
    this.activeIndex = -1;
    this.suggestion = [];
    this.errorToastEl = null;
    this.serviceHandler = null;
    this.lanaOptions = { sampleRate: 100, tags: `Unity-${workflowCfg.productName}` };
  }

  async initActionListeners() {
    // AI workflow has its own initialization logic
    this.apiConfig = this.initializeApiConfig();
    this.inputField = this.getElement('.inp-field');
    this.dropdown = this.getElement('.drop');
    this.surpriseBtn = this.getElement('.surprise-btn');
    this.widget = this.getElement('.ex-unity-widget');
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundOutsideClickHandler = this.handleOutsideClick.bind(this);
    this.widgetWrap = this.getElement('.ex-unity-wrap');
    this.scrRead = this.createScreenReader();
    this.widgetWrap.append(this.scrRead);
    this.addAccessibility();

    // Set up event listeners for AI-specific elements
    Object.entries(this.actions).forEach(([selector, actionsList]) => {
      const elements = this.block.querySelectorAll(selector);
      elements.forEach((el) => {
        if (!el.hasAttribute('data-event-bound')) {
          this.addEventListeners(el, actionsList);
          el.setAttribute('data-event-bound', 'true');
        }
      });
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

    // Delegate to the full implementation
    await tempBinder.execActions(value);
  }

  // Helper methods that will be overridden by the full ActionBinder
  initializeApiConfig() {
    // This will be overridden by the full ActionBinder
    return {};
  }

  getElement(selector) {
    // This will be overridden by the full ActionBinder
    return null;
  }

  addEventListeners(el, actionsList) {
    // This will be overridden by the full ActionBinder
  }

  handleKeyDown(ev) {
    // This will be overridden by the full ActionBinder
  }

  handleOutsideClick(event) {
    // This will be overridden by the full ActionBinder
  }

  addAccessibility() {
    // This will be overridden by the full ActionBinder
  }

  createScreenReader() {
    // This will be overridden by the full ActionBinder
    return document.createElement('div');
  }
} 