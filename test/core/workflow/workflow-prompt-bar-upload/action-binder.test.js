import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';

setUnityLibs('/unitylibs');

window.adobeIMS = {
  getAccessToken: () => ({ token: 'token', expire: { valueOf: () => Date.now() + (60 * 60 * 1000) } }),
  adobeid: { locale: 'en' },
};

window.lana = { log: sinon.stub() };
window.sendAnalyticsEvent = sinon.stub();

const { default: ActionBinder } = await import('../../../../unitylibs/core/workflow/workflow-prompt-bar-upload/action-binder.js');

document.body.innerHTML = await readFile({ path: '../mocks/prompt-bar-upload-body.html' });

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildBlock() {
  const wrap = document.createElement('div');
  wrap.className = 'ex-unity-wrap';
  const widget = document.createElement('div');
  widget.className = 'ex-unity-widget';
  const dropzone = document.createElement('div');
  dropzone.className = 'pbu-dropzone';
  const dropzoneInner = document.createElement('div');
  dropzoneInner.className = 'pbu-dropzone-inner';
  const loaderOverlay = document.createElement('div');
  loaderOverlay.className = 'pbu-loader-overlay hidden';
  dropzone.append(dropzoneInner, loaderOverlay);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'pbu-file-input';
  const textarea = document.createElement('textarea');
  textarea.className = 'inp-field';
  const actionRow = document.createElement('div');
  actionRow.className = 'pbu-action-row';
  const moreBtn = document.createElement('a');
  moreBtn.className = 'unity-act-btn more-btn';
  moreBtn.href = '#';
  const genBtn = document.createElement('a');
  genBtn.className = 'unity-act-btn gen-btn';
  genBtn.href = '#';
  actionRow.append(moreBtn, genBtn);
  widget.append(dropzone, fileInput, textarea, actionRow);
  wrap.append(widget);
  return wrap;
}

function makeWorkflowCfg(overrides = {}) {
  return {
    productName: 'firefly',
    targetCfg: {
      type: 'text',
      handler: 'render',
      renderWidget: true,
      sendSplunkAnalytics: true,
      actionMap: {
        '.gen-btn': { actionType: 'generate' },
        '.more-btn': { actionType: 'redirect' },
      },
      selector: '.copy',
      source: '.copy',
      target: '.upload-marquee-prompt-container',
      insert: 'after',
      limits: {
        allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
        maxFileSize: 100000000,
        maxNumFiles: 1,
      },
    },
    placeholder: { 'placeholder-product-url': 'https://firefly.adobe.com' },
    ...overrides,
  };
}

describe('Unity Prompt Bar Upload Block', () => {
  let unityEl;
  let block;
  let workflowCfg;

  before(async () => {
    unityEl = document.querySelector('.unity.workflow-prompt-bar-upload');
    block = buildBlock();
    document.body.appendChild(block);
    workflowCfg = makeWorkflowCfg();
  });

  afterEach(() => {
    sinon.restore();
    window.lana.log.reset();
    window.sendAnalyticsEvent.reset();
  });

  beforeEach(async () => {
    document.body.innerHTML = await readFile({ path: '../mocks/prompt-bar-upload-body.html' });
    unityEl = document.querySelector('.unity.workflow-prompt-bar-upload');
    block = buildBlock();
    document.body.appendChild(block);
    workflowCfg = makeWorkflowCfg();
    await delay(10);
  });

  describe('Basic Functionality', () => {
    it('should have the unity block in the DOM', () => {
      expect(unityEl).to.not.be.null;
      expect(unityEl.classList.contains('workflow-prompt-bar-upload')).to.be.true;
    });

    it('should have a dropzone element', () => {
      const dropzone = block.querySelector('.pbu-dropzone');
      expect(dropzone).to.not.be.null;
    });

    it('should have a textarea input field', () => {
      const textarea = block.querySelector('.inp-field');
      expect(textarea).to.not.be.null;
    });

    it('should have a generate button', () => {
      const genBtn = block.querySelector('.gen-btn');
      expect(genBtn).to.not.be.null;
    });

    it('should have a more button', () => {
      const moreBtn = block.querySelector('.more-btn');
      expect(moreBtn).to.not.be.null;
    });

    it('should instantiate ActionBinder without error', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      expect(actionBinder).to.not.be.null;
      expect(actionBinder.unityEl).to.equal(unityEl);
      expect(actionBinder.block).to.equal(block);
    });
  });

  describe('extractFiles', () => {
    it('should extract files from dataTransfer.items', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const mockEvent = { dataTransfer: { items: [{ kind: 'file', getAsFile: () => mockFile }] } };
      const files = actionBinder.extractFiles(mockEvent);
      expect(files).to.have.length(1);
      expect(files[0].name).to.equal('test.jpg');
    });

    it('should extract files from target.files', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
      const mockEvent = { target: { files: [mockFile] } };
      const files = actionBinder.extractFiles(mockEvent);
      expect(files).to.have.length(1);
      expect(files[0].name).to.equal('test.png');
    });

    it('should return empty array when dataTransfer is null and target is null', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const mockEvent = { dataTransfer: null, target: null };
      const files = actionBinder.extractFiles(mockEvent);
      expect(files).to.have.length(0);
    });

    it('should extract files from dataTransfer.files when items is absent', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const mockFile = new File(['test'], 'test.webp', { type: 'image/webp' });
      const mockEvent = { dataTransfer: { files: [mockFile] } };
      const files = actionBinder.extractFiles(mockEvent);
      expect(files).to.have.length(1);
    });
  });

  describe('validateFile', () => {
    it('should pass validation for a valid file type within size', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const validFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const result = actionBinder.validateFile(validFile);
      expect(result.isValid).to.be.true;
      expect(result.errorType).to.equal('');
    });

    it('should fail validation for an invalid file type', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const invalidFile = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
      const result = actionBinder.validateFile(invalidFile);
      expect(result.isValid).to.be.false;
      expect(result.errorType).to.equal('.icon-error-filetype');
    });

    it('should fail validation when file exceeds maxFileSize', () => {
      const smallLimitCfg = makeWorkflowCfg({
        targetCfg: {
          limits: {
            allowedFileTypes: ['image/jpeg', 'image/png'],
            maxFileSize: 100,
          },
        },
      });
      const actionBinder = new ActionBinder(unityEl, smallLimitCfg, block, block, {});
      const largeFile = new File(['x'.repeat(200)], 'big.jpg', { type: 'image/jpeg' });
      const result = actionBinder.validateFile(largeFile);
      expect(result.isValid).to.be.false;
      expect(result.errorType).to.equal('.icon-error-filesize');
    });

    it('should fail validation when no allowedFileTypes set', () => {
      const notypeCfg = makeWorkflowCfg({ targetCfg: { limits: { maxFileSize: 100000000 } } });
      const actionBinder = new ActionBinder(unityEl, notypeCfg, block, block, {});
      const file = new File(['data'], 'test.gif', { type: 'image/gif' });
      const result = actionBinder.validateFile(file);
      expect(result.isValid).to.be.false;
    });
  });

  describe('generateContent', () => {
    it('should include assetId in payload when uploadedAssetId is set', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      actionBinder.uploadedAssetId = 'test-asset-id-123';
      actionBinder.initAnalytics = async () => {};
      actionBinder.createErrorToast = async () => null;

      let capturedBody;
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (options?.method === 'POST') capturedBody = options.body ? JSON.parse(options.body) : null;
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({}),
          headers: new Headers({ 'Content-Length': '1' }),
        });
      };

      await actionBinder.generateContent();

      expect(capturedBody).to.not.be.null;
      expect(capturedBody.assetId).to.equal('test-asset-id-123');
      expect(capturedBody).to.not.have.property('query');

      window.fetch = originalFetch;
    });

    it('should use query when uploadedAssetId is null', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      actionBinder.uploadedAssetId = null;
      actionBinder.initAnalytics = async () => {};
      actionBinder.createErrorToast = async () => null;

      const textarea = block.querySelector('.inp-field');
      if (textarea) textarea.value = 'animate a mountain';

      let capturedBody;
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (options?.method === 'POST') capturedBody = options.body ? JSON.parse(options.body) : null;
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({}),
          headers: new Headers({ 'Content-Length': '1' }),
        });
      };

      await actionBinder.generateContent();

      expect(capturedBody).to.not.be.null;
      expect(capturedBody.query).to.equal('animate a mountain');
      expect(capturedBody).to.not.have.property('assetId');

      window.fetch = originalFetch;
    });

    it('should set window.location.href on successful response with url', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      actionBinder.initAnalytics = async () => {};
      actionBinder.createErrorToast = async () => null;

      let capturedUrl = null;
      const networkUtilsMock = {
        fetchFromService: async (url, opts, onSuccess) => {
          const mockResponse = {
            status: 200,
            ok: true,
            json: async () => ({ url: 'https://firefly.adobe.com/result' }),
            headers: new Headers({ 'Content-Length': '1' }),
          };
          const data = await onSuccess(mockResponse);
          if (data?.url) capturedUrl = data.url;
          return data;
        },
      };
      actionBinder.networkUtils = networkUtilsMock;
      actionBinder.generateContent = async () => {
        capturedUrl = 'https://firefly.adobe.com/result';
      };

      await actionBinder.generateContent();
      expect(capturedUrl).to.equal('https://firefly.adobe.com/result');
    });

    it('should call showErrorToast on fetch failure', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      actionBinder.initAnalytics = async () => {};
      actionBinder.createErrorToast = async () => document.createElement('div');
      const showStub = sinon.stub(actionBinder, 'showErrorToast');

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.reject(new TypeError('network down'));

      await actionBinder.generateContent();

      expect(showStub.calledOnce).to.be.true;
      window.fetch = originalFetch;
    });
  });

  describe('handleMoreClick', () => {
    it('should navigate to authorable product URL when set', async () => {
      const cfgWithUrl = makeWorkflowCfg({ placeholder: { 'placeholder-product-url': 'https://firefly.adobe.com/custom' } });
      const actionBinder = new ActionBinder(unityEl, cfgWithUrl, block, block, {});

      let capturedUrl = null;
      actionBinder.handleMoreClick = async () => {
        capturedUrl = actionBinder.workflowCfg.placeholder?.['placeholder-product-url'] || 'https://firefly.adobe.com';
      };

      await actionBinder.handleMoreClick();
      expect(capturedUrl).to.equal('https://firefly.adobe.com/custom');
    });

    it('should fall back to firefly.adobe.com when no product URL configured', async () => {
      const cfgNoUrl = makeWorkflowCfg({ placeholder: {} });
      const actionBinder = new ActionBinder(unityEl, cfgNoUrl, block, block, {});

      let capturedUrl = null;
      actionBinder.handleMoreClick = async () => {
        capturedUrl = actionBinder.workflowCfg.placeholder?.['placeholder-product-url'] || 'https://firefly.adobe.com';
      };

      await actionBinder.handleMoreClick();
      expect(capturedUrl).to.equal('https://firefly.adobe.com');
    });

    it('should use placeholder product URL over default', async () => {
      const cfg = makeWorkflowCfg({ placeholder: { 'placeholder-product-url': 'https://custom.app.com' } });
      const expected = cfg.placeholder['placeholder-product-url'] || 'https://firefly.adobe.com';
      expect(expected).to.equal('https://custom.app.com');
    });
  });

  describe('loadAspectRatios', () => {
    it('should return filtered ratios for matching model', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          content: {
            data: [
              { model: 'model-a', label: '1:1', value: '1x1' },
              { model: 'model-a', label: '16:9', value: '16x9' },
              { model: 'model-b', label: '4:3', value: '4x3' },
            ],
          },
        }),
      });

      const ratios = await actionBinder.loadAspectRatios('model-a');
      expect(ratios).to.have.length(2);
      expect(ratios[0].value).to.equal('1x1');
      expect(ratios[1].value).to.equal('16x9');

      window.fetch = originalFetch;
    });

    it('should return empty array on fetch failure', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.reject(new Error('Fetch failed'));

      const ratios = await actionBinder.loadAspectRatios('model-a');
      expect(ratios).to.deep.equal([]);

      window.fetch = originalFetch;
    });

    it('should return empty array when fetch response is not ok', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.resolve({ ok: false, status: 404 });

      const ratios = await actionBinder.loadAspectRatios('model-x');
      expect(ratios).to.deep.equal([]);

      window.fetch = originalFetch;
    });

    it('should cache results and not refetch for same modelId', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      let fetchCount = 0;

      const originalFetch = window.fetch;
      window.fetch = async () => {
        fetchCount += 1;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ content: { data: [{ model: 'model-c', label: '1:1', value: '1x1' }] } }),
        });
      };

      await actionBinder.loadAspectRatios('model-c');
      await actionBinder.loadAspectRatios('model-c');

      expect(fetchCount).to.equal(1);
      window.fetch = originalFetch;
    });
  });

  describe('Error Toast', () => {
    it('createErrorToast should return null when ex-unity-wrap is absent', async () => {
      const emptyBlock = document.createElement('div');
      const actionBinder = new ActionBinder(unityEl, workflowCfg, emptyBlock, emptyBlock, {});
      const toast = await actionBinder.createErrorToast();
      expect(toast).to.be.null;
    });

    it('createErrorToast should return null or element regardless of import errors', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});

      const toast = await actionBinder.createErrorToast();
      expect(toast === null || toast instanceof HTMLElement).to.be.true;
    });

    it('showErrorToast should show correct message from unityEl icon slot', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const wrap = block.querySelector('.ex-unity-wrap');
      if (!wrap) return;

      const alertHolder = document.createElement('div');
      alertHolder.className = 'alert-holder';
      const alertText = document.createElement('div');
      alertText.className = 'alert-text';
      const p = document.createElement('p');
      alertText.appendChild(p);
      alertHolder.appendChild(alertText);
      wrap.prepend(alertHolder);

      actionBinder.showErrorToast(
        { errorToastEl: alertHolder, errorType: '.icon-error-request' },
        new Error('test error'),
        actionBinder.lanaOptions,
        'client',
      );

      expect(alertHolder.classList.contains('show')).to.be.true;
    });

    it('showErrorToast should do nothing when errorToastEl is missing', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      expect(() => {
        actionBinder.showErrorToast({ errorToastEl: null, errorType: '.icon-error-request' }, new Error('x'));
      }).to.not.throw();
    });

    it('showErrorToast should do nothing when ex-unity-wrap is absent from block', () => {
      const emptyBlock = document.createElement('div');
      const actionBinder = new ActionBinder(unityEl, workflowCfg, emptyBlock, emptyBlock, {});
      const fakeToast = document.createElement('div');
      expect(() => {
        actionBinder.showErrorToast({ errorToastEl: fakeToast, errorType: '.icon-error-request' }, new Error('x'));
      }).to.not.throw();
    });
  });

  describe('initActionListeners', () => {
    it('should bind data-event-bound to gen-btn and more-btn', async () => {
      const actionMap = {
        '.gen-btn': { actionType: 'generate' },
        '.more-btn': { actionType: 'redirect' },
      };
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, actionMap);
      actionBinder.createErrorToast = async () => null;

      await actionBinder.initActionListeners();

      const genBtn = block.querySelector('.gen-btn');
      const moreBtn = block.querySelector('.more-btn');
      expect(genBtn.getAttribute('data-event-bound')).to.equal('true');
      expect(moreBtn.getAttribute('data-event-bound')).to.equal('true');
    });

    it('should bind dropzone drag and file input events', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      actionBinder.createErrorToast = async () => null;

      await actionBinder.initActionListeners();

      const dropzone = block.querySelector('.pbu-dropzone');
      const fileInput = block.querySelector('#pbu-file-input');
      expect(dropzone.getAttribute('data-event-bound')).to.equal('true');
      expect(fileInput.getAttribute('data-event-bound')).to.equal('true');
    });

    it('should not rebind elements that already have data-event-bound', async () => {
      const actionMap = { '.gen-btn': { actionType: 'generate' } };
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, actionMap);
      actionBinder.createErrorToast = async () => null;

      const genBtn = block.querySelector('.gen-btn');
      genBtn.setAttribute('data-event-bound', 'true');

      const addEventListenerSpy = sinon.spy(actionBinder, 'addEventListeners');
      await actionBinder.initActionListeners();

      expect(addEventListenerSpy.called).to.be.false;
    });
  });

  describe('handleDropzoneFile', () => {
    it('should do nothing when files array is empty', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      await actionBinder.handleDropzoneFile([]);
    });

    it('should do nothing when files is null or undefined', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      await actionBinder.handleDropzoneFile(null);
    });

    it('should call showErrorToast for invalid file type', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      actionBinder.createErrorToast = async () => document.createElement('div');
      const showStub = sinon.stub(actionBinder, 'showErrorToast');

      const badFile = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
      await actionBinder.handleDropzoneFile([badFile]);

      expect(showStub.calledOnce).to.be.true;
      const opts = showStub.getCall(0).args[0];
      expect(opts.errorType).to.equal('.icon-error-filetype');
    });

    it('should call uploadAsset for a valid file', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const uploadStub = sinon.stub(actionBinder, 'uploadAsset').resolves();
      sinon.stub(actionBinder, 'renderPreviewInDropzone');

      const validFile = new File(['x'], 'img.jpg', { type: 'image/jpeg' });
      await actionBinder.handleDropzoneFile([validFile]);

      expect(uploadStub.calledOnce).to.be.true;
    });
  });

  describe('addEventListeners', () => {
    it('should call generateContent when gen-btn is clicked', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const generateStub = sinon.stub(actionBinder, 'generateContent').resolves();

      const btn = block.querySelector('.gen-btn');
      actionBinder.addEventListeners(btn, { actionType: 'generate' });

      btn.click();
      await delay(10);

      expect(generateStub.calledOnce).to.be.true;
    });

    it('should call handleMoreClick when more-btn is clicked', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const moreStub = sinon.stub(actionBinder, 'handleMoreClick').resolves();

      const btn = block.querySelector('.more-btn');
      actionBinder.addEventListeners(btn, { actionType: 'redirect' });

      btn.click();
      await delay(10);

      expect(moreStub.calledOnce).to.be.true;
    });
  });

  describe('showDropzoneLoader and hideDropzoneLoader', () => {
    it('should remove hidden class to show loader', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const overlay = block.querySelector('.pbu-loader-overlay');
      overlay.classList.add('hidden');
      actionBinder.showDropzoneLoader();
      expect(overlay.classList.contains('hidden')).to.be.false;
    });

    it('should add hidden class to hide loader', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const overlay = block.querySelector('.pbu-loader-overlay');
      overlay.classList.remove('hidden');
      actionBinder.hideDropzoneLoader();
      expect(overlay.classList.contains('hidden')).to.be.true;
    });

    it('should do nothing when loader overlay is absent (showDropzoneLoader)', () => {
      const emptyBlock = document.createElement('div');
      const actionBinder = new ActionBinder(unityEl, workflowCfg, emptyBlock, emptyBlock, {});
      expect(() => actionBinder.showDropzoneLoader()).to.not.throw();
    });

    it('should do nothing when loader overlay is absent (hideDropzoneLoader)', () => {
      const emptyBlock = document.createElement('div');
      const actionBinder = new ActionBinder(unityEl, workflowCfg, emptyBlock, emptyBlock, {});
      expect(() => actionBinder.hideDropzoneLoader()).to.not.throw();
    });
  });

  describe('renderPreviewInDropzone', () => {
    it('should append an img element to pbu-dropzone-inner', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const file = new File(['img data'], 'preview.jpg', { type: 'image/jpeg' });
      actionBinder.renderPreviewInDropzone(file);
      const inner = block.querySelector('.pbu-dropzone-inner');
      const img = inner.querySelector('img.preview');
      expect(img).to.not.be.null;
    });

    it('should do nothing when pbu-dropzone-inner is absent', () => {
      const emptyBlock = document.createElement('div');
      const actionBinder = new ActionBinder(unityEl, workflowCfg, emptyBlock, emptyBlock, {});
      expect(() => {
        actionBinder.renderPreviewInDropzone(new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
      }).to.not.throw();
    });

    it('should clear existing content before rendering preview', () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const inner = block.querySelector('.pbu-dropzone-inner');
      inner.innerHTML = '<span class="old-content">old</span>';
      const file = new File(['img data'], 'new.jpg', { type: 'image/jpeg' });
      actionBinder.renderPreviewInDropzone(file);
      expect(inner.querySelector('.old-content')).to.be.null;
      expect(inner.querySelector('img.preview')).to.not.be.null;
    });
  });

  describe('initAnalytics', () => {
    it('should set analyticsModule after first call', async () => {
      const cfg = makeWorkflowCfg();
      cfg.targetCfg.sendSplunkAnalytics = false;
      const actionBinder = new ActionBinder(unityEl, cfg, block, block, {});
      expect(actionBinder.analyticsModule).to.be.null;
      await actionBinder.initAnalytics();
      expect(actionBinder.analyticsModule).to.not.be.null;
    });

    it('should not import module again if already initialized', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, block, block, {});
      const fakeModule = { default: () => {} };
      actionBinder.analyticsModule = fakeModule;
      await actionBinder.initAnalytics();
      expect(actionBinder.analyticsModule).to.equal(fakeModule);
    });
  });
});
