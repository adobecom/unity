import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import UnityWidget from '../../../../unitylibs/core/workflow/workflow-ai/widget.js';
import { createTag } from '../../../../unitylibs/scripts/utils.js';

describe('UnityWidget Class Unit Tests', () => {
  let unityWidget;
  let target;
  let el;
  let workflowCfg;
  let spriteCon;

  before(async () => {
    document.body.innerHTML = await readFile({ path: '../mocks/exp-body.html' });
    target = document.querySelector('.unity-enabled');
    el = document.querySelector('.unity');
    workflowCfg = { targetCfg: { floatPrompt: true, actionMap: {} } };
    spriteCon = '<svg></svg>';
    unityWidget = new UnityWidget(target, el, workflowCfg, spriteCon);
    sinon.stub(unityWidget, 'createBg');
    sinon.stub(unityWidget, 'addWidget');
    sinon.stub(unityWidget, 'initIO');
  });

  it('should initialize UnityWidget instance correctly', () => {
    expect(unityWidget).to.exist;
    expect(unityWidget.el).to.equal(el);
    expect(unityWidget.target).to.equal(target);
    expect(unityWidget.workflowCfg).to.equal(workflowCfg);
    expect(unityWidget.spriteCon).to.equal(spriteCon);
  });

  it('should create and initialize widget structure', async () => {
    await unityWidget.initWidget();
    expect(unityWidget.widgetWrap).to.exist;
    expect(unityWidget.widget).to.exist;
  });

  it('should generate dropdown with correct placeholders', () => {
    const placeholder = {
      'placeholder-prompt': 'Prompt',
      'placeholder-suggestions': 'Suggestions',
    };
    const dropdown = unityWidget.genDropdown(placeholder);
    expect(dropdown).to.exist;
    expect(dropdown.querySelector('.drop-title')).to.exist;
    expect(dropdown.querySelector('.close-btn')).to.exist;
  });

  it('should correctly populate placeholders', () => {
    const placeholders = unityWidget.popPlaceholders();
    expect(placeholders).to.be.an('object');
    expect(Object.keys(placeholders).length).to.be.greaterThan(0);
  });

  it('should correctly toggle sticky class based on intersection', () => {
    const cfg = { isIntersecting: false };
    unityWidget.widgetWrap = createTag('div', { class: 'ex-unity-wrap' });
    unityWidget.addSticky(cfg);
    expect(unityWidget.widgetWrap.classList.contains('sticky')).to.be.true;

    cfg.isIntersecting = true;
    unityWidget.addSticky(cfg);
    expect(unityWidget.widgetWrap.classList.contains('sticky')).to.be.false;
  });

  it('should toggle visibility correctly', () => {
    const cfg = { isIntersecting: true };
    const wrapper = unityWidget.target.querySelector('.ex-unity-wrap');
    unityWidget.toggleVisibility(cfg);
    expect(wrapper.classList.contains('hidden')).to.be.true;
    cfg.isIntersecting = false;
    unityWidget.toggleVisibility(cfg);
    expect(wrapper.classList.contains('hidden')).to.be.false;
  });

  it('should create correct footer structure', () => {
    const ph = { 'placeholder-tip': 'Tip' };
    const footer = unityWidget.createFooter(ph);
    expect(footer).to.exist;
    expect(footer.querySelector('.tip-text')).to.exist;
  });

  it('should debounce function calls', async () => {
    const testFunc = sinon.spy();
    const debouncedFunc = unityWidget.debounce(testFunc, 100);
    debouncedFunc();
    debouncedFunc();
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    expect(testFunc.calledOnce).to.be.true;
  });

  it('should set up intersection observers for observerEl and footerEl', () => {
    const observerEl = document.createElement('div');
    const footerEl = document.createElement('div');
    const createObsSpy = sinon.spy(unityWidget, 'createCustIntsecObs');
    unityWidget.setupIO(observerEl, footerEl);
    expect(createObsSpy.calledTwice).to.be.true;
    expect(createObsSpy.firstCall.args[0]).to.include({ el: observerEl });
    expect(createObsSpy.firstCall.args[0].options).to.deep.equal({ root: null, rootMargin: '200px', threshold: [0.1, 0.9] });
    expect(createObsSpy.secondCall.args[0]).to.include({ el: footerEl });
    expect(createObsSpy.secondCall.args[0].options).to.deep.equal({ root: null, rootMargin: '0px', threshold: [0.0] });
    createObsSpy.restore();
  });
});
