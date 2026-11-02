import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';
import {
  buildImageOperationsPayload, editorUploadFlow, runEditorOperation,
  resetEditor, runEditInFirefly,
} from '../../../../unitylibs/core/workflow/workflow-inline-action/editor-flow.js';

setUnityLibs('/unitylibs');

describe('Inline action editor workflow', () => {
  let binder;
  let engine;
  let urls;
  const file = new File(['original'], 'photo.png', { type: 'image/png' });
  const bounds = { left: 10, top: 20, right: 110, bottom: 220 };

  beforeEach(() => {
    urls = [];
    engine = {
      sourceImg: Object.assign(document.createElement('canvas'), { width: 200, height: 300 }),
      getSourceBounds: sinon.stub().returns(bounds),
      getResizeDimensions: sinon.stub().returns({ width: 50.4, height: 100.4 }),
      encodeQuality: sinon.stub().returns(undefined),
      outputType: 'image/png',
      quality: 79.7,
      naturalW: 200,
      naturalH: 300,
      currentImageSize: 1000,
      uploadedImageSize: 2000,
      originalImageUrl: 'original-url',
      resizeTab: 'custom',
      unit: 'px',
      setImage: sinon.stub().resolves(),
      setOutputType: sinon.spy(),
      reset: sinon.spy(),
      setBusy: sinon.spy(),
    };
    engine.sourceImg.decode = sinon.stub().resolves();
    binder = {
      operation: 'crop',
      assetId: 'original',
      originalAssetId: 'original',
      originalFileType: 'image/png',
      originalFile: file,
      filesData: { type: file.type, name: file.name },
      apiConfig: { endPoint: { imageOperations: '/imageOperations' } },
      lanaOptions: { tags: 'test' },
      widgetRef: {
        editorEngine: engine,
        ensureEditorEngine: sinon.stub().resolves(engine),
        setState: sinon.spy(),
        setProgress: sinon.spy(),
      },
      uploadAsset: sinon.stub().callsFake(async () => {
        binder.assetId = 'uploaded';
        binder.originalAssetId = 'uploaded';
        binder.originalFileType = binder.filesData.type;
        return true;
      }),
      uploadErrorOpts: sinon.stub().returns({ errorType: 'upload' }),
      trackEvent: sinon.spy(),
      trackServerError: sinon.spy(),
      bindActionMapElements: sinon.spy(),
      handleConnector: sinon.stub().resolves(),
      buildConnectorPayload: sinon.stub().callsFake(async (fields) => fields),
      callConnector: sinon.stub().resolves(),
      serviceHandler: {
        postCallToService: sinon.stub().resolves({ assetId: 'cropped', outputUrl: 'crop-url' }),
        showErrorToast: sinon.spy(),
      },
    };
    const create = URL.createObjectURL.bind(URL);
    sinon.stub(URL, 'createObjectURL').callsFake((blob) => {
      const url = create(blob);
      urls.push(url);
      return url;
    });
  });

  afterEach(() => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    sinon.restore();
  });

  it('keeps the crop image-operations contract unchanged', async () => {
    expect(buildImageOperationsPayload(binder, bounds)).to.deep.equal({
      operations: [{ type: 'crop', ...bounds }],
      outputMediaType: 'image/jpeg',
      assets: [{ id: 'original' }],
    });
    await runEditorOperation(binder);
    const [endpoint, options] = binder.serviceHandler.postCallToService.firstCall.args;
    expect(endpoint).to.equal('/imageOperations');
    expect(JSON.parse(options.body)).to.deep.equal(buildImageOperationsPayload({ assetId: 'original' }, bounds));
    expect(binder.assetId).to.equal('cropped');
    expect(binder.filesData.type).to.equal('image/jpeg');
    expect(engine.setImage.calledWith('crop-url', 1000)).to.equal(true);
    expect(binder.handleConnector.calledWith(null, true)).to.equal(true);
    expect(engine.setBusy.args).to.deep.equal([[true, undefined], [false, undefined]]);
  });

  ['image/png', 'image/jpeg', 'image/webp'].forEach((type) => {
    it(`resizes ${type} in canvas and uploads the actual encoded type`, async () => {
      binder.operation = 'resize';
      engine.outputType = type;
      engine.encodeQuality.returns(type === 'image/jpeg' ? 0.8 : undefined);
      const draw = sinon.spy(CanvasRenderingContext2D.prototype, 'drawImage');
      await runEditorOperation(binder);
      expect(draw.firstCall.args).to.deep.equal([engine.sourceImg, 10, 20, 100, 200, 0, 0, 50, 100]);
      expect(binder.serviceHandler.postCallToService.called).to.equal(false);
      const uploadedFile = binder.uploadAsset.firstCall.args[0];
      expect(uploadedFile.type).to.equal(type);
      expect(binder.resultBlob.type).to.equal(type);
      expect(binder.filesData.type).to.equal(type);
      expect(binder.resultAssetId).to.equal('uploaded');
      expect(binder.originalAssetId).to.equal('original');
      expect(binder.originalFileType).to.equal('image/png');
      expect(engine.setImage.calledWith(binder.resultUrl, binder.resultBlob.size)).to.equal(true);
    });
  });

  it('uses the returned PNG type when a WebP encoder falls back', async () => {
    binder.operation = 'resize';
    engine.outputType = 'image/webp';
    sinon.stub(HTMLCanvasElement.prototype, 'toBlob').callsFake((callback, type, quality) => {
      expect(type).to.equal('image/webp');
      expect(quality).to.equal(undefined);
      callback(new Blob(['png'], { type: 'image/png' }));
    });
    await runEditorOperation(binder);
    expect(binder.uploadAsset.firstCall.args[0].type).to.equal('image/png');
    expect(binder.resultBlob.type).to.equal('image/png');
    expect(binder.filesData.type).to.equal('image/png');
  });

  it('sends unlocalized NBA analytics and continues with the clicked element', async () => {
    const pill = document.createElement('button');
    pill.dataset.nba = 'removeElement';
    pill.textContent = 'Supprimer';
    await runEditorOperation(binder, pill);
    expect(binder.trackEvent.firstCall.args).to.deep.equal([
      'removeElement - Do more with|UnityWidget',
      { assetId: 'cropped', action: 'redirect', verb: 'removeElement' },
    ]);
    expect(binder.handleConnector.calledWithExactly(pill)).to.equal(true);
  });

  ['crop', 'resize'].forEach((operation) => {
    [false, true].forEach((tracked) => {
      it(`reports ${operation} processing errors without duplicating tracked errors (${tracked})`, async () => {
        binder.operation = operation;
        const error = Object.assign(new Error('processing failed'), { analyticsTracked: tracked });
        if (operation === 'crop') binder.serviceHandler.postCallToService.rejects(error);
        else engine.sourceImg.decode.rejects(error);
        await runEditorOperation(binder);
        expect(binder.handleConnector.called).to.equal(false);
        expect(binder.trackServerError.called).to.equal(!tracked);
        expect(binder.serviceHandler.showErrorToast.firstCall.args[1]).to.equal(error);
        expect(engine.setBusy.lastCall.args[0]).to.equal(false);
      });
    });
  });

  it('rejects a null canvas encoding and does not upload', async () => {
    binder.operation = 'resize';
    sinon.stub(HTMLCanvasElement.prototype, 'toBlob').callsFake((callback) => callback(null));
    await runEditorOperation(binder);
    expect(binder.uploadAsset.called).to.equal(false);
    expect(binder.trackServerError.firstCall.args[1].message).to.equal('Canvas toBlob failed');
  });

  it('restores original asset state when a resized upload fails', async () => {
    binder.operation = 'resize';
    binder.uploadAsset.callsFake(async () => {
      binder.assetId = 'failed';
      binder.originalAssetId = 'failed';
      binder.originalFileType = 'image/jpeg';
      return false;
    });
    await runEditorOperation(binder);
    expect(binder.assetId).to.equal('original');
    expect(binder.originalAssetId).to.equal('original');
    expect(binder.originalFileType).to.equal('image/png');
    expect(binder.handleConnector.called).to.equal(false);
  });

  it('always clears busy state if the connector rejects', async () => {
    const error = new Error('connector');
    binder.handleConnector.rejects(error);
    let caught;
    await runEditorOperation(binder).catch((e) => { caught = e; });
    expect(caught).to.equal(error);
    expect(engine.setBusy.lastCall.args[0]).to.equal(false);
  });

  ['crop', 'resize'].forEach((operation) => {
    it(`initializes the ${operation} editor with its intended upload timing`, async () => {
      binder.operation = operation;
      binder.widgetRef.editorEngine = null;
      engine.leftPanel = document.createElement('div');
      engine.rightPanel = document.createElement('div');
      engine.moreMenu = document.createElement('div');
      binder.widgetRef.ensureEditorEngine.callsFake(async (track) => {
        track('editor-event', { test: true });
        binder.widgetRef.editorEngine = engine;
        return engine;
      });
      await editorUploadFlow(binder, file, 999);
      expect(binder.uploadAsset.called).to.equal(operation === 'crop');
      if (operation === 'crop') expect(binder.uploadAsset.firstCall.args).to.deep.equal([file, true]);
      else {
        expect(binder.originalFile).to.equal(file);
        expect(engine.setOutputType.calledWith(file.type)).to.equal(true);
      }
      expect(engine.setImage.firstCall.args.slice(1)).to.deep.equal([999, true]);
      expect(engine.reset.calledOnce).to.equal(true);
      expect(binder.bindActionMapElements.callCount).to.equal(3);
      expect(binder.widgetRef.setState.args.map(([s]) => s)).to.deep.equal(['loading', 'complete']);
      expect(binder.trackEvent.calledWith('editor-event', { test: true })).to.equal(true);
    });

    it(`resets ${operation} using the correct size and original metadata`, async () => {
      binder.operation = operation;
      await resetEditor(binder);
      expect(engine.setImage.firstCall.args).to.deep.equal(['original-url', operation === 'resize' ? 2000 : 1000]);
      expect(binder.assetId).to.equal('original');
      expect(binder.filesData.type).to.equal('image/png');
      expect(binder.trackEvent.calledWith('Reset|UnityWidget')).to.equal(true);
    });
  });

  it('does not rebind an existing engine and defaults to the file size', async () => {
    await editorUploadFlow(binder, file);
    expect(binder.bindActionMapElements.called).to.equal(false);
    expect(engine.setImage.firstCall.args[1]).to.equal(file.size);
  });

  it('returns to initial when crop upload fails', async () => {
    binder.uploadAsset.resolves(false);
    await editorUploadFlow(binder, file);
    expect(engine.setImage.called).to.equal(false);
    expect(binder.widgetRef.setState.lastCall.args).to.deep.equal(['initial']);
  });

  [false, true].forEach((tracked) => {
    it(`reports editor initialization failures (${tracked})`, async () => {
      const error = Object.assign(new Error('decode'), { analyticsTracked: tracked });
      engine.setImage.rejects(error);
      await editorUploadFlow(binder, file);
      expect(binder.trackServerError.called).to.equal(!tracked);
      expect(binder.serviceHandler.showErrorToast.firstCall.args[1]).to.equal(error);
      expect(binder.widgetRef.setState.lastCall.args).to.deep.equal(['initial']);
    });
  });

  it('does nothing without an engine', async () => {
    binder.widgetRef.editorEngine = null;
    await runEditorOperation(binder);
    await resetEditor(binder);
    await runEditInFirefly(binder);
    expect(binder.trackEvent.called).to.equal(false);
    expect(binder.handleConnector.called).to.equal(false);
  });

  it('can reset without an original file type', async () => {
    binder.originalFileType = null;
    binder.filesData.type = 'image/webp';
    await resetEditor(binder);
    expect(binder.filesData.type).to.equal('image/webp');
  });

  it('preserves the crop Firefly contract and converts bounds to edge distances', async () => {
    engine.selectedRatioText = '4:3';
    await runEditInFirefly(binder);
    expect(binder.buildConnectorPayload.firstCall.args[0]).to.deep.equal({
      verb: 'cropImage',
      connectorAssetId: 'original',
      fileType: 'image/png',
      workflow: 'image-operations',
      includeWidgetType: false,
      aspectRatio: '4:3',
      operations: [{ type: 'crop', left: 10, top: 20, right: 90, bottom: 80 }],
    });
    expect(binder.uploadAsset.called).to.equal(false);
  });

  it('uses freeform for crop without a selected ratio and reports connector errors', async () => {
    const error = new Error('connector');
    binder.callConnector.rejects(error);
    await runEditInFirefly(binder, { textContent: 'Edit' });
    expect(binder.buildConnectorPayload.firstCall.args[0].aspectRatio).to.equal('freeform');
    expect(binder.serviceHandler.showErrorToast.firstCall.args[1]).to.equal(error);
    expect(binder.trackEvent.firstCall.args[0]).to.equal('Edit|UnityWidget');
  });

  [
    { tab: 'custom', pill: null, mode: 'Freeform' },
    { tab: 'standard', pill: { ratioText: '4:3' }, mode: 'Standard', aspectRatio: '4:3' },
    { tab: 'social', pill: { platform: 'Instagram', name: 'Story', width: '1080', height: '1920' }, mode: 'Social' },
    { tab: 'social', pill: { platform: 'Facebook', name: 'Post' }, mode: 'Social' },
    { tab: 'custom', pill: { ratioText: '4:3' }, mode: 'Freeform' },
    { tab: 'custom', pill: {}, mode: 'Freeform' },
  ].forEach(({ tab, pill, mode, aspectRatio }) => {
    it(`builds resize operations for ${tab}/${JSON.stringify(pill)}`, async () => {
      binder.operation = 'resize';
      engine.resizeTab = tab;
      engine.selectedPill = pill ? { dataset: pill } : null;
      engine.outputType = 'image/jpeg';
      engine.unit = 'in';
      await runEditInFirefly(binder);
      const fields = binder.buildConnectorPayload.firstCall.args[0];
      const expected = { type: 'resize', resizeMode: mode, width: 50, height: 100, displayUnit: 'in', quality: 80 };
      if (mode === 'Social') {
        expected.socialApp = pill.platform;
        expected.socialPostType = pill.name;
        if (pill.width) Object.assign(expected, { width: 1080, height: 1920 });
      }
      expect(fields.operations).to.deep.equal([
        { type: 'crop', left: 10, top: 20, right: 90, bottom: 80 }, expected,
      ]);
      expect(fields.aspectRatio).to.equal(aspectRatio);
      expect(fields.verb).to.equal('resizeImage');
      expect(fields.workflow).to.equal('image-operations');
      expect(binder.uploadAsset.called).to.equal(false);
    });
  });

  it('uploads lazily once and omits quality for non-JPEG', async () => {
    binder.operation = 'resize';
    binder.assetId = null;
    await Promise.all([runEditInFirefly(binder), runEditInFirefly(binder)]);
    expect(binder.uploadAsset.calledOnceWithExactly(file)).to.equal(true);
    expect(binder.originalUploadPromise).to.equal(null);
    expect(binder.buildConnectorPayload.firstCall.args[0].operations[1]).to.deep.equal({ type: 'resize', resizeMode: 'Freeform', width: 50, height: 100, displayUnit: 'px' });
    await runEditInFirefly(binder);
    expect(binder.uploadAsset.callCount).to.equal(1);
  });

  it('allows retry after a failed deferred upload and releases busy state', async () => {
    binder.operation = 'resize';
    binder.assetId = null;
    binder.uploadAsset.onFirstCall().resolves(false);
    await runEditInFirefly(binder);
    expect(binder.assetId).to.equal(null);
    expect(binder.callConnector.called).to.equal(false);
    expect(engine.setBusy.lastCall.args[0]).to.equal(false);
    await runEditInFirefly(binder);
    expect(binder.uploadAsset.callCount).to.equal(2);
    expect(binder.callConnector.calledOnce).to.equal(true);
  });
});
