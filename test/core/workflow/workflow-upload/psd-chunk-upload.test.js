import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { getUnityLibs, setUnityLibs } from '../../../../unitylibs/scripts/utils.js';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-upload/action-binder.js';
import sendAnalyticsToSplunk from '../../../../unitylibs/scripts/analytics.js';

setUnityLibs('/unitylibs');
const { default: UploadHandler } = await import(`${getUnityLibs()}/core/workflow/workflow-upload/upload-handler.js`);
await import(`${getUnityLibs()}/utils/executeInBatches.js`);

const PSD_TYPE = 'image/vnd.adobe.photoshop';
const BLOCK_SIZE = 10;

function makeFile(chunks = 20, type = PSD_TYPE) {
  const buffer = new ArrayBuffer(chunks * BLOCK_SIZE);
  if (buffer.byteLength >= 26) {
    const view = new DataView(buffer);
    view.setUint32(0, 0x38425053);
    view.setUint16(4, 1);
    view.setUint16(12, 3);
    view.setUint32(14, 32);
    view.setUint32(18, 32);
    view.setUint16(22, 8);
    view.setUint16(24, 3);
  }
  return new File([buffer], 'document.psd', { type });
}

function urls(count) {
  return Array.from({ length: count }, (_, index) => `https://storage.example/upload?partNumber=${index + 1}`);
}

function response(status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: `status ${status}` };
}

describe('PSD-only chunk uploads', () => {
  let handler;
  let binder;
  let controller;
  let clock;
  let fetchStub;
  let coresStub;

  beforeEach(() => {
    setUnityLibs('/unitylibs');
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    coresStub = sinon.stub(navigator, 'hardwareConcurrency').get(() => 4);
    controller = new AbortController();
    binder = {
      assetId: 'psd-asset',
      workflowCfg: { name: 'workflow-upload', productName: 'Photoshop' },
      logAnalyticsinSplunk: sinon.spy(),
      lanaOptions: {},
    };
    handler = new UploadHandler(binder, {});
    fetchStub = sinon.stub(window, 'fetch').resolves(response());
  });

  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
  });

  function upload(count = 20, callbacks = {}) {
    return handler.uploadChunksToUnity(urls(count), makeFile(count), BLOCK_SIZE, controller.signal, callbacks);
  }

  function stallUntilAborted(_url, { signal }) {
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
    });
  }

  it('should emit exactly one success event for each uploaded PSD chunk', async () => {
    await upload(20);
    const events = binder.logAnalyticsinSplunk.getCalls();
    expect(events).to.have.lengthOf(20);
    events.forEach((event, index) => {
      expect(event.args).to.deep.equal(['Chunk Uploaded|UnityWidget', {
        assetId: 'psd-asset',
        fileMetaData: {
          chunkNumber: index + 1,
          chunkUploadAttempt: 1,
          size: `${BLOCK_SIZE}`,
          type: PSD_TYPE,
        },
      }]);
    });
  });

  it('should report the actual size of the final partial chunk', async () => {
    const file = new File([makeFile(3).slice(0, 25)], 'document.psd', { type: PSD_TYPE });
    await handler.uploadChunksToUnity(urls(3), file, BLOCK_SIZE, controller.signal);
    expect(binder.logAnalyticsinSplunk.lastCall.args[1].fileMetaData).to.deep.equal({
      chunkNumber: 3,
      chunkUploadAttempt: 1,
      size: '5',
      type: PSD_TYPE,
    });
  });

  it('should preserve chunk details in the serialized Splunk request', async () => {
    await upload(1);
    const [eventName, metadata] = binder.logAnalyticsinSplunk.firstCall.args;
    const originalIms = window.adobeIMS;
    window.adobeIMS = { getAccessToken: () => undefined };
    try {
      await sendAnalyticsToSplunk(eventName, 'photoshop', metadata, '/analytics');
      const [url, options] = fetchStub.lastCall.args;
      expect(url).to.equal('/analytics');
      expect(options.method).to.equal('POST');
      const payload = JSON.parse(options.body);
      expect(payload.event.name).to.equal('Chunk Uploaded|UnityWidget');
      expect(payload.content).to.deep.equal({
        assetId: 'psd-asset',
        fileMetaData: {
          chunkNumber: 1,
          chunkUploadAttempt: 1,
          size: `${BLOCK_SIZE}`,
          type: PSD_TYPE,
        },
      });
    } finally {
      window.adobeIMS = originalIms;
    }
  });

  [
    { cores: 8, limit: 10 },
    { cores: 4, limit: 10 },
    { cores: 3, limit: 6 },
    { cores: 2, limit: 6 },
    { cores: undefined, limit: 10 },
  ].forEach(({ cores, limit }) => {
    it(`should cap ${cores} reported cores at ${limit} rolling uploads`, async () => {
      coresStub.get(() => cores);
      const pending = [];
      let active = 0;
      let peak = 0;
      let hold = true;
      fetchStub.callsFake(() => {
        active += 1;
        peak = Math.max(peak, active);
        if (!hold) {
          active -= 1;
          return Promise.resolve(response());
        }
        return new Promise((resolve) => {
          let done = false;
          pending.push(() => {
            if (done) return;
            done = true;
            active -= 1;
            resolve(response());
          });
        });
      });
      const operation = upload();
      await clock.tickAsync(0);
      expect(fetchStub.callCount).to.equal(limit);
      pending[0]();
      await clock.tickAsync(0);
      expect(fetchStub.callCount).to.equal(limit + 1);
      expect(active).to.equal(limit);
      hold = false;
      pending.forEach((finish) => finish());
      const result = await operation;
      expect(peak).to.equal(limit);
      expect(active).to.equal(0);
      expect(result.failedChunks.size).to.equal(0);
      expect(result.attemptMap.size).to.equal(20);
      expect(clock.countTimers()).to.equal(0);
    });
  });

  it('should slice exact bytes, support href objects, and complete each chunk once', async () => {
    const file = makeFile(3);
    const uploadUrls = urls(3).map((href) => ({ href }));
    const onChunkComplete = sinon.spy();
    const onChunkError = sinon.spy();
    const result = await handler.uploadChunksToUnity(uploadUrls, file, BLOCK_SIZE, controller.signal, { onChunkComplete, onChunkError });
    expect(result.failedChunks.size).to.equal(0);
    expect([...result.attemptMap.values()]).to.deep.equal([1, 1, 1]);
    expect(onChunkComplete.callCount).to.equal(3);
    expect(onChunkComplete.firstCall.args.slice(0, 2)).to.deep.equal([0, 1]);
    expect(onChunkComplete.firstCall.args[2].attempt).to.equal(1);
    expect(onChunkError.called).to.be.false;
    await Promise.all(Array.from({ length: 3 }, async (_, index) => {
      const [url, options] = fetchStub.getCall(index).args;
      expect(url).to.equal(uploadUrls[index].href);
      expect(options.method).to.equal('PUT');
      expect(options.headers['Content-Type']).to.equal(PSD_TYPE);
      expect(options.signal).not.to.equal(controller.signal);
      expect(new Uint8Array(await options.body.arrayBuffer())).to.deep.equal(
        new Uint8Array(await file.slice(index * BLOCK_SIZE, (index + 1) * BLOCK_SIZE).arrayBuffer()),
      );
    }));
  });

  [429, 500, 502, 503, 504].forEach((status) => {
    it(`should retry HTTP ${status} after backoff`, async () => {
      fetchStub.onFirstCall().resolves(response(status));
      const operation = upload(1);
      await clock.tickAsync(999);
      expect(fetchStub.callCount).to.equal(1);
      await clock.tickAsync(1);
      const result = await operation;
      expect(fetchStub.callCount).to.equal(2);
      expect(result.attemptMap.get(0)).to.equal(2);
      expect(result.failedChunks.size).to.equal(0);
    });
  });

  it('should retry a network error without retrying already successful chunks', async () => {
    const counts = new Map();
    fetchStub.callsFake(async (url) => {
      const count = (counts.get(url) || 0) + 1;
      counts.set(url, count);
      if (url === urls(3)[1] && count === 1) throw new TypeError('Failed to fetch');
      return response();
    });
    const onChunkComplete = sinon.spy();
    const operation = upload(3, { onChunkComplete });
    await clock.tickAsync(1000);
    const result = await operation;
    expect([...counts.values()]).to.deep.equal([1, 2, 1]);
    expect(result.attemptMap.get(1)).to.equal(2);
    expect(onChunkComplete.callCount).to.equal(3);
    expect(result.failedChunks.size).to.equal(0);
    const events = binder.logAnalyticsinSplunk.getCalls();
    expect(events).to.have.lengthOf(3);
    expect(events.map((event) => event.args[0])).to.deep.equal(Array(3).fill('Chunk Uploaded|UnityWidget'));
    expect(events.find((event) => event.args[1].fileMetaData.chunkNumber === 2).args[1].fileMetaData.chunkUploadAttempt).to.equal(2);
  });

  it('should make exactly four attempts with 1s, 2s, and 4s delays', async () => {
    fetchStub.resolves(response(503));
    const onChunkError = sinon.spy();
    const operation = upload(1, { onChunkError });
    await clock.tickAsync(999);
    expect(fetchStub.callCount).to.equal(1);
    await clock.tickAsync(1);
    expect(fetchStub.callCount).to.equal(2);
    await clock.tickAsync(1999);
    expect(fetchStub.callCount).to.equal(2);
    await clock.tickAsync(1);
    expect(fetchStub.callCount).to.equal(3);
    await clock.tickAsync(3999);
    expect(fetchStub.callCount).to.equal(3);
    await clock.tickAsync(1);
    const result = await operation;
    expect(fetchStub.callCount).to.equal(4);
    expect(result.failedChunks.size).to.equal(1);
    expect(result.attemptMap.get(0)).to.equal(4);
    expect(onChunkError.calledOnce).to.be.true;
    expect(onChunkError.firstCall.args[1].status).to.equal(503);
    expect(onChunkError.firstCall.args[1].attempt).to.equal(4);
    expect(binder.logAnalyticsinSplunk.calledWith('Chunk Uploaded|UnityWidget')).to.be.false;
    expect(clock.countTimers()).to.equal(0);
  });

  [400, 401, 403, 404].forEach((status) => {
    it(`should fail HTTP ${status} without retrying`, async () => {
      fetchStub.resolves(response(status));
      const result = await upload(1);
      expect(fetchStub.calledOnce).to.be.true;
      expect(result.failedChunks.size).to.equal(1);
      expect(result.attemptMap.get(0)).to.equal(1);
      expect(controller.signal.aborted).to.be.false;
      expect(clock.countTimers()).to.equal(0);
    });
  });

  it('should abort the actual fetch after 60s and retry with a fresh signal', async () => {
    fetchStub.onFirstCall().callsFake(stallUntilAborted);
    const operation = upload(1);
    await clock.tickAsync(59999);
    expect(fetchStub.calledOnce).to.be.true;
    const firstSignal = fetchStub.firstCall.args[1].signal;
    expect(firstSignal.aborted).to.be.false;
    await clock.tickAsync(1);
    expect(firstSignal.aborted).to.be.true;
    expect(fetchStub.calledOnce).to.be.true;
    await clock.tickAsync(1000);
    const result = await operation;
    expect(fetchStub.callCount).to.equal(2);
    expect(fetchStub.secondCall.args[1].signal).not.to.equal(firstSignal);
    expect(fetchStub.secondCall.args[1].signal.aborted).to.be.false;
    expect(result.attemptMap.get(0)).to.equal(2);
    expect(controller.signal.aborted).to.be.false;
    expect(clock.countTimers()).to.equal(0);
  });

  it('should stop after four timeouts and report the timeout rather than user cancellation', async () => {
    fetchStub.callsFake(stallUntilAborted);
    const onChunkError = sinon.spy();
    const operation = upload(1, { onChunkError });
    await clock.tickAsync(247000);
    const result = await operation;
    expect(fetchStub.callCount).to.equal(4);
    expect(result.failedChunks.size).to.equal(1);
    expect(onChunkError.firstCall.args[1].name).to.equal('TimeoutError');
    expect(onChunkError.firstCall.args[1].status).to.equal(504);
    expect(controller.signal.aborted).to.be.false;
    expect(clock.countTimers()).to.equal(0);
  });

  it('should cancel pending requests and queued chunks without reporting an upload failure', async () => {
    fetchStub.callsFake(stallUntilAborted);
    const onChunkError = sinon.spy();
    const operation = upload(20, { onChunkError }).catch((error) => error);
    await clock.tickAsync(0);
    expect(fetchStub.callCount).to.equal(10);
    controller.abort();
    const error = await operation;
    expect(error.name).to.equal('AbortError');
    expect(fetchStub.callCount).to.equal(10);
    expect(fetchStub.getCalls().every((call) => call.args[1].signal.aborted)).to.be.true;
    expect(onChunkError.called).to.be.false;
    expect(binder.logAnalyticsinSplunk.called).to.be.false;
    expect(clock.countTimers()).to.equal(0);
  });

  it('should cancel retry waits immediately without starting more attempts', async () => {
    fetchStub.resolves(response(503));
    const operation = upload().catch((error) => error);
    await clock.tickAsync(0);
    expect(fetchStub.callCount).to.equal(10);
    controller.abort();
    expect((await operation).name).to.equal('AbortError');
    await clock.tickAsync(7000);
    expect(fetchStub.callCount).to.equal(10);
    expect(clock.countTimers()).to.equal(0);
  });

  it('should not start an already cancelled upload', async () => {
    controller.abort();
    const error = await upload().catch((caught) => caught);
    expect(error.name).to.equal('AbortError');
    expect(fetchStub.called).to.be.false;
  });

  it('should stop queued chunks, abort siblings, and drain before reporting permanent failure', async () => {
    let failFirst;
    let settled = false;
    fetchStub.onFirstCall().callsFake(() => new Promise((resolve) => { failFirst = resolve; }));
    fetchStub.callsFake((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        setTimeout(() => reject(new DOMException('Sibling aborted', 'AbortError')), 10);
      }, { once: true });
    }));
    const onChunkError = sinon.spy();
    const operation = upload(20, { onChunkError }).then((result) => {
      settled = true;
      return result;
    });
    await clock.tickAsync(0);
    expect(fetchStub.callCount).to.equal(10);
    failFirst(response(403));
    await clock.tickAsync(0);
    expect(settled).to.be.false;
    expect(fetchStub.getCalls().slice(1).every((call) => call.args[1].signal.aborted)).to.be.true;
    expect(fetchStub.callCount).to.equal(10);
    await clock.tickAsync(10);
    const result = await operation;
    expect(result.failedChunks.size).to.equal(1);
    expect([...result.failedChunks][0]).to.deep.equal({ chunkIndex: 0, chunkNumber: 1 });
    expect(onChunkError.calledOnce).to.be.true;
    expect(onChunkError.firstCall.args[1].status).to.equal(403);
    expect(binder.logAnalyticsinSplunk.calledWith('Chunk Uploaded|UnityWidget')).to.be.false;
    expect(controller.signal.aborted).to.be.false;
    expect(clock.countTimers()).to.equal(0);
  });

  it('should abort siblings in backoff when another chunk fails permanently', async () => {
    fetchStub.onFirstCall().resolves(response(503));
    fetchStub.onSecondCall().resolves(response(403));
    const result = await upload(2);
    expect(result.failedChunks.size).to.equal(1);
    expect([...result.failedChunks][0].chunkIndex).to.equal(1);
    await clock.tickAsync(7000);
    expect(fetchStub.callCount).to.equal(2);
    expect(clock.countTimers()).to.equal(0);
  });

  it('should remove the parent cancellation listener after success', async () => {
    const add = sinon.spy(controller.signal, 'addEventListener');
    const remove = sinon.spy(controller.signal, 'removeEventListener');
    await upload(1);
    expect(add.calledOnce).to.be.true;
    expect(remove.calledOnceWithExactly('abort', add.firstCall.args[1])).to.be.true;
    expect(clock.countTimers()).to.equal(0);
  });

  [0, -1, 1.5, NaN, Infinity].forEach((blockSize) => {
    it(`should reject invalid PSD block size ${blockSize} before uploading`, async () => {
      const error = await handler.uploadChunksToUnity(urls(1), makeFile(1), blockSize, controller.signal).catch((caught) => caught);
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include('positive integer block size');
      expect(fetchStub.called).to.be.false;
      expect(binder.logAnalyticsinSplunk.called).to.be.false;
    });
  });

  it('should reject a mismatch between PSD chunks and upload URLs', async () => {
    const error = await handler.uploadChunksToUnity(urls(1), makeFile(2), BLOCK_SIZE, controller.signal).catch((caught) => caught);
    expect(error.message).to.include('Mismatch between number of chunks');
    expect(fetchStub.called).to.be.false;
  });

  [
    { name: 'workflow-upload', productName: 'photoshop', type: 'image/jpeg' },
    { name: 'workflow-upload', productName: 'photoshop', type: 'image/jpg' },
    { name: 'workflow-upload', productName: 'photoshop', type: 'image/png' },
    { name: 'workflow-upload', productName: 'photoshop', type: 'image/webp' },
    { name: 'workflow-upload', productName: 'photoshop', type: 'video/mp4' },
    { name: 'workflow-upload', productName: 'photoshop', type: 'video/quicktime' },
    { name: 'workflow-upload', productName: 'lightroom', type: PSD_TYPE },
    { name: 'workflow-upload', productName: 'firefly', type: PSD_TYPE },
    { name: 'workflow-acrobat', productName: 'photoshop', type: PSD_TYPE },
    { name: undefined, productName: 'photoshop', type: PSD_TYPE },
  ].forEach(({ name, productName, type }) => {
    it(`should preserve the legacy transport for ${name}/${productName}/${type}`, async () => {
      binder.workflowCfg = { name, productName };
      const legacy = sinon.spy(handler, 'uploadFileToUnity');
      const network = sinon.stub(handler.networkUtils, 'fetchFromServiceWithRetry')
        .resolves({ response: response(), attempt: 1 });
      const file = makeFile(1, type);
      const result = await handler.uploadChunksToUnity(urls(1), file, BLOCK_SIZE, controller.signal);
      expect(result.failedChunks.size).to.equal(0);
      expect(legacy.calledOnce).to.be.true;
      expect(network.calledOnce).to.be.true;
      expect(network.firstCall.args[1].signal).to.equal(controller.signal);
      expect(network.firstCall.args[1].headers['Content-Type']).to.equal(type);
      expect(network.firstCall.args[2]).to.deep.equal({ retryType: 'exponential', retryParams: { maxRetries: 4, retryDelay: 1000 } });
      expect(fetchStub.called).to.be.false;
      expect(binder.logAnalyticsinSplunk.called).to.be.false;
    });
  });

  ['success', 'failure', 'cancel'].forEach((outcome) => {
    it(`should ${outcome === 'success' ? '' : 'not '}finalize or hand off after PSD ${outcome}`, async () => {
      const element = document.createElement('div');
      const workflowCfg = {
        name: 'workflow-upload',
        productName: 'photoshop',
        supportedFeatures: new Set(['tbd']),
        targetCfg: {
          limits: {
            maxNumFiles: 1,
            maxFileSize: 1000000000,
            maxWidth: 8000,
            maxHeight: 8000,
            allowedFileTypes: [PSD_TYPE],
          },
        },
      };
      const actionBinder = new ActionBinder(element, workflowCfg, element, [element]);
      const analytics = sinon.spy(actionBinder, 'logAnalyticsinSplunk');
      sinon.stub(actionBinder, 'checkImageDimensions').resolves({ width: 32, height: 32 });
      actionBinder.serviceHandler = {
        postCallToService: sinon.stub().resolves({ id: 'psd-asset', blocksize: BLOCK_SIZE, uploadUrls: urls(20) }),
        showErrorToast: sinon.spy(),
      };
      actionBinder.transitionScreen = { showSplashScreen: sinon.stub().resolves() };
      const finalize = sinon.stub(UploadHandler.prototype, 'scanImgForSafetyWithRetry').resolves();
      const handoff = sinon.stub(actionBinder, 'continueInApp').resolves();
      if (outcome === 'failure') fetchStub.resolves(response(403));
      if (outcome === 'cancel') fetchStub.callsFake(stallUntilAborted);
      const operation = actionBinder.uploadFile([makeFile()]);
      await clock.tickAsync(0);
      if (outcome === 'cancel') {
        expect(actionBinder.uploadAbortController).not.to.equal(null);
        actionBinder.uploadAbortController.abort();
      }
      await operation;
      expect(finalize.callCount, actionBinder.serviceHandler.showErrorToast.firstCall?.args[1]?.stack).to.equal(outcome === 'success' ? 1 : 0);
      expect(handoff.callCount).to.equal(outcome === 'success' ? 1 : 0);
      expect(actionBinder.serviceHandler.showErrorToast.callCount).to.equal(outcome === 'failure' ? 1 : 0);
      expect(analytics.withArgs('Chunk Uploaded|UnityWidget').callCount).to.equal(outcome === 'success' ? 20 : 0);
      expect(analytics.withArgs('Chunked Upload Completed|UnityWidget').callCount).to.equal(outcome === 'success' ? 1 : 0);
      expect(clock.countTimers()).to.equal(0);
    });
  });
});
