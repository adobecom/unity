import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs, getUnityLibs, unityConfig } from '../../../../unitylibs/scripts/utils.js';

setUnityLibs('/unitylibs');

window.adobeIMS = {
  getAccessToken: () => ({ token: 'token', isGuestToken: true, expire: { valueOf: () => Date.now() + 3600000 } }),
  adobeid: { locale: 'en' },
};
window.lana = { log: sinon.stub() };

const { default: FaceSwapWidget } = await import('../../../../unitylibs/core/widgets/face-swap/face-swap.js');
const {
  default: ActionBinder,
  validateSelection,
  buildFaceSwapAssetPayload,
  cdnHref,
  RULES,
} = await import('../../../../unitylibs/core/workflow/workflow-face-swap/action-binder.js');
const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const pngFile = (name = 'face.png') => new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], name, { type: 'image/png' });
const limits = { maxNumFiles: 1, allowedFileTypes: ['image/jpeg', 'image/png'], maxFileSize: 1000 };
const tick = (ms = 0) => new Promise((r) => { setTimeout(r, ms); });

const workflowCfg = () => ({
  name: 'workflow-face-swap',
  productName: 'Firefly',
  supportedFeatures: new Set(['face-swap']),
  enabledFeatures: ['face-swap'],
  targetCfg: {
    showSplashScreen: true,
    sendSplunkAnalytics: false,
    limits,
    actionMap: { '.gen-btn': [{ actionType: 'generate' }] },
  },
});

async function setup() {
  document.body.innerHTML = await readFile({ path: '../../widgets/face-swap/mocks/body.html' });
  const unityEl = document.querySelector('.unity.workflow-face-swap');
  const cfg = workflowCfg();
  const widget = new FaceSwapWidget(null, unityEl, cfg, '');
  const actionMap = await widget.initWidget();
  const canvas = widget.extendedRoot;
  const binder = new ActionBinder(unityEl, cfg, canvas, canvas, actionMap, widget);
  return { unityEl, widget, binder, canvas };
}

function fakeTransition() {
  return { showSplashScreen: sinon.stub().resolves(), splashScreenEl: null };
}

describe('Face Swap action binder', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(window, 'fetch').callsFake(async (url) => {
      const body = String(url).endsWith('.svg') ? '<svg></svg>' : {};
      return { status: 200, ok: true, text: async () => body, json: async () => body };
    });
  });

  afterEach(() => {
    sinon.restore();
    window.lana.log.resetHistory();
    document.body.innerHTML = '';
  });

  describe('validateSelection', () => {
    it('accepts a single allowed file within the size limit', () => {
      expect(validateSelection([{ type: 'image/png', size: 10 }], limits)).to.deep.equal({ ok: true });
    });

    it('rejects too many, unsupported, empty and oversized files in rule order', () => {
      const ok = { type: 'image/png', size: 10 };
      expect(validateSelection([ok, ok], limits).errorToken).to.equal('error-filecount');
      expect(validateSelection([{ type: 'image/gif', size: 10 }], limits).errorToken).to.equal('error-filetype');
      expect(validateSelection([{ type: 'image/png', size: 0 }], limits).errorToken).to.equal('error-filesize');
      expect(validateSelection([{ type: 'image/png', size: 5000 }], limits).errorToken).to.equal('error-filesize');
      expect(RULES.map((r) => r.id)).to.deep.equal(['filecount', 'filetype', 'filesize']);
    });

    it('applies only the limits that are configured', () => {
      expect(validateSelection([{ type: 'image/gif', size: 1e9 }], {}).ok).to.be.true;
      expect(validateSelection(null).errorToken).to.equal(undefined);
    });
  });

  describe('buildFaceSwapAssetPayload', () => {
    it('orders original before face and tags each reference image', () => {
      const payload = buildFaceSwapAssetPayload([
        { slotId: 'face', assetId: 'face-id' },
        { slotId: 'original', href: 'https://cdn/x.jpg' },
      ]);
      expect(payload).to.deep.equal({
        assets: [
          { href: 'https://cdn/x.jpg', metadata: { referenceImage: 'baseImage' } },
          { id: 'face-id', metadata: { referenceImage: 'faceImage' } },
        ],
      });
    });

    it('omits assets when nothing usable is provided', () => {
      expect(buildFaceSwapAssetPayload()).to.deep.equal({});
      expect(buildFaceSwapAssetPayload([{ slotId: 'other', assetId: 'x' }, { slotId: 'face' }])).to.deep.equal({});
    });

    it('resolves gallery paths against the page config origin', () => {
      const { origin } = new URL(unityConfig.pageConfigEndPoint);
      expect(cdnHref('/a/b.jpg')).to.equal(`${origin}/a/b.jpg`);
    });
  });

  describe('construction', () => {
    it('derives verb, headers, limits and endpoints', async () => {
      const { binder, canvas } = await setup();
      expect(binder.verb).to.equal('faceSwap');
      expect(binder.getAdditionalHeaders()).to.deep.equal({ 'x-unity-product': 'Firefly', 'x-unity-action': 'face-swap-faceSwap' });
      expect(binder.root).to.equal(canvas);
      expect(binder.limits).to.equal(limits);
      expect(binder.lanaOptions.tags).to.equal('Unity-FF-FaceSwap');
      expect(binder.apiConfig.endPoint.assetUpload).to.equal(`${unityConfig.apiEndPoint}/asset`);
    });

    it('falls back to the enabled feature when no operation token is authored', async () => {
      const { binder } = await setup();
      binder.unityEl = document.createElement('div');
      expect(binder.getVerbFromDom()).to.equal('face-swap');
    });

    it('omits isGuestUser from analytics until it is known', async () => {
      const { binder } = await setup();
      expect(binder.getAnalyticsMeta({ a: 1 })).to.deep.equal({ workflow: 'workflow-face-swap', a: 1 });
      binder.isGuestUser = true;
      expect(binder.getAnalyticsMeta()).to.include({ isGuestUser: true });
    });
  });

  describe('initActionListeners', () => {
    it('installs widget hooks, the error toast and the generate binding once', async () => {
      const { binder, widget } = await setup();
      const generate = sinon.stub(binder, 'handleGenerate').resolves();
      await binder.initActionListeners();
      await binder.initActionListeners();
      expect(widget.validateFiles).to.be.a('function');
      expect(widget.slotEls.face.input.getAttribute('accept')).to.equal('image/jpeg,image/png');
      expect(binder.errorToastEl).to.exist;
      expect(binder.errorToastEl.querySelector('.alert-text').getAttribute('role')).to.equal('alert');
      widget.genBtn.click();
      expect(generate.calledOnce).to.be.true;
    });

    it('binds string action maps to cancel', async () => {
      const { binder } = await setup();
      const cancel = sinon.stub(binder, 'cancelUploadOperation').resolves();
      const block = document.createElement('div');
      block.innerHTML = '<a class="cancel" href="#">Cancel</a>';
      await binder.initActionListeners(block, { '.cancel': 'interrupt' });
      block.querySelector('.cancel').click();
      await tick();
      expect(cancel.calledOnce).to.be.true;
      expect(binder.isStringActionMap({})).to.be.false;
    });

    it('tracks slot selections and warms the upload path once', async () => {
      const { binder, widget } = await setup();
      const track = sinon.spy(binder, 'track');
      const warm = sinon.stub(binder, 'warmUp');
      await binder.initActionListeners();
      widget.handleFiles('face', [pngFile()], 'upload');
      widget.selectGallery(1);
      expect(warm.calledTwice).to.be.true;
      expect(track.firstCall.args[0]).to.equal('Upload 2 started|UnityWidget');
      expect(track.secondCall.args[0]).to.equal('Sample 2|UnityWidget');
    });
  });

  describe('error toast', () => {
    it('reports client validation failures, makes the widget inert and restores focus on close', async () => {
      const { binder, widget, canvas } = await setup();
      await binder.initActionListeners();
      const splunk = sinon.spy(binder, 'logAnalyticsinSplunk');
      expect(widget.handleFiles('face', [new File(['x'], 'a.gif', { type: 'image/gif' })], 'upload')).to.be.false;
      const holder = canvas.querySelector('.alert-holder');
      expect(holder.classList.contains('show')).to.be.true;
      expect(holder.querySelector('.alert-text p').innerText).to.equal('File type not supported');
      expect(canvas.querySelector('.unity-slf-main').hasAttribute('inert')).to.be.true;
      expect(splunk.calledWith('Upload client error|UnityWidget')).to.be.true;
      expect(splunk.calledWith('Upload 2 error|UnityWidget')).to.be.true;
      holder.querySelector('.alert-close').click();
      expect(holder.classList.contains('show')).to.be.false;
      expect(canvas.querySelector('.unity-slf-main').hasAttribute('inert')).to.be.false;
      expect(document.activeElement).to.equal(widget.slotEls.face.input);
    });

    it('closes on Escape and on Space from the close control', async () => {
      const { binder, canvas } = await setup();
      await binder.initActionListeners();
      const holder = canvas.querySelector('.alert-holder');
      const close = holder.querySelector('.alert-close');
      binder.handleClientError('error-request', 'original');
      holder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(holder.classList.contains('show')).to.be.false;
      binder.handleClientError('error-request', 'original');
      holder.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(holder.classList.contains('show')).to.be.true;
      close.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(holder.classList.contains('show')).to.be.false;
    });

    it('shows the generic request error when a preview cannot load', async () => {
      const { binder, widget } = await setup();
      await binder.initActionListeners();
      const clientError = sinon.spy(binder, 'handleClientError');
      widget.onPreviewError('face', 'upload');
      expect(clientError.calledWith('error-request', 'face')).to.be.true;
    });

    it('logs instead of throwing when the toast cannot be built', async () => {
      const { binder } = await setup();
      fetchStub.rejects(new Error('offline'));
      expect(await binder.createErrorToast()).to.equal(null);
      expect(window.lana.log.calledWithMatch(/Error creating error toast/)).to.be.true;
    });
  });

  describe('handleGenerate', () => {
    let ctx;

    beforeEach(async () => {
      ctx = await setup();
      await ctx.binder.initActionListeners();
      ctx.continueInApp = sinon.stub(ctx.binder, 'continueInApp').resolves();
      sinon.stub(ctx.binder, 'ensureTransitionScreen').callsFake(async () => {
        ctx.binder.transitionScreen ||= fakeTransition();
      });
    });

    it('redirects immediately with no splash when nothing is selected', async () => {
      await ctx.binder.handleGenerate();
      expect(ctx.continueInApp.calledOnceWith([])).to.be.true;
      expect(ctx.binder.ensureTransitionScreen.called).to.be.false;
    });

    it('passes gallery picks through as CDN hrefs without uploading', async () => {
      const upload = sinon.stub(ctx.binder, 'uploadSlot');
      ctx.widget.selectGallery(0);
      await ctx.binder.handleGenerate();
      expect(upload.called).to.be.false;
      expect(ctx.continueInApp.firstCall.args[0]).to.deep.equal([
        { slotId: 'original', href: cdnHref('/cc-shared/assets/face-swap/one.jpg') },
      ]);
    });

    it('uploads files behind the splash and forwards every asset', async () => {
      sinon.stub(ctx.binder, 'uploadSlot').callsFake(async (slotId) => ({ slotId, assetId: `${slotId}-id` }));
      ctx.widget.selectGallery(0);
      ctx.widget.handleFiles('face', [pngFile()], 'upload');
      await ctx.binder.handleGenerate();
      expect(ctx.binder.transitionScreen.showSplashScreen.calledWith(true)).to.be.true;
      expect(ctx.binder.isGuestUser).to.be.true;
      expect(ctx.continueInApp.firstCall.args[0]).to.deep.equal([
        { slotId: 'original', href: cdnHref('/cc-shared/assets/face-swap/one.jpg') },
        { slotId: 'face', assetId: 'face-id' },
      ]);
    });

    it('ignores repeat clicks while a request is in flight', async () => {
      let release;
      sinon.stub(ctx.binder, 'uploadSlot').callsFake(() => new Promise((r) => { release = r; }));
      ctx.widget.handleFiles('face', [pngFile()], 'upload');
      const first = ctx.binder.handleGenerate();
      await ctx.binder.handleGenerate();
      await tick();
      release({ slotId: 'face', assetId: 'id' });
      await first;
      expect(ctx.binder.uploadSlot.calledOnce).to.be.true;
      expect(ctx.binder.inFlight).to.be.false;
    });

    it('stays on the widget and names the failed slot when an upload fails', async () => {
      const failure = sinon.stub(ctx.binder, 'handleUploadFailure').resolves();
      sinon.stub(ctx.binder, 'uploadSlot').callsFake(async (slotId) => {
        if (slotId === 'face') throw new Error('boom');
        return { slotId, assetId: 'ok' };
      });
      ctx.widget.handleFiles('original', [pngFile()], 'upload');
      ctx.widget.handleFiles('face', [pngFile()], 'upload');
      await ctx.binder.handleGenerate();
      expect(failure.calledOnce).to.be.true;
      expect(failure.firstCall.args[0]).to.equal('face');
      expect(ctx.continueInApp.called).to.be.false;
      expect(ctx.widget.getFilledSlots()).to.have.length(2);
    });

    it('does nothing further after the user cancels', async () => {
      sinon.stub(ctx.binder, 'uploadSlot').callsFake(async (slotId) => {
        await ctx.binder.cancelUploadOperation();
        return { slotId, assetId: 'id' };
      });
      ctx.widget.handleFiles('face', [pngFile()], 'upload');
      await ctx.binder.handleGenerate();
      expect(ctx.continueInApp.called).to.be.false;
      expect(document.activeElement).to.equal(ctx.widget.genBtn);
    });

    it('shows the request error when the flow throws unexpectedly', async () => {
      ctx.binder.ensureTransitionScreen.rejects(new Error('fragment'));
      const toast = sinon.spy(ctx.binder, 'showToast');
      ctx.widget.handleFiles('face', [pngFile()], 'upload');
      await ctx.binder.handleGenerate();
      expect(toast.firstCall.args[0]).to.include({ errorType: '.icon-error-request' });
      expect(ctx.binder.inFlight).to.be.false;
    });

    it('hides the splash before showing the upload failure toast', async () => {
      ctx.binder.handleUploadFailure.restore?.();
      ctx.binder.transitionScreen = fakeTransition();
      const toast = sinon.spy(ctx.binder, 'showToast');
      await ctx.binder.handleUploadFailure('face', Object.assign(new Error('x'), { errorToken: 'error-filesize' }));
      expect(ctx.binder.transitionScreen.showSplashScreen.calledBefore(toast)).to.be.true;
      expect(toast.firstCall.args[0]).to.include({ errorType: '.icon-error-filesize' });
    });
  });

  describe('uploadSlot', () => {
    let ctx;

    beforeEach(async () => {
      ctx = await setup();
      ctx.binder.setupServiceHandler();
      sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
    });

    it('creates the asset, uploads it and runs the safety scan', async () => {
      fetchStub.callsFake(async (url, opts) => {
        if (opts?.method === 'PUT') return { status: 200 };
        return { status: 200, json: async () => ({ id: 'asset-1', href: 'https://storage/put' }) };
      });
      const result = await ctx.binder.uploadSlot('face', { file: pngFile() });
      expect(result).to.deep.equal({ slotId: 'face', assetId: 'asset-1' });
      const create = fetchStub.getCalls().find((c) => c.args[0].endsWith('/asset'));
      expect(JSON.parse(create.args[1].body)).to.include({ targetProduct: 'Firefly', name: 'face.png', format: 'image/png' });
      expect(UploadHandler.prototype.scanImgForSafetyWithRetry.calledWith('asset-1')).to.be.true;
    });

    it('keeps concurrent uploads isolated to their own asset id', async () => {
      let n = 0;
      fetchStub.callsFake(async (url, opts) => {
        if (opts?.method === 'PUT') return { status: 200 };
        n += 1;
        const id = `asset-${n}`;
        await tick(n === 1 ? 20 : 0);
        return { status: 200, json: async () => ({ id, href: 'https://storage/put' }) };
      });
      const seen = [];
      UploadHandler.prototype.scanImgForSafetyWithRetry.callsFake(function scan(assetId) {
        seen.push([assetId, this.actionBinder.assetId]);
      });
      const [a, b] = await Promise.all([
        ctx.binder.uploadSlot('original', { file: pngFile('a.png') }),
        ctx.binder.uploadSlot('face', { file: pngFile('b.png') }),
      ]);
      expect(a.assetId).to.not.equal(b.assetId);
      expect(seen).to.have.length(2);
      seen.forEach(([scanned, facade]) => expect(facade).to.equal(scanned));
    });

    it('uses chunked upload when the service returns upload URLs', async () => {
      fetchStub.resolves({ status: 200, json: async () => ({ id: 'c1', blocksize: 5, uploadUrls: [{ href: 'u1' }] }) });
      const chunks = sinon.stub(UploadHandler.prototype, 'uploadChunksToUnity').resolves({ failedChunks: new Set(), attemptMap: new Map() });
      await ctx.binder.uploadSlot('face', { file: pngFile() });
      expect(chunks.calledOnce).to.be.true;
    });

    it('fails when any chunk fails', async () => {
      fetchStub.resolves({ status: 200, json: async () => ({ id: 'c1', blocksize: 5, uploadUrls: [{ href: 'u1' }] }) });
      sinon.stub(UploadHandler.prototype, 'uploadChunksToUnity').resolves({ failedChunks: new Set([1]), attemptMap: new Map([[1, 4]]) });
      const err = await ctx.binder.uploadSlot('face', { file: pngFile() }).catch((e) => e);
      expect(err.status).to.equal(504);
    });

    it('re-validates before uploading', async () => {
      const err = await ctx.binder.uploadSlot('face', { file: new File([''], 'e.png', { type: 'image/png' }) }).catch((e) => e);
      expect(err.errorToken).to.equal('error-filesize');
      expect(fetchStub.called).to.be.false;
    });

    it('surfaces storage and network failures with a status', async () => {
      fetchStub.callsFake(async (url, opts) => {
        if (opts?.method === 'PUT') return { status: 403 };
        return { status: 200, json: async () => ({ id: 'x', href: 'https://storage/put' }) };
      });
      expect((await ctx.binder.uploadSlot('face', { file: pngFile() }).catch((e) => e)).status).to.equal(403);
      fetchStub.rejects(new TypeError('Failed to fetch'));
      expect((await ctx.binder.uploadImgToUnity('u', pngFile(), 'image/png').catch((e) => e)).status).to.equal(0);
      expect((await ctx.binder.serviceHandler.postCallToService('u', {}).catch((e) => e)).status).to.equal(0);
      fetchStub.resolves({ status: 500 });
      expect((await ctx.binder.serviceHandler.postCallToService('u', {}).catch((e) => e)).status).to.equal(500);
      expect((await ctx.binder.serviceHandler.postCallToService('u', {}, false)).status).to.equal(500);
    });
  });

  describe('continueInApp', () => {
    let ctx;

    beforeEach(async () => {
      ctx = await setup();
      await ctx.binder.initActionListeners();
    });

    afterEach(() => {
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    });

    const connectorBody = () => JSON.parse(fetchStub.getCalls().find((c) => c.args[0] === unityConfig.connectorApiEndPoint).args[1].body);

    it('posts the dual-asset payload and redirects to the returned url', async () => {
      fetchStub.callsFake(async () => ({ status: 200, json: async () => ({ url: '#fs-redirect' }) }));
      await ctx.binder.continueInApp([{ slotId: 'face', assetId: 'f' }, { slotId: 'original', href: 'https://cdn/o.jpg' }]);
      const body = connectorBody();
      expect(body.assets.map((a) => a.metadata.referenceImage)).to.deep.equal(['baseImage', 'faceImage']);
      expect(body.payload).to.include({ workflow: 'face-swap', action: 'asset-upload', verb: 'faceSwap' });
      expect(body.additionalQueryParams).to.include({ ff_source: 'adobe-com', ff_campaign: 'face-swap' });
      expect(window.location.hash).to.equal('#fs-redirect');
    });

    it('sends no assets for the empty redirect', async () => {
      fetchStub.callsFake(async () => ({ status: 200, json: async () => ({ url: '#fs-empty' }) }));
      await ctx.binder.continueInApp([]);
      expect(connectorBody()).to.not.have.property('assets');
    });

    it('shows the request error when the connector fails or returns no url', async () => {
      const toast = sinon.spy(ctx.binder, 'showToast');
      fetchStub.callsFake(async () => ({ status: 500, json: async () => ({}) }));
      await ctx.binder.continueInApp([]);
      fetchStub.callsFake(async () => ({ status: 200, json: async () => ({}) }));
      await ctx.binder.continueInApp([]);
      expect(toast.callCount).to.equal(2);
      expect(toast.alwaysCalledWithMatch({ errorType: '.icon-error-request' })).to.be.true;
    });

    it('does not redirect once the user has cancelled', async () => {
      fetchStub.callsFake(async () => ({ status: 200, json: async () => ({ url: '#fs-cancelled' }) }));
      ctx.binder.promiseStack = [Promise.resolve()];
      await ctx.binder.continueInApp([]);
      expect(window.location.hash).to.equal('');
    });
  });

  describe('warmUp', () => {
    it('preconnects and prefetches the upload path only once', async () => {
      const { binder } = await setup();
      const ensure = sinon.stub(binder, 'ensureTransitionScreen').resolves();
      sinon.stub(window, 'requestIdleCallback').callsFake((cb) => cb());
      binder.warmUp();
      binder.warmUp();
      await tick(20);
      expect(ensure.calledOnce).to.be.true;
      const { origin } = new URL(unityConfig.apiEndPoint);
      expect(document.head.querySelectorAll(`link[rel="preconnect"][href="${origin}"]`)).to.have.length(1);
    });
  });
});
