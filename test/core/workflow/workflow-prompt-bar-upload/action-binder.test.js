import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';

setUnityLibs('/unitylibs');
window.lana = { log: sinon.stub() };

const { default: ActionBinder } = await import('../../../../unitylibs/core/workflow/workflow-prompt-bar-upload/action-binder.js');
const { default: PromptBarUploadWidget } = await import('../../../../unitylibs/core/widgets/prompt-bar-upload/prompt-bar-upload.js');

const pending = () => new Promise(() => {});
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('Prompt Bar Upload ActionBinder', () => {
  let block;
  let workflowCfg;

  beforeEach(async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    block = document.querySelector('.marquee');
    workflowCfg = { productName: 'firefly', enabledFeatures: ['video'], targetCfg: { showSplashScreen: true } };
  });

  afterEach(() => {
    sinon.restore();
    window.lana.log.reset();
  });

  it('binds listeners without waiting for analytics, error toast or preloads', async () => {
    const binder = new ActionBinder(block, workflowCfg, block, block, { '.gen-btn': [] });
    sinon.stub(binder, 'initAnalytics').returns(pending());
    sinon.stub(binder, 'createErrorToast').returns(pending());
    sinon.stub(binder, 'handlePreloads').returns(pending());
    sinon.stub(binder, 'bindElement');

    await binder.initActionListeners();

    expect(binder.bindElement.calledOnce).to.be.true;
    expect(binder.initAnalytics.calledOnce).to.be.true;
    expect(binder.createErrorToast.calledOnce).to.be.true;
    expect(binder.handlePreloads.calledOnce).to.be.true;
  });

  it('logs when background analytics or preloads fail', async () => {
    const binder = new ActionBinder(block, workflowCfg, block, block, { '.gen-btn': [] });
    sinon.stub(binder, 'initAnalytics').rejects(new Error('analytics down'));
    sinon.stub(binder, 'createErrorToast').resolves(null);
    sinon.stub(binder, 'handlePreloads').rejects(new Error('css down'));
    sinon.stub(binder, 'bindElement');

    await binder.initActionListeners();
    await flush();

    expect(window.lana.log.calledWithMatch(/Analytics init failed/)).to.be.true;
    expect(window.lana.log.calledWithMatch(/Preloads failed/)).to.be.true;
  });

  it('creates the error toast only once for concurrent requests', async () => {
    const binder = new ActionBinder(block, workflowCfg, block, block);
    const toast = document.createElement('div');
    sinon.stub(binder, 'createErrorToast').resolves(toast);

    const [first, second] = await Promise.all([binder.ensureErrorToast(), binder.ensureErrorToast()]);

    expect(binder.createErrorToast.calledOnce).to.be.true;
    expect(first).to.equal(toast);
    expect(second).to.equal(toast);
    expect(binder.errorToastEl).to.equal(toast);
  });

  it('retries error toast creation after a failed attempt', async () => {
    const binder = new ActionBinder(block, workflowCfg, block, block);
    const toast = document.createElement('div');
    sinon.stub(binder, 'createErrorToast').onFirstCall().resolves(null).onSecondCall()
      .resolves(toast);

    expect(await binder.ensureErrorToast()).to.be.null;
    expect(await binder.ensureErrorToast()).to.equal(toast);
  });

  it('loads analytics on widget interaction when not yet initialized', async () => {
    const binder = new ActionBinder(block, workflowCfg, block, block);
    binder.widgetWrap = block.querySelector('.ex-unity-wrap');
    sinon.stub(binder, 'initAnalytics').callsFake(async () => {
      binder.analyticsModule = { PROMPT_BAR_EVENTS: { ENTER_PROMPT: 'enter-prompt-event' } };
    });
    sinon.stub(binder, 'logAnalyticsinSplunk');

    binder.bindWidgetInteractionEvent('pbu-enter-prompt', 'ENTER_PROMPT', 'enter-prompt');
    binder.widgetWrap.dispatchEvent(new CustomEvent('pbu-enter-prompt'));
    await flush();

    expect(binder.initAnalytics.calledOnce).to.be.true;
    expect(binder.logAnalyticsinSplunk.calledWith('enter-prompt-event', { action: 'enter-prompt' })).to.be.true;
  });
});

describe('PromptBarUploadWidget loadModels', () => {
  afterEach(() => sinon.restore());

  it('uses the prefetched video models request when available', async () => {
    const fetchStub = sinon.stub(window, 'fetch');
    const videoModelsRequest = Promise.resolve({
      ok: true,
      json: async () => ({ content: { data: [{ id: 'model-1' }] } }),
    });
    const workflowCfg = { videoModelsRequest };
    const widget = new PromptBarUploadWidget(null, null, workflowCfg, null);

    await widget.loadModels();

    expect(fetchStub.called).to.be.false;
    expect(widget.models).to.deep.equal([{ id: 'model-1' }]);
    expect(workflowCfg.videoModelsRequest).to.be.undefined;
  });

  it('fetches video models when no prefetched request exists', async () => {
    const fetchStub = sinon.stub(window, 'fetch').resolves({
      ok: true,
      json: async () => ({ content: { data: [{ id: 'model-2' }] } }),
    });
    const widget = new PromptBarUploadWidget(null, null, {}, null);

    await widget.loadModels();

    expect(fetchStub.calledOnceWithMatch(/model-picker-video\.json/)).to.be.true;
    expect(widget.models).to.deep.equal([{ id: 'model-2' }]);
  });
});
