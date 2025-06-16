import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('UploadHandler', () => {
  let UploadHandler;
  let uploadHandler;
  let mockActionBinder;
  let mockServiceHandler;

  before(async () => {
    // Store original import function if it exists
    const originalImport = window.import;

    // Establish global mocks before dynamic import
    window.unityConfig = {
      surfaceId: 'test-surface',
      apiEndPoint: 'https://test-api.adobe.com',
    };

    // Mock getUnityLibs to return the correct relative path to unitylibs folder
    window.getUnityLibs = () => '../unitylibs';

    // Mock import function to handle transition-screen imports
    window.import = function mockImport(specifier) {
      if (specifier && typeof specifier === 'string' && specifier.includes('transition-screen.js')) {
        return Promise.resolve({
          default: function TransitionScreen() {
            this.showSplashScreen = () => Promise.resolve();
            this.updateProgressBar = () => Promise.resolve();
          },
        });
      }
      if (originalImport) {
        return originalImport(specifier);
      }
      return Promise.resolve({ default: () => {} });
    };

    // Now dynamically import UploadHandler
    const module = await import('../../../../unitylibs/core/workflow/workflow-acrobat/upload-handler.js');
    UploadHandler = module.default;
  });

  beforeEach(() => {
    // Reset global stubs
    window.getUnityLibs = sinon.stub().returns('../unitylibs');
    window.unityConfig = {
      surfaceId: 'test-surface',
      apiEndPoint: 'https://test-api.adobe.com',
    };

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
  });

  after(() => {
    // Clean up global mocks
    delete window.unityConfig;
    delete window.getUnityLibs;
    delete window.import;
  });

  describe('Constructor', () => {
    it('should use correct upload limits', () => {
      expect(UploadHandler.UPLOAD_LIMITS.HIGH_END).to.deep.equal({ files: 3, chunks: 10 });
      expect(UploadHandler.UPLOAD_LIMITS.MID_RANGE).to.deep.equal({ files: 3, chunks: 10 });
      expect(UploadHandler.UPLOAD_LIMITS.LOW_END).to.deep.equal({ files: 2, chunks: 6 });
    });
  });

  describe('Utility Functions', () => {
    it('should generate guest connection payload', () => {
      const payload = uploadHandler.getGuestConnPayload('nonpdf');
      expect(payload.payload.feedback).to.equal('nonpdf');
      expect(payload.targetProduct).to.equal('test-product');
    });

    it('should identify PDF files correctly', () => {
      expect(uploadHandler.isPdf({ type: 'application/pdf' })).to.be.true;
      expect(uploadHandler.isPdf({ type: 'image/jpeg' })).to.be.false;
    });
  });

  describe('Page Count Validation', () => {
    it('should validate normal page count', async () => {
      const assetData = { id: 'asset-123' };
      mockServiceHandler.getCallToService.resolves({ numPages: 50 });

      const result = await uploadHandler.checkPageNumCount(assetData, false);
      expect(result).to.be.false;
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
      expect(result.attemptMap.get(0)).to.equal(1);
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
      const failedFile = Array.from(result.failedFiles)[0];
      expect(failedFile.fileIndex).to.equal(0);
    });
  });

  describe('Content Verification', () => {
    it('should verify content successfully', async () => {
      const assetData = { id: 'asset-123' };
      mockServiceHandler.postCallToServiceWithRetry.resolves({});

      const result = await uploadHandler.verifyContent(assetData, null);
      expect(result).to.be.true;
    });
  });

  describe('Asset Creation', () => {
    it('should create asset successfully', async () => {
      const file = { name: 'test.pdf', size: 1000, type: 'application/pdf' };
      mockServiceHandler.postCallToService.resolves({ id: 'asset-123' });

      const result = await uploadHandler.createAsset(file, true, 'workflow-123');

      expect(result.id).to.equal('asset-123');
      expect(mockServiceHandler.postCallToService.calledOnce).to.be.true;
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
  });

  describe('General Validations', () => {
    it('should pass all validations', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.checkPageNumCount = sinon.stub().resolves(false);

      const result = await uploadHandler.handleValidations(assetData, false);

      expect(result).to.be.true;
    });

    it('should fail validations on error', async () => {
      const assetData = { id: 'asset-123' };
      uploadHandler.checkPageNumCount = sinon.stub().resolves(true);

      const result = await uploadHandler.handleValidations(assetData, false);

      expect(result).to.be.false;
    });
  });
});
