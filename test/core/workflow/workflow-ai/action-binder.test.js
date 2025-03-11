import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-ai/action-binder.js';

describe('ActionBinder Class Unit Tests', () => {
  let actionBinder;
  let unityElement;
  let workflowCfg;
  let block;
  let canvasArea;
  let actionMap;
  before(async () => {
    document.body.innerHTML = await readFile({ path: '../mocks/exp-body.html' });
    unityElement = document.querySelector('.unity');
    block = document.querySelector('.unity-enabled');
    canvasArea = document.createElement('div');
    workflowCfg = {
      name: 'workflow-ai',
      placeholder: { 'placeholder-no-suggestions': 'No Suggestions available' },
      targetCfg: { renderWidget: true, actionMap: {} },
      supportedTexts: { prompt: ['prompt1', 'prompt2', 'prompt3'] },
    };
    actionMap = {
      '.inp-field': [{ actionType: 'autocomplete' }],
      '.surprise-btn': [{ actionType: 'surprise' }],
      '.gen-btn': [{ actionType: 'generate' }],
      '.drop-item': [{ actionType: 'setPromptValue' }],
      '.refresh-btn': [{ actionType: 'refreshSuggestion' }],
      '.close-btn': [{ actionType: 'closeDropdown' }],
    };
    actionBinder = new ActionBinder(unityElement, workflowCfg, block, canvasArea, actionMap);
  });
  it('should initialize ActionBinder instance correctly', () => {
    expect(actionBinder).to.exist;
    expect(actionBinder.inputField).to.exist;
    expect(actionBinder.dropdown).to.exist;
    expect(actionBinder.surpriseBtn).to.exist;
    expect(actionBinder.widget).to.exist;
  });
  it('should call initActionListeners and bind event listeners', async () => {
    await actionBinder.initActionListeners();
    const inputField = document.querySelector('.inp-field');
    const surpriseBtn = document.querySelector('.surprise-btn');
    const genBtn = document.querySelector('.gen-btn');
    const dropItem = document.querySelector('.drop-item');
    expect(inputField.getAttribute('data-event-bound')).to.equal('true');
    expect(surpriseBtn.getAttribute('data-event-bound')).to.equal('true');
    expect(genBtn.getAttribute('data-event-bound')).to.equal('true');
    expect(dropItem.getAttribute('data-event-bound')).to.equal('true');
  });
  it('should initialize action on iOS and bind event listeners', async () => {
    const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    Object.defineProperty(navigator, 'userAgent', {
      value: 'iPhone',
      configurable: true,
    });
    const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    const inputField = document.createElement('input');
    inputField.classList.add('inp-field');
    document.body.appendChild(inputField);
    actionBinder.inputField = inputField;
    const initActionListenersSpy = sinon.spy(actionBinder, 'initActionListeners');
    const showDropdownSpy = sinon.spy(actionBinder, 'showDropdown');
    actionBinder.initAction();
    const pageShowEvent = new Event('pageshow');
    Object.defineProperty(pageShowEvent, 'persisted', { value: true });
    window.dispatchEvent(pageShowEvent);
    inputField.dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    expect(initActionListenersSpy.calledOnce).to.be.true;
    expect(showDropdownSpy.calledOnce).to.be.true;
    expect(document.activeElement).to.equal(inputField);
    if (originalUserAgent) {
      Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    }
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState);
    }
    initActionListenersSpy.restore();
    showDropdownSpy.restore();
  });
  it('should handle user input and update query', async () => {
    await actionBinder.initActionListeners();
    const inputField = document.querySelector('.inp-field');
    expect(inputField).to.exist;
    actionBinder.addInputEvents(inputField, ['autocomplete']);
    inputField.value = 'Test Input';
    inputField.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => { setTimeout(resolve, 1100); });
    expect(actionBinder.query).to.equal('Test Input');
  });
  it('should show suggestion dropdown when we focus on input', async () => {
    await actionBinder.initActionListeners();
    const inputField = document.querySelector('.inp-field');
    expect(inputField).to.exist;
    inputField.dispatchEvent(new Event('focus', { bubbles: true }));
    expect(actionBinder.sendAnalyticsOnFocus).to.be.false;
  });
  it('should hide the dropdown when input loses focus and relatedTarget is outside widget', async () => {
    await actionBinder.initActionListeners();
    const hideDropdownSpy = sinon.spy(actionBinder, 'hideDropdown');
    const inputField = document.querySelector('.inp-field');
    expect(inputField).to.exist;
    const focusOutEvent = new FocusEvent('focusout', {
      relatedTarget: document.createElement('div'),
      bubbles: true,
    });
    inputField.dispatchEvent(focusOutEvent);
    expect(hideDropdownSpy.calledOnce).to.be.true;
    hideDropdownSpy.restore();
  });
  it('should Show No sugestion available in the dropdown', async () => {
    const mockResponse = { completions: [] };
    actionBinder.serviceHandler = { postCallToService: sinon.stub().resolves(mockResponse) };
    actionBinder.query = 'test';
    await actionBinder.fetchAutoComplete();
    expect(actionBinder.serviceHandler.postCallToService.calledOnce).to.be.true;
  });
  it('should fetch autocomplete suggestions', async () => {
    const mockResponse = { completions: ['suggestion1', 'suggestion2'] };
    actionBinder.serviceHandler = { postCallToService: sinon.stub().resolves(mockResponse) };
    actionBinder.query = 'test';
    await actionBinder.fetchAutoComplete();
    expect(actionBinder.serviceHandler.postCallToService.calledOnce).to.be.true;
  });
  it('should trigger surprise action', async () => {
    await actionBinder.initActionListeners();
    sinon.stub(actionBinder, 'generateContent');
    await actionBinder.triggerSurprise();
    expect(actionBinder.generateContent.calledOnce).to.be.true;
    actionBinder.generateContent.restore();
  });
  it('should generate content', async () => {
    await actionBinder.initActionListeners();
    sinon.stub(actionBinder, 'generateContent');
    await actionBinder.generateContent();
    expect(actionBinder.generateContent.calledOnce).to.be.true;
    actionBinder.generateContent.restore();
  });
  it('should correctly process enter key actions', async () => {
    await actionBinder.initActionListeners();
    const dropdown = document.querySelector('#prompt-dropdown');
    dropdown.classList.remove('hidden');
    const dropdownItem = dropdown.querySelector('.drop-item');
    dropdownItem.focus();
    actionBinder.activeIndex = 0;
    const dropItems = actionBinder.getDropdownItems();
    const focusElems = actionBinder.getFocusElems(dropItems.length > 0);
    const currIdx = focusElems.indexOf(document.activeElement);
    actionBinder.handleEnter(new KeyboardEvent('keydown', { key: 'Enter' }), dropItems, focusElems, currIdx);
    expect(actionBinder.query).to.equal('suggestion1');
  });
  it('should refresh suggestions with cached data', async () => {
    sinon.stub(actionBinder, 'displaySuggestions');
    actionBinder.suggestion = ['suggestion1', 'suggestion2', 'suggestion3'];
    await actionBinder.initActionListeners();
    await actionBinder.refreshSuggestions();
    expect(actionBinder.displaySuggestions.calledOnce).to.be.true;
    actionBinder.displaySuggestions.restore();
  });
  it('should call fetch AutoComplete when cached suggestions shown', async () => {
    actionBinder.suggestion = [];
    await actionBinder.initActionListeners();
    sinon.stub(actionBinder, 'fetchAutoComplete');
    await actionBinder.refreshSuggestions();
    expect(actionBinder.fetchAutoComplete.calledOnce).to.be.true;
    actionBinder.fetchAutoComplete.restore();
  });
  it('should handle keydown events for navigation', () => {
    actionBinder.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(actionBinder.activeIndex).to.not.equal(-1);
    actionBinder.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(actionBinder.activeIndex).to.not.equal(-1);
    actionBinder.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(actionBinder.activeIndex).to.not.equal(-1);
  });
  it('Redirect to Product page when Enter is pressed in the Input Field', async () => {
    await actionBinder.initActionListeners();
    sinon.stub(actionBinder, 'generateContent');
    const inpField = document.querySelector('.inp-field');
    inpField.focus();
    actionBinder.query = 'Test Input';
    actionBinder.activeIndex = 0;
    const dropItems = actionBinder.getDropdownItems();
    const focusElems = actionBinder.getFocusElems(dropItems.length > 0);
    const currIdx = focusElems.indexOf(document.activeElement);
    actionBinder.handleEnter(new KeyboardEvent('keydown', { key: 'Enter' }), dropItems, focusElems, currIdx);
    expect(actionBinder.generateContent.calledOnce).to.be.true;
    actionBinder.generateContent.restore();
  });
  it('should close dropdown on clicking close button', async () => {
    const closeBtn = document.querySelector('.close-btn');
    expect(closeBtn).to.exist;
    closeBtn.click();
    expect(actionBinder.dropdown.classList.contains('hidden')).to.be.true;
  });
  it('should handle outside clicks and hide dropdown', () => {
    const clickEvent = new Event('click');
    sinon.stub(actionBinder, 'hideDropdown');
    actionBinder.handleOutsideClick(clickEvent);
    expect(actionBinder.hideDropdown.called).to.be.true;
    actionBinder.hideDropdown.restore();
  });
  it('should handle clicking on generate button', async () => {
    const generateBtn = document.querySelector('.gen-btn');
    expect(generateBtn).to.exist;
    if (generateBtn.hasAttribute('data-event-bound')) {
      generateBtn.removeAttribute('data-event-bound');
    }
    await actionBinder.initActionListeners();
    const generateStub = sinon.stub(actionBinder, 'generateContent').resolves();
    generateBtn.click();
    expect(generateStub.calledOnce).to.be.true;
    generateStub.restore();
  });
  it('should handle clicking on refresh button', async () => {
    const refreshBtn = document.querySelector('.refresh-btn');
    expect(refreshBtn).to.exist;
    if (refreshBtn.hasAttribute('data-event-bound')) {
      refreshBtn.removeAttribute('data-event-bound');
    }
    await actionBinder.initActionListeners();
    const refreshStub = sinon.stub(actionBinder, 'refreshSuggestions').resolves();
    refreshBtn.click();
    expect(refreshStub.calledOnce).to.be.true;
    refreshStub.restore();
  });
  it('should properly add input events', () => {
    const el = document.createElement('input');
    const addEventListenerSpy = sinon.spy(el, 'addEventListener');
    actionBinder.addInputEvents(el, ['autocomplete']);
    expect(addEventListenerSpy.called).to.be.true;
  });
  it('should handle Tab key navigation in dropdown', () => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const shiftEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, shiftKey: true });
    document.body.innerHTML = `
        <input id="promptInput" class="inp-field" type="text">
        <div class="gen-btn" tabindex="0"></div>
        <li class="drop-item" id="item-1" role="option" tabindex="0"></li>
        <button class="close-btn"></button>
    `;
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
    document.body.innerHTML = `
        <div class="tip-con" tabindex="0"></div>
        <a class="legal-text" href="#" tabindex="0"></a>
    `;
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
});
