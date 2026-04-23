/* eslint-disable max-len */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs } from '../../../unitylibs/scripts/utils.js';
import UnityWidget from '../../../unitylibs/core/widgets/image-to-video/image-to-video.js';
import ActionBinder from '../../../unitylibs/core/workflow/workflow-image-to-video/action-binder.js';

const MODELS_DATA = [
  { id: 'firefly-v3', version: '3.0', name: 'Firefly v3', icon: '' },
  { id: 'firefly-v4', version: '4.0', name: 'Firefly v4', icon: '' },
];

const ASPECT_RATIOS_DATA = [
  { label: '16:9', value: '16:9', model: 'firefly-v3' },
  { label: '9:16', value: '9:16', model: 'firefly-v3' },
  { label: '1:1', value: '1:1', model: 'firefly-v4' },
];

describe('Image-to-Video Workflow Tests', () => {
  let unityWidget;
  let actionBinder;
  let unityElement;
  let block;
  let canvasArea;
  let workflowCfg;
  let actionMap;
  let fetchStub;

  before(async () => {
    setUnityLibs('', 'unity');

    fetchStub = sinon.stub(window, 'fetch');
    fetchStub.callsFake(async (url) => {
      if (url && url.includes('model-picker')) {
        return { ok: true, json: async () => ({ data: MODELS_DATA }) };
      }
      if (url && url.includes('aspect-ratios')) {
        return { ok: true, json: async () => ({ data: ASPECT_RATIOS_DATA }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    document.body.innerHTML = await readFile({ path: './mocks/image-to-video-body.html' });

    unityElement = document.querySelector('.unity');
    block = document.querySelector('.unity-enabled');
    canvasArea = document.createElement('div');

    workflowCfg = {
      name: 'workflow-image-to-video',
      productName: 'image-to-video',
      targetCfg: {
        renderWidget: true,
        insert: 'before',
        target: '.row-supplemental',
        actionMap: {
          '.gen-btn': [{ actionType: 'generate' }],
          '.more-filters-btn': [{ actionType: 'moreFilters' }],
        },
      },
    };

    unityWidget = new UnityWidget(block, unityElement, workflowCfg, '<svg></svg>');
    actionMap = await unityWidget.initWidget();

    actionBinder = new ActionBinder(unityElement, workflowCfg, block, canvasArea, actionMap);
  });

  after(() => {
    fetchStub.restore();
  });

  it('should initialize UnityWidget correctly', () => {
    expect(unityWidget).to.exist;
    expect(unityWidget.target).to.equal(block);
    expect(unityWidget.el).to.equal(unityElement);
  });

  it('should return actionMap from initWidget', () => {
    expect(actionMap).to.be.an('object');
    expect(actionMap['.gen-btn']).to.exist;
    expect(actionMap['.more-filters-btn']).to.exist;
  });

  it('should insert widget wrap into DOM', () => {
    expect(document.querySelector('.ex-unity-wrap')).to.exist;
    expect(document.querySelector('.ex-unity-widget')).to.exist;
    expect(document.querySelector('.iv-widget')).to.exist;
  });

  it('should render dropzone with correct elements', () => {
    const dropzone = document.querySelector('.iv-dropzone');
    expect(dropzone).to.exist;
    const fileInput = dropzone.querySelector('.dz-input');
    expect(fileInput).to.exist;
    expect(fileInput.type).to.equal('file');
    expect(fileInput.getAttribute('aria-hidden')).to.equal('true');
    const loader = dropzone.querySelector('.dz-loader');
    expect(loader).to.exist;
    expect(dropzone.classList.contains('loading')).to.be.false;
    const preview = dropzone.querySelector('.dz-preview');
    expect(preview).to.exist;
    expect(dropzone.classList.contains('preview-ready')).to.be.false;
  });

  it('should render prompt bar with .inp-field textarea', () => {
    const promptBar = document.querySelector('.iv-prompt-bar');
    expect(promptBar).to.exist;
    const textarea = promptBar.querySelector('.inp-field');
    expect(textarea).to.exist;
    expect(textarea.tagName.toLowerCase()).to.equal('textarea');
  });

  it('should render model selector when models are provided', () => {
    const modelSelector = document.querySelector('.iv-model-selector');
    expect(modelSelector).to.exist;
    const selectedBtn = modelSelector.querySelector('.selected-model');
    expect(selectedBtn).to.exist;
    const verbList = modelSelector.querySelector('.verb-list');
    expect(verbList).to.exist;
    expect(verbList.querySelectorAll('.verb-item').length).to.equal(MODELS_DATA.length);
  });

  it('should set first model as selected on init', () => {
    const wrap = document.querySelector('.ex-unity-wrap');
    expect(wrap.dataset.selectedModelId).to.equal(MODELS_DATA[0].id);
    expect(wrap.dataset.selectedModelVersion).to.equal(MODELS_DATA[0].version);
  });

  it('should render aspect ratio options for first model', () => {
    const arSelector = document.querySelector('.iv-ar-selector');
    expect(arSelector).to.exist;
    const firstModelOptions = ASPECT_RATIOS_DATA.filter((ar) => !ar.model || ar.model === MODELS_DATA[0].id);
    const buttons = arSelector.querySelectorAll('.iv-ar-option');
    expect(buttons.length).to.equal(firstModelOptions.length);
    expect(buttons[0].classList.contains('selected')).to.be.true;
    expect(buttons[0].getAttribute('aria-pressed')).to.equal('true');
  });

  it('should update aspect ratio options when model is changed', () => {
    unityWidget.updateAspectRatiosForModel(MODELS_DATA[1].id);
    const arSelector = document.querySelector('.iv-ar-selector');
    const secondModelOptions = ASPECT_RATIOS_DATA.filter((ar) => !ar.model || ar.model === MODELS_DATA[1].id);
    const buttons = arSelector.querySelectorAll('.iv-ar-option');
    expect(buttons.length).to.equal(secondModelOptions.length);
    unityWidget.updateAspectRatiosForModel(MODELS_DATA[0].id);
  });

  it('should render More filters button and generate button', () => {
    const moreFiltersBtn = document.querySelector('.more-filters-btn');
    expect(moreFiltersBtn).to.exist;
    const genBtn = document.querySelector('.gen-btn');
    expect(genBtn).to.exist;
  });

  it('should correctly populate placeholders', () => {
    const placeholders = unityWidget.popPlaceholders();
    expect(placeholders).to.be.an('object');
    expect(Object.keys(placeholders).length).to.be.greaterThan(0);
    expect(placeholders['placeholder-input']).to.equal('Describe your animation');
    expect(placeholders['placeholder-dropzone']).to.equal('Drag and drop or click to upload');
  });

  it('should initialize ActionBinder correctly', () => {
    expect(actionBinder).to.exist;
    expect(actionBinder.block).to.equal(block);
    expect(actionBinder.unityEl).to.equal(unityElement);
  });

  it('should bind event listeners on initActionListeners', async () => {
    const createErrorToastStub = sinon.stub(actionBinder, 'createErrorToast').resolves(null);
    await actionBinder.initActionListeners();
    createErrorToastStub.restore();
    document.querySelectorAll('.gen-btn').forEach((el) => {
      expect(el.getAttribute('data-event-bound')).to.equal('true');
    });
    document.querySelectorAll('.more-filters-btn').forEach((el) => {
      expect(el.getAttribute('data-event-bound')).to.equal('true');
    });
  });

  it('should call window.open with product URL on moreFilters', () => {
    const openStub = sinon.stub(window, 'open');
    actionBinder.moreFilters();
    expect(openStub.calledOnce).to.be.true;
    const calledUrl = openStub.firstCall.args[0];
    expect(calledUrl).to.include('firefly.adobe.com');
    expect(openStub.firstCall.args[1]).to.equal('_blank');
    openStub.restore();
  });

  describe('generateContent', () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should build payload without assetId when no image is uploaded', async () => {
      const wrap = document.querySelector('.ex-unity-wrap');
      const dropzone = document.querySelector('.iv-dropzone');
      dropzone.classList.remove('preview-ready');
      delete wrap._ivUploadedFile;

      const textarea = document.querySelector('.inp-field');
      textarea.value = 'a calm ocean at sunset';

      let capturedPayload = null;
      const mockNetworkUtils = {
        fetchFromService: sandbox.stub().callsFake(async (endpoint, opts, handler) => {
          capturedPayload = JSON.parse(opts.body);
          return handler({ status: 200, json: async () => ({ url: '' }) });
        }),
      };
      sandbox.stub(actionBinder, 'getNetworkUtils').resolves(mockNetworkUtils);
      sandbox.stub(actionBinder, 'createErrorToast').resolves(null);

      await actionBinder.generateContent();

      expect(capturedPayload).to.exist;
      expect(capturedPayload.assetId).to.be.undefined;
      expect(capturedPayload.payload.prompt).to.equal('a calm ocean at sunset');
      expect(capturedPayload.payload.workflow).to.equal('image-to-video');
    });

    it('should include assetId in payload when image is uploaded', async () => {
      const wrap = document.querySelector('.ex-unity-wrap');
      const dropzone = document.querySelector('.iv-dropzone');
      dropzone.classList.add('preview-ready');

      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/78fKfoAAAAASUVORK5CYII=';
      const imageBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
      const file = new File([imageBlob], 'test.png', { type: 'image/png' });
      wrap._ivUploadedFile = file;

      sandbox.stub(actionBinder, 'uploadImageIfPresent').resolves('mock-asset-id-123');

      let capturedPayload = null;
      const mockNetworkUtils = {
        fetchFromService: sandbox.stub().callsFake(async (endpoint, opts, handler) => {
          capturedPayload = JSON.parse(opts.body);
          return handler({ status: 200, json: async () => ({ url: '' }) });
        }),
      };
      sandbox.stub(actionBinder, 'getNetworkUtils').resolves(mockNetworkUtils);
      sandbox.stub(actionBinder, 'createErrorToast').resolves(null);

      await actionBinder.generateContent();

      expect(capturedPayload).to.exist;
      expect(capturedPayload.assetId).to.equal('mock-asset-id-123');

      dropzone.classList.remove('preview-ready');
      delete wrap._ivUploadedFile;
    });

    it('should navigate to returned URL on successful generate', async () => {
      const dropzone = document.querySelector('.iv-dropzone');
      dropzone.classList.remove('preview-ready');

      const redirectUrl = 'https://firefly.adobe.com/video/result';
      let fetchedUrl = null;
      const mockNetworkUtils = {
        fetchFromService: sandbox.stub().callsFake(async (endpoint, opts, handler) => {
          fetchedUrl = endpoint;
          return handler({
            status: 200,
            json: async () => ({ url: redirectUrl }),
          });
        }),
      };
      sandbox.stub(actionBinder, 'getNetworkUtils').resolves(mockNetworkUtils);
      sandbox.stub(actionBinder, 'createErrorToast').resolves(null);

      await actionBinder.generateContent();

      expect(fetchedUrl).to.exist;
      expect(mockNetworkUtils.fetchFromService.calledOnce).to.be.true;
    });

    it('should show error toast on generate failure', async () => {
      const dropzone = document.querySelector('.iv-dropzone');
      dropzone.classList.remove('preview-ready');

      const mockNetworkUtils = {
        fetchFromService: sandbox.stub().rejects(new Error('Network error')),
      };
      sandbox.stub(actionBinder, 'getNetworkUtils').resolves(mockNetworkUtils);
      const showErrorToastStub = sandbox.stub(actionBinder, 'showErrorToast').resolves();

      await actionBinder.generateContent();

      expect(showErrorToastStub.calledOnce).to.be.true;
    });
  });

  describe('handleKeyDown', () => {
    it('should trigger gen-btn click on Enter in inp-field', () => {
      const textarea = document.querySelector('.inp-field');
      const genBtn = document.querySelector('.gen-btn');
      const clickStub = sinon.stub(genBtn, 'click');

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      Object.defineProperty(enterEvent, 'target', { value: textarea, writable: false });
      actionBinder.handleKeyDown(enterEvent);

      expect(clickStub.calledOnce).to.be.true;
      clickStub.restore();
    });

    it('should ignore non-valid keys', () => {
      const genBtn = document.querySelector('.gen-btn');
      const clickStub = sinon.stub(genBtn, 'click');

      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
      actionBinder.handleKeyDown(event);

      expect(clickStub.called).to.be.false;
      clickStub.restore();
    });
  });

  describe('execActions', () => {
    it('should handle unknown action types gracefully', async () => {
      const invalidAction = { actionType: 'unknownAction' };
      let threw = false;
      try {
        await actionBinder.execActions([invalidAction]);
      } catch (e) {
        threw = true;
      }
      expect(threw).to.be.false;
    });
  });
});
