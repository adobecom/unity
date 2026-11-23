import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-prompt-upload/action-binder.js';

describe('Prompt upload drop handling', () => {
  let sandbox;
  let block;
  let binder;
  let file;
  let bodyListeners;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    sandbox.stub(ActionBinder.prototype, 'initialize').resolves();
    sandbox.stub(window, 'IntersectionObserver').callsFake((callback) => ({ observe: () => callback([{ isIntersecting: true }]) }));
    bodyListeners = sandbox.spy(document.body, 'addEventListener');
    block = document.createElement('section');
    block.innerHTML = '<div class="canvas"><div class="interactive-area"><div class="drop-zone"><span>Add sources</span><input id="file-upload" type="file"></div><div class="marquee-content"></div></div></div>';
    document.body.append(block);
    const canvas = block.querySelector('.canvas');
    binder = new ActionBinder(block, {
      productName: 'acrobat',
      enabledFeatures: ['citation-generator'],
      targetCfg: { selector: '.canvas' },
    }, block, canvas, {
      '.drop-zone': 'upload',
      '#file-upload': 'upload',
      body: 'upload',
    });
    sandbox.stub(binder, 'runPreflight').resolves(true);
    sandbox.stub(binder, 'loadTransitionScreen').resolves();
    sandbox.stub(binder, 'ensurePageConfig').resolves();
    sandbox.stub(binder, 'dispatchAnalyticsEvent');
    sandbox.stub(binder, 'handleFileUpload').resolves();
    sandbox.stub(binder, 'continueInApp').resolves();
    sandbox.stub(binder, 'dispatchErrorToast').resolves();
    sandbox.spy(binder, 'uploadFilesImmediately');
    file = new File(['sample'], 'sample.pdf', { type: 'application/pdf' });
    await binder.initActionListeners();
  });

  afterEach(() => {
    bodyListeners.getCalls().forEach(({ args }) => {
      document.body.removeEventListener(...args);
    });
    delete document.body.dataset.puBound;
    block.remove();
    sandbox.restore();
  });

  async function dropAndCheck(target) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    target.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
    await Promise.all(binder.uploadFilesImmediately.getCalls().map((call) => call.returnValue));

    expect(binder.uploadFilesImmediately.callCount).to.equal(1);
    expect(binder.handleFileUpload.callCount).to.equal(1);
    expect(binder.handleFileUpload.firstCall.args[0]).to.deep.equal([file]);
    expect(binder.continueInApp.callCount).to.equal(1);
    expect(binder.dispatchErrorToast.callCount).to.equal(0);
    const drops = binder.dispatchAnalyticsEvent.getCalls().filter((call) => call.args[0] === 'drop');
    expect(drops.length).to.equal(1);
    expect(drops[0].args[1]).to.deep.equal({
      type: file.type,
      size: file.size,
      count: 1,
      uploadType: 'sfu',
    });
    ['entry', 'discover'].forEach((name) => {
      expect(binder.dispatchAnalyticsEvent.getCalls().filter((call) => call.args[0] === name).length).to.equal(1);
    });
  }

  it('handles a dropzone child drop once with file metadata', async () => {
    await dropAndCheck(block.querySelector('.drop-zone span'));
  });

  it('does not forward a marquee drop to the body upload handler', async () => {
    await dropAndCheck(block.querySelector('.marquee-content'));
  });

  it('keeps body drops outside the marquee working', async () => {
    await dropAndCheck(document.body);
  });

  it('does not duplicate drop handling after repeated initialization', async () => {
    await binder.initActionListeners();
    await dropAndCheck(block.querySelector('.marquee-content'));
  });
});
