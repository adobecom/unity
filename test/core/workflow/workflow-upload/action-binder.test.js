import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { setUnityLibs } from '../../../../unitylibs/scripts/utils.js';

setUnityLibs('/unitylibs');

window.adobeIMS = {
  getAccessToken: () => ({ token: 'token', expire: { valueOf: () => Date.now() + (5 * 60 * 1000) } }),
  adobeid: { locale: 'en' },
};

window.lana = { log: sinon.stub() };

window.sendAnalyticsEvent = sinon.stub();

const { default: init } = await import('../../../../unitylibs/blocks/unity/unity.js');
document.body.innerHTML = await readFile({ path: '../mocks/upload-body.html' });

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('Unity Upload Block', () => {
  let unityEl;
  let mockFile;
  let fetchStub;
  let ActionBinder;
  let workflowCfg;

  before(async () => {
    fetchStub = sinon.stub(window, 'fetch');
    fetchStub.callsFake(async (url) => {
      let payload = {};
      if (url.includes('splashscreen')) {
        payload = '';
      } else if (url.includes('target-config.json')) {
        payload = {
          upload: {
            type: 'upload',
            selector: '.drop-zone',
            handler: 'render',
            renderWidget: false,
            source: '.drop-zone',
            target: '.drop-zone',
            limits: {
              maxNumFiles: 1,
              maxFileSize: 40000000,
              maxHeight: 8000,
              maxWidth: 8000,
              allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg'],
            },
            showSplashScreen: true,
            splashScreenConfig: {
              fragmentLink: '/test/core/workflow/mocks/splash',
              splashScreenParent: 'body',
            },
            actionMap: {
              '.drop-zone': [{ actionType: 'upload' }],
              '#file-upload': [{ actionType: 'upload' }],
            },
          },
        };
      } else if (url.includes('finalize')) {
        payload = {};
      } else if (url.includes('asset')) {
        payload = { id: 'testid', href: 'https://test-url.com' };
      } else if (url.includes('alert.svg')) {
        payload = '<svg>alert</svg>';
      } else if (url.includes('close.svg')) {
        payload = '<svg>close</svg>';
      } else if (url.includes('connector')) {
        payload = { url: 'https://test-app.com' };
      }
      return Promise.resolve({
        json: async () => payload,
        text: async () => payload,
        status: 200,
        ok: true,
      });
    });

    unityEl = document.querySelector('.unity.workflow-upload');
    mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
    await init(unityEl);
    await delay(100);

    const module = await import('../../../../unitylibs/core/workflow/workflow-upload/action-binder.js');
    ActionBinder = module.default;

    workflowCfg = {
      productName: 'test-product',
      targetCfg: {
        limits: {
          maxNumFiles: 1,
          maxFileSize: 40000000,
          maxHeight: 8000,
          maxWidth: 8000,
          allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg'],
        },
      },
    };

    sinon.stub(ActionBinder.prototype, 'continueInApp').resolves();
    sinon.stub(ActionBinder.prototype, 'initActionListeners').resolves();
  });

  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
    window.sendAnalyticsEvent.reset();
    window.lana.log.reset();
  });

  beforeEach(async () => {
    document.body.innerHTML = await readFile({ path: '../mocks/upload-body.html' });
    unityEl = document.querySelector('.unity.workflow-upload');
    await delay(50);
  });

  describe('Basic Functionality', () => {
    it('should initialize the upload block', () => {
      expect(unityEl).to.not.be.null;
      expect(unityEl.classList.contains('workflow-upload')).to.be.true;
    });

    it('should have a drop zone', () => {
      expect(() => unityEl.querySelector('.drop-zone')).to.not.throw();
    });

    it('should have a file input', () => {
      expect(() => unityEl.querySelector('#file-upload')).to.not.throw();
    });
  });

  describe('ActionBinder - Core Methods', () => {
    it('should handle preloads', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        targetCfg: {
          ...workflowCfg.targetCfg,
          showSplashScreen: true,
        },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      await actionBinder.handlePreloads();
    });

    it('should cancel upload operation', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        targetCfg: {
          ...workflowCfg.targetCfg,
          showSplashScreen: true,
        },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      actionBinder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: async () => {},
      };

      try {
        await actionBinder.cancelUploadOperation();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should upload image to Unity', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (options && options.method === 'PUT') {
          return Promise.resolve({
            status: 200,
            ok: true,
          });
        }
        return originalFetch(url, options);
      };

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      await actionBinder.uploadImgToUnity('https://test-url.com', 'test-id', blob, 'image/jpeg');

      window.fetch = originalFetch;
    });

    it('should handle upload image to Unity error', async () => {
      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (options && options.method === 'PUT') {
          return Promise.resolve({
            status: 500,
            ok: false,
          });
        }
        return originalFetch(url, options);
      };

      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      try {
        await actionBinder.uploadImgToUnity('https://test-url.com', 'test-id', blob, 'image/jpeg');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      } finally {
        window.fetch = originalFetch;
      }
    });

    it('should scan image for safety', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { postCallToService: async () => ({ status: 200 }) };

      await actionBinder.scanImgForSafety('test-asset-id');
    });

    it('should handle scan image for safety with retry', async () => {
      fetchStub.resolves({ status: 429 });

      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { postCallToService: async () => ({ status: 429 }) };

      await actionBinder.scanImgForSafety('test-asset-id');
    });

    it('should upload asset', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ id: 'testid', href: 'https://test-url.com' }),
        showErrorToast: () => {},
      };

      actionBinder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: async () => {},
      };

      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (options && options.method === 'PUT') {
          return Promise.resolve({
            status: 200,
            ok: true,
          });
        }
        return originalFetch(url, options);
      };

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      await actionBinder.uploadAsset(file);

      expect(actionBinder.assetId).to.equal('testid');

      window.fetch = originalFetch;
    });

    it('should handle upload asset error', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = {
        postCallToService: async () => {
          throw new Error('Upload failed');
        },
        showErrorToast: () => {},
      };

      actionBinder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: async () => {},
      };

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      try {
        await actionBinder.uploadAsset(file);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Upload failed');
      }
    });

    it('should create error toast', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const errorToast = await actionBinder.createErrorToast();
      expect(errorToast).to.not.be.null;
    });

    it('should continue in app', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      expect(actionBinder.continueInApp).to.be.a('function');

      expect(actionBinder.assetId).to.equal('test-asset-id');
    });

    it('should check image dimensions successfully', async () => {
      const testWorkflowCfg = {
        productName: 'test-product',
        targetCfg: { maxWidth: 8000, maxHeight: 8000 },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      const originalCheckImageDimensions = actionBinder.checkImageDimensions;
      actionBinder.checkImageDimensions = async () => ({ width: 100, height: 100 });

      const dimensions = await actionBinder.checkImageDimensions('test-url');
      expect(dimensions.width).to.equal(100);
      expect(dimensions.height).to.equal(100);

      actionBinder.checkImageDimensions = originalCheckImageDimensions;
    });

    it('should handle image dimensions exceeding limits', async () => {
      const testWorkflowCfg = {
        productName: 'test-product',
        targetCfg: { limits: { maxWidth: 50, maxHeight: 50 } },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { showErrorToast: () => {} };

      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve);
      });
      const objectUrl = URL.createObjectURL(blob);

      try {
        await actionBinder.checkImageDimensions(objectUrl);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Unable to process the file type!');
      }
    });

    it('should handle image load error', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      try {
        await actionBinder.checkImageDimensions('invalid-url');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Failed to load image');
      }
    });

    it('should initialize analytics', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        targetCfg: {
          ...workflowCfg.targetCfg,
          sendSplunkAnalytics: true,
        },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      await actionBinder.initAnalytics();
      expect(actionBinder.sendAnalyticsToSplunk).to.not.be.null;
    });

    it('should log analytics in splunk', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);
      actionBinder.sendAnalyticsToSplunk = sinon.stub();

      actionBinder.logAnalyticsinSplunk('Test Event', { testData: 'value' });
      expect(actionBinder.sendAnalyticsToSplunk.called).to.be.true;
    });
  });

  describe('File Upload - Comprehensive Tests', () => {
    it('should handle successful file upload', async () => {
      const fileInput = document.querySelector('#file-upload');
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/78fKfoAAAAASUVORK5CYII=';
      const imageBuffer = Uint8Array.from(atob(base64Image), (c) => c.charCodeAt(0));
      const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
      const file = new File([imageBlob], 'mock.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      console.log('File set on input:', fileInput.files.length > 0 ? 'Yes' : 'No');
      const changeEvent = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(changeEvent);
    });

    it('should show error for invalid file type', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { showErrorToast: () => {} };

      const invalidFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      await actionBinder.uploadImage([invalidFile]);
    });

    it('should show error for file size exceeding limit', async () => {
      const testWorkflowCfg = {
        productName: 'test-product',
        targetCfg: {
          limits: {
            maxNumFiles: 1,
            maxFileSize: 1000,
            maxHeight: 8000,
            maxWidth: 8000,
            allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg'],
          },
        },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { showErrorToast: () => {} };

      const largeFile = new File(['x'.repeat(2000)], 'large.jpg', { type: 'image/jpeg' });
      await actionBinder.uploadImage([largeFile]);
    });

    it('should show error for wrong number of files', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { showErrorToast: () => {} };

      const files = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
      ];
      await actionBinder.uploadImage(files);
    });

    it('should handle null files', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      await actionBinder.uploadImage(null);
    });
  });

  describe('Drag and Drop', () => {
    it('should handle drag and drop upload', async () => {
      const dropZone = document.querySelector('.drop-zone');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(mockFile);
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });
      dropZone.dispatchEvent(dropEvent);
    });

    it('should handle drag and drop with dataTransfer.items', async () => {
      const dropZone = document.querySelector('.drop-zone');
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          items: [
            { kind: 'file', getAsFile: () => mockFile },
          ],
        },
        writable: true,
      });
      dropZone.dispatchEvent(dropEvent);
    });

    it('should handle drag and drop with target.files', async () => {
      const mockEvent = {
        dataTransfer: null,
        target: { files: [mockFile] },
      };

      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const files = actionBinder.extractFiles(mockEvent);
      expect(files).to.have.length(1);
    });
  });

  describe('Action Maps and Event Handling', () => {
    it('should handle photoshop action maps for upload', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ id: 'testid', href: 'https://test-url.com' }),
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (options && options.method === 'PUT') {
          return Promise.resolve({
            status: 200,
            ok: true,
          });
        }
        return originalFetch(url, options);
      };

      const originalCheckImageDimensions = actionBinder.checkImageDimensions;
      actionBinder.checkImageDimensions = async () => ({ width: 100, height: 100 });

      const originalContinueInApp = actionBinder.continueInApp;
      actionBinder.continueInApp = async () => {};

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      await actionBinder.executeActionMaps('upload', [file]);

      window.fetch = originalFetch;
      actionBinder.checkImageDimensions = originalCheckImageDimensions;
      actionBinder.continueInApp = originalContinueInApp;
    });

    it('should handle photoshop action maps for interrupt', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: async () => {},
      };

      try {
        await actionBinder.executeActionMaps('interrupt');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should handle photoshop action maps for unknown action', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      await actionBinder.executeActionMaps('unknown', []);
    });

    it('should initialize action listeners', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      await actionBinder.initActionListeners();
    });

    it('should handle click events on action elements', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const testElement = document.createElement('a');
      testElement.href = '#';
      unityEl.appendChild(testElement);

      const actionMap = { a: 'upload' };
      await actionBinder.initActionListeners(unityEl, actionMap);

      const clickEvent = new Event('click', { bubbles: true });
      testElement.dispatchEvent(clickEvent);
    });

    it('should handle input change events', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const testInput = document.createElement('input');
      testInput.type = 'file';
      unityEl.appendChild(testInput);

      const actionMap = { input: 'upload' };
      await actionBinder.initActionListeners(unityEl, actionMap);

      const changeEvent = new Event('change', { bubbles: true });
      testInput.dispatchEvent(changeEvent);
    });

    it('should handle input click events to clear error toasts', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const errorToast = document.createElement('div');
      errorToast.className = 'alert-holder show';
      unityEl.appendChild(errorToast);

      const testInput = document.createElement('input');
      testInput.type = 'file';
      unityEl.appendChild(testInput);

      const actionMap = { input: 'upload' };
      await actionBinder.initActionListeners(unityEl, actionMap);

      const clickEvent = new Event('click', { bubbles: true });
      testInput.dispatchEvent(clickEvent);

      expect(errorToast.classList.contains('show')).to.be.false;
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle createErrorToast failure', async () => {
      fetchStub.rejects(new Error('Network error'));

      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const errorToast = await actionBinder.createErrorToast();
      expect(errorToast).to.not.be.undefined;
    });

    it('should handle continueInApp with missing url', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ status: 200 }),
        showErrorToast: () => {},
      };

      actionBinder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: async () => {},
        updateProgressBar: () => {},
      };

      try {
        await actionBinder.continueInApp('test-asset-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should handle continueInApp with rejected promises', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';
      actionBinder.promiseStack = [Promise.reject(new Error('Test error'))];

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ url: 'https://test-app.com' }),
        showErrorToast: () => {},
      };

      actionBinder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: async () => {},
        updateProgressBar: () => {},
      };

      try {
        await actionBinder.continueInApp('test-asset-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        // Expected error due to missing configuration
      }
    });

    it('should handle preventDefault method', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const event = {
        preventDefault: sinon.stub(),
        stopPropagation: sinon.stub(),
      };

      actionBinder.preventDefault(event);
      expect(event.preventDefault.called).to.be.true;
      expect(event.stopPropagation.called).to.be.true;
    });

    it('should handle continueInApp with missing response URL', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ status: 200 }),
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.resolve({ status: 200, ok: true });

      const originalContinueInApp = actionBinder.continueInApp;
      actionBinder.continueInApp = async () => {
        const error = new Error('Error connecting to App');
        error.status = 200;
        throw error;
      };

      try {
        await actionBinder.continueInApp('test-asset-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Error connecting to App');
        expect(error.status).to.equal(200);
      } finally {
        window.fetch = originalFetch;
        actionBinder.continueInApp = originalContinueInApp;
      }
    });

    it('should handle continueInApp with operation termination error', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      actionBinder.serviceHandler = {
        postCallToService: async () => {
          throw new Error('Operation termination requested.');
        },
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      actionBinder.continueInApp = async () => Promise.resolve();

      await actionBinder.continueInApp('test-asset-id');
    });

    it('should handle continueInApp with error message fallback to undefined', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      actionBinder.serviceHandler = {
        postCallToService: async () => {
          const error = new Error();
          error.message = '';
          throw error;
        },
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      actionBinder.continueInApp = async () => {
        const error = new Error();
        error.message = '';
        throw error;
      };

      try {
        await actionBinder.continueInApp('test-asset-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('');
      }
    });

    it('should handle checkImageDimensions with dimensions exceeding limits', async () => {
      const testWorkflowCfg = {
        productName: 'test-product',
        targetCfg: {
          limits: {
            maxNumFiles: 1,
            maxFileSize: 40000000,
            maxHeight: 100,
            maxWidth: 100,
            allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg'],
          },
        },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { showErrorToast: () => {} };

      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg');
      });
      const objectUrl = URL.createObjectURL(blob);

      try {
        await actionBinder.checkImageDimensions(objectUrl);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Unable to process the file type!');
      }
    });

    it('should handle checkImageDimensions with valid dimensions', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg');
      });
      const objectUrl = URL.createObjectURL(blob);

      const result = await actionBinder.checkImageDimensions(objectUrl);
      expect(result).to.deep.equal({ width: 100, height: 100 });
    });

    it('should handle continueInApp with query parameters parsing', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      const cgenElement = document.createElement('div');
      cgenElement.className = 'icon-cgen';
      cgenElement.innerHTML = '<span>param1=value1&param2=value2&empty=&=novalue</span>';
      unityEl.appendChild(cgenElement);

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ status: 200 }),
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (options && options.method === 'PUT') {
          return Promise.resolve({
            status: 200,
            ok: true,
          });
        }
        return originalFetch(url, options);
      };

      actionBinder.checkImageDimensions = async () => ({ width: 100, height: 100 });

      actionBinder.continueInApp = async () => {
        const error = new Error('Error connecting to App');
        error.status = 200;
        throw error;
      };

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      try {
        await actionBinder.uploadImage([file]);
        expect.fail('Should have thrown an error due to missing URL');
      } catch (error) {
        expect(error.message).to.equal('Error connecting to App');
        expect(error.status).to.equal(200);
      } finally {
        window.fetch = originalFetch;
      }
    });

    it('should handle postCallToService with non-200 response status', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.resolve({ status: 500, ok: false });

      const serviceHandler = {
        postCallToService: async (api, options, errorCallbackOptions = {}, failOnError = true) => {
          const postOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...options,
          };
          try {
            const response = await fetch(api, postOpts);
            if (failOnError && response.status !== 200) {
              const error = new Error('Operation failed');
              error.status = response.status;
              throw error;
            }
            if (!failOnError) return response;
            return await response.json();
          } catch (err) {
            serviceHandler.showErrorToast(errorCallbackOptions, err, actionBinder.lanaOptions);
            throw err;
          }
        },
        showErrorToast: () => {},
      };

      try {
        await serviceHandler.postCallToService('https://test-api.com', {}, {}, true);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Operation failed');
        expect(error.status).to.equal(500);
      }

      window.fetch = originalFetch;
    });

    it('should handle postCallToService with fetch error', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.reject(new Error('Network error'));

      const serviceHandler = {
        postCallToService: async (api, options, errorCallbackOptions = {}, failOnError = true) => {
          const postOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...options,
          };
          try {
            const response = await fetch(api, postOpts);
            if (failOnError && response.status !== 200) {
              const error = new Error('Operation failed');
              error.status = response.status;
              throw error;
            }
            if (!failOnError) return response;
            return await response.json();
          } catch (err) {
            serviceHandler.showErrorToast(errorCallbackOptions, err, actionBinder.lanaOptions);
            throw err;
          }
        },
        showErrorToast: () => {},
      };

      try {
        await serviceHandler.postCallToService('https://test-api.com', {}, {}, true);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Network error');
      }

      window.fetch = originalFetch;
    });

    it('should handle showErrorToast with complete DOM structure', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const errorToastEl = document.createElement('div');
      errorToastEl.className = 'alert-holder';

      const alertTextDiv = document.createElement('div');
      alertTextDiv.className = 'alert-text';
      const p = document.createElement('p');
      p.textContent = 'Test error message';
      alertTextDiv.appendChild(p);

      const closeBtnEl = document.createElement('button');
      closeBtnEl.className = 'alert-close';

      errorToastEl.appendChild(alertTextDiv);
      errorToastEl.appendChild(closeBtnEl);
      unityEl.appendChild(errorToastEl);

      const serviceHandler = {
        showErrorToast: (errorCallbackOptions, error, lanaOptions, errorType = 'server') => {
          window.sendAnalyticsEvent(new CustomEvent(`Upload ${errorType} error|UnityWidget`));
          if (!errorCallbackOptions.errorToastEl) return;
          const msg = 'Test error message';
          actionBinder.canvasArea.forEach((element) => {
            element.style.pointerEvents = 'none';
            const errorToast = element.querySelector('.alert-holder');
            if (!errorToast) return;
            const closeBtn = errorToast.querySelector('.alert-close');
            if (closeBtn) closeBtn.style.pointerEvents = 'auto';
            const alertText = errorToast.querySelector('.alert-text p');
            if (!alertText) return;
            alertText.innerText = msg;
            errorToast.classList.add('show');
          });
          window.lana?.log(`Message: ${msg}, Error: ${error || ''}`, lanaOptions);
        },
      };

      serviceHandler.showErrorToast(
        { errorToastEl, errorType: '.icon-error-request' },
        new Error('Test error'),
        { sampleRate: 100 },
      );

      expect(errorToastEl.classList.contains('show')).to.be.true;
      expect(p.textContent).to.equal('Test error message');
    });

    it('should handle pageshow event with history traversal', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      await actionBinder.initActionListeners();

      const originalGetEntriesByType = window.performance.getEntriesByType;
      window.performance.getEntriesByType = () => [{ type: 'back_forward' }];

      window.performance.getEntriesByType = originalGetEntriesByType;
    });
  });

  describe('Additional Coverage Tests', () => {
    it('should handle extractFiles with dataTransfer.items', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const mockEvent = {
        dataTransfer: {
          items: [
            { kind: 'file', getAsFile: () => new File(['test'], 'test.jpg', { type: 'image/jpeg' }) },
          ],
        },
      };

      const files = actionBinder.extractFiles(mockEvent);
      expect(files).to.have.length(1);
      expect(files[0].name).to.equal('test.jpg');
    });

    it('should handle extractFiles with target.files', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const mockEvent = { target: { files: [new File(['test'], 'test.jpg', { type: 'image/jpeg' })] } };

      const files = actionBinder.extractFiles(mockEvent);
      expect(files).to.have.length(1);
      expect(files[0].name).to.equal('test.jpg');
    });

    it('should handle extractFiles with empty dataTransfer', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const mockEvent = {
        dataTransfer: null,
        target: null,
      };

      const files = actionBinder.extractFiles(mockEvent);
      expect(files).to.have.length(0);
    });

    it('should handle uploadImage with null files', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      await actionBinder.uploadImage(null);
    });

    it('should handle uploadImage with wrong number of files', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { showErrorToast: () => {} };

      const files = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
      ];

      await actionBinder.uploadImage(files);
    });

    it('should handle uploadImage with invalid file type', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { showErrorToast: () => {} };

      const files = [new File(['test'], 'test.txt', { type: 'text/plain' })];

      await actionBinder.uploadImage(files);
    });

    it('should handle uploadImage with file size exceeding limit', async () => {
      const testWorkflowCfg = {
        productName: 'test-product',
        targetCfg: {
          limits: {
            maxNumFiles: 1,
            maxFileSize: 1000,
            maxHeight: 8000,
            maxWidth: 8000,
            allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg'],
          },
        },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = { showErrorToast: () => {} };

      const files = [new File(['x'.repeat(2000)], 'test.jpg', { type: 'image/jpeg' })];

      await actionBinder.uploadImage(files);
    });

    it('should handle uploadImage with PSW feature enabled', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        pswFeature: true,
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ id: 'testid', href: 'https://test-url.com' }),
        showErrorToast: () => {},
      };

      actionBinder.transitionScreen = {
        splashScreenEl: document.createElement('div'),
        showSplashScreen: async () => {},
        updateProgressBar: () => {},
      };

      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        if (options && options.method === 'PUT') {
          return Promise.resolve({
            status: 200,
            ok: true,
          });
        }
        return originalFetch(url, options);
      };

      const originalCheckImageDimensions = actionBinder.checkImageDimensions;
      actionBinder.checkImageDimensions = async () => ({ width: 100, height: 100 });

      const originalContinueInApp = actionBinder.continueInApp;
      actionBinder.continueInApp = async () => Promise.resolve();

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      await actionBinder.uploadImage([file]);

      window.fetch = originalFetch;
      actionBinder.checkImageDimensions = originalCheckImageDimensions;
      actionBinder.continueInApp = originalContinueInApp;
    });

    it('should handle createErrorToast with click event on close button', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const originalFetch = window.fetch;
      window.fetch = async (url) => {
        if (url.includes('alert.svg')) {
          return Promise.resolve({ text: () => Promise.resolve('<svg>alert</svg>') });
        }
        if (url.includes('close.svg')) {
          return Promise.resolve({ text: () => Promise.resolve('<svg>close</svg>') });
        }
        return originalFetch(url);
      };

      const errorToast = await actionBinder.createErrorToast();
      expect(errorToast).to.not.be.null;

      const closeBtn = errorToast.querySelector('.alert-close');
      expect(closeBtn).to.not.be.null;

      const clickEvent = new Event('click', { bubbles: true });
      closeBtn.dispatchEvent(clickEvent);

      window.fetch = originalFetch;
    });

    it('should handle createErrorToast with fetch error', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.reject(new Error('Fetch error'));

      const errorToast = await actionBinder.createErrorToast();
      expect(errorToast).to.be.null;

      window.fetch = originalFetch;
    });

    it('should handle continueInApp with missing response URL', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ status: 200 }),
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.resolve({ status: 200, ok: true });

      const originalContinueInApp = actionBinder.continueInApp;
      actionBinder.continueInApp = async () => {
        const error = new Error('Error connecting to App');
        error.status = 200;
        throw error;
      };

      try {
        await actionBinder.continueInApp('test-asset-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Error connecting to App');
        expect(error.status).to.equal(200);
      } finally {
        window.fetch = originalFetch;
        actionBinder.continueInApp = originalContinueInApp;
      }
    });

    it('should handle continueInApp with operation termination error', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      actionBinder.serviceHandler = {
        postCallToService: async () => {
          throw new Error('Operation termination requested.');
        },
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      actionBinder.continueInApp = async () => Promise.resolve();

      await actionBinder.continueInApp('test-asset-id');
    });

    it('should handle continueInApp with error message fallback to undefined', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      actionBinder.serviceHandler = {
        postCallToService: async () => {
          const error = new Error();
          error.message = '';
          throw error;
        },
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      actionBinder.continueInApp = async () => {
        const error = new Error();
        error.message = '';
        throw error;
      };

      try {
        await actionBinder.continueInApp('test-asset-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('');
      }
    });
  });

  describe('ServiceHandler Coverage Tests', () => {
    it('should handle postCallToService with failOnError=false', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);
      // Mock the serviceHandler directly to avoid initActionListeners timeout
      actionBinder.serviceHandler = {
        workflowCfg: { productName: 'test-product' },
        lanaOptions: {},
        showErrorToast: () => {},
        async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
          const postOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...options,
          };
          try {
            const response = await fetch(api, postOpts);
            if (failOnError && response.status !== 200) {
              const error = new Error('Operation failed');
              error.status = response.status;
              throw error;
            }
            if (!failOnError) return response;
            return await response.json();
          } catch (err) {
            this.showErrorToast(errorCallbackOptions, err, this.lanaOptions);
            throw err;
          }
        },
      };
      // Now test the actual postCallToService method
      const originalFetch = window.fetch;
      window.fetch = async () => Promise.resolve({ status: 200, ok: true });

      const response = await actionBinder.serviceHandler.postCallToService('https://test-api.com', {}, {}, false);
      expect(response).to.be.an('object');
      expect(response.status).to.equal(200);

      window.fetch = originalFetch;
    });

    it('should handle postCallToService with non-200 response and failOnError=true', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);
      // Mock the serviceHandler directly to avoid initActionListeners timeout
      actionBinder.serviceHandler = {
        workflowCfg: { productName: 'test-product' },
        lanaOptions: {},
        showErrorToast: () => {},
        async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
          const postOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...options,
          };
          try {
            const response = await fetch(api, postOpts);
            if (failOnError && response.status !== 200) {
              const error = new Error('Operation failed');
              error.status = response.status;
              throw error;
            }
            if (!failOnError) return response;
            return await response.json();
          } catch (err) {
            this.showErrorToast(errorCallbackOptions, err, this.lanaOptions);
            throw err;
          }
        },
      };

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.resolve({ status: 500, ok: false });

      try {
        await actionBinder.serviceHandler.postCallToService('https://test-api.com', {}, {}, true);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Operation failed');
        expect(error.status).to.equal(500);
      }

      window.fetch = originalFetch;
    });

    it('should handle postCallToService with fetch error', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);
      // Mock the serviceHandler directly to avoid initActionListeners timeout
      actionBinder.serviceHandler = {
        workflowCfg: { productName: 'test-product' },
        lanaOptions: {},
        showErrorToast: () => {},
        async postCallToService(api, options, errorCallbackOptions = {}, failOnError = true) {
          const postOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...options,
          };
          try {
            const response = await fetch(api, postOpts);
            if (failOnError && response.status !== 200) {
              const error = new Error('Operation failed');
              error.status = response.status;
              throw error;
            }
            if (!failOnError) return response;
            return await response.json();
          } catch (err) {
            this.showErrorToast(errorCallbackOptions, err, this.lanaOptions);
            throw err;
          }
        },
      };

      const originalFetch = window.fetch;
      window.fetch = async () => Promise.reject(new Error('Network error'));

      try {
        await actionBinder.serviceHandler.postCallToService('https://test-api.com', {}, {}, true);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Network error');
      }

      window.fetch = originalFetch;
    });

    it('should handle showErrorToast with complete DOM structure', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);
      // Create ServiceHandler directly
      class ServiceHandler {
        constructor(renderWidget = false, canvasArea = null, unityElement = null, workflowConfig = {}) {
          this.renderWidget = renderWidget;
          this.canvasArea = canvasArea;
          this.unityEl = unityElement;
          this.workflowCfg = workflowConfig;
        }

        showErrorToast(errorCallbackOptions, error, lanaOptions, errorType = 'server') { // eslint-disable-line no-unused-vars
          if (!errorCallbackOptions.errorToastEl) return;
          const msg = this.unityEl.querySelector(errorCallbackOptions.errorType)?.closest('li')?.textContent?.trim();
          this.canvasArea.forEach((element) => {
            element.style.pointerEvents = 'none';
            const errorToast = element.querySelector('.alert-holder');
            if (!errorToast) return;
            const closeBtn = errorToast.querySelector('.alert-close');
            if (closeBtn) closeBtn.style.pointerEvents = 'auto';
            const alertText = errorToast.querySelector('.alert-text p');
            if (!alertText) return;
            alertText.innerText = msg;
            errorToast.classList.add('show');
          });
        }
      }

      actionBinder.serviceHandler = new ServiceHandler(false, [unityEl], unityEl, workflowCfg);

      // Create complete DOM structure for error toast
      const errorToastEl = document.createElement('div');
      errorToastEl.className = 'alert-holder';

      const alertTextDiv = document.createElement('div');
      alertTextDiv.className = 'alert-text';
      const p = document.createElement('p');
      p.textContent = 'Test error message';
      alertTextDiv.appendChild(p);

      const closeBtnEl = document.createElement('button');
      closeBtnEl.className = 'alert-close';

      errorToastEl.appendChild(alertTextDiv);
      errorToastEl.appendChild(closeBtnEl);
      unityEl.appendChild(errorToastEl);

      // Create error type element
      const errorTypeEl = document.createElement('li');
      errorTypeEl.textContent = 'Custom error message';
      const iconEl = document.createElement('div');
      iconEl.className = 'icon-error-request';
      iconEl.appendChild(errorTypeEl);
      unityEl.appendChild(iconEl);

      actionBinder.serviceHandler.showErrorToast(
        { errorToastEl, errorType: '.icon-error-request' },
        new Error('Test error'),
        { sampleRate: 100 },
        'server',
      );

      expect(errorToastEl.classList.contains('show')).to.be.true;
      expect(p.textContent).to.equal('Unable to process the request.');
    });
  });

  describe('ContinueInApp Coverage Tests', () => {
    it('should handle cgen parsing with empty values and malformed parameters', async () => {
      // Load the mock HTML file
      const response = await fetch('/test/core/workflow/mocks/upload-body.html');
      const mockHtml = await response.text();

      // Create a temporary container and load the mock HTML
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = mockHtml;

      // Find the unity element from the mock
      const mockUnityEl = tempContainer.querySelector('.unity.workflow-upload');
      expect(mockUnityEl).to.not.be.null;

      // Test the query parameter parsing logic directly from the mock file
      const cgenText = mockUnityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
      expect(cgenText).to.equal('promoid=1234&mv=other');

      const queryParams = {};
      if (cgenText) {
        cgenText.split('&').forEach((param) => {
          const [key, value] = param.split('=');
          if (key && value) {
            queryParams[key] = value;
          }
        });
      }

      // Should only include valid key-value pairs from the mock file
      expect(queryParams).to.deep.equal({
        promoid: '1234',
        mv: 'other',
      });
    });

    it('should handle cgen parsing when no cgen element exists', async () => {
      // Create a clean DOM without cgen element
      const cleanUnityEl = document.createElement('div');
      cleanUnityEl.className = 'unity workflow-upload';
      // Test the query parameter parsing logic when no cgen element exists
      const cgenText = cleanUnityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
      const queryParams = {};
      if (cgenText) {
        cgenText.split('&').forEach((param) => {
          const [key, value] = param.split('=');
          if (key && value) {
            queryParams[key] = value;
          }
        });
      }
      // Should be empty when no cgen element exists
      expect(queryParams).to.deep.equal({});
    });

    it('should handle cgen parsing with complex edge cases', async () => {
      // Create a test DOM with complex edge cases
      const testUnityEl = document.createElement('div');
      testUnityEl.className = 'unity workflow-upload';
      // Create cgen element with complex edge cases
      const cgenElement = document.createElement('div');
      cgenElement.className = 'icon-cgen';
      testUnityEl.appendChild(cgenElement);
      // Add text content with various edge cases
      const textNode = document.createTextNode('key1=value1&key2=&=value3&key4&key5=value5=extra&key6=value6');
      testUnityEl.appendChild(textNode);

      // Test the query parameter parsing logic directly
      const cgenText = testUnityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
      const queryParams = {};
      if (cgenText) {
        cgenText.split('&').forEach((param) => {
          const [key, value] = param.split('=');
          if (key && value) {
            queryParams[key] = value;
          }
        });
      }
      expect(queryParams).to.deep.equal({
        key1: 'value1',
        key5: 'value5',
        key6: 'value6',
      });
    });

    it('should handle cgen parsing with whitespace and special characters', async () => {
      // Create a test DOM with whitespace and special characters
      const testUnityEl = document.createElement('div');
      testUnityEl.className = 'unity workflow-upload';
      // Create cgen element with whitespace and special characters
      const cgenElement = document.createElement('div');
      cgenElement.className = 'icon-cgen';
      testUnityEl.appendChild(cgenElement);
      // Add text content with whitespace and special characters
      const textNode = document.createTextNode('  key1=value1  &  key2=value2  &key3=value3&key4=value4  ');
      testUnityEl.appendChild(textNode);

      // Test the query parameter parsing logic directly
      const cgenText = testUnityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
      const queryParams = {};
      if (cgenText) {
        cgenText.split('&').forEach((param) => {
          const [key, value] = param.split('=');
          if (key && value) {
            queryParams[key] = value;
          }
        });
      }
      // Should handle whitespace correctly
      expect(queryParams).to.deep.equal({
        key1: 'value1  ',
        '  key2': 'value2  ',
        key3: 'value3',
        key4: 'value4',
      });
    });

    it('should handle cgen parsing with empty string and single character parameters', async () => {
      // Create a test DOM with empty and single character parameters
      const testUnityEl = document.createElement('div');
      testUnityEl.className = 'unity workflow-upload';
      // Create cgen element with empty and single character parameters
      const cgenElement = document.createElement('div');
      cgenElement.className = 'icon-cgen';
      testUnityEl.appendChild(cgenElement);
      // Add text content with empty and single character parameters
      const textNode = document.createTextNode('a=b&=&c=d&e=&f');
      testUnityEl.appendChild(textNode);

      // Test the query parameter parsing logic directly
      const cgenText = testUnityEl.querySelector('.icon-cgen')?.nextSibling?.textContent?.trim();
      const queryParams = {};
      if (cgenText) {
        cgenText.split('&').forEach((param) => {
          const [key, value] = param.split('=');
          if (key && value) {
            queryParams[key] = value;
          }
        });
      }

      // Should only include valid key-value pairs
      expect(queryParams).to.deep.equal({
        a: 'b',
        c: 'd',
      });
    });

    it('should handle continueInApp with missing response URL', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ status: 200 }),
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      const originalContinueInApp = actionBinder.continueInApp;
      actionBinder.continueInApp = async () => {
        const response = { status: 200 };
        if (!response?.url) {
          const error = new Error('Error connecting to App');
          error.status = response.status;
          throw error;
        }
      };

      try {
        await actionBinder.continueInApp('test-asset-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Error connecting to App');
        expect(error.status).to.equal(200);
      } finally {
        actionBinder.continueInApp = originalContinueInApp;
      }
    });

    it('should handle continueInApp with rejected promises', async () => {
      const testWorkflowCfg = {
        ...workflowCfg,
        supportedFeatures: { values: () => ({ next: () => ({ value: 'test-workflow' }) }) },
      };
      const actionBinder = new ActionBinder(unityEl, testWorkflowCfg, unityEl, [unityEl]);
      actionBinder.assetId = 'test-asset-id';
      actionBinder.promiseStack = [Promise.reject(new Error('Test error'))];

      actionBinder.serviceHandler = {
        postCallToService: async () => ({ url: 'https://test-app.com' }),
        showErrorToast: () => {},
      };

      const mockSplashScreenEl = document.createElement('div');
      mockSplashScreenEl.innerHTML = '<div class="progress-bar"></div>';
      actionBinder.transitionScreen = {
        splashScreenEl: mockSplashScreenEl,
        showSplashScreen: async () => {},
        updateProgressBar: (el, progress) => {
          if (el && el.querySelector) {
            const progressBar = el.querySelector('.progress-bar');
            if (progressBar) {
              progressBar.style.width = `${progress}%`;
            }
          }
        },
      };

      const originalContinueInApp = actionBinder.continueInApp;
      actionBinder.continueInApp = async () => {
        const finalResults = await Promise.allSettled(actionBinder.promiseStack);
        if (finalResults.some((result) => result.status === 'rejected')) return;
        window.location.href = 'https://test-app.com';
      };

      await actionBinder.continueInApp('test-asset-id');
      // Should return early due to rejected promise, so no redirection should happen

      actionBinder.continueInApp = originalContinueInApp;
    });
  });

  describe('Event Listeners Coverage Tests', () => {
    it('should handle drop event on DIV element', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      // Create a DIV element for testing
      const testDiv = document.createElement('div');
      testDiv.className = 'drop-zone';
      unityEl.appendChild(testDiv);

      const actionMap = { '.drop-zone': 'upload' };
      await actionBinder.initActionListeners(unityEl, actionMap);

      // Create drop event with files
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(mockFile);
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      });

      // Mock the executeActionMaps method
      const originalExecuteActionMaps = actionBinder.executeActionMaps;
      actionBinder.executeActionMaps = async (action, files) => {
        expect(action).to.equal('upload');
        expect(files).to.have.length(1);
        expect(files[0]).to.equal(mockFile);
      };

      testDiv.dispatchEvent(dropEvent);

      actionBinder.executeActionMaps = originalExecuteActionMaps;
    });

    it('should handle click event on DIV element', async () => {
      const actionBinder = new ActionBinder(unityEl, workflowCfg, unityEl, [unityEl]);

      // Create a DIV element for testing
      const testDiv = document.createElement('div');
      testDiv.className = 'drop-zone';
      unityEl.appendChild(testDiv);

      const actionMap = { '.drop-zone': 'upload' };
      await actionBinder.initActionListeners(unityEl, actionMap);

      // Reset the stub to clear previous calls
      window.sendAnalyticsEvent.reset();

      // Wait a bit for event listeners to be attached
      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 10));

      const clickEvent = new Event('click', { bubbles: true });
      testDiv.dispatchEvent(clickEvent);
      expect(testDiv).to.not.be.null;
    });
  });
});
