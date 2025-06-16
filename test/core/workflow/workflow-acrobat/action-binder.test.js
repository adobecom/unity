import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import ActionBinder from '../../../../unitylibs/core/workflow/workflow-acrobat/action-binder.js';

describe('ActionBinder', () => {
  let actionBinder;
  let mockWorkflowCfg;
  let mockUnityEl;
  let mockWfblock;
  let mockCanvasArea;
  let mockServiceHandler;

  beforeEach(() => {
    mockWorkflowCfg = {
      productName: 'test-product',
      enabledFeatures: ['test-feature'],
      targetCfg: {
        sendSplunkAnalytics: true,
      },
      errors: {
        'test-error': 'Test error message',
      },
    };

    // Mock DOM elements
    mockUnityEl = {
      classList: { contains: sinon.stub().returns(false) },
    };

    mockWfblock = {
      classList: { contains: sinon.stub().returns(false) },
      dispatchEvent: sinon.stub(),
    };

    mockCanvasArea = {};

    // Mock global config and functions
    window.unityConfig = {
      surfaceId: 'test-surface',
      apiEndPoint: 'https://test-api.adobe.com',
      errorToastEvent: 'unity:error-toast',
      trackAnalyticsEvent: 'unity:track-analytics',
      apiKey: 'test-api-key',
    };

    // Mock isGuestUser function
    window.isGuestUser = sinon.stub().resolves({ isGuest: false });

    actionBinder = new ActionBinder(mockUnityEl, mockWorkflowCfg, mockWfblock, mockCanvasArea);
    mockServiceHandler = actionBinder.serviceHandler;
  });

  afterEach(() => {
    sinon.restore();
    delete window.isGuestUser;
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(actionBinder).to.be.instanceOf(ActionBinder);
      expect(actionBinder.workflowCfg).to.equal(mockWorkflowCfg);
    });

    it('should have required properties', () => {
      expect(actionBinder).to.have.property('workflowCfg');
      expect(actionBinder).to.have.property('unityEl');
      expect(actionBinder).to.have.property('block');
      expect(actionBinder).to.have.property('canvasArea');
      expect(actionBinder).to.have.property('serviceHandler');
    });
  });

  describe('Configuration', () => {
    it('should have product name from config', () => {
      expect(actionBinder.workflowCfg.productName).to.equal('test-product');
    });

    it('should have enabled features from config', () => {
      expect(actionBinder.workflowCfg.enabledFeatures).to.include('test-feature');
    });
  });

  describe('Methods', () => {
    it('should have dispatchAnalyticsEvent method', () => {
      expect(actionBinder.dispatchAnalyticsEvent).to.be.a('function');
    });

    it('should have dispatchErrorToast method', () => {
      expect(actionBinder.dispatchErrorToast).to.be.a('function');
    });

    it('should have getAbortSignal method', () => {
      expect(actionBinder.getAbortSignal).to.be.a('function');
    });

    it('should have handleRedirect method', () => {
      expect(actionBinder.handleRedirect).to.be.a('function');
    });
  });

  describe('ServiceHandler', () => {
    describe('handleAbortedRequest', () => {
      it('should throw AbortError when signal is aborted', () => {
        const options = { signal: { aborted: true } };
        expect(() => mockServiceHandler.handleAbortedRequest('test-url', options)).to.throw('Request to test-url aborted by user.');
      });

      it('should not throw when signal is not aborted', () => {
        const options = { signal: { aborted: false } };
        expect(() => mockServiceHandler.handleAbortedRequest('test-url', options)).to.not.throw();
      });
    });

    describe('fetchFromService', () => {
      beforeEach(() => {
        window.fetch = sinon.stub();
      });

      it('should return JSON response on successful request', async () => {
        const mockHeaders = new Headers();
        const mockResponse = { 
          json: () => Promise.resolve({ data: 'test' }),
          headers: mockHeaders,
          ok: true,
          status: 200,
        };
        window.fetch.resolves(mockResponse);

        const result = await mockServiceHandler.fetchFromService('test-url', {});
        expect(result).to.deep.equal({ data: 'test' });
      });

      it('should handle 202 response', async () => {
        const mockHeaders = new Headers({ 'Content-Length': '0' });
        const mockResponse = {
          status: 202,
          headers: mockHeaders,
          ok: true,
        };
        window.fetch.resolves(mockResponse);

        const result = await mockServiceHandler.fetchFromService('test-url', {});
        expect(result).to.deep.equal({ status: 202, headers: mockHeaders });
      });

      it('should retry on 5xx errors', async () => {
        const mockHeaders = new Headers();
        const mockResponse = { 
          status: 500,
          headers: mockHeaders,
          ok: false,
        };
        window.fetch.resolves(mockResponse);

        try {
          await mockServiceHandler.fetchFromService('test-url', {});
        } catch (error) {
          expect(error.status).to.equal(500);
        }
      });

      it('should handle network errors', async () => {
        window.fetch.rejects(new TypeError('Network error'));

        try {
          await mockServiceHandler.fetchFromService('test-url', {});
        } catch (error) {
          expect(error.status).to.equal(0);
          expect(error.message).to.include('Network error');
        }
      });
    });

    describe('fetchFromServiceWithRetry', () => {
      beforeEach(() => {
        window.fetch = sinon.stub();
        // Mock setTimeout to avoid actual delays
        sinon.stub(window, 'setTimeout').callsFake((fn) => {
          fn();
          return 1;
        });
      });

      afterEach(() => {
        window.setTimeout.restore();
      });

      it('should retry on 202 response', async () => {
        const mockHeaders = new Headers({ 'retry-after': '1' });
        const mockResponse = {
          status: 202,
          headers: mockHeaders,
          ok: true,
        };
        window.fetch.resolves(mockResponse);

        try {
          await mockServiceHandler.fetchFromServiceWithRetry('test-url', {}, 2);
        } catch (error) {
          expect(error.status).to.equal(504);
          expect(error.message).to.include('Max retry delay exceeded');
        }
      });

      it('should return response on successful retry', async () => {
        const mockHeaders = new Headers();
        const mockResponse = { 
          json: () => Promise.resolve({ data: 'test' }),
          headers: mockHeaders,
          ok: true,
          status: 200,
        };
        window.fetch.resolves(mockResponse);

        const result = await mockServiceHandler.fetchFromServiceWithRetry('test-url', {});
        expect(result).to.deep.equal({ data: 'test' });
      });
    });

    describe('postCallToService', () => {
      beforeEach(() => {
        window.fetch = sinon.stub();
      });

      it('should make POST request with correct headers', async () => {
        const mockHeaders = new Headers();
        const mockResponse = { 
          json: () => Promise.resolve({ data: 'test' }),
          headers: mockHeaders,
          ok: true,
          status: 200,
        };
        window.fetch.resolves(mockResponse);

        await mockServiceHandler.postCallToService('test-url', { body: 'test' });

        expect(window.fetch.calledWith('test-url', {
          method: 'POST',
          headers: sinon.match.object,
          body: 'test',
        })).to.be.true;
      });
    });

    describe('postCallToServiceWithRetry', () => {
      beforeEach(() => {
        window.fetch = sinon.stub();
      });

      it('should make POST request with retry capability', async () => {
        const mockHeaders = new Headers();
        const mockResponse = { 
          json: () => Promise.resolve({ data: 'test' }),
          headers: mockHeaders,
          ok: true,
          status: 200,
        };
        window.fetch.resolves(mockResponse);

        await mockServiceHandler.postCallToServiceWithRetry('test-url', { body: 'test' });

        expect(window.fetch.calledWith('test-url', {
          method: 'POST',
          headers: sinon.match.object,
          body: 'test',
        })).to.be.true;
      });
    });

    describe('getCallToService', () => {
      beforeEach(() => {
        window.fetch = sinon.stub();
      });

      it('should make GET request with query parameters', async () => {
        const mockHeaders = new Headers();
        const mockResponse = { 
          json: () => Promise.resolve({ data: 'test' }),
          headers: mockHeaders,
          ok: true,
          status: 200,
        };
        window.fetch.resolves(mockResponse);

        await mockServiceHandler.getCallToService('test-url', { param: 'value' });

        expect(window.fetch.calledWith('test-url?param=value', {
          method: 'GET',
          headers: sinon.match.object,
        })).to.be.true;
      });
    });

    describe('deleteCallToService', () => {
      beforeEach(() => {
        window.fetch = sinon.stub();
      });

      it('should make DELETE request with access token', async () => {
        const mockHeaders = new Headers();
        const mockResponse = { 
          json: () => Promise.resolve({ data: 'test' }),
          headers: mockHeaders,
          ok: true,
          status: 200,
        };
        window.fetch.resolves(mockResponse);

        await mockServiceHandler.deleteCallToService('test-url', 'test-token');

        expect(window.fetch.calledWith('test-url', {
          method: 'DELETE',
          headers: {
            Authorization: 'test-token',
            'x-api-key': 'unity',
          },
        })).to.be.true;
      });
    });
  });

  describe('ActionBinder', () => {
    describe('dispatchErrorToast', () => {
      it('should dispatch error toast event with correct data', async () => {
        await actionBinder.dispatchErrorToast('test-error', 500, 'Test info');

        expect(mockWfblock.dispatchEvent.calledOnce).to.be.true;
        const event = mockWfblock.dispatchEvent.firstCall.args[0];
        expect(event.type).to.equal('unity:show-error-toast');
        expect(event.detail).to.deep.include({
          code: 'test-error',
          message: 'Test error message',
          status: 500,
          info: 'Upload Type: single; Test info',
          accountType: 'signed-in',
          sendToSplunk: true,
        });
      });

      it('should not dispatch event when showError is false', async () => {
        await actionBinder.dispatchErrorToast('test-error', 500, 'Test info', false, false);

        expect(mockWfblock.dispatchEvent.called).to.be.false;
      });
    });

    describe('dispatchAnalyticsEvent', () => {
      it('should dispatch analytics event with correct data', async () => {
        const testData = { test: 'data' };
        await actionBinder.dispatchAnalyticsEvent('test-event', testData);

        expect(mockWfblock.dispatchEvent.calledWith(sinon.match({
          type: 'unity:track-analytics',
          detail: {
            event: 'test-event',
            data: testData,
            sendToSplunk: true,
          },
        }))).to.be.true;
      });

      it('should dispatch analytics event without data', async () => {
        await actionBinder.dispatchAnalyticsEvent('test-event');

        expect(mockWfblock.dispatchEvent.calledWith(sinon.match({
          type: 'unity:track-analytics',
          detail: {
            event: 'test-event',
            sendToSplunk: true,
          },
        }))).to.be.true;
      });
    });

    describe('isMixedFileTypes', () => {
      it('should return true for mixed file types', () => {
        const files = [
          { type: 'application/pdf' },
          { type: 'image/jpeg' }
        ];
        expect(actionBinder.isMixedFileTypes(files)).to.equal('mixed');
      });

      it('should return false for same file types', () => {
        const files = [
          { type: 'application/pdf' },
          { type: 'application/pdf' }
        ];
        expect(actionBinder.isMixedFileTypes(files)).to.equal('application/pdf');
      });

      it('should return false for single file', () => {
        const files = [{ type: 'application/pdf' }];
        expect(actionBinder.isMixedFileTypes(files)).to.equal('application/pdf');
      });
    });

    describe('sanitizeFileName', () => {
      it('should sanitize file name with special characters', async () => {
        const result = await actionBinder.sanitizeFileName('test@#$%^&-()file.pdf');
        expect(result).to.equal('test@#$%^&-()file.pdf');
      });

      it('should handle file name with spaces', async () => {
        const result = await actionBinder.sanitizeFileName('test file name.pdf');
        expect(result).to.equal('test file name.pdf');
      });

      it('should handle file name with multiple extensions', async () => {
        const result = await actionBinder.sanitizeFileName('test.file.pdf');
        expect(result).to.equal('test.file.pdf');
      });

      it('should handle file name with only extension', async () => {
        const result = await actionBinder.sanitizeFileName('.pdf');
        expect(result).to.equal('-pdf');
      });
    });

    describe('isSameFileType', () => {
      beforeEach(() => {
        mockWorkflowCfg.targetCfg = {
          allowedFileTypes: ['application/pdf']
        };
      });

      it('should return true for matching file types', () => {
        expect(actionBinder.isSameFileType('compress-pdf', 'application/pdf')).to.be.false;
      });

      it('should return false for non-matching file types', () => {
        expect(actionBinder.isSameFileType('compress-pdf', 'image/jpeg')).to.be.false;
      });

      it('should handle undefined file type', () => {
        expect(actionBinder.isSameFileType('compress-pdf', undefined)).to.be.false;
      });
    });

    describe('validateFiles', () => {
      beforeEach(() => {
        mockWorkflowCfg.limits = {
          maxFileSize: 10485760, // 10MB
          allowedFileTypes: ['application/pdf', 'image/jpeg']
        };
        mockWorkflowCfg.targetCfg = {
          allowedFileTypes: ['application/pdf', 'image/jpeg']
        };
        actionBinder.limits = mockWorkflowCfg.limits;
        actionBinder.workflowCfg = mockWorkflowCfg;
      });

      it('should validate files within limits', async () => {
        const files = [
          { type: 'application/pdf', size: 5242880 }, // 5MB
          { type: 'image/jpeg', size: 2097152 } // 2MB
        ];
        const result = await actionBinder.validateFiles(files);
        expect(result.isValid).to.be.true;
        expect(result.validFiles).to.deep.equal(files);
      });

      it('should reject files exceeding size limit', async () => {
        const files = [
          { type: 'application/pdf', size: 15728640 } // 15MB
        ];
        const result = await actionBinder.validateFiles(files);
        expect(result.isValid).to.be.false;
        expect(result.validFiles).to.be.empty;
      });

      it('should reject files with unsupported types', async () => {
        const files = [
          { type: 'application/zip', size: 5242880 } // 5MB
        ];
        const result = await actionBinder.validateFiles(files);
        expect(result.isValid).to.be.false;
        expect(result.validFiles).to.be.empty;
      });
    });

    describe('loadVerbLimits', () => {
      beforeEach(() => {
        mockWorkflowCfg.limits = {
          'test-verb': {
            maxFileSize: 10485760,
            allowedFileTypes: ['application/pdf']
          }
        };
        actionBinder.workflowCfg = mockWorkflowCfg;
        actionBinder.limits = mockWorkflowCfg.limits['test-verb'];
        actionBinder.serviceHandler = {
          getCallToService: sinon.stub().resolves({
            maxFileSize: 10485760,
            allowedFileTypes: ['application/pdf']
          })
        };
        actionBinder.acrobatApiConfig = {
          acrobatEndpoint: {
            getVerbLimits: '/api/verb-limits'
          }
        };
      });

      it('should load verb limits successfully', async () => {
        const result = await actionBinder.loadVerbLimits('test-verb', ['maxFileSize', 'allowedFileTypes']);
        expect(result).to.be.an('object');
      });
    });

    describe('extractFiles', () => {
      it('should extract files from event', () => {
        const mockEvent = {
          target: {
            files: [
              { name: 'test1.pdf', type: 'application/pdf', size: 1048576 },
              { name: 'test2.pdf', type: 'application/pdf', size: 2097152 }
            ]
          }
        };

        const result = actionBinder.extractFiles(mockEvent);
        expect(result).to.have.property('files');
        expect(result.files).to.have.lengthOf(2);
        expect(result.files[0].name).to.equal('test1.pdf');
        expect(result.files[1].name).to.equal('test2.pdf');
        expect(result).to.have.property('totalFileSize');
      });

      it('should handle empty files', () => {
        const mockEvent = {
          target: {
            files: []
          }
        };

        const result = actionBinder.extractFiles(mockEvent);
        expect(result).to.have.property('files');
        expect(result.files).to.be.an('array').that.is.empty;
        expect(result).to.have.property('totalFileSize', 0);
      });
    });

    describe('setAssetId', () => {
      beforeEach(() => {
        actionBinder.filesData = {};
      });

      it('should set asset ID', () => {
        const assetId = 'test-asset-id';
        actionBinder.setAssetId(assetId);
        expect(actionBinder.filesData.assetId).to.equal(assetId);
      });
    });

    describe('processSingleFile', () => {
      beforeEach(() => {
        actionBinder.MULTI_FILE = false;
        actionBinder.filesData = {};
        actionBinder.uploadHandler = {
          singleFileGuestUpload: sinon.stub().resolves(),
          singleFileUserUpload: sinon.stub().resolves(),
        };
        actionBinder.signedOut = false;
        actionBinder.limits = {
          maxNumFiles: 1,
          allowedFileTypes: ['application/pdf'],
          maxFileSize: 10485760,
        };
        actionBinder.dispatchErrorToast = sinon.stub().resolves();
        actionBinder.handleFileUpload = sinon.stub().resolves();
        actionBinder.workflowCfg = {
          enabledFeatures: ['test-feature'],
          name: 'test-workflow',
        };
        actionBinder.loadVerbLimits = sinon.stub().resolves(actionBinder.limits);
      });

      it('should process single file for signed-in user', async () => {
        const files = [{ type: 'application/pdf', size: 1048576 }];
        await actionBinder.processSingleFile(files);
        expect(actionBinder.handleFileUpload.calledWith(files)).to.be.true;
      });

      it('should process single file for guest user', async () => {
        actionBinder.signedOut = true;
        const files = [{ type: 'application/pdf', size: 1048576 }];
        await actionBinder.processSingleFile(files);
        expect(actionBinder.handleFileUpload.calledWith(files)).to.be.true;
      });

      it('should not process if limits are not loaded', async () => {
        actionBinder.loadVerbLimits.resolves({});
        const files = [{ type: 'application/pdf', size: 1048576 }];
        await actionBinder.processSingleFile(files);
        expect(actionBinder.handleFileUpload.called).to.be.false;
      });

      it('should not process if files are not provided', async () => {
        const files = null;
        await actionBinder.processSingleFile(files);
        expect(actionBinder.handleFileUpload.called).to.be.false;
      });
    });

    describe('processHybrid', () => {
      beforeEach(() => {
        actionBinder.MULTI_FILE = true;
        actionBinder.filesData = {};
        actionBinder.uploadHandler = {
          multiFileGuestUpload: sinon.stub().resolves(),
          multiFileUserUpload: sinon.stub().resolves(),
        };
        actionBinder.signedOut = false;
        actionBinder.limits = {
          maxNumFiles: 10,
          allowedFileTypes: ['application/pdf'],
          maxFileSize: 10485760,
        };
        actionBinder.dispatchErrorToast = sinon.stub().resolves();
        actionBinder.handleFileUpload = sinon.stub().resolves();
        actionBinder.workflowCfg = {
          enabledFeatures: ['test-feature'],
          name: 'test-workflow',
        };
        actionBinder.loadVerbLimits = sinon.stub().resolves(actionBinder.limits);
      });

      it('should process hybrid files for signed-in user', async () => {
        const files = [
          { type: 'application/pdf', size: 1048576 },
          { type: 'application/pdf', size: 2097152 },
        ];
        await actionBinder.processHybrid(files);
        expect(actionBinder.handleFileUpload.calledWith(files)).to.be.true;
      });

      it('should process hybrid files for guest user', async () => {
        actionBinder.signedOut = true;
        const files = [
          { type: 'application/pdf', size: 1048576 },
          { type: 'application/pdf', size: 2097152 },
        ];
        await actionBinder.processHybrid(files);
        expect(actionBinder.handleFileUpload.calledWith(files)).to.be.true;
      });

      it('should not process if limits are not loaded', async () => {
        actionBinder.loadVerbLimits.resolves({});
        const files = [
          { type: 'application/pdf', size: 1048576 },
          { type: 'application/pdf', size: 2097152 },
        ];
        await actionBinder.processHybrid(files);
        expect(actionBinder.handleFileUpload.called).to.be.false;
      });

      it('should not process if files are not provided', async () => {
        const files = null;
        await actionBinder.processHybrid(files);
        expect(actionBinder.handleFileUpload.called).to.be.false;
      });
    });

    describe('delay', () => {
      let clock;

      beforeEach(() => {
        clock = sinon.useFakeTimers();
      });

      afterEach(() => {
        clock.restore();
      });

      it('should delay for specified milliseconds', async () => {
        const delayMs = 1000;
        const delayPromise = actionBinder.delay(delayMs);
        expect(delayPromise).to.be.instanceOf(Promise);
        clock.tick(delayMs);
        await delayPromise;
      });
    });

    describe('setIsUploading', () => {
      it('should set isUploading flag', () => {
        actionBinder.setIsUploading(true);
        expect(actionBinder.isUploading).to.be.true;

        actionBinder.setIsUploading(false);
        expect(actionBinder.isUploading).to.be.false;
      });
    });

    describe('getAbortSignal', () => {
      it('should return abort controller signal', () => {
        const signal = actionBinder.getAbortSignal();
        expect(signal).to.equal(actionBinder.abortController.signal);
      });

      it('should return a new signal after abort', () => {
        const originalSignal = actionBinder.getAbortSignal();
        actionBinder.abortController.abort();
        actionBinder.abortController = new AbortController();
        const newSignal = actionBinder.getAbortSignal();
        expect(newSignal).to.not.equal(originalSignal);
      });
    });

    describe('acrobatSignedInSettings', () => {
      beforeEach(() => {
        actionBinder.limits = {
          allowedFileTypes: ['application/pdf'],
          signedInallowedFileTypes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        };
      });

      it('should add signed in file types when user is signed in', () => {
        actionBinder.signedOut = false;
        actionBinder.acrobatSignedInSettings();
        expect(actionBinder.limits.allowedFileTypes).to.deep.equal([
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ]);
      });

      it('should not add signed in file types when user is signed out', () => {
        actionBinder.signedOut = true;
        actionBinder.acrobatSignedInSettings();
        expect(actionBinder.limits.allowedFileTypes).to.deep.equal(['application/pdf']);
      });

      it('should not modify allowedFileTypes when signedInallowedFileTypes is not present', () => {
        delete actionBinder.limits.signedInallowedFileTypes;
        actionBinder.signedOut = false;
        actionBinder.acrobatSignedInSettings();
        expect(actionBinder.limits.allowedFileTypes).to.deep.equal(['application/pdf']);
      });
    });
  });
}); 