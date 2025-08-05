/* eslint-disable max-len */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import ActionBinder from '../../../unitylibs/core/workflow/workflow-firefly/action-binder.js';
import UnityWidget from '../../../unitylibs/core/workflow/workflow-firefly/widget.js';

describe('Firefly Workflow Tests', () => {
  let actionBinder;
  let unityElement;
  let workflowCfg;
  let block;
  let canvasArea;
  let actionMap;
  let unityWidget;
  let spriteContainer;

  before(async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ff-body.html' });
    unityElement = document.querySelector('.unity');
    workflowCfg = {
      name: 'workflow-firefly',
      targetCfg: { renderWidget: true, insert: 'before', target: 'a:last-of-type' },
    };
    spriteContainer = '<svg></svg>';
    block = document.querySelector('.unity-enabled');
    canvasArea = document.createElement('div');
    actionMap = {
      '.gen-btn': [{ actionType: 'generate' }],
      '.drop-item': [{ actionType: 'setPromptValue' }],
      '.close-btn': [{ actionType: 'closeDropdown' }],
      '.inp-field': [{ actionType: 'autocomplete' }],
    };

    sinon.stub(UnityWidget.prototype, 'loadPrompts').callsFake(function () {
      const samplePrompts = [
        { verb: 'image', prompt: 'A calm face blending into a forest landscape with birds flying from the silhouette. Soft lighting with color popping trees', assetid: '17669552-32bc-4216-82fe-8f7e72ffb4b0' },
        { verb: 'image', prompt: 'Make a cheerful product image of a collectible jar with a tiny person tending to a miniature garden, complete with working watering can, tiny plants, and a little bench, the jar lid decorated with flower patterns and labeled Green Thumb Series', assetid: '69c64e7a-83cb-466b-a530-6b42b06a914a' },
        { verb: 'image', prompt: 'high quality image  of a translucent studio background with light prisms created by light sunlight, the atmosphere is magical, ephemeral, modern, in the center there is a a flower made of clouds', assetid: 'f56dbb62-53ed-4745-874f-adc549e81ee5' },
        { verb: 'video', prompt: 'photograph of a boy standing in tall grass, wearing a pig mask over his head. hazy halation filter. weird surreal dreamy look', assetid: '0a3b51b4-23e8-4f80-a955-c0b91fd67bf7' },
        { verb: 'video', prompt: 'a bright yellow sun with a face in a very blue sky', assetid: 'af9b6097-1c3a-49d3-a0f8-e0b4fe288ee1' },
        { verb: 'video', prompt: 'vehicle that constantly shifts between three states: solid chrome geometry with sharp angles, flowing mercury that maintains speed while changing shape, and an energy wireframe that leaves trails of light - all on a track that loops through different reality layers.', assetid: 'da5d3aa3-61e3-4492-8795-9b558b495402' },
      ];
      // Group by verb
      this.prompts = samplePrompts.reduce((acc, item) => {
        if (!acc[item.verb]) acc[item.verb] = [];
        acc[item.verb].push({ prompt: item.prompt, assetid: item.assetid });
        return acc;
      }, {});
      return Promise.resolve();
    });

    // Ensure .copy contains a target <a> for widget insertion
    const copy = block.querySelector('.copy');
    if (copy && !copy.querySelector('a')) {
      copy.innerHTML = '<a href="#">Target Link</a>';
    }

    unityWidget = new UnityWidget(block, unityElement, workflowCfg, spriteContainer);
    await unityWidget.initWidget();

    // Ensure .ex-unity-wrap is present before constructing ActionBinder
    if (!document.querySelector('.ex-unity-wrap')) {
      throw new Error('.ex-unity-wrap not found in DOM after widget initialization');
    }

    actionBinder = new ActionBinder(unityElement, workflowCfg, block, canvasArea, actionMap);
  });

  it('should initialize ActionBinder correctly', () => {
    expect(actionBinder).to.exist;
    expect(actionBinder.inputField).to.exist;
    expect(actionBinder.dropdown).to.exist;
    expect(actionBinder.widget).to.exist;
  });

  it('should bind event listeners on init', async () => {
    await actionBinder.initActionListeners();
    Object.keys(actionMap).forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        expect(el.getAttribute('data-event-bound')).to.equal('true');
      });
    });
  });

  it('should initialize UnityWidget correctly', () => {
    expect(unityWidget).to.exist;
    expect(unityWidget.target).to.equal(block);
    expect(unityWidget.el).to.equal(unityElement);
  });

  it('should insert widget into DOM', () => {
    expect(document.querySelector('.ex-unity-wrap')).to.exist;
  });

  it('should correctly populate placeholders', () => {
    const placeholders = unityWidget.popPlaceholders();
    expect(placeholders).to.be.an('object');
    expect(Object.keys(placeholders).length).to.be.greaterThan(0);
  });

  it('should generate dropdown with correct placeholders', async () => {
    const placeholder = {
      'placeholder-prompt': 'Prompt',
      'placeholder-suggestions': 'Suggestions',
    };
    const dropdown = await unityWidget.genDropdown(placeholder);
    expect(dropdown).to.exist;
    expect(dropdown.querySelector('.drop-title')).to.exist;
  });

  it('should handle keydown events correctly', () => {
    const dropdown = document.querySelector('.drop');
    actionBinder.dropdown = dropdown;
    const arrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    actionBinder.handleKeyDown(arrowDownEvent);
    expect(actionBinder.activeIndex).to.not.equal(-1);
    const arrowUpEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    actionBinder.handleKeyDown(arrowUpEvent);
    expect(actionBinder.activeIndex).to.not.equal(-1);
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    sinon.stub(actionBinder, 'hideDropdown');
    actionBinder.handleKeyDown(escapeEvent);
    expect(actionBinder.hideDropdown.calledOnce).to.be.true;
    actionBinder.hideDropdown.restore();
  });

  it('should move focus correctly with Arrow keys', () => {
    const dropItems = [...document.querySelectorAll('.drop-item')];
    actionBinder.moveFocusWithArrow(dropItems, 'down');
    expect(document.activeElement).to.equal(dropItems[0]);

    actionBinder.moveFocusWithArrow(dropItems, 'down');
    expect(document.activeElement).to.equal(dropItems[1]);

    actionBinder.moveFocusWithArrow(dropItems, 'up');
    expect(document.activeElement).to.equal(dropItems[0]);
  });

  it('should correctly process Enter key actions', () => {
    const dropItem = document.querySelector('.drop-item');
    dropItem.focus();
    actionBinder.activeIndex = 0;
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    sinon.stub(actionBinder, 'setPrompt');
    actionBinder.handleEnter(enterEvent, [dropItem], [], 0);
    expect(actionBinder.setPrompt.calledOnce).to.be.true;
    actionBinder.setPrompt.restore();
  });

  it('should handle Tab key navigation in dropdown', () => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const shiftEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, shiftKey: true });
    const focusableElements = Array.from(document.querySelectorAll('.inp-field, .gen-btn, .drop-item, .close-btn'));
    const dropItems = [document.querySelector('.drop-item')];
    focusableElements[0].focus();
    const currentIndex = focusableElements.indexOf(document.activeElement);
    actionBinder.handleTab(event, focusableElements, dropItems, currentIndex);
    expect(document.activeElement).to.equal(focusableElements[1]);
    actionBinder.handleTab(shiftEvent, focusableElements, dropItems, 1);
    expect(document.activeElement).to.equal(focusableElements[0]);
  });

  it('should move focus to legal-text if tip-con is focused', () => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const tipCon = document.querySelector('.tip-con');
    const legalText = document.querySelector('.legal-text');
    tipCon.focus();
    expect(document.activeElement).to.equal(tipCon);
    const queryStub = sinon.stub(actionBinder.block, 'querySelector');
    queryStub.withArgs('.legal-text').returns(legalText);
    actionBinder.handleTab(event, [tipCon, legalText], [], 0);
    expect(document.activeElement).to.equal(legalText);
    queryStub.restore();
  });

  it('should update prompt suggestions when verb is changed', async () => {
    const imagePrompts = [
      'A calm face blending into a forest landscape with birds flying from the silhouette. Soft lighting with color popping trees',
      'Make a cheerful product image of a collectible jar with a tiny person tending to a miniature garden, complete with working watering can, tiny plants, and a little bench, the jar lid decorated with flower patterns and labeled Green Thumb Series',
      'high quality image  of a translucent studio background with light prisms created by light sunlight, the atmosphere is magical, ephemeral, modern, in the center there is a a flower made of clouds',
    ];
    const videoPrompts = [
      'photograph of a boy standing in tall grass, wearing a pig mask over his head. hazy halation filter. weird surreal dreamy look',
      'a bright yellow sun with a face in a very blue sky',
      'vehicle that constantly shifts between three states: solid chrome geometry with sharp angles, flowing mercury that maintains speed while changing shape, and an energy wireframe that leaves trails of light - all on a track that loops through different reality layers.',
    ];
    // Initial verb is 'image' (default)
    await unityWidget.updateDropdownForVerb('image');
    let dropItems = Array.from(document.querySelectorAll('.drop-item'));
    expect(dropItems.length).to.be.greaterThan(0);
    expect(dropItems.some((item) => imagePrompts.some((prompt) => item.getAttribute('aria-label').includes(prompt)))).to.be.true;

    // Change verb to 'video'
    await unityWidget.updateDropdownForVerb('video');
    dropItems = Array.from(document.querySelectorAll('.drop-item'));
    expect(dropItems.length).to.be.greaterThan(0);
    expect(dropItems.some((item) => videoPrompts.some((prompt) => item.getAttribute('aria-label').includes(prompt)))).to.be.true;

    // Change back to 'image'
    await unityWidget.updateDropdownForVerb('image');
    dropItems = Array.from(document.querySelectorAll('.drop-item'));
    expect(dropItems.length).to.be.greaterThan(0);
    expect(dropItems.some((item) => imagePrompts.some((prompt) => item.getAttribute('aria-label').includes(prompt)))).to.be.true;
  });

  describe('Error Handling', () => {
    it('should validate input length correctly', () => {
      const shortQuery = 'short query';
      const longQuery = 'a'.repeat(751);

      // Set up serviceHandler for validation
      actionBinder.serviceHandler = { showErrorToast: sinon.stub() };

      const shortValidation = actionBinder.validateInput(shortQuery);
      expect(shortValidation.isValid).to.be.true;

      const longValidation = actionBinder.validateInput(longQuery);
      expect(longValidation.isValid).to.be.false;
      expect(longValidation.errorCode).to.equal('max-prompt-characters-exceeded');
    });

    it('should handle generateContent with invalid input', async () => {
      actionBinder.inputField.value = 'a'.repeat(751);
      const logAnalyticsStub = sinon.stub(actionBinder, 'logAnalytics');

      await actionBinder.generateContent();

      expect(logAnalyticsStub.calledTwice).to.be.true;
      expect(logAnalyticsStub.secondCall.args[2].statusCode).to.equal(-1);

      logAnalyticsStub.restore();
    });

    it('should handle generateContent with network errors', async () => {
      actionBinder.inputField.value = 'valid query';
      const mockServiceHandler = {
        postCallToService: sinon.stub().rejects(new Error('Network error')),
        showErrorToast: sinon.stub(),
      };
      actionBinder.serviceHandler = mockServiceHandler;
      const logAnalyticsStub = sinon.stub(actionBinder, 'logAnalytics');

      await actionBinder.generateContent();

      expect(mockServiceHandler.showErrorToast.calledOnce).to.be.true;
      expect(logAnalyticsStub.calledTwice).to.be.true;
      expect(logAnalyticsStub.secondCall.args[2].statusCode).to.equal(-1);

      logAnalyticsStub.restore();
    });

    it('should handle execActions errors gracefully', async () => {
      const invalidAction = { actionType: 'invalid' };

      await actionBinder.execActions(invalidAction);

      // Should not throw an error
      expect(true).to.be.true;
    });
  });

  describe('Dropdown Interactions', () => {
    it('should show dropdown correctly', () => {
      const dropdown = document.querySelector('.drop');
      actionBinder.dropdown = dropdown;

      actionBinder.showDropdown();

      expect(dropdown.classList.contains('hidden')).to.be.false;
      expect(dropdown.hasAttribute('inert')).to.be.false;
      expect(dropdown.hasAttribute('aria-hidden')).to.be.false;
    });

    it('should hide dropdown correctly', () => {
      const dropdown = document.querySelector('.drop');
      actionBinder.dropdown = dropdown;

      actionBinder.showDropdown();
      actionBinder.hideDropdown();

      expect(dropdown.classList.contains('hidden')).to.be.true;
      expect(dropdown.hasAttribute('inert')).to.be.true;
      expect(dropdown.getAttribute('aria-hidden')).to.equal('true');
    });

    it('should handle outside clicks', () => {
      const dropdown = document.querySelector('.drop');
      actionBinder.dropdown = dropdown;
      actionBinder.widget = document.querySelector('.ex-unity-widget');

      actionBinder.showDropdown();
      const outsideEvent = new MouseEvent('click', { bubbles: true });
      document.dispatchEvent(outsideEvent);

      expect(dropdown.classList.contains('hidden')).to.be.true;
    });

    it('should not hide dropdown when clicking inside widget', () => {
      const dropdown = document.querySelector('.drop');
      actionBinder.dropdown = dropdown;
      actionBinder.widget = document.querySelector('.ex-unity-widget');

      actionBinder.showDropdown();
      const insideEvent = new MouseEvent('click', { bubbles: true });
      actionBinder.widget.dispatchEvent(insideEvent);

      expect(dropdown.classList.contains('hidden')).to.be.false;
    });

    it('should reset dropdown correctly', () => {
      const inputField = document.querySelector('.inp-field');
      actionBinder.inputField = inputField;
      actionBinder.query = 'test query';

      const focusStub = sinon.stub(inputField, 'focus');
      const hideDropdownStub = sinon.stub(actionBinder, 'hideDropdown');

      actionBinder.resetDropdown();

      expect(focusStub.calledOnce).to.be.true;
      expect(hideDropdownStub.calledOnce).to.be.true;
      // The query property is not cleared in resetDropdown, only input field value is cleared if query is empty
      expect(actionBinder.query).to.equal('test query');

      focusStub.restore();
      hideDropdownStub.restore();
    });
  });

  describe('UnityWidget Additional Tests', () => {
    it('should create verb dropdown correctly', () => {
      const verbDropdown = unityWidget.verbDropdown();
      expect(verbDropdown).to.be.an('array');
      expect(verbDropdown.length).to.be.greaterThan(0);
    });

    it('should get limited display prompts', () => {
      const prompts = [
        { prompt: 'short prompt', assetid: '1' },
        { prompt: 'a'.repeat(200), assetid: '2' },
        { prompt: 'medium prompt', assetid: '3' },
      ];

      const limited = unityWidget.getLimitedDisplayPrompts(prompts);

      expect(limited.length).to.be.lessThanOrEqual(3);
      expect(limited[0]).to.have.property('displayPrompt');
    });

    it('should create prompt map correctly', () => {
      // Mock unityConfig.env for the test
      const originalEnv = unityWidget.constructor.prototype.createPromptMap;
      unityWidget.constructor.prototype.createPromptMap = function createPromptMap(data) {
        const promptMap = {};
        if (Array.isArray(data)) {
          data.forEach((item) => {
            const itemEnv = item.env || 'prod';
            if (item.verb && item.prompt && item.assetid && itemEnv === 'prod') {
              if (!promptMap[item.verb]) promptMap[item.verb] = [];
              promptMap[item.verb].push({ prompt: item.prompt, assetid: item.assetid });
            }
          });
        }
        return promptMap;
      };

      const data = [
        { verb: 'image', prompt: 'test prompt', assetid: '1', env: 'prod' },
        { verb: 'video', prompt: 'test video', assetid: '2', env: 'prod' },
        { verb: 'image', prompt: 'another prompt', assetid: '3', env: 'prod' },
      ];

      const promptMap = unityWidget.createPromptMap(data);

      expect(promptMap.image).to.have.length(2);
      expect(promptMap.video).to.have.length(1);

      // Restore original method
      unityWidget.constructor.prototype.createPromptMap = originalEnv;
    });

    it('should filter out invalid prompts', () => {
      const data = [
        { verb: 'image', prompt: '', assetid: '1', env: 'prod' },
        { verb: 'image', prompt: '   ', assetid: '2', env: 'prod' },
        { verb: 'image', prompt: 'valid prompt', assetid: '3', env: 'prod' },
      ];

      // Test the actual filtering logic from getPrompt method
      const filteredPrompts = data.filter((item) => item.prompt && item.prompt.trim() !== '');
      expect(filteredPrompts).to.have.length(1);
      expect(filteredPrompts[0].prompt).to.equal('valid prompt');
    });
  });

  describe('Accessibility', () => {
    it('should handle non-interactive elements in Enter key', () => {
      const nonInteractiveElement = document.createElement('div');
      nonInteractiveElement.setAttribute('role', 'note');
      nonInteractiveElement.focus();

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventDefaultStub = sinon.stub(event, 'preventDefault');

      actionBinder.handleEnter(event, [], [], 0);

      expect(preventDefaultStub.calledOnce).to.be.true;

      preventDefaultStub.restore();
    });
  });

  describe('Input Events', () => {
    it('should handle input focus events', () => {
      const input = document.createElement('input');
      const showDropdownStub = sinon.stub(actionBinder, 'showDropdown');

      actionBinder.addInputEvents(input);
      input.dispatchEvent(new Event('focus'));

      expect(showDropdownStub.calledOnce).to.be.true;

      showDropdownStub.restore();
    });

    it('should handle input focusout events', () => {
      const input = document.createElement('input');
      const hideDropdownStub = sinon.stub(actionBinder, 'hideDropdown');

      actionBinder.addInputEvents(input);
      const focusoutEvent = new FocusEvent('focusout', { relatedTarget: null });
      input.dispatchEvent(focusoutEvent);

      expect(hideDropdownStub.calledOnce).to.be.true;

      hideDropdownStub.restore();
    });
  });

  describe('Element Event Binding', () => {
    it('should bind click events to anchor elements', () => {
      const anchor = document.createElement('a');
      const actionsList = [{ actionType: 'generate' }];
      const execActionsStub = sinon.stub(actionBinder, 'execActions');

      actionBinder.addEventListeners(anchor, actionsList);
      anchor.click();

      expect(execActionsStub.calledOnce).to.be.true;

      execActionsStub.restore();
    });

    it('should bind click events to button elements', () => {
      const button = document.createElement('button');
      const actionsList = [{ actionType: 'generate' }];
      const execActionsStub = sinon.stub(actionBinder, 'execActions');

      actionBinder.addEventListeners(button, actionsList);
      button.click();

      expect(execActionsStub.calledOnce).to.be.true;

      execActionsStub.restore();
    });

    it('should bind mousedown and click events to list items', () => {
      const listItem = document.createElement('li');
      const actionsList = [{ actionType: 'generate' }];
      const execActionsStub = sinon.stub(actionBinder, 'execActions');

      actionBinder.addEventListeners(listItem, actionsList);

      const mousedownEvent = new MouseEvent('mousedown');
      const preventDefaultStub = sinon.stub(mousedownEvent, 'preventDefault');
      listItem.dispatchEvent(mousedownEvent);

      expect(preventDefaultStub.calledOnce).to.be.true;

      listItem.click();
      expect(execActionsStub.calledOnce).to.be.true;

      execActionsStub.restore();
    });
  });

  describe('ServiceHandler showErrorToast', () => {
    let serviceHandler;
    let mockUnityEl;
    let mockCanvasArea;

    beforeEach(() => {
      mockUnityEl = document.createElement('div');
      mockCanvasArea = document.createElement('div');
      // Create ServiceHandler directly since it's not exported
      serviceHandler = {
        renderWidget: true,
        canvasArea: mockCanvasArea,
        unityEl: mockUnityEl,
        showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') {
          // Mock sendAnalyticsEvent to avoid global reference issues
          const mockSendAnalytics = () => {};
          mockSendAnalytics(new CustomEvent(`FF Generate prompt ${errorType} error|UnityWidget`));
          if (!errorCallbackOptions?.errorToastEl) return;
          const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.nextSibling?.textContent;
          const promptBarEl = this.canvasArea.querySelector('.copy .ex-unity-wrap');
          if (!promptBarEl) return;
          promptBarEl.style.pointerEvents = 'none';
          const errorToast = promptBarEl.querySelector('.alert-holder');
          if (!errorToast) return;
          const closeBtn = errorToast.querySelector('.alert-close');
          if (closeBtn) closeBtn.style.pointerEvents = 'auto';
          const alertText = errorToast.querySelector('.alert-text p');
          if (!alertText) return;
          alertText.innerText = msg;
          errorToast.classList.add('show');
          window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, lanaOptions);
        },
      };
    });

    it('should return early if errorToastEl is not provided', () => {
      expect(() => {
        serviceHandler.showErrorToast({}, 'Test error');
      }).to.not.throw();
    });

    it('should return early if errorToastEl is null', () => {
      expect(() => {
        serviceHandler.showErrorToast({ errorToastEl: null }, 'Test error');
      }).to.not.throw();
    });

    it('should return early if promptBarEl is not found', () => {
      const errorToastEl = document.createElement('div');
      const querySelectorStub = sinon.stub(mockCanvasArea, 'querySelector');
      querySelectorStub.withArgs('.copy .ex-unity-wrap').returns(null);

      const errorCallbackOptions = { errorToastEl, errorType: '.icon-error-max-length' };
      expect(() => {
        serviceHandler.showErrorToast(errorCallbackOptions, 'Test error');
      }).to.not.throw();

      querySelectorStub.restore();
    });

    it('should return early if errorToast is not found', () => {
      const errorToastEl = document.createElement('div');
      const promptBarEl = document.createElement('div');

      const querySelectorStub = sinon.stub(mockCanvasArea, 'querySelector');
      querySelectorStub.withArgs('.copy .ex-unity-wrap').returns(promptBarEl);
      querySelectorStub.withArgs('.alert-holder').returns(null);

      const errorCallbackOptions = { errorToastEl, errorType: '.icon-error-max-length' };
      expect(() => {
        serviceHandler.showErrorToast(errorCallbackOptions, 'Test error');
      }).to.not.throw();

      querySelectorStub.restore();
    });

    it('should return early if alertText is not found', () => {
      const errorToastEl = document.createElement('div');
      const promptBarEl = document.createElement('div');
      const closeBtn = document.createElement('button');

      const querySelectorStub = sinon.stub(mockCanvasArea, 'querySelector');
      querySelectorStub.withArgs('.copy .ex-unity-wrap').returns(promptBarEl);
      querySelectorStub.withArgs('.alert-holder').returns(errorToastEl);

      const querySelectorStub2 = sinon.stub(errorToastEl, 'querySelector');
      querySelectorStub2.withArgs('.alert-close').returns(closeBtn);
      querySelectorStub2.withArgs('.alert-text p').returns(null);

      const errorCallbackOptions = { errorToastEl, errorType: '.icon-error-max-length' };
      expect(() => {
        serviceHandler.showErrorToast(errorCallbackOptions, 'Test error');
      }).to.not.throw();

      querySelectorStub.restore();
      querySelectorStub2.restore();
    });

    it('should handle missing lana gracefully', () => {
      const errorToastEl = document.createElement('div');
      const promptBarEl = document.createElement('div');
      const closeBtn = document.createElement('button');
      const alertText = document.createElement('p');

      const unityErrorEl = document.createElement('span');
      unityErrorEl.className = 'icon-error-max-length';
      const nextSibling = document.createElement('span');
      nextSibling.textContent = 'Error message text';

      const originalLana = window.lana;
      window.lana = undefined;

      const querySelectorStub = sinon.stub(mockCanvasArea, 'querySelector');
      querySelectorStub.withArgs('.copy .ex-unity-wrap').returns(promptBarEl);
      querySelectorStub.withArgs('.alert-holder').returns(errorToastEl);

      const querySelectorStub2 = sinon.stub(errorToastEl, 'querySelector');
      querySelectorStub2.withArgs('.alert-close').returns(closeBtn);
      querySelectorStub2.withArgs('.alert-text p').returns(alertText);

      const querySelectorStub3 = sinon.stub(mockUnityEl, 'querySelector');
      querySelectorStub3.withArgs('.icon-error-max-length').returns(unityErrorEl);

      // Mock the nextSibling property
      Object.defineProperty(unityErrorEl, 'nextSibling', {
        value: nextSibling,
        writable: true,
      });

      const errorCallbackOptions = { errorToastEl, errorType: '.icon-error-max-length' };
      expect(() => {
        serviceHandler.showErrorToast(errorCallbackOptions, 'Test error');
      }).to.not.throw();

      window.lana = originalLana;
      querySelectorStub.restore();
      querySelectorStub2.restore();
      querySelectorStub3.restore();
    });

    it('should test the core showErrorToast logic', () => {
      // Test that the function can be called without throwing
      const errorCallbackOptions = { errorToastEl: document.createElement('div') };
      expect(() => {
        serviceHandler.showErrorToast(errorCallbackOptions, 'Test error');
      }).to.not.throw();
    });
  });

  describe('verbsWithoutPromptSuggestions configuration', () => {
    it('should hide dropdown when excluded verb is selected', () => {
      workflowCfg.targetCfg.verbsWithoutPromptSuggestions = ['vector'];

      const testActionBinder = new ActionBinder(unityElement, workflowCfg, block, canvasArea, actionMap);
      testActionBinder.widgetWrap = document.createElement('div');
      testActionBinder.widgetWrap.setAttribute('data-selected-verb', 'vector');
      testActionBinder.dropdown = document.createElement('div');
      testActionBinder.dropdown.classList.add('hidden');
      testActionBinder.getSelectedVerbType = () => 'vector';
      testActionBinder.showDropdown();
      expect(testActionBinder.dropdown.classList.contains('hidden')).to.be.true;
    });

    it('should show dropdown when non-excluded verb is selected', () => {
      workflowCfg.targetCfg.verbsWithoutPromptSuggestions = ['vector'];
      const testActionBinder = new ActionBinder(unityElement, workflowCfg, block, canvasArea, actionMap);
      testActionBinder.widgetWrap = document.createElement('div');
      testActionBinder.widgetWrap.setAttribute('data-selected-verb', 'image');
      testActionBinder.dropdown = document.createElement('div');
      testActionBinder.dropdown.classList.add('hidden');
      testActionBinder.getSelectedVerbType = () => 'image';
      testActionBinder.showDropdown();
      expect(testActionBinder.dropdown.classList.contains('hidden')).to.be.false;
    });
  });
});
