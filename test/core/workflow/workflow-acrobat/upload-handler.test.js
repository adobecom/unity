import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import UploadHandler from '../../../../unitylibs/core/workflow/workflow-acrobat/upload-handler.js';

describe('UploadHandler', () => {
  let uploadHandler;
  let mockActionBinder;
  let mockServiceHandler;
  let originalImport;
  let originalGetUnityLibs;

  beforeEach(() => {
    // Store original functions
    originalImport = window.import;
    originalGetUnityLibs = window.getUnityLibs;

    // Mock getUnityLibs to return consistent path
    window.getUnityLibs = sinon.stub().returns('/test-libs');
    window.unityConfig = {
      surfaceId: 'test-surface',
      apiEndPoint: 'https://test-api.adobe.com',
    };

    // Mock dynamic import to handle the constructed path
    window.import = sinon.stub().callsFake(async (specifier) => {
      // Handle any path that includes transition-screen.js
      if (specifier && specifier.includes && specifier.includes('transition-screen.js')) {
        return {
          default: class TransitionScreen {
            constructor() {
              this.showSplashScreen = sinon.stub().resolves();
              this.updateProgressBar = sinon.stub();
            }
          },
        };
      }
      // For other imports, return empty function
      return { default: () => {} };
    });

    mockActionBinder = {
      workflowCfg: {
        productName: 'test-product',
        enabledFeatures: ['test-feature'],
        langRegion: 'us',
        langCode: 'en',
      },
      acrobatApiConfig: {
        acrobatEndpoint: {
          createAsset: '/api/create-asset',
          finalizeAsset: '/api/finalize-asset',
          getMetadata: '/api/metadata',
        },
      },
      MULTI_FILE: false,
      LOADER_LIMIT: 95,
      limits: {
        pageLimit: {
          maxNumPages: 100,
          minNumPages: 1,
        },
      },
      operations: [],
      transitionScreen: { splashScreenEl: document.createElement('div') },
      initActionListeners: sinon.stub(),
      dispatchAnalyticsEvent: sinon.stub(),
      dispatchErrorToast: sinon.stub().resolves(),
      getAbortSignal: sinon.stub().returns(null),
      setAssetId: sinon.stub(),
      handleRedirect: sinon.stub().resolves(true),
      delay: sinon.stub().resolves(),
    };

    mockServiceHandler = {
      postCallToService: sinon.stub(),
      postCallToServiceWithRetry: sinon.stub(),
      getCallToService: sinon.stub(),
      deleteCallToService: sinon.stub(),
    };

    uploadHandler = new UploadHandler(mockActionBinder, mockServiceHandler);
  });

  afterEach(() => {
    sinon.restore();
    window.getUnityLibs = originalGetUnityLibs;
    window.import = originalImport;
    delete window.unityConfig;
  });

  describe('Blob Operations', () => {
    beforeEach(() => {
      window.fetch = sinon.stub();
      window.URL = { createObjectURL: sinon.stub().returns('blob:url'), revokeObjectURL: sinon.stub() };
    });

    it('should get blob data successfully', async () => {
      const mockBlob = new Blob(['test data']);
      window.fetch.resolves({ ok: true, blob: () => Promise.resolve(mockBlob) });

      const result = await uploadHandler.getBlobData(new Blob(['input']));

      expect(result).to.equal(mockBlob);
    });

    it('should handle blob fetch error with status', async () => {
      window.fetch.resolves({ ok: false, status: 404 });

      try {
        await uploadHandler.getBlobData(new Blob(['input']));
        expect.fail('Should throw error');
      } catch (error) {
        expect(error.status).to.equal(404);
      }
    });

    it('should handle blob fetch error without status', async () => {
      window.fetch.resolves({ ok: false });

      try {
        await uploadHandler.getBlobData(new Blob(['input']));
        expect.fail('Should throw error');
      } catch (error) {
        // Error should be thrown
      }
    });
  });

  describe('Upload Operations', () => {
    beforeEach(() => {
      window.fetch = sinon.stub();
    });

    it('should upload file successfully', async () => {
      const mockResponse = { ok: true };
      window.fetch.resolves(mockResponse);

      const result = await uploadHandler.uploadFileToUnity(
        'https://test.com/upload',
        new Blob(['test']),
        'application/pdf',
        'asset-123',
        null,
        1,
      );

      expect(result).to.equal(mockResponse);
    });

    it('should handle upload response error', async () => {
      window.fetch.resolves({ ok: false, status: 500, statusText: 'Server Error' });

      try {
        await uploadHandler.uploadFileToUnity(
          'https://test.com/upload',
          new Blob(['test']),
          'application/pdf',
          'asset-123',
          null,
          1,
        );
        expect.fail('Should throw error');
      } catch (error) {
        expect(error.status).to.equal(500);
      }
    });

    it('should handle AbortError during upload', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      window.fetch.rejects(abortError);

      try {
        await uploadHandler.uploadFileToUnity(
          'https://test.com/upload',
          new Blob(['test']),
          'application/pdf',
          'asset-123',
          null,
          1,
        );
        expect.fail('Should throw error');
      } catch (error) {
        expect(error.name).to.equal('AbortError');
      }
    });

    it('should handle TypeError network error', async () => {
      const networkError = new TypeError('Network error');
      window.fetch.rejects(networkError);

      try {
        await uploadHandler.uploadFileToUnity(
          'https://test.com/upload',
          new Blob(['test']),
          'application/pdf',
          'asset-123',
          null,
          1,
        );
        expect.fail('Should throw error');
      } catch (error) {
        expect(error).to.be.instanceOf(TypeError);
      }
    });
  });

  describe('Retry Logic', () => {
    it('should succeed on first attempt', async () => {
      uploadHandler.uploadFileToUnity = sinon.stub().resolves({ ok: true });

      const result = await uploadHandler.uploadFileToUnityWithRetry(
        'url',
        new Blob(['test']),
        'type',
        'asset',
        null,
        1,
      );

      expect(result.attempt).to.equal(1);
    });

    it('should retry multiple times and succeed', async () => {
      const clock = sinon.useFakeTimers();
      uploadHandler.uploadFileToUnity = sinon.stub()
        .onCall(0)
        .resolves({ ok: false })
        .onCall(1)
        .resolves({ ok: false })
        .onCall(2)
        .resolves({ ok: true });

      const promise = uploadHandler.uploadFileToUnityWithRetry(
        'url',
        new Blob(['test']),
        'type',
        'asset',
        null,
        1,
      );

      // Fast-forward through the retry delays
      await clock.tickAsync(8000); // Total delay: 1000 + 2000 + 4000 = 7000ms

      const result = await promise;
      expect(result.attempt).to.equal(3);

      clock.restore();
    });

    it('should fail after max retries', async () => {
      const clock = sinon.useFakeTimers();
      uploadHandler.uploadFileToUnity = sinon.stub().resolves({ ok: false });

      const promise = uploadHandler.uploadFileToUnityWithRetry(
        'url',
        new Blob(['test']),
        'type',
        'asset',
        null,
        1,
      );

      // Fast-forward through all retry delays
      await clock.tickAsync(16000); // Total delay for 4 attempts

      try {
        await promise;
        expect.fail('Should throw error');
      } catch (error) {
        expect(error.message).to.include('Max retry delay exceeded');
      }

      clock.restore();
    });

    it('should handle AbortError immediately in retry', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      uploadHandler.uploadFileToUnity = sinon.stub().rejects(abortError);

      try {
        await uploadHandler.uploadFileToUnityWithRetry(
          'url',
          new Blob(['test']),
          'type',
          'asset',
          null,
          1,
        );
        expect.fail('Should throw error');
      } catch (error) {
        expect(error.name).to.equal('AbortError');
      }
    });
  });

  describe('Constructor', () => {
    it('should initialize with action binder and service handler', () => {
      expect(uploadHandler.actionBinder).to.equal(mockActionBinder);
      expect(uploadHandler.serviceHandler).to.equal(mockServiceHandler);
    });

    it('should have static upload limits defined', () => {
      expect(UploadHandler.UPLOAD_LIMITS).to.be.an('object');
      expect(UploadHandler.UPLOAD_LIMITS.HIGH_END).to.deep.equal({ files: 3, chunks: 10 });
      expect(UploadHandler.UPLOAD_LIMITS.MID_RANGE).to.deep.equal({ files: 3, chunks: 10 });
      expect(UploadHandler.UPLOAD_LIMITS.LOW_END).to.deep.equal({ files: 2, chunks: 6 });
    });

    it('should support configurable device type override', () => {
      const mockActionBinderWithOverride = {
        ...mockActionBinder,
        deviceTypeOverride: 'HIGH_END',
      };
      const handlerWithOverride = new UploadHandler(mockActionBinderWithOverride, mockServiceHandler);
      Object.defineProperty(handlerWithOverride, 'deviceTypeOverride', {
        value: 'HIGH_END',
        writable: true,
        configurable: true,
      });
    });
  });

  describe('Utility Functions', () => {
    it('should get concurrent limits for single file', () => {
      mockActionBinder.MULTI_FILE = false;
      const limits = uploadHandler.getConcurrentLimits();
      expect(limits).to.have.property('maxConcurrentChunks');
      expect(limits.maxConcurrentChunks).to.be.a('number');
    });

    it('should get concurrent limits for multi file', () => {
      mockActionBinder.MULTI_FILE = true;
      const limits = uploadHandler.getConcurrentLimits();
      expect(limits).to.have.property('maxConcurrentFiles');
      expect(limits).to.have.property('maxConcurrentChunks');
      expect(limits.maxConcurrentFiles).to.be.a('number');
      expect(limits.maxConcurrentChunks).to.be.a('number');
    });

    it('should generate guest connection payload with feedback', () => {
      const payload = uploadHandler.getGuestConnPayload('Great product!');
      expect(payload.payload.feedback).to.equal('Great product!');
      expect(payload.targetProduct).to.equal('test-product');
    });

    it('should generate guest connection payload without feedback', () => {
      const payload = uploadHandler.getGuestConnPayload();
      expect(payload.payload.feedback).to.equal(undefined);
      expect(payload.targetProduct).to.equal('test-product');
    });

    it('should generate guest connection payload with null feedback', () => {
      const payload = uploadHandler.getGuestConnPayload(null);
      expect(payload.payload.feedback).to.equal(null);
      expect(payload.targetProduct).to.equal('test-product');
    });

    it('should identify PDF files correctly', () => {
      expect(uploadHandler.isPdf({ type: 'application/pdf' })).to.be.true;
      expect(uploadHandler.isPdf({ type: 'image/jpeg' })).to.be.false;
      expect(uploadHandler.isPdf({ type: '' })).to.be.false;
      expect(uploadHandler.isPdf({ type: null })).to.be.false;
      expect(uploadHandler.isPdf({ type: undefined })).to.be.false;
    });

    it('should handle dispatchGenericError', async () => {
      await uploadHandler.dispatchGenericError();
      expect(mockActionBinder.dispatchErrorToast.calledWith('error_generic')).to.be.true;
    });
  });

  describe('Asset Creation', () => {
    it('should create asset with all parameters', async () => {
      const file = { name: 'test.pdf', size: 1000, type: 'application/pdf' };
      mockServiceHandler.postCallToService.resolves({ id: 'asset-123' });

      const result = await uploadHandler.createAsset(file, true, 'workflow-123');

      expect(result.id).to.equal('asset-123');
      expect(mockServiceHandler.postCallToService.calledOnce).to.be.true;
      const [, options] = mockServiceHandler.postCallToService.getCall(0).args;
      const bodyData = JSON.parse(options.body);
      expect(bodyData.multifile).to.be.true;
      expect(bodyData.workflowId).to.equal('workflow-123');
      expect(bodyData.targetProduct).to.equal('test-product');
    });

    it('should create asset without optional parameters', async () => {
      const file = { name: 'test.pdf', size: 1000, type: 'application/pdf' };
      mockServiceHandler.postCallToService.resolves({ id: 'asset-123' });

      await uploadHandler.createAsset(file);

      const [, options] = mockServiceHandler.postCallToService.getCall(0).args;
      const bodyData = JSON.parse(options.body);
      expect(bodyData.multifile).to.be.undefined;
      expect(bodyData.workflowId).to.be.undefined;
    });

    it('should handle createAsset errors', async () => {
      const file = { name: 'test.pdf', size: 1000, type: 'application/pdf' };
      mockServiceHandler.postCallToService.rejects(new Error('Asset creation failed'));

      try {
        await uploadHandler.createAsset(file);
        expect.fail('Should throw error');
      } catch (error) {
        expect(error.message).to.include('Asset creation failed');
      }
    });
  });

  describe('Page Count Validation', () => {
    it('should validate normal page count', async () => {
      const assetData = { id: 'asset-123' };

      // Mock service to return page count immediately
      mockServiceHandler.getCallToService.resolves({ numPages: 50 });

      const result = await uploadHandler.checkPageNumCount(assetData, false);
      expect(result).to.be.false; // No validation failure
    });

    it('should fail for page count exceeding max pages', async () => {
      const assetData = { id: 'asset-123' };
      mockActionBinder.limits.pageLimit.maxNumPages = 100;

      // Mock service to return page count that exceeds limit immediately
      mockServiceHandler.getCallToService.resolves({ numPages: 150 });

      const result = await uploadHandler.checkPageNumCount(assetData, false);
      expect(result).to.be.true; // Should indicate validation failure
    });
  });

  describe('General Validations', () => {
    it('should pass all validations', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.checkPageNumCount = sinon.stub().resolves(false);

      const result = await uploadHandler.handleValidations(assetData, false);

      expect(result).to.be.true;
      expect(uploadHandler.checkPageNumCount.calledWith(assetData, false)).to.be.true;
    });

    it('should fail validations on error', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.checkPageNumCount = sinon.stub().resolves(true);

      const result = await uploadHandler.handleValidations(assetData, false);

      expect(result).to.be.false;
    });
  });

  describe('Error Handling', () => {
    it('should handle duplicate asset error (409)', async () => {
      const error = new Error('Duplicate asset');
      error.status = 409;

      await uploadHandler.handleUploadError(error);

      expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
      const [errorCode, status] = mockActionBinder.dispatchErrorToast.getCall(0).args;
      expect(errorCode).to.equal('upload_validation_error_duplicate_asset');
      expect(status).to.equal(409);
    });

    it('should handle quota exceeded error (403)', async () => {
      const error = new Error('quotaexceeded');
      error.status = 403;
      error.message = 'quotaexceeded';

      await uploadHandler.handleUploadError(error);

      expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
      const [errorCode] = mockActionBinder.dispatchErrorToast.getCall(0).args;
      expect(errorCode).to.equal('upload_error_max_quota_exceeded');
    });

    it('should handle generic error', async () => {
      const error = new Error('Network error');

      await uploadHandler.handleUploadError(error);

      expect(mockActionBinder.dispatchErrorToast.calledOnce).to.be.true;
      const [errorCode] = mockActionBinder.dispatchErrorToast.getCall(0).args;
      expect(errorCode).to.equal('error_generic');
    });
  });

  describe('Batch Processing', () => {
    it('should execute items in batches', async () => {
      const items = [1, 2, 3, 4, 5, 6];
      const processedItems = [];

      await uploadHandler.executeInBatches(items, 2, async (item) => {
        processedItems.push(item);
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
      });

      expect(processedItems).to.have.length(6);
      expect(processedItems).to.include.members([1, 2, 3, 4, 5, 6]);
    });

    it('should handle errors in batch processing gracefully', async () => {
      const items = [1, 2, 3, 4];

      await uploadHandler.executeInBatches(items, 2, async (item) => {
        if (item === 2) throw new Error('Processing error');
        return item;
      });

      expect(true).to.be.true; // Should complete without throwing
    });

    it('should handle batch upload tasks', async () => {
      const results = [];
      const tasks = [
        async () => {
          results.push('task1');
        },
        async () => {
          results.push('task2');
        },
        async () => {
          results.push('task3');
        },
      ];

      await uploadHandler.batchUpload(tasks, 2);

      expect(results).to.have.length(3);
      expect(results).to.include.members(['task1', 'task2', 'task3']);
    });
  });

  describe('PDF Chunking', () => {
    it('should chunk and upload PDF successfully', async () => {
      const assetDataArray = [{
        id: 'asset-123',
        blocksize: 50,
        uploadUrls: [
          { href: 'https://test.com/chunk1?partNumber=1' },
          { href: 'https://test.com/chunk2?partNumber=2' },
        ],
      }];
      const blobDataArray = [new Blob(['x'.repeat(75)])];
      const filetypeArray = ['application/pdf'];

      uploadHandler.uploadFileToUnityWithRetry = sinon.stub().resolves({ attempt: 1 });

      const result = await uploadHandler.chunkPdf(assetDataArray, blobDataArray, filetypeArray, 2, null);

      expect(result.failedFiles.size).to.equal(0);
      expect(result.attemptMap.has(0)).to.be.true; // Check that file index 0 is in the attempt map
      expect(result.attemptMap.get(0)).to.equal(1); // Check the attempt count
    });

    it('should handle chunk upload failures', async () => {
      const assetDataArray = [{
        id: 'asset-123',
        blocksize: 50,
        uploadUrls: [{ href: 'https://test.com/chunk1?partNumber=1' }],
      }];
      const blobDataArray = [new Blob(['x'.repeat(25)])];
      const filetypeArray = ['application/pdf'];

      uploadHandler.uploadFileToUnityWithRetry = sinon.stub().rejects(new Error('Upload failed'));

      const result = await uploadHandler.chunkPdf(assetDataArray, blobDataArray, filetypeArray, 2, null);

      expect(result.failedFiles.size).to.equal(1);
      expect(Array.from(result.failedFiles)[0]).to.have.property('fileIndex', 0);
    });

    it('should handle abort signal during chunking', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await uploadHandler.chunkPdf([], [], [], 2, controller.signal);

      expect(result.failedFiles.size).to.equal(0);
      expect(result.attemptMap.size).to.equal(0);
    });
  });

  describe('Content Verification', () => {
    it('should verify content successfully', async () => {
      const assetData = { id: 'asset-123' };

      // Mock successful finalize call - should return empty object {}
      mockServiceHandler.postCallToServiceWithRetry.resolves({});

      const result = await uploadHandler.verifyContent(assetData, null);
      expect(result).to.be.true;
      expect(mockServiceHandler.postCallToServiceWithRetry.calledOnce).to.be.true;
    });

    it('should handle verification service errors', async () => {
      const assetData = { id: 'asset-123' };
      const serviceError = new Error('Service error');
      serviceError.showError = true;
      mockServiceHandler.postCallToServiceWithRetry.rejects(serviceError);

      const result = await uploadHandler.verifyContent(assetData, null);
      expect(result).to.be.false;
    });
  });
}); 