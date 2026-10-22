import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-inline-action/action-binder.js';
import { setUnityLibs, getUnityLibs, unityConfig } from '../../../../unitylibs/scripts/utils.js';

setUnityLibs('/unitylibs');
const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
const { default: TransitionScreen } = await import(`${getUnityLibs()}/scripts/transition-screen.js`);

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

async function rejection(promise) {
  let error;
  await promise.catch((e) => { error = e; });
  expect(error).to.be.instanceOf(Error);
  return error;
}

describe('Inline action binder', () => {
  let binder;
  let root;
  let widget;
  let fetchStub;
  let guest;
  let file;
  let oldIMS;
  let oldLana;
  let oldConfig;
  let objectUrls;

  function editor() {
    widget.editorEngine = { setOutputType: sinon.spy(), setImage: sinon.stub().resolves(), reset: sinon.spy() };
    widget.ensureEditorEngine = sinon.stub().resolves(widget.editorEngine);
    return widget.editorEngine;
  }

  beforeEach(async () => {
    oldIMS = window.adobeIMS;
    oldLana = window.lana;
    oldConfig = { ...unityConfig };
    guest = true;
    window.adobeIMS = {
      getAccessToken: () => ({ token: 'test', isGuestToken: guest, expire: { valueOf: () => Date.now() + 3600000 } }),
      adobeid: { locale: 'en_US' },
    };
    window.lana = { log: sinon.spy() };
    unityConfig.apiEndPoint = '/test-api';
    unityConfig.connectorApiEndPoint = '/connector';
    root = document.createElement('div');
    root.innerHTML = `<div class="interactive-area"><div class="ia-widget" data-state="initial">
      <div class="drop-zone ia-dropzone">
        <div class="upload-action-container"><a class="action-button" href="#">Upload</a></div>
      </div>
      <input type="file" class="ia-file-input">
      <button class="ia-nba-card" data-nba="removeElement">Localized</button>
      <button class="ia-edit-in-firefly">Edit</button>
      <button class="download">Download</button>
      <a class="cancel" href="#_cancel">Cancel</a>
      <img class="ia-result-img" src="${pixel}">
    </div></div>
    <ul><li><span class="icon-error-request"></span>Request failed</li></ul>`;
    document.body.append(root);
    widget = {
      widget: root.querySelector('.ia-widget'),
      parsedData: { operation: 'removeBackground' },
      setProgress: sinon.spy(),
      setState(state) { this.widget.dataset.state = state; },
      setResultUrl(url) { this.widget.querySelector('img').src = url; },
      openFilePicker: sinon.spy(),
    };
    file = new File(['pixels'], 'image.png', { type: 'image/png' });
    binder = new ActionBinder(root, {
      productName: 'Firefly',
      supportedFeatures: new Set(['upload-image']),
      targetCfg: { limits: { maxNumFiles: 1, maxFileSize: 100, allowedFileTypes: ['image/png', 'image/jpeg'] } },
    }, root, root, {}, widget);
    await binder.initActionListeners();
    fetchStub = sinon.stub(window, 'fetch').callsFake(async (url) => {
      if (String(url).endsWith('.svg')) return new Response('<svg></svg>');
      if (String(url).endsWith('/asset')) return new Response(JSON.stringify({ id: 'asset', href: '/storage' }));
      if (String(url).endsWith('/connector')) return new Response(JSON.stringify({ url: '#connected' }));
      if (String(url).includes('RemoveBackground')) {
        return new Response(JSON.stringify({ assetId: 'result', outputUrl: pixel }));
      }
      return new Response('{}');
    });
    binder.filesData = { type: file.type, name: file.name, size: file.size };
    binder.sendAnalyticsToSplunk = sinon.stub().resolves();
    objectUrls = sinon.spy(URL, 'createObjectURL');
    localStorage.removeItem('inline-action-download-count');
    localStorage.removeItem('inline-action-download-count-crop');
    localStorage.removeItem('inline-action-download-count-resize');
  });

  afterEach(() => {
    binder.transitionScreen?.clearProgressBarHandler?.();
    root.remove();
    objectUrls.returnValues.forEach((url) => URL.revokeObjectURL(url));
    sinon.restore();
    window.adobeIMS = oldIMS;
    window.lana = oldLana;
    Object.keys(unityConfig).forEach((key) => { delete unityConfig[key]; });
    Object.assign(unityConfig, oldConfig);
    ['inline-action-download-count', 'inline-action-download-count-crop', 'inline-action-download-count-resize']
      .forEach((key) => localStorage.removeItem(key));
  });

  it('merges product limits and supports absent optional construction inputs', () => {
    expect(ActionBinder.resolveLimits({ productName: 'Firefly', targetCfg: { limits: { maxFileSize: 10 }, 'limits-firefly': { maxFileSize: 20, maxNumFiles: 1 } } })).to.deep.equal({ maxFileSize: 20, maxNumFiles: 1 });
    expect(ActionBinder.resolveLimits({})).to.deep.equal({});
    const minimal = new ActionBinder(root, {}, root);
    expect(minimal.canvasArea).to.deep.equal([]);
    expect(minimal.operation).to.equal('removeBackground');
    expect(binder.getAdditionalHeaders()).to.deep.equal({ 'x-unity-product': 'Firefly', 'x-unity-action': 'upload-image-removeBackground' });
    binder.operation = null;
    expect(binder.getAdditionalHeaders()['x-unity-action']).to.equal('upload-image');
  });

  it('adds guest/workflow metadata without using localized NBA labels', () => {
    binder.isGuestUser = true;
    binder.sendAnalyticsToSplunk = sinon.spy();
    binder.resultAssetId = 'result';
    binder.trackConnectorAnalytics(root.querySelector('.ia-nba-card'));
    binder.trackConnectorAnalytics(root.querySelector('.ia-edit-in-firefly'));
    binder.trackConnectorAnalytics(null);
    expect(binder.sendAnalyticsToSplunk.firstCall.args).to.deep.equal([
      'removeElement - Do more with|UnityWidget', 'Firefly',
      { workflow: 'inline-action', isGuestUser: true, assetId: 'result', action: 'redirect', verb: 'removeElement' },
      '/test-api/log',
    ]);
    expect(binder.sendAnalyticsToSplunk.lastCall.args[0]).to.equal('Edit in Firefly|UnityWidget');
    expect(binder.getAnalyticsMeta({ workflow: 'override' }).workflow).to.equal('override');
  });

  it('records client, server, removal and connector outcomes with metadata', () => {
    binder.sendAnalyticsToSplunk = sinon.spy();
    binder.resultAssetId = 'fallback';
    binder.trackClientError('bad-file');
    binder.trackServerError('upload', { status: 503, message: 'offline' });
    binder.trackServerError('upload', {});
    binder.trackRemoveBackgroundError({ status: 500, message: 'remove' });
    binder.trackRemoveBackgroundError();
    binder.trackConnectorSuccess('verb');
    expect(binder.sendAnalyticsToSplunk.args[0][2].errorData.code).to.equal('bad-file');
    expect(binder.sendAnalyticsToSplunk.args[1][2]).to.include({ assetId: 'fallback', action: 'upload' });
    expect(binder.sendAnalyticsToSplunk.args[1][2].errorData).to.deep.equal({ code: 'error-request', subCode: 'upload 503', desc: 'offline' });
    expect(binder.sendAnalyticsToSplunk.args[2][2].errorData.subCode).to.equal('upload');
    expect(binder.sendAnalyticsToSplunk.args[4][2].errorData.subCode).to.equal('removeBackground');
    expect(binder.sendAnalyticsToSplunk.lastCall.args[2]).to.include({ assetId: 'fallback', verb: 'verb' });
  });

  it('loads Splunk analytics only when enabled and reuses the function', async () => {
    binder.workflowCfg.targetCfg.sendSplunkAnalytics = true;
    await binder.initAnalytics();
    const loaded = binder.sendAnalyticsToSplunk;
    expect(loaded).to.be.a('function');
    await binder.initAnalytics();
    expect(binder.sendAnalyticsToSplunk).to.equal(loaded);
  });

  ['crop', 'resize', 'removeBackground'].forEach((operation) => {
    it(`uses independent download counters and verbs for ${operation}`, () => {
      binder.operation = operation;
      expect(binder.getUserCount()).to.equal(0);
      expect(binder.incrementUserCount()).to.equal(1);
      expect(binder.getUserCount()).to.equal(1);
      const first = { crop: 'cropImageFirstDownload', resize: 'resizeImageFirstDownload', removeBackground: 'aiPhotoEditor' };
      const later = { crop: 'cropImageDownload', resize: 'resizeImageDownload', removeBackground: 'download' };
      expect(binder.resolveConnectorVerb(null, true, true)).to.equal(first[operation]);
      expect(binder.resolveConnectorVerb(null, true)).to.equal(later[operation]);
      expect(binder.resolveConnectorVerb(root.querySelector('.ia-nba-card'))).to.equal('removeElement');
      expect(binder.resolveConnectorVerb(root.querySelector('.ia-edit-in-firefly'))).to.equal('aiPhotoEditor');
      expect(binder.resolveConnectorVerb()).to.equal(undefined);
    });
  });

  it('extracts only files and rejects invalid counts, types and sizes', async () => {
    expect(binder.extractFiles({
      dataTransfer: {
        items: [
          { kind: 'string' }, { kind: 'file', getAsFile: () => file },
        ],
      },
    })).to.deep.equal([file]);
    expect(binder.extractFiles({ target: { files: [file] } })).to.deep.equal([file]);
    expect(binder.extractFiles({})).to.deep.equal([]);
    const toast = sinon.spy(binder.serviceHandler, 'showErrorToast');
    const track = sinon.spy(binder, 'trackClientError');
    expect(await binder.validateFile()).to.equal(null);
    expect(await binder.validateFile([])).to.equal(null);
    expect(await binder.validateFile([file, file])).to.equal(null);
    expect(await binder.validateFile([new File(['a'], 'a.txt', { type: 'text/plain' })])).to.equal(null);
    expect(await binder.validateFile([new File(['x'.repeat(101)], 'a.png', { type: 'image/png' })])).to.equal(null);
    expect(track.args).to.deep.equal([['error-filecount'], ['error-filetype'], ['error-filesize']]);
    expect(toast.callCount).to.equal(3);
    expect(await binder.validateFile([file])).to.equal(file);
  });

  it('posts service requests with auth, custom headers and strict status checks', async () => {
    expect(await binder.serviceHandler.postCallToService('/test', { body: '{}' })).to.deep.equal({});
    const options = fetchStub.lastCall.args[1];
    expect(options).to.include({ method: 'POST', body: '{}' });
    expect(options.headers).to.include({ 'x-unity-product': 'Firefly', 'x-unity-action': 'upload-image-removeBackground' });
    fetchStub.resolves(new Response('{}', { status: 201 }));
    expect((await rejection(binder.serviceHandler.postCallToService('/test', {}))).status).to.equal(201);
    expect((await binder.serviceHandler.postCallToService('/test', {}, {}, false)).status).to.equal(201);
    fetchStub.rejects(new TypeError('offline'));
    const error = await rejection(binder.serviceHandler.postCallToService('/test', {}));
    expect(error.status).to.equal(0);
    expect(error.message).to.include('URL: /test');
    const other = new Error('other');
    fetchStub.rejects(other);
    expect(await rejection(binder.serviceHandler.postCallToService('/test', {}))).to.equal(other);
  });

  it('uploads storage blobs using PUT with optional abort and status errors', async () => {
    await binder.uploadImgToUnity('/storage', 'id', file, file.type);
    expect(fetchStub.lastCall.args[1]).to.deep.equal({ method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: file });
    const { signal } = new AbortController();
    await binder.uploadImgToUnity('/storage', 'id', file, file.type, signal);
    expect(fetchStub.lastCall.args[1].signal).to.equal(signal);
    fetchStub.resolves(new Response('', { status: 503 }));
    expect((await rejection(binder.uploadImgToUnity('/storage', 'id', file, file.type))).status).to.equal(503);
    fetchStub.rejects(new TypeError('offline'));
    expect((await rejection(binder.uploadImgToUnity('/storage', 'id', file, file.type))).status).to.equal(0);
    const error = new Error('storage');
    fetchStub.rejects(error);
    expect(await rejection(binder.uploadImgToUnity('/storage', 'id', file, file.type))).to.equal(error);
  });

  it('uploads and finalizes an asset and emits upload-start only at this boundary', async () => {
    const scan = sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
    const track = sinon.spy(binder, 'trackEvent');
    const log = sinon.spy(binder, 'logAnalyticsinSplunk');
    expect(await binder.uploadAsset(file, true)).to.equal(true);
    expect(JSON.parse(fetchStub.firstCall.args[1].body)).to.deep.equal({ targetProduct: 'Firefly', name: file.name, size: file.size, format: 'image/png' });
    expect(binder.assetId).to.equal('asset');
    expect(binder.originalAssetId).to.equal('asset');
    expect(binder.assetHref).to.equal('/storage');
    expect(scan.firstCall.args[0]).to.equal('asset');
    expect(widget.setProgress.lastCall.args).to.deep.equal([60]);
    expect(track.calledWith('Uploading Started|UnityWidget')).to.equal(true);
    expect(log.calledWith('Upload Completed|UnityWidget', { assetId: 'asset' })).to.equal(true);
  });

  [true, false].forEach((inline) => {
    it(`uploads chunks with ${inline ? 'inline' : 'splash'} progress and finalizes`, async () => {
      fetchStub.withArgs('/test-api/asset').resolves(new Response(JSON.stringify({ id: 'chunked', href: '/storage', blocksize: 3, uploadUrls: ['/a', '/b'] })));
      const scan = sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
      sinon.stub(UploadHandler.prototype, 'uploadChunksToUnity').callsFake(async (urls, data, size, signal, callbacks) => {
        expect(urls).to.deep.equal(['/a', '/b']);
        expect(data).to.equal(file);
        expect(size).to.equal(3);
        callbacks.onChunkComplete?.();
        callbacks.onChunkComplete?.();
        return { failedChunks: new Set(), attemptMap: new Map() };
      });
      expect(await binder.uploadAsset(file, inline)).to.equal(true);
      expect(scan.firstCall.args[0]).to.equal('chunked');
      expect(widget.setProgress.lastCall.args).to.deep.equal([60]);
    });
  });

  it('reports chunk failures without finalizing', async () => {
    fetchStub.withArgs('/test-api/asset').resolves(new Response(JSON.stringify({ id: 'chunked', blocksize: 3, uploadUrls: ['/a'] })));
    sinon.stub(UploadHandler.prototype, 'uploadChunksToUnity').resolves({ failedChunks: new Set([0]), attemptMap: new Map([[0, 4]]) });
    const scan = sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
    const track = sinon.spy(binder, 'trackServerError');
    expect(await binder.uploadAsset(file)).to.equal(false);
    expect(track.firstCall.args[0]).to.equal('upload');
    expect(track.firstCall.args[1].status).to.equal(504);
    expect(scan.called).to.equal(false);
  });

  it('honors cancellation after asset creation and chunk failure', async () => {
    fetchStub.withArgs('/test-api/asset').callsFake(async () => {
      binder.uploadAbortController.abort();
      return new Response(JSON.stringify({ id: 'asset' }));
    });
    expect(await binder.uploadAsset(file)).to.equal(false);
    fetchStub.withArgs('/test-api/asset').callsFake(async () => new Response(JSON.stringify({ id: 'asset', blocksize: 3, uploadUrls: ['/a'] })));
    sinon.stub(UploadHandler.prototype, 'uploadChunksToUnity').callsFake(async () => {
      binder.uploadAbortController.abort();
      return { failedChunks: new Set([0]), attemptMap: new Map() };
    });
    expect(await binder.uploadAsset(file)).to.equal(false);
  });

  [new Error('asset error'), new DOMException('cancelled', 'AbortError')].forEach((error) => {
    it(`handles asset creation failure: ${error.name}`, async () => {
      fetchStub.rejects(error);
      const track = sinon.spy(binder, 'trackServerError');
      expect(await binder.uploadAsset(file)).to.equal(false);
      expect(track.called).to.equal(error.name !== 'AbortError');
    });
  });

  it('removes backgrounds and records result/progress', async () => {
    binder.assetId = 'source';
    const res = await binder.removeBackground();
    expect(JSON.parse(fetchStub.lastCall.args[1].body)).to.deep.equal({ surfaceId: 'Unity', assets: [{ id: 'source' }] });
    expect(binder.resultAssetId).to.equal(res.assetId);
    expect(binder.resultUrl).to.equal(pixel);
    expect(widget.setProgress.lastCall.args).to.deep.equal([95]);
    binder.uploadAbortController = new AbortController();
    binder.uploadAbortController.abort();
    expect(await binder.removeBackground()).to.equal(null);
  });

  it('marks remove-background failures as tracked but ignores aborted requests', async () => {
    const error = new Error('remove');
    fetchStub.rejects(error);
    expect(await rejection(binder.removeBackground())).to.equal(error);
    expect(error.analyticsTracked).to.equal(true);
    fetchStub.rejects(new DOMException('cancel', 'AbortError'));
    expect(await binder.removeBackground()).to.equal(null);
  });

  it('builds connector payload with optional crop operations and default workflow', async () => {
    binder.assetId = 'source';
    expect((await binder.buildConnectorPayload()).payload).to.include({ workflow: 'upload-image', action: 'asset-upload', verb: 'removeBackground', widgetType: 'nba' });
    const operations = [{ type: 'crop', left: 0, top: 0, bottom: 0, right: 0 }];
    const payload = await binder.buildConnectorPayload({
      defaultPrompt: '  replace sky  ',
      verb: 'cropImage',
      connectorAssetId: 'source',
      fileType: 'image/jpeg',
      operations,
      aspectRatio: '4:3',
      workflow: 'image-operations',
      includeWidgetType: false,
    });
    expect(payload).to.include({ assetId: 'source', targetProduct: 'Firefly', query: 'replace sky' });
    expect(payload.payload).to.include({ workflow: 'image-operations', verb: 'cropImage', type: 'image/jpeg', aspectRatio: '4:3' });
    expect(payload.payload.operations).to.deep.equal(operations);
    expect(payload.payload).not.to.have.property('widgetType');
  });

  it('opens connector destinations and tracks failures', async () => {
    const open = sinon.stub(window, 'open').returns({});
    const success = sinon.spy(binder, 'trackConnectorSuccess');
    const opts = { assetId: 'asset', payload: { verb: 'resizeImage' } };
    expect(await binder.callConnector(opts)).to.deep.equal({ url: '#connected' });
    expect(open.calledWith('#connected', '_blank')).to.equal(true);
    expect(success.calledWith('resizeImage', 'asset')).to.equal(true);
    fetchStub.resolves(new Response(JSON.stringify({ status: 502 })));
    const error = await rejection(binder.callConnector(opts));
    expect(error.status).to.equal(502);
    expect(error.analyticsTracked).to.equal(true);
    fetchStub.rejects(new DOMException('abort', 'AbortError'));
    expect((await rejection(binder.callConnector(opts))).name).to.equal('AbortError');
  });

  it('completes splash progress for same-tab redirects and blocked popups', async () => {
    binder.sendAnalyticsToSplunk = null;
    const originalHash = window.location.hash;
    const progress = sinon.spy();
    binder.transitionScreen = { splashScreenEl: document.createElement('div'), updateProgressBar: progress };
    await binder.callConnector({ payload: {} }, { openInSameTab: true, useSplashProgress: true });
    expect(binder.transitionScreen.LOADER_LIMIT).to.equal(100);
    expect(progress.lastCall.args[1]).to.equal(100);
    sinon.stub(window, 'open').returns(null);
    await binder.callConnector({});
    expect(window.location.hash).to.equal('#connected');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${originalHash}`);
  });

  it('formats filenames from output MIME types', () => {
    expect(ActionBinder.downloadFilename()).to.equal('Firefly_RemoveBackground.png');
    ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'unknown'].forEach((type, i) => {
      expect(ActionBinder.downloadFilename(type, 'resize')).to.equal(`Firefly_Resize.${['jpg', 'jpg', 'png', 'webp', 'png'][i]}`);
    });
  });

  it('fetches download blobs and rejects failed or empty responses', async () => {
    const xhr = sinon.useFakeXMLHttpRequest();
    const requests = [];
    xhr.onCreate = (request) => requests.push(request);
    const promise = binder.getImageBlobData('/result');
    const blob = new Blob(['image'], { type: 'image/webp' });
    requests[0].respond(200, { 'Content-Type': 'image/webp' }, blob);
    expect(await promise).to.equal(blob);
    const failed = binder.getImageBlobData('/failed');
    const failedAssertion = rejection(failed);
    requests[1].respond(404, {}, '');
    expect((await failedAssertion).message).to.include('404');
    const network = binder.getImageBlobData('/network');
    const networkAssertion = rejection(network);
    requests[2].error();
    expect((await networkAssertion).message).to.equal('Failed to fetch image');
    xhr.restore();
    binder.resultBlob = new Blob([]);
    expect((await rejection(binder.resolveDownloadBlob('/empty'))).message).to.include('empty response');
  });

  it('uses cached blobs for downloads and revokes the temporary URL', async () => {
    const clock = sinon.useFakeTimers();
    const click = sinon.stub(HTMLAnchorElement.prototype, 'click');
    const revoke = sinon.spy(URL, 'revokeObjectURL');
    binder.resultBlob = new Blob(['image'], { type: 'image/jpeg' });
    binder.operation = 'crop';
    await binder.triggerDownload('/unused');
    expect(click.firstCall.thisValue.download).to.equal('Firefly_Crop.jpg');
    expect(document.body.contains(click.firstCall.thisValue)).to.equal(true);
    clock.tick(1000);
    expect(document.body.contains(click.firstCall.thisValue)).to.equal(false);
    expect(revoke.calledOnce).to.equal(true);
  });

  it('caches download data and clears cache after a failed fetch', async () => {
    const xhr = sinon.useFakeXMLHttpRequest();
    let request;
    xhr.onCreate = (value) => { request = value; };
    const cache = binder.cacheResultBlob('/result');
    const blob = new Blob(['data'], { type: 'image/png' });
    request.respond(200, { 'Content-Type': 'image/png' }, blob);
    await cache;
    expect(binder.resultBlob).to.equal(blob);
    binder.resultBlob = null;
    const failed = binder.cacheResultBlob('/failed');
    request.respond(500, {}, '');
    await failed;
    expect(binder.resultBlob).to.equal(null);
    xhr.restore();
  });

  it('counts successful local downloads but reports failed downloads', async () => {
    sinon.stub(HTMLAnchorElement.prototype, 'click');
    binder.resultBlob = new Blob(['data'], { type: 'image/webp' });
    await binder.runFirstLocalDownload();
    expect(binder.getUserCount()).to.equal(1);
    binder.resultBlob = null;
    const xhr = sinon.useFakeXMLHttpRequest();
    let request;
    xhr.onCreate = (value) => { request = value; };
    const pending = binder.runFirstLocalDownload();
    request.respond(404, {}, '');
    await pending;
    expect(binder.getUserCount()).to.equal(1);
    xhr.restore();
  });

  ['crop', 'resize', 'removeBackground'].forEach((operation) => {
    it(`routes signed-in ${operation} through its own verb`, async () => {
      binder.operation = operation;
      const scan = sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
      const ts = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: sinon.stub().resolves(),
        updateProgressBar: sinon.spy(),
      };
      binder.transitionScreen = ts;
      const originalHash = window.location.hash;
      await binder.signedInFlow(file, { performOperation: operation === 'removeBackground' });
      const request = fetchStub.args.find(([url]) => url === '/connector');
      const payload = JSON.parse(request[1].body);
      expect(payload.payload.verb).to.equal({ crop: 'cropImage', resize: 'resizeImage', removeBackground: 'aiPhotoEditor' }[operation]);
      expect(payload.assetId).to.equal(operation === 'removeBackground' ? 'result' : 'asset');
      expect(payload.payload.widgetType).to.equal(operation === 'removeBackground' ? 'nba' : undefined);
      expect(scan.calledOnce).to.equal(true);
      expect(binder.signedInFlowInProgress).to.equal(false);
      expect(binder.uploadAbortController).to.equal(null);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${originalHash}`);
    });
  });

  it('guards duplicate signed-in actions and handles failed uploads', async () => {
    binder.signedInFlowInProgress = true;
    await binder.signedInFlow(file);
    expect(fetchStub.called).to.equal(false);
    binder.signedInFlowInProgress = false;
    const ts = { loadSplashFragment: sinon.stub().resolves(), showSplashScreen: sinon.stub().resolves() };
    binder.transitionScreen = ts;
    fetchStub.rejects(new Error('upload failed'));
    await binder.signedInFlow(file);
    expect(ts.loadSplashFragment.calledOnce).to.equal(true);
    expect(ts.showSplashScreen.lastCall.args).to.deep.equal([false]);
    expect(binder.signedInFlowInProgress).to.equal(false);
  });

  it('handles failed signed-in remove-background and aborted operations', async () => {
    sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
    const ts = {
      splashScreenEl: document.createElement('div'),
      showSplashScreen: sinon.stub().resolves(),
      updateProgressBar: sinon.spy(),
    };
    binder.transitionScreen = ts;
    fetchStub.withArgs('/test-api/providers/RemoveBackground').rejects(new Error('remove'));
    await binder.signedInFlow(file);
    expect(ts.showSplashScreen.lastCall.args).to.deep.equal([false]);
    fetchStub.withArgs('/test-api/providers/RemoveBackground').rejects(new DOMException('abort', 'AbortError'));
    await binder.signedInFlow(file);
    expect(ts.showSplashScreen.lastCall.args).to.deep.equal([false]);
  });

  it('processes anonymous remove-background and updates the visible widget', async () => {
    sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
    binder.resultBlob = new Blob(['cached'], { type: 'image/png' });
    await binder.anonymousFlow(file);
    expect(widget.widget.dataset.state).to.equal('complete');
    expect(widget.widget.querySelector('img').src).to.equal(pixel);
    expect(widget.setProgress.lastCall.args).to.deep.equal([100]);
  });

  it('returns anonymous flows to initial state for upload and processing errors', async () => {
    fetchStub.rejects(new Error('upload'));
    await binder.anonymousFlow(file);
    expect(widget.widget.dataset.state).to.equal('initial');
    fetchStub.restore();
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response(JSON.stringify({ id: 'asset', href: '/storage' })));
    sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
    fetchStub.withArgs('/test-api/providers/RemoveBackground').rejects(new Error('remove'));
    await binder.anonymousFlow(file);
    expect(widget.widget.dataset.state).to.equal('initial');
  });

  it('sets up themed transition screens and reuses existing instances', async () => {
    root.classList.add('dark');
    const delayed = sinon.stub(TransitionScreen.prototype, 'delayedSplashLoader').resolves();
    const screen = await binder.ensureTransitionScreen({ delayedSplash: true });
    expect(binder.workflowCfg.theme).to.equal('dark');
    expect(delayed.calledOnce).to.equal(true);
    expect(await binder.ensureTransitionScreen()).to.equal(screen);
    expect(delayed.callCount).to.equal(1);
    binder.transitionScreen = null;
    root.classList.remove('dark');
    delayed.rejects(new Error('splash'));
    expect((await rejection(binder.loadTransitionScreen())).message).to.equal('splash');
    expect(window.lana.log.lastCall.args[0]).to.include('Error loading transition screen');
  });

  it('keeps splash progress monotonic and cancels active uploads', async () => {
    const ts = {
      splashScreenEl: document.createElement('div'),
      updateProgressBar: sinon.spy(),
      showSplashScreen: sinon.stub().resolves(),
    };
    binder.transitionScreen = ts;
    binder.setProgress(60, true);
    binder.setProgress(20, true);
    expect(ts.updateProgressBar.lastCall.args[1]).to.equal(60);
    binder.uploadAbortController = new AbortController();
    const { signal } = binder.uploadAbortController;
    binder.assetId = 'asset';
    binder.resultAssetId = 'result';
    await binder.cancelUploadOperation();
    expect(signal.aborted).to.equal(true);
    expect(binder.assetId).to.equal(null);
    expect(binder.resultAssetId).to.equal(null);
    expect(ts.showSplashScreen.calledWith(false)).to.equal(true);
    ts.showSplashScreen.onCall(1).rejects(new Error('hide'));
    await binder.cancelUploadOperation();
    expect(window.lana.log.lastCall.args[0]).to.include('Error cancelling upload operation');
  });

  it('creates one error toast per mount and restores interaction on close', async () => {
    binder.errorToastEl = await binder.createErrorToast();
    expect(binder.errorToastEl.querySelector('.alert-close-text').textContent).to.equal('Close error toast');
    expect(await binder.createErrorToast()).to.equal(binder.errorToastEl);
    binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), new Error('bad'), {});
    expect(widget.widget.style.pointerEvents).to.equal('none');
    expect(binder.errorToastEl.classList.contains('show')).to.equal(true);
    expect(binder.errorToastEl.querySelector('.alert-text p').innerText).to.equal('Request failed');
    binder.dismissErrorToast();
    expect(widget.widget.style.pointerEvents).to.equal('auto');
    binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), new Error('bad'), {});
    binder.errorToastEl.querySelector('.alert-close').click();
    expect(binder.errorToastEl.classList.contains('show')).to.equal(false);
    expect(widget.widget.style.pointerEvents).to.equal('auto');
  });

  it('handles absent toast mounts and failed icon loading', async () => {
    binder.serviceHandler.showErrorToast({}, new Error('ignored'), {});
    binder.serviceHandler.showErrorToast({ errorToastEl: true }, new Error('logged'), {});
    expect(window.lana.log.calledOnce).to.equal(true);
    fetchStub.rejects(new Error('icons'));
    expect(await binder.createErrorToast()).to.equal(null);
  });

  it('tracks whole-widget drops once and ignores drops while loading', () => {
    const track = sinon.spy(binder, 'trackEvent');
    const files = new DataTransfer();
    files.items.add(file);
    const area = root.querySelector('.interactive-area');
    area.dispatchEvent(new DragEvent('drop', { dataTransfer: files, bubbles: true, cancelable: true }));
    expect(track.calledWith('Click Drag and drop|UnityWidget')).to.equal(true);
    track.resetHistory();
    widget.widget.dataset.state = 'loading';
    area.dispatchEvent(new DragEvent('drop', { dataTransfer: files, bubbles: true }));
    expect(track.called).to.equal(false);
    widget.widget.dataset.state = 'complete';
    area.dispatchEvent(new DragEvent('drop', { bubbles: true }));
    expect(track.called).to.equal(false);
    root.querySelector('.action-button').click();
    expect(track.lastCall.args[0]).to.equal('Upload asset CTA|UnityWidget');
    root.querySelector('.ia-dropzone').click();
    expect(track.lastCall.args[0]).to.equal('Click Drag and drop|UnityWidget');
  });

  it('enables drag affordances only in initial/complete and transfers dropped files', () => {
    const area = root.querySelector('.interactive-area');
    const zone = root.querySelector('.ia-dropzone');
    const input = root.querySelector('input');
    const changed = sinon.spy();
    input.addEventListener('change', changed);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    ['dragenter', 'dragover'].forEach((type) => area.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, cancelable: true })));
    expect(zone.classList.contains('active')).to.equal(true);
    area.dispatchEvent(new DragEvent('dragleave'));
    expect(zone.classList.contains('active')).to.equal(false);
    area.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, cancelable: true }));
    expect(input.files[0]).to.equal(file);
    expect(changed.calledOnce).to.equal(true);
    expect(zone.classList.contains('active')).to.equal(false);
    widget.widget.dataset.state = 'loading';
    area.dispatchEvent(new DragEvent('dragenter'));
    expect(zone.classList.contains('active')).to.equal(false);
    binder.bindInteractiveAreaDrag(document.createElement('div'));
  });

  it('wires file pickers, dropzones, action buttons and interrupt links', async () => {
    const execute = sinon.spy(binder, 'executeActionMaps');
    binder.errorToastEl = document.createElement('div');
    binder.transitionScreen = { showSplashScreen: sinon.stub().resolves() };
    binder.limits.allowedFileTypes = ['image/jpeg'];
    const click = sinon.stub(root.querySelector('input'), 'click');
    binder.bindActionMapElements(root, {
      '.ia-dropzone': 'upload',
      '.ia-file-input': 'upload',
      '.action-button': 'upload',
      '.cancel': 'interrupt',
      '.download': 'resetEditor',
      '.ia-widget img': 'unknown',
    });
    const zone = root.querySelector('.ia-dropzone');
    const button = root.querySelector('.action-button');
    const input = root.querySelector('input');
    expect(input.accept).to.equal('image/jpeg');
    zone.click();
    button.click();
    ['Enter', ' ', 'Escape'].forEach((key) => button.dispatchEvent(new KeyboardEvent('keydown', { key })));
    expect(click.callCount).to.equal(4);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, cancelable: true }));
    expect(zone.classList.contains('active')).to.equal(true);
    zone.dispatchEvent(new DragEvent('dragleave'));
    expect(zone.classList.contains('active')).to.equal(false);
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, cancelable: true }));
    expect(execute.lastCall.args).to.deep.equal(['upload', [file]]);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('click'));
    root.querySelector('.cancel').click();
    root.querySelector('.download').click();
    expect(execute.calledWith('interrupt')).to.equal(true);
    expect(execute.calledWith('resetEditor', null, root.querySelector('.download'))).to.equal(true);
    widget.widget.dataset.state = 'loading';
    zone.click();
    button.click();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    zone.dispatchEvent(new DragEvent('dragover'));
    zone.dispatchEvent(new DragEvent('dragleave'));
    zone.dispatchEvent(new DragEvent('drop'));
    expect(click.callCount).to.equal(4);
    await Promise.all(execute.returnValues);
    expect(input.value).to.equal('');
  });

  it('dispatches upload action maps using real validation and upload flow', async () => {
    editor();
    binder.operation = 'resize';
    await binder.executeActionMaps('upload', [file]);
    expect(binder.originalFile).to.equal(file);
    expect(widget.widget.dataset.state).to.equal('complete');
    expect(binder.assetId).to.equal(null);
    expect(binder.errorToastEl.className).to.equal('alert-holder');
  });

  it('downloads a fetched first result without a cached blob', async () => {
    sinon.stub(HTMLAnchorElement.prototype, 'click');
    const xhr = sinon.useFakeXMLHttpRequest();
    let request;
    xhr.onCreate = (value) => { request = value; };
    const pending = binder.runFirstLocalDownload();
    request.respond(200, { 'Content-Type': 'image/png' }, new Blob(['data'], { type: 'image/png' }));
    await pending;
    expect(binder.getUserCount()).to.equal(1);
    xhr.restore();
  });

  ['crop', 'resize'].forEach((operation) => {
    it(`routes guest ${operation} to the editor and uploads only when required`, async () => {
      const engine = editor();
      binder.operation = operation;
      sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
      await binder.uploadFile([file]);
      expect(binder.isGuestUser).to.equal(true);
      expect(binder.filesData).to.deep.equal({ count: 1, name: file.name, size: file.size, type: file.type });
      expect(engine.setImage.firstCall.args.slice(1)).to.deep.equal([file.size, true]);
      expect(widget.widget.dataset.state).to.equal('complete');
      expect(fetchStub.args.some(([url]) => url === '/test-api/asset')).to.equal(operation === 'crop');
    });

    it(`routes signed-in ${operation} without server pixel processing`, async () => {
      guest = false;
      binder.operation = operation;
      binder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: sinon.stub().resolves(),
        updateProgressBar: sinon.spy(),
      };
      sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
      const originalHash = window.location.hash;
      await binder.uploadFile([file]);
      const connector = fetchStub.args.find(([url]) => url === '/connector');
      expect(JSON.parse(connector[1].body).payload.verb).to.equal(operation === 'crop' ? 'cropImage' : 'resizeImage');
      expect(fetchStub.args.some(([url]) => /providers/.test(url))).to.equal(false);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${originalHash}`);
    });
  });

  it('does not start uploads for missing or invalid files', async () => {
    await binder.uploadFile([]);
    await binder.uploadFile([new File(['a'], 'a.txt', { type: 'text/plain' })]);
    expect(fetchStub.called).to.equal(false);
    expect(binder.assetId).to.equal(null);
  });

  [true, false].forEach((isGuest) => {
    it(`routes remove-background for ${isGuest ? 'guest' : 'signed-in'} users`, async () => {
      guest = isGuest;
      binder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: sinon.stub().resolves(),
        updateProgressBar: sinon.spy(),
      };
      sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
      binder.resultBlob = new Blob(['old']);
      const xhr = sinon.useFakeXMLHttpRequest();
      xhr.onCreate = (request) => { request.respond = () => {}; };
      const originalHash = window.location.hash;
      await binder.uploadFile([file]);
      expect(fetchStub.args.some(([url]) => String(url).includes('/RemoveBackground'))).to.equal(true);
      expect(binder.resultAssetId).to.equal('result');
      if (isGuest) expect(widget.widget.dataset.state).to.equal('complete');
      xhr.restore();
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${originalHash}`);
    });
  });

  [1, 6].forEach((orientation) => {
    [true, false].forEach((little) => {
      it(`reads JPEG EXIF orientation ${orientation} (${little ? 'little' : 'big'} endian)`, async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 3;
        const jpeg = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg'); });
        const bytes = new Uint8Array(await jpeg.arrayBuffer());
        const segment = new Uint8Array(36);
        const view = new DataView(segment.buffer);
        view.setUint16(0, 0xFFE1);
        view.setUint16(2, 34);
        view.setUint32(4, 0x45786966);
        view.setUint16(10, little ? 0x4949 : 0x4D4D);
        view.setUint16(12, 42, little);
        view.setUint32(14, 8, little);
        view.setUint16(18, 1, little);
        view.setUint16(20, 0x0112, little);
        view.setUint16(22, 3, little);
        view.setUint32(24, 1, little);
        view.setUint16(28, orientation, little);
        const image = new File([bytes.slice(0, 2), segment, bytes.slice(2)], 'oriented.jpg', { type: 'image/jpeg' });
        binder.limits.maxFileSize = Infinity;
        binder.operation = 'resize';
        editor();
        await binder.uploadFile([image]);
        expect(binder.originalFile.name).to.equal('oriented.jpg');
        expect(binder.originalFile.type).to.equal('image/jpeg');
        if (orientation === 1) expect(binder.originalFile).to.equal(image);
        else expect(binder.originalFile).not.to.equal(image);
        expect(widget.editorEngine.setImage.firstCall.args[1]).to.equal(image.size);
      });
    });
  });

  [
    [0, 0, 0, 0],
    [0xFF, 0xD8, 0, 0, 0, 0, 0, 0],
    [0xFF, 0xD8, 0xFF, 0xE1, 0, 8, 0, 0, 0, 0],
    [0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0],
  ].forEach((bytes, index) => {
    it(`preserves JPEG without usable EXIF metadata (${index})`, async () => {
      binder.operation = 'resize';
      editor();
      const image = new File([new Uint8Array(bytes)], 'plain.jpg', { type: 'image/jpeg' });
      await binder.uploadFile([image]);
      expect(binder.originalFile).to.equal(image);
    });
  });

  it('dispatches reupload, cancellation and editor action maps without backend requests', async () => {
    editor();
    binder.errorToastEl = document.createElement('div');
    await binder.executeActionMaps('reupload');
    expect(widget.openFilePicker.calledOnce).to.equal(true);
    await binder.executeActionMaps('interrupt');
    expect(binder.assetId).to.equal(null);
    widget.editorEngine = null;
    await binder.executeActionMaps('resetEditor');
    await binder.executeActionMaps('runEditorOperation');
    await binder.executeActionMaps('runEditInFirefly');
    await binder.executeActionMaps('unknown');
    expect(fetchStub.called).to.equal(false);
  });

  ['crop', 'resize', 'removeBackground'].forEach((operation) => {
    it(`sends ${operation} download and NBA connector contracts`, async () => {
      binder.operation = operation;
      binder.resultAssetId = 'result';
      binder.resultBlob = new Blob(['result'], { type: 'image/png' });
      sinon.stub(HTMLAnchorElement.prototype, 'click');
      sinon.stub(window, 'open').returns({});
      await binder.executeActionMaps('download');
      let requests = fetchStub.args.filter(([url]) => url === '/connector');
      const first = JSON.parse(requests[0][1].body);
      expect(first.payload.verb).to.equal({ crop: 'cropImageFirstDownload', resize: 'resizeImageFirstDownload', removeBackground: 'aiPhotoEditor' }[operation]);
      expect(first.assetId).to.equal('result');
      expect(first.payload.widgetType).to.equal(operation === 'removeBackground' ? 'nba' : undefined);
      await binder.executeActionMaps('download');
      requests = fetchStub.args.filter(([url]) => url === '/connector');
      expect(JSON.parse(requests[1][1].body).payload.verb).to.equal({ crop: 'cropImageDownload', resize: 'resizeImageDownload', removeBackground: 'download' }[operation]);
      await binder.executeActionMaps('connector', null, root.querySelector('.ia-nba-card'));
      const nba = JSON.parse(fetchStub.lastCall.args[1].body);
      expect(nba.payload).to.include({ verb: 'removeElement', widgetType: 'nba', workflow: 'upload-image' });
      expect(nba.assetId).to.equal('result');
    });
  });

  it('reports connector errors from the download path', async () => {
    binder.incrementUserCount();
    fetchStub.withArgs('/connector').resolves(new Response('{}', { status: 500 }));
    const toast = sinon.spy(binder.serviceHandler, 'showErrorToast');
    await binder.handleConnector(root.querySelector('.ia-nba-card'));
    expect(toast.firstCall.args[1].status).to.equal(500);
  });

  it('skips a connector redirect for first local downloads on iOS Safari', async () => {
    sinon.stub(navigator, 'userAgent').get(() => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
    sinon.stub(navigator, 'userAgentData').get(() => undefined);
    binder.resultBlob = new Blob(['result'], { type: 'image/png' });
    sinon.stub(HTMLAnchorElement.prototype, 'click');
    await binder.handleConnector(null, true);
    expect(binder.getUserCount()).to.equal(1);
    expect(fetchStub.called).to.equal(false);
  });
});
